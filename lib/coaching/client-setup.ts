/**
 * P-016 C1 guarded service — staff-only client setup + template assignments
 * (product-decisions #49–#57). Assignment rows are client-associated
 * operational metadata: a stable per-client aggregate (ClientSetup) plus an
 * append-only assignment/version-pin history (ClientSetupPin) — no plans,
 * entries, answers, or variant state exist here.
 *
 * Lifecycle (decisions #49/#51): each pin makes exactly one terminal
 * transition — CANCELLED (manual cancel) in C1; SUPERSEDED is schema-reserved
 * for the C2 repin transaction and this service never writes it. Only
 * `status` and ending provenance may change; the pin, identity, seq,
 * assignedByMemberId, and assignedAt never change. Terminal rows are never
 * reused, repinned, reactivated, or hard-deleted through ordinary product
 * actions. Cancellation requires no target eligibility — an actor who
 * remains authorized can always end a current assignment (decision #51).
 *
 * Authorization (`clientSetups`, decisions #52/#54): owner → workspace
 * read/write; coach → assigned read/write through the current ACTIVE
 * ClientAssignment (any assigned coach — never PRIMARY-only); assistant →
 * assigned read only; client/support/platform denied, including dual-role
 * platform admins. Every call re-authorizes inside its transaction on the
 * tx client — a demotion/revocation mid-flight cannot be honoured.
 *
 * Mutations: Serializable transaction + a per-(workspace, client)
 * `pg_advisory_xact_lock`, then the aggregate row FOR UPDATE, then the
 * template row FOR UPDATE (deterministic order — an archive must serialize
 * against assignment), bounded P2034/P2010-40001/40P01 retry, and the
 * partial unique index as the final concurrency authority. `seq` is
 * allocated max(seq)+1 under those locks; `@@unique([clientSetupId, seq])`
 * is the database backstop. Audit writes are transaction-bound: a failed
 * audit rolls the mutation back. `meta.version` carries the pinned
 * template's versionSeq — never the pin's seq.
 */

import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import {
  AccessDeniedError,
  authorize,
  authorizeCollection,
  type CollectionContext,
  type SessionLike,
} from "../auth/guard";
import {
  createPrismaAuthorizationRepo,
  type PrismaLike,
} from "../workspace/access";
import { writeAuditEvent } from "../audit";
import { buildClientProfileWhere, normalizeLimit } from "../workspace/clients";
import { CLIENT_SETUP_LIMITS, ClientSetupError } from "./client-setup-gate";

// ── Types ──────────────────────────────────────────────────────────────────

export type TemplateAssignmentSummary = {
  /** Absolute position in the caller's authorized ordered row list —
   * the only selection token the browser ever sends back (P-016-R2). */
  index: number;
  clientName: string;
  templateName: string;
  /** Whether the pinned template is currently archived — archived templates
   * accept no new assignments but existing pins stay effective and readable
   * (decision #53). */
  templateArchived: boolean;
  /** The immutable pinned template version's seq (the audit version marker). */
  versionSeq: number;
  status: "ACTIVE" | "SUPERSEDED" | "CANCELLED";
  assignedAt: string;
  endedAt: string | null;
};

export type AssignableSetupClient = { id: string; name: string };
export type AssignableTemplate = {
  id: string;
  name: string;
  latestVersionSeq: number;
  /** Structural only (ISO timestamp) — used to order and disambiguate
   * duplicate display names in the picker without exposing IDs (decision
   * #46 permits duplicate names). */
  createdAt: string;
};

// ── Positional selection + fingerprint contract (P-016-R2) ────────────────

/**
 * Canonical fingerprint of an ordered identity list (or several lists joined
 * in fixed order). The fingerprint is a CONSISTENCY token only — it proves
 * the browser's positional selection was made against the same authorized
 * list the server re-resolves at submit time. It never replaces
 * authorization: every resolved identity is reauthorized and
 * workspace-scoped before any mutation.
 */
export function computeSelectionFingerprint(...groups: string[][]): string {
  const hash = createHash("sha256");
  for (const [gi, group] of groups.entries()) {
    if (gi > 0) hash.update("\x00");
    for (const id of group) hash.update(`${id}\n`);
  }
  return hash.digest("hex");
}

function fingerprintMismatch(fingerprint: string, expected: string): boolean {
  return fingerprint !== expected;
}

function boundedIndex(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= CLIENT_SETUP_LIMITS.indexMax
    ? value
    : null;
}

// ── Concurrency protocol (mirrors the reviewed assignments service) ────────

const RAW_SERIALIZATION_SQLSTATES = new Set(["40001", "40P01"]);
const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 10;
const BACKOFF_CAP_MS = 50;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryableSerialization(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code === "P2010") {
    const meta = error.meta as { code?: unknown } | undefined;
    return (
      typeof meta?.code === "string" &&
      RAW_SERIALIZATION_SQLSTATES.has(meta.code)
    );
  }
  return false;
}

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (isRetryableSerialization(error) && ++attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(BACKOFF_BASE_MS * attempt, BACKOFF_CAP_MS));
        continue;
      }
      if (isRetryableSerialization(error))
        throw new ClientSetupError("serialization_conflict");
      throw error;
    }
  }
}

/** Transaction-scoped advisory lock on the (workspace, client) tuple —
 * serializes setup creation, assignment, and cancellation for the client
 * before any lifecycle write. */
async function lockClientTuple(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<void> {
  // $executeRawUnsafe: pg_advisory_xact_lock returns void, which $queryRaw
  // cannot deserialize. hashtextextended matches the reviewed convention
  // (64-bit keyspace, not 32-bit hashtext).
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    `csetup:${workspaceId}:${clientProfileId}`,
  );
}

// ── Scoped read helpers ────────────────────────────────────────────────────

/** Where-clause for the actor's resolved collection scope: workspace scope
 * sees all; assigned scope constrains through the actor's ACTIVE
 * ClientAssignment — never caller-supplied role or assignment data. */
function setupWhere(ctx: CollectionContext): Prisma.ClientSetupPinWhereInput {
  const base: Prisma.ClientSetupPinWhereInput = {
    workspaceId: ctx.workspaceId,
  };
  if (ctx.grantedScope === "workspace") return base;
  return {
    ...base,
    clientProfile: {
      assignments: {
        some: {
          workspaceId: ctx.workspaceId,
          coachMemberId: ctx.workspaceMemberId,
          status: "ACTIVE",
        },
      },
    },
  };
}

const summarySelect = {
  id: true,
  status: true,
  seq: true,
  assignedAt: true,
  endedAt: true,
  clientProfile: { select: { name: true } },
  template: { select: { id: true, name: true, status: true } },
  templateVersion: { select: { versionSeq: true } },
} satisfies Prisma.ClientSetupPinSelect;

type SummaryRow = Prisma.ClientSetupPinGetPayload<{
  select: typeof summarySelect;
}>;

function toSummary(row: SummaryRow, index: number): TemplateAssignmentSummary {
  return {
    index,
    clientName: row.clientProfile.name,
    templateName: row.template.name,
    templateArchived: row.template.status === "ARCHIVED",
    versionSeq: row.templateVersion.versionSeq,
    status: row.status,
    assignedAt: row.assignedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

// ── Eligibility (decisions #50/#53) ────────────────────────────────────────

/** A client is assignable only when its profile belongs to the workspace, is
 * linked to a User, that User is ACTIVE, and the corresponding CLIENT
 * WorkspaceMember is ACTIVE in the same workspace. */
const ELIGIBLE_CLIENT_PREDICATE = (
  workspaceId: string,
): Prisma.ClientProfileWhereInput => ({
  userId: { not: null },
  user: {
    status: "ACTIVE",
    memberships: {
      some: { workspaceId, role: "CLIENT", status: "ACTIVE" },
    },
  },
});

async function requireEligibleClient(
  tx: PrismaLike,
  workspaceId: string,
  clientProfileId: string,
): Promise<void> {
  const row = await tx.clientProfile.findFirst({
    where: {
      id: clientProfileId,
      workspaceId,
      ...ELIGIBLE_CLIENT_PREDICATE(workspaceId),
    },
    select: { id: true },
  });
  if (!row) throw new ClientSetupError("client_not_eligible");
}

/** Row-locks the template FOR UPDATE (serializes assignment against a
 * concurrent archive in the deterministic lock order), then resolves the
 * pinned target: the template must be ACTIVE in this workspace and have at
 * least one published version; the latest version wins (decision #50 —
 * staff never select an older version). */
async function requireAssignableTemplate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  templateId: string,
): Promise<{ id: string; versionSeq: number }> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "coaching_template"
     WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    templateId,
    workspaceId,
  );
  if (rows.length === 0) throw new ClientSetupError("template_not_eligible");
  const latest = await tx.coachingTemplateVersion.findFirst({
    where: {
      templateId,
      template: { id: templateId, workspaceId, status: "ACTIVE" },
    },
    orderBy: { versionSeq: "desc" },
    select: { id: true, versionSeq: true },
  });
  if (!latest) throw new ClientSetupError("template_not_eligible");
  return latest;
}

/** Returns the stable aggregate row for (workspace, client), creating it on
 * first assignment. Under the per-client advisory lock a concurrent creator
 * for the same tuple cannot exist; the P2002 path is a belt-and-braces
 * re-read. The row is then taken FOR UPDATE — the deterministic second lock
 * in the protocol. */
async function lockOrCreateSetup(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<string> {
  const found = await tx.clientSetup.findFirst({
    where: { workspaceId, clientProfileId },
    select: { id: true },
  });
  let setupId = found?.id;
  if (!setupId) {
    try {
      setupId = (
        await tx.clientSetup.create({
          data: { workspaceId, clientProfileId },
          select: { id: true },
        })
      ).id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        setupId = (
          await tx.clientSetup.findFirstOrThrow({
            where: { workspaceId, clientProfileId },
            select: { id: true },
          })
        ).id;
      } else throw error;
    }
  }
  await tx.$executeRawUnsafe(
    `SELECT id FROM "client_setup" WHERE id = $1 FOR UPDATE`,
    setupId,
  );
  return setupId;
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listClientSetups(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  client: PrismaClient = defaultPrisma,
): Promise<{
  items: TemplateAssignmentSummary[];
  nextCursor: string | null;
  fingerprint: string;
}> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "clientSetups",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const limit = normalizeLimit(input.limit);
  const where = {
    ...setupWhere(ctx),
    ...(input.cursor !== undefined ? { id: { gt: input.cursor } } : {}),
  };
  // The full authorized ordered id list backs both the list fingerprint and
  // each row's absolute positional index — a single indexed id-only scan.
  const [idRows, rows] = await Promise.all([
    client.clientSetupPin.findMany({
      where: setupWhere(ctx),
      orderBy: { id: "asc" },
      select: { id: true },
    }),
    client.clientSetupPin.findMany({
      where,
      orderBy: { id: "asc" },
      take: limit + 1,
      select: summarySelect,
    }),
  ]);
  const orderedIds = idRows.map((r) => r.id);
  const indexOf = new Map(orderedIds.map((id, i) => [id, i] as const));
  const page = rows.slice(0, limit);
  return {
    items: page.map((row) => toSummary(row, indexOf.get(row.id)!)),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    fingerprint: computeSelectionFingerprint(orderedIds),
  };
}

/** Ordered authorized pin ids — the canonical row list for positional
 * cancel resolution. Reauthorizes on every call; returns ids server-side
 * only (the boundary never serializes them to the browser). */
export async function listClientSetupPinIds(
  session: SessionLike,
  input: { workspaceId: string },
  client: PrismaClient = defaultPrisma,
): Promise<{ ids: string[]; fingerprint: string }> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "clientSetups",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const rows = await client.clientSetupPin.findMany({
    where: setupWhere(ctx),
    orderBy: { id: "asc" },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  return { ids, fingerprint: computeSelectionFingerprint(ids) };
}

export async function listAssignableSetupClients(
  session: SessionLike,
  input: { workspaceId: string },
  client: PrismaClient = defaultPrisma,
): Promise<AssignableSetupClient[]> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "clientSetups",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  // The picker list is the resolution table for positional selection — it
  // must be the full authorized set with a deterministic order.
  return client.clientProfile.findMany({
    where: {
      ...buildClientProfileWhere(ctx.grantedScope, {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        workspaceMemberId: ctx.workspaceMemberId,
      }),
      ...ELIGIBLE_CLIENT_PREDICATE(ctx.workspaceId),
    },
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
}

export async function listAssignableTemplates(
  session: SessionLike,
  input: { workspaceId: string },
  client: PrismaClient = defaultPrisma,
): Promise<AssignableTemplate[]> {
  // Template-picker data is library data: it requires the approved
  // coachingTemplates/read permission (owner + coach), not merely the
  // assignment read an assistant holds. Never returns definitions or drafts —
  // only id, name, and the latest published version number.
  const ctx = await authorizeCollection(
    session,
    {
      resource: "coachingTemplates",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const rows = await client.coachingTemplate.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      status: "ACTIVE",
      versions: { some: {} },
    },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      createdAt: true,
      versions: {
        select: { versionSeq: true },
        orderBy: { versionSeq: "desc" },
        take: 1,
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    latestVersionSeq: row.versions[0]!.versionSeq,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ── Positional resolution (P-016-R2) ───────────────────────────────────────

/**
 * Resolves the browser's positional (index + fingerprint) selection for the
 * assign form back to server-side identities. Re-fetches the SAME authorized
 * ordered lists the render used — any change to eligibility, archive state,
 * scope, or membership between render and submit changes the fingerprint and
 * fails closed with `stale_selection` and zero writes. A fingerprint that
 * matches but an index outside the resolved list is tampered input, not a
 * staleness signal, so it fails with `invalid_input`.
 */
export async function resolveAssignSelection(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientIndex: number;
    templateIndex: number;
    fingerprint: string;
  },
  client: PrismaClient = defaultPrisma,
): Promise<{ clientProfileId: string; templateId: string }> {
  const [clients, templates] = await Promise.all([
    listAssignableSetupClients(
      session,
      { workspaceId: input.workspaceId },
      client,
    ),
    listAssignableTemplates(
      session,
      { workspaceId: input.workspaceId },
      client,
    ),
  ]);
  const expected = computeSelectionFingerprint(
    clients.map((c) => c.id),
    templates.map((t) => t.id),
  );
  if (fingerprintMismatch(input.fingerprint, expected))
    throw new ClientSetupError("stale_selection");
  const clientRow = clients[boundedIndex(input.clientIndex) ?? -1];
  const templateRow = templates[boundedIndex(input.templateIndex) ?? -1];
  if (!clientRow || !templateRow) throw new ClientSetupError("invalid_input");
  return { clientProfileId: clientRow.id, templateId: templateRow.id };
}

/** Same contract for the cancellation row list — the submitted index is an
 * absolute position in the caller's authorized ordered pin list. */
export async function resolveCancelSelection(
  session: SessionLike,
  input: { workspaceId: string; pinIndex: number; fingerprint: string },
  client: PrismaClient = defaultPrisma,
): Promise<{ pinId: string }> {
  const { ids, fingerprint: expected } = await listClientSetupPinIds(
    session,
    { workspaceId: input.workspaceId },
    client,
  );
  if (fingerprintMismatch(input.fingerprint, expected))
    throw new ClientSetupError("stale_selection");
  const pinId = ids[boundedIndex(input.pinIndex) ?? -1];
  if (!pinId) throw new ClientSetupError("invalid_input");
  return { pinId };
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function createClientSetupAssignment(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string; templateId: string },
  client: PrismaClient = defaultPrisma,
): Promise<{ assignmentId: string }> {
  const db = client;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await authorize(
          session,
          {
            resource: "clientSetups",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        await lockClientTuple(tx, input.workspaceId, input.clientProfileId);
        await requireEligibleClient(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        // Deterministic lock order: per-client advisory → aggregate row →
        // template row → pin insert. Every writer takes them in this order.
        const setupId = await lockOrCreateSetup(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        const latest = await requireAssignableTemplate(
          tx,
          input.workspaceId,
          input.templateId,
        );
        const existing = await tx.clientSetupPin.findFirst({
          where: { clientSetupId: setupId, status: "ACTIVE" },
          select: { id: true },
        });
        if (existing) throw new ClientSetupError("assignment_conflict");
        const seqRows = await tx.$queryRawUnsafe<{ next: number }[]>(
          `SELECT CAST(COALESCE(MAX(seq), 0) + 1 AS integer) AS next
           FROM "client_setup_pin" WHERE client_setup_id = $1`,
          setupId,
        );
        const seq = seqRows[0]!.next;
        try {
          const row = await tx.clientSetupPin.create({
            data: {
              clientSetupId: setupId,
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              seq,
              templateId: input.templateId,
              templateVersionId: latest.id,
              assignedByMemberId: ctx.workspaceMemberId as string,
            },
            select: { id: true },
          });
          await writeAuditEvent(tx, ctx, {
            action: "ASSIGN",
            resourceType: "client_setup_pin",
            resourceId: row.id,
            subjectClientProfileId: input.clientProfileId,
            // meta.version is the pinned template version's seq — never the
            // pin's per-setup seq.
            meta: { changed: true, version: `v${latest.versionSeq}` },
          });
          return { assignmentId: row.id };
        } catch (error) {
          // The partial unique index is the final authority — a concurrent
          // create committed between our check and insert lands here.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
            throw new ClientSetupError("assignment_conflict");
          throw error;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

type LockedPin = {
  id: string;
  status: string;
};

/**
 * Authorization-before-lock protocol for row-targeting mutations:
 * a NON-locking scoped lookup resolves the immutable (client, setup,
 * pinned version) tuple, the caller is authorized against it, and only
 * then are locks acquired — tuple advisory lock first, aggregate row lock
 * second, pin row lock last, in that fixed order for every mutation.
 * Missing, foreign, denied, active, and terminal inputs all surface the
 * same `assignment_not_accessible` to unauthorized callers; only
 * authorized callers learn `assignment_not_active`.
 */
async function authorizePinTarget(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  input: { workspaceId: string; pinId: string },
): Promise<{
  ctx: Awaited<ReturnType<typeof authorize>>;
  target: {
    clientSetupId: string;
    clientProfileId: string;
    versionSeq: number;
  };
}> {
  const resolved = await tx.clientSetupPin.findFirst({
    where: { id: input.pinId, workspaceId: input.workspaceId },
    // Immutable columns only — existence/status is never read here.
    select: {
      clientSetupId: true,
      clientProfileId: true,
      templateVersion: { select: { versionSeq: true } },
    },
  });
  if (!resolved) throw new ClientSetupError("assignment_not_accessible");
  try {
    const ctx = await authorize(
      session,
      {
        resource: "clientSetups",
        action: "write",
        workspaceId: input.workspaceId,
        clientProfileId: resolved.clientProfileId,
      },
      createPrismaAuthorizationRepo(tx),
    );
    return {
      ctx,
      target: {
        clientSetupId: resolved.clientSetupId,
        clientProfileId: resolved.clientProfileId,
        versionSeq: resolved.templateVersion.versionSeq,
      },
    };
  } catch (error) {
    if (error instanceof AccessDeniedError)
      throw new ClientSetupError("assignment_not_accessible");
    throw error;
  }
}

async function lockPinRow(
  tx: Prisma.TransactionClient,
  pinId: string,
): Promise<LockedPin | null> {
  const rows = await tx.$queryRawUnsafe<LockedPin[]>(
    `SELECT id, status FROM "client_setup_pin" WHERE id = $1 FOR UPDATE`,
    pinId,
  );
  return rows[0] ?? null;
}

export async function cancelClientSetupAssignment(
  session: SessionLike,
  input: { workspaceId: string; pinId: string },
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  const db = client;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, target } = await authorizePinTarget(tx, session, input);
        await lockClientTuple(tx, input.workspaceId, target.clientProfileId);
        // Aggregate row lock — same fixed position as the create path.
        await tx.$executeRawUnsafe(
          `SELECT id FROM "client_setup" WHERE id = $1 FOR UPDATE`,
          target.clientSetupId,
        );
        const current = await lockPinRow(tx, input.pinId);
        if (!current) throw new ClientSetupError("assignment_not_accessible");
        // Terminal/stale/repeated requests produce no mutation and no audit.
        if (current.status !== "ACTIVE")
          throw new ClientSetupError("assignment_not_active");
        const now = new Date();
        await tx.clientSetupPin.update({
          where: { id: current.id },
          data: {
            status: "CANCELLED",
            endedByMemberId: ctx.workspaceMemberId as string,
            endedAt: now,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "client_setup_pin",
          resourceId: current.id,
          subjectClientProfileId: target.clientProfileId,
          meta: { changed: true, version: `v${target.versionSeq}` },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
