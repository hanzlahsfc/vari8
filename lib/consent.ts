import { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "./db";
import { AccessDeniedError, authorize, type SessionLike } from "./auth/guard";
import { type Resource } from "./auth/rbac";
import {
  createPrismaAuthorizationRepo,
  type PrismaLike,
} from "./workspace/access";
import { normalizeLimit } from "./workspace/clients";

/**
 * S1-D versioned consent model and consent gates (hardened).
 *
 * Consent is client-owned. Every grant/revoke/read authorizes through the S1-B
 * guard with resource `consent` (client `own` only). Order is always:
 * authorization → client/workspace confirmation → policy/version + consent →
 * mutation. Consent never grants authorization by itself.
 *
 * Every `ConsentRecord` query embeds the workspace relation predicate
 * (`clientProfile: { workspaceId }`) as defense in depth, so a lookup cannot
 * cross tenants even if a prior check were bypassed.
 *
 * No audit table/logger here: consent mutations must not be exposed by any route
 * until S1-E couples audit writing transactionally.
 */

export type ConsentKind =
  | "PRIVACY_NOTICE"
  | "HEALTH_DATA"
  | "CYCLE"
  | "PHOTOS"
  | "BLOODWORK"
  | "PED_HRT";

export const CONSENT_KINDS: readonly ConsentKind[] = [
  "PRIVACY_NOTICE",
  "HEALTH_DATA",
  "CYCLE",
  "PHOTOS",
  "BLOODWORK",
  "PED_HRT",
];

export type ConsentSource = "CLIENT_SELF" | "COACH_ATTESTED";

export type ConsentErrorCode =
  | "invalid_input"
  | "policy_not_configured"
  | "coach_attested_unsupported"
  | "ped_hrt_not_approved"
  | "consent_missing"
  | "consent_conflict"
  | "audit_not_wired_for_external_use";

export class ConsentError extends Error {
  constructor(readonly code: ConsentErrorCode) {
    super(code);
    this.name = "ConsentError";
  }
}

export function isConsentKind(value: unknown): value is ConsentKind {
  return (
    typeof value === "string" &&
    (CONSENT_KINDS as readonly string[]).includes(value)
  );
}

// --- policy registry (trusted, server-side) ---------------------------------

export type ConsentPolicyRegistry = {
  /** The current approved exact version for a kind, or null when unconfigured. */
  currentVersion(kind: ConsentKind): string | null;
};

/** Production default: unconfigured, so every grant/health check fails closed. */
export const unconfiguredConsentPolicy: ConsentPolicyRegistry = {
  currentVersion: () => null,
};

export function createStaticConsentPolicy(
  versions: Partial<Record<ConsentKind, string>>,
): ConsentPolicyRegistry {
  return { currentVersion: (kind) => versions[kind] ?? null };
}

// --- protected-operation mapping (closed) -----------------------------------

export const BASE_CONSENTS: readonly ConsentKind[] = [
  "PRIVACY_NOTICE",
  "HEALTH_DATA",
];

const PROTECTED_OPERATIONS: Partial<Record<Resource, readonly ConsentKind[]>> =
  {
    dailyTracking: BASE_CONSENTS,
    mealPlans: BASE_CONSENTS,
    trainingPlansLogs: BASE_CONSENTS,
    checkinsCoachReviews: BASE_CONSENTS,
    coachNotes: BASE_CONSENTS,
    clientNotes: BASE_CONSENTS,
    privateMediaFiles: [...BASE_CONSENTS, "PHOTOS"],
    cycleData: [...BASE_CONSENTS, "CYCLE"],
    bloodwork: [...BASE_CONSENTS, "BLOODWORK"],
    pedHrt: [...BASE_CONSENTS, "PED_HRT"],
  };

/** Required consent kinds for a resource, or `undefined` when not consent-protected. */
export function requiredConsentsFor(
  resource: Resource,
): readonly ConsentKind[] | undefined {
  return PROTECTED_OPERATIONS[resource];
}

// --- pure helpers -----------------------------------------------------------

export type ConsentRow = {
  kind: string;
  version: string;
  revokedAt: Date | null;
};

/** True only for an exact-version, unrevoked grant. */
export function hasExactActiveConsent(
  rows: readonly ConsentRow[],
  kind: ConsentKind,
  version: string,
): boolean {
  return rows.some(
    (row) =>
      row.kind === kind && row.version === version && row.revokedAt === null,
  );
}

export function assertConsentMutationsExternallyExposable(): never {
  // S1-E must transactionally couple audit writing before any route/action exposes
  // consent mutations. This is not a no-op auditor; it fails closed.
  throw new ConsentError("audit_not_wired_for_external_use");
}

export type ConsentServiceDeps = {
  client?: PrismaClient;
  registry?: ConsentPolicyRegistry;
};

export type ConsentMutationResult = { kind: ConsentKind; changed: boolean };
export type ConsentStatusRow = {
  id: string;
  kind: ConsentKind;
  version: string;
  grantedAt: Date;
  revokedAt: Date | null;
};
export type ConsentStatusPage = {
  items: ConsentStatusRow[];
  nextCursor: string | null;
};

export type ConsentVersionPair = { kind: ConsentKind; version: string };

// --- helpers ----------------------------------------------------------------

function mapConsentConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    throw new ConsentError("consent_conflict");
  }
  throw error;
}

/** Prisma 6/PostgreSQL reports the raw partial index by its exact column target.
 * This is the observed P2002 metadata for consent_record_active_version_key;
 * any other or ambiguous shape must not enable idempotent recovery.
 */
function isActiveConsentIndexConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  )
    return false;
  const meta = error.meta;
  if (!meta || Object.keys(meta).sort().join(",") !== "modelName,target")
    return false;
  const target = meta.target;
  return (
    meta.modelName === "ConsentRecord" &&
    Array.isArray(target) &&
    target.length === 3 &&
    target[0] === "client_profile_id" &&
    target[1] === "kind" &&
    target[2] === "version"
  );
}

/** Relation predicate tying a consent row's client to the requested workspace. */
function consentWhere(
  workspaceId: string,
  clientProfileId: string,
): Prisma.ConsentRecordWhereInput {
  return { clientProfileId, clientProfile: { workspaceId } };
}

/** Confirms the client belongs to the workspace; preserves the real resource/action. */
async function requireClientInWorkspace(
  client: PrismaLike,
  workspaceId: string,
  clientProfileId: string,
  resource: Resource,
  action: "read" | "write",
): Promise<void> {
  const row = await client.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: { id: true },
  });
  if (!row)
    throw new AccessDeniedError("client_outside_workspace", resource, action);
}

/** Loads only the active rows matching the requested (kind, version) pairs. */
async function loadActiveConsentPairs(
  client: PrismaLike,
  workspaceId: string,
  clientProfileId: string,
  pairs: readonly ConsentVersionPair[],
): Promise<ConsentRow[]> {
  if (pairs.length === 0) return [];
  return client.consentRecord.findMany({
    where: {
      ...consentWhere(workspaceId, clientProfileId),
      revokedAt: null,
      OR: pairs.map((pair) => ({ kind: pair.kind, version: pair.version })),
    },
    select: { kind: true, version: true, revokedAt: true },
  });
}

async function isActiveConsentRowPresent(
  client: PrismaLike,
  workspaceId: string,
  clientProfileId: string,
  kind: ConsentKind,
  version: string,
): Promise<boolean> {
  const row = await client.consentRecord.findFirst({
    where: {
      ...consentWhere(workspaceId, clientProfileId),
      kind,
      version,
      revokedAt: null,
    },
    select: { id: true },
  });
  return row !== null;
}

// --- services ---------------------------------------------------------------

export async function grantOwnConsent(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string; kind: ConsentKind },
  deps: ConsentServiceDeps = {},
): Promise<ConsentMutationResult> {
  // Basic parsing only (no policy state) may precede authorization.
  if (!isConsentKind(input.kind)) throw new ConsentError("invalid_input");
  const client = deps.client ?? prisma;
  const registry = deps.registry ?? unconfiguredConsentPolicy;
  let resolvedVersion: string | null = null;

  try {
    return await client.$transaction(
      async (tx) => {
        // 1. Authorization FIRST (unauthorized callers never reach policy below).
        const context = await authorize(
          session,
          {
            resource: "consent",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          createPrismaAuthorizationRepo(tx),
        );

        // 2. Client/workspace relationship.
        await requireClientInWorkspace(
          tx,
          input.workspaceId,
          input.clientProfileId,
          "consent",
          "write",
        );

        // 3. Runtime source policy — caller cannot choose the source.
        const requestedSource = (input as { source?: unknown }).source;
        if (
          requestedSource !== undefined &&
          requestedSource !== "CLIENT_SELF"
        ) {
          throw new ConsentError("coach_attested_unsupported");
        }
        // PED/HRT consent granting is not approved.
        if (input.kind === "PED_HRT")
          throw new ConsentError("ped_hrt_not_approved");

        // 4. Trusted registry version.
        const version = registry.currentVersion(input.kind);
        if (!version) throw new ConsentError("policy_not_configured");
        resolvedVersion = version;

        // 5. Existing exact active grant (idempotent).
        const existing = await tx.consentRecord.findFirst({
          where: {
            ...consentWhere(input.workspaceId, input.clientProfileId),
            kind: input.kind,
            version,
            revokedAt: null,
          },
          select: { id: true },
        });
        if (existing) return { kind: input.kind, changed: false };

        // 6. Mutation (actor id comes from the authorized context, not the session).
        await tx.consentRecord.create({
          data: {
            clientProfileId: input.clientProfileId,
            kind: input.kind,
            version,
            grantedByUserId: context.userId,
            source: "CLIENT_SELF",
          },
        });
        return { kind: input.kind, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof AccessDeniedError || error instanceof ConsentError)
      throw error;
    // Only the observed raw active-consent index target can enter recovery.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      if (!isActiveConsentIndexConflict(error) || !resolvedVersion)
        throw new ConsentError("consent_conflict");
      try {
        return await client.$transaction(
          async (tx) => {
            // The failed transaction's authorization is stale. Re-read every
            // S1-B input through this new transaction before any consent query.
            await authorize(
              session,
              {
                resource: "consent",
                action: "write",
                workspaceId: input.workspaceId,
                clientProfileId: input.clientProfileId,
              },
              createPrismaAuthorizationRepo(tx),
            );
            await requireClientInWorkspace(
              tx,
              input.workspaceId,
              input.clientProfileId,
              "consent",
              "write",
            );
            const requestedSource = (input as { source?: unknown }).source;
            if (
              requestedSource !== undefined &&
              requestedSource !== "CLIENT_SELF"
            )
              throw new ConsentError("coach_attested_unsupported");
            if (input.kind === "PED_HRT")
              throw new ConsentError("ped_hrt_not_approved");
            const currentVersion = registry.currentVersion(input.kind);
            if (!currentVersion || currentVersion !== resolvedVersion)
              throw new ConsentError("consent_conflict");
            if (
              !(await isActiveConsentRowPresent(
                tx,
                input.workspaceId,
                input.clientProfileId,
                input.kind,
                currentVersion,
              ))
            )
              throw new ConsentError("consent_conflict");
            return { kind: input.kind, changed: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (recoveryError) {
        if (
          recoveryError instanceof AccessDeniedError ||
          recoveryError instanceof ConsentError
        )
          throw recoveryError;
        mapConsentConflict(recoveryError);
      }
    }
    mapConsentConflict(error);
  }
}

export async function revokeOwnConsent(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string; kind: ConsentKind },
  deps: ConsentServiceDeps = {},
): Promise<ConsentMutationResult> {
  if (!isConsentKind(input.kind)) throw new ConsentError("invalid_input");
  const client = deps.client ?? prisma;
  try {
    return await client.$transaction(
      async (tx) => {
        await authorize(
          session,
          {
            resource: "consent",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        await requireClientInWorkspace(
          tx,
          input.workspaceId,
          input.clientProfileId,
          "consent",
          "write",
        );
        // Revoke every active version; workspace relation predicate is embedded.
        const result = await tx.consentRecord.updateMany({
          where: {
            ...consentWhere(input.workspaceId, input.clientProfileId),
            kind: input.kind,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        return { kind: input.kind, changed: result.count > 0 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof AccessDeniedError || error instanceof ConsentError)
      throw error;
    mapConsentConflict(error);
  }
}

export async function readOwnConsentStatus(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    limit?: number;
    cursor?: string;
  },
  deps: ConsentServiceDeps = {},
): Promise<ConsentStatusPage> {
  const client = deps.client ?? prisma;
  await authorize(
    session,
    {
      resource: "consent",
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    },
    createPrismaAuthorizationRepo(client),
  );
  await requireClientInWorkspace(
    client,
    input.workspaceId,
    input.clientProfileId,
    "consent",
    "read",
  );
  const take = normalizeLimit(input.limit);
  const where: Prisma.ConsentRecordWhereInput = consentWhere(
    input.workspaceId,
    input.clientProfileId,
  );
  if (input.cursor) where.id = { gt: input.cursor };
  const rows = await client.consentRecord.findMany({
    where,
    orderBy: { id: "asc" },
    take: take + 1,
    select: {
      id: true,
      kind: true,
      version: true,
      grantedAt: true,
      revokedAt: true,
    },
  });
  const items = rows.slice(0, take);
  const nextCursor =
    rows.length > take ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}

export type AuthorizedHealthOperation = {
  userId: string;
  workspaceId: string;
  clientProfileId: string;
  grantedScope: string;
};

/**
 * Authorize a consent-protected health operation. Order: S1-B authorization
 * (user/workspace/membership → RBAC role/scope) → client/workspace → exact-version
 * consent. Consent never grants authorization by itself.
 */
export async function authorizeHealthOperation(
  session: SessionLike,
  input: {
    resource: Resource;
    action: "read" | "write";
    workspaceId?: string;
    clientProfileId?: string;
  },
  deps: ConsentServiceDeps = {},
): Promise<AuthorizedHealthOperation> {
  const required = requiredConsentsFor(input.resource);
  if (!required) throw new ConsentError("invalid_input");
  if (
    typeof input.clientProfileId !== "string" ||
    input.clientProfileId.length === 0
  ) {
    throw new ConsentError("invalid_input");
  }

  const client = deps.client ?? prisma;
  // 1-2. Authorization FIRST — no policy/consent lookup happens before this.
  const context = await authorize(
    session,
    {
      resource: input.resource,
      action: input.action,
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    },
    createPrismaAuthorizationRepo(client),
  );

  const clientProfileId = input.clientProfileId;
  const workspaceId = context.workspaceId as string;
  await requireClientInWorkspace(
    client,
    workspaceId,
    clientProfileId,
    input.resource,
    input.action,
  );

  // PED/HRT stays fail-closed regardless of any stored consent row.
  if (input.resource === "pedHrt")
    throw new ConsentError("ped_hrt_not_approved");

  // 3. Resolve exact required versions, then query ONLY those active rows.
  const registry = deps.registry ?? unconfiguredConsentPolicy;
  const pairs: ConsentVersionPair[] = [];
  for (const kind of required) {
    const version = registry.currentVersion(kind);
    if (!version) throw new ConsentError("policy_not_configured");
    pairs.push({ kind, version });
  }
  const rows = await loadActiveConsentPairs(
    client,
    workspaceId,
    clientProfileId,
    pairs,
  );
  for (const pair of pairs) {
    if (!hasExactActiveConsent(rows, pair.kind, pair.version)) {
      throw new ConsentError("consent_missing");
    }
  }

  return {
    userId: context.userId,
    workspaceId,
    clientProfileId,
    grantedScope: context.grantedScope,
  };
}
