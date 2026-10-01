import { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { writeAuditEvent } from "../audit";
import {
  AccessDeniedError,
  authorize,
  authorizeCollection,
  type SessionLike,
} from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";

/**
 * S1-G allowlist client export (internal service — no route/UI).
 *
 * The own path (`exportOwnData`) resolves the `ClientProfile` from the actor —
 * no caller-supplied client id can select another subject. The scoped path
 * (`exportClientData`) serves the `exportsErasure` matrix scopes
 * `workspace` (owner) and `assigned` (coach); `own` is rejected there.
 *
 * The document is a closed section allowlist plus a counts manifest derived
 * from the emitted rows. Each section is read with explicit bounded
 * pagination; exceeding the section ceiling throws `export_too_large` and
 * returns nothing — an export is never silently incomplete. Exactly one
 * `EXPORT`/`client_export` audit event commits inside the same transaction
 * on success; denials and oversized exports write nothing.
 *
 * No health tables exist, so no health section exists here — new sections
 * are added to the allowlist deliberately and re-reviewed.
 */

export type GdprErrorCode =
  | "invalid_input"
  | "client_not_accessible"
  | "export_too_large"
  | "serialization_conflict";

export class GdprError extends Error {
  constructor(readonly code: GdprErrorCode) {
    super(code);
    this.name = "GdprError";
  }
}

/** Closed section allowlist — only client-owned tables that exist today. */
export const EXPORT_SECTIONS = [
  "clientProfile",
  "consents",
  "assignments",
] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];

/** Engineering bounds (PROPOSED values from the reviewed plan) — injectable
 * for tests via `ExportOptions`, never a product policy. */
export const EXPORT_PAGE_SIZE = 500;
export const EXPORT_SECTION_ROW_MAX = 100_000;

export type ExportOptions = {
  pageSize?: number;
  maxSectionRows?: number;
};

export type ConsentExportRow = {
  kind: string;
  version: string;
  grantedAt: string;
  revokedAt: string | null;
  source: string;
};

export type AssignmentExportRow = {
  role: string;
  status: string;
  assignedAt: string;
};

export type ExportSectionsData = {
  clientProfile: { name: string; createdAt: string };
  consents: ConsentExportRow[];
  assignments: AssignmentExportRow[];
};

export type ClientExportDocument = {
  formatVersion: 1;
  manifest: {
    sections: Record<ExportSection, number>;
    totalRecords: number;
  };
  sections: ExportSectionsData;
};

/** SQLSTATEs that are genuine serialization artifacts when surfaced through
 * raw SQL (Prisma wraps those as P2010 rather than P2034). */
const RAW_SERIALIZATION_SQLSTATES = new Set(["40001", "40P01"]);

function isRetryableConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code === "P2010") {
    const meta = error.meta;
    return (
      !!meta &&
      typeof meta === "object" &&
      typeof (meta as { code?: unknown }).code === "string" &&
      RAW_SERIALIZATION_SQLSTATES.has((meta as { code: string }).code)
    );
  }
  return false;
}

/** Bounded retry for SSI aborts — never an unbounded loop. */
const MAX_ATTEMPTS = 2;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeBound(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw new GdprError("invalid_input");
  return value;
}

/**
 * Build the export document; the manifest is derived from the emitted rows
 * so counts can never disagree with the payload. The input must carry exactly
 * the allowlisted sections — an unknown key is rejected, never emitted.
 */
export function buildExportDocument(
  sections: ExportSectionsData,
): ClientExportDocument {
  if (!isPlainObject(sections)) throw new GdprError("invalid_input");
  const keys = Object.keys(sections).sort();
  if (keys.join(",") !== "assignments,clientProfile,consents")
    throw new GdprError("invalid_input");
  const { clientProfile, consents, assignments } = sections;
  if (
    !isPlainObject(clientProfile) ||
    typeof clientProfile.name !== "string" ||
    typeof clientProfile.createdAt !== "string" ||
    !Array.isArray(consents) ||
    !Array.isArray(assignments)
  )
    throw new GdprError("invalid_input");
  const counts = {
    clientProfile: 1,
    consents: consents.length,
    assignments: assignments.length,
  };
  return {
    formatVersion: 1,
    manifest: {
      sections: counts,
      totalRecords: counts.clientProfile + counts.consents + counts.assignments,
    },
    sections: { clientProfile, consents, assignments },
  };
}

/** Bounded id-cursor pagination; throws `export_too_large` over the ceiling. */
async function readPaged<T extends { id: string }, R>(
  pageSize: number,
  maxSectionRows: number,
  fetchPage: (cursor: string | undefined) => Promise<T[]>,
  emit: (row: T) => R,
): Promise<R[]> {
  const rows: R[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    if (rows.length + page.length > maxSectionRows)
      throw new GdprError("export_too_large");
    for (const row of page) rows.push(emit(row));
    if (page.length < pageSize) break;
    cursor = page[page.length - 1].id;
  }
  return rows;
}

async function collectSections(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  options: { pageSize: number; maxSectionRows: number },
): Promise<ExportSectionsData> {
  // Every query embeds the workspace predicate as defense in depth — the
  // authorization context already bound the pair, and this cannot cross
  // tenants even if a caller-side check were bypassed.
  const profile = await tx.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: { name: true, createdAt: true },
  });
  // A `workspace`-scoped caller (owner) can name a client id outside the
  // workspace — the guard's scope never verified it. Deny with the same
  // structural reason the guard uses for own/assigned scope.
  if (!profile)
    throw new AccessDeniedError(
      "client_outside_workspace",
      "exportsErasure",
      "read",
    );

  const { pageSize, maxSectionRows } = options;

  const consents = await readPaged(
    pageSize,
    maxSectionRows,
    (cursor) =>
      tx.consentRecord.findMany({
        where: { clientProfileId, clientProfile: { workspaceId } },
        orderBy: { id: "asc" },
        take: pageSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          kind: true,
          version: true,
          grantedAt: true,
          revokedAt: true,
          source: true,
        },
      }),
    (row) => ({
      kind: row.kind,
      version: row.version,
      grantedAt: row.grantedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      source: row.source,
    }),
  );

  const assignments = await readPaged(
    pageSize,
    maxSectionRows,
    (cursor) =>
      tx.clientAssignment.findMany({
        where: { clientProfileId, workspaceId },
        orderBy: { id: "asc" },
        take: pageSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, role: true, status: true, assignedAt: true },
      }),
    (row) => ({
      role: row.role,
      status: row.status,
      assignedAt: row.assignedAt.toISOString(),
    }),
  );

  return {
    clientProfile: {
      name: profile.name,
      createdAt: profile.createdAt.toISOString(),
    },
    consents: consents as ExportSectionsData["consents"],
    assignments: assignments as ExportSectionsData["assignments"],
  };
}

async function runExport(
  session: SessionLike,
  workspaceId: string,
  clientProfileId: string,
  ownPath: boolean,
  client: PrismaClient,
  options?: ExportOptions,
): Promise<ClientExportDocument> {
  const bounds = {
    pageSize: normalizeBound(options?.pageSize, EXPORT_PAGE_SIZE),
    maxSectionRows: normalizeBound(
      options?.maxSectionRows,
      EXPORT_SECTION_ROW_MAX,
    ),
  };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.$transaction(
        async (tx) => {
          const ctx = await authorize(
            session,
            {
              resource: "exportsErasure",
              action: "read",
              workspaceId,
              clientProfileId,
            },
            createPrismaAuthorizationRepo(tx),
          );
          // The scoped path serves `workspace` (owner) and `assigned`
          // (coach) only; a client exporting their own record must use the
          // actor-resolved path.
          if (!ownPath && ctx.grantedScope === "own")
            throw new AccessDeniedError(
              "role_denied",
              "exportsErasure",
              "read",
            );
          const sections = await collectSections(
            tx,
            workspaceId,
            clientProfileId,
            bounds,
          );
          const document = buildExportDocument(sections);
          await writeAuditEvent(tx, ctx, {
            action: "EXPORT",
            resourceType: "client_export",
            resourceId: null,
            subjectClientProfileId: clientProfileId,
            meta: { count: document.manifest.totalRecords },
          });
          return document;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isRetryableConflict(error)) {
        if (attempt < MAX_ATTEMPTS) continue;
        throw new GdprError("serialization_conflict");
      }
      throw error;
    }
  }
  throw new GdprError("serialization_conflict");
}

/**
 * Scoped per-client export — serves the matrix's `workspace` (owner) and
 * `assigned` (coach) read scopes. `own` scope is denied here; the client
 * uses `exportOwnData`.
 */
export async function exportClientData(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  client: PrismaClient = prisma,
  options?: ExportOptions,
): Promise<ClientExportDocument> {
  if (typeof input.workspaceId !== "string" || input.workspaceId.length === 0)
    throw new GdprError("invalid_input");
  if (
    typeof input.clientProfileId !== "string" ||
    input.clientProfileId.length === 0
  )
    throw new GdprError("invalid_input");
  return runExport(
    session,
    input.workspaceId,
    input.clientProfileId,
    false,
    client,
    options,
  );
}

/**
 * Actor-resolved own export: the client profile is resolved from the
 * session's user inside the workspace — no caller-supplied client id can
 * select another subject.
 */
export async function exportOwnData(
  session: SessionLike,
  input: { workspaceId: string },
  client: PrismaClient = prisma,
  options?: ExportOptions,
): Promise<ClientExportDocument> {
  if (typeof input.workspaceId !== "string" || input.workspaceId.length === 0)
    throw new GdprError("invalid_input");
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "exportsErasure", "read");
  // Workspace/membership gate BEFORE profile resolution: non-members and
  // non-ACTIVE users are denied without learning whether a linked profile
  // exists. The authoritative own-scope check re-runs inside the
  // transaction.
  await authorizeCollection(
    session,
    {
      resource: "exportsErasure",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const profile = await client.clientProfile.findFirst({
    where: { workspaceId: input.workspaceId, userId },
    select: { id: true },
  });
  if (!profile) throw new GdprError("client_not_accessible");
  return runExport(
    session,
    input.workspaceId,
    profile.id,
    true,
    client,
    options,
  );
}
