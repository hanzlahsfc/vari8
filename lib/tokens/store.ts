import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AccessTokenPurpose,
  MemberRole,
  AccessToken,
} from "@prisma/client";

import { normalizeEmail } from "../credentials";
import {
  generateAccessToken,
  hashAccessToken,
  TokenError,
  type RawAccessToken,
} from "./crypto";

/**
 * S1-F2A — internal, transaction-bound token-store primitives.
 *
 * These are building blocks for the future reviewed invite/reset services (see
 * `docs/tasks/s1-f-invites-recovery-plan.md`). They are NOT services: every
 * state-changing function requires a caller-provided `Prisma.TransactionClient`
 * and never opens its own transaction or touches the global client. The future
 * service owns authorization, atomic multi-step orchestration (issue + account
 * mutation + sessionVersion + audit inside ONE Serializable transaction),
 * delivery, and rollback.
 *
 * Nothing here encodes an unanswered decision: no invite acceptance, no
 * activation, no eligibility/policy checks, no email, no audit, no cleanup.
 * Raw tokens are returned exactly once to the caller (the future delivery
 * layer) and are never stored, logged, or embedded in errors.
 *
 * `assertTokenFlowsExternallyExposable` in `lib/tokens.ts` remains fail-closed.
 */

/** Founder-decided link lifetime (2026-09-30): exactly 12 hours. */
export const ACCESS_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const MAX_TARGET_EMAIL_LENGTH = 254;

/** Roles the database boundary accepts as `intended_role` for invites. */
const INVITABLE_ROLES: readonly MemberRole[] = [
  "COACH",
  "ASSISTANT_COACH",
  "CLIENT",
];

export type TokenStoreErrorCode = "invalid_input" | "token_store_failed";

export class TokenStoreError extends Error {
  constructor(readonly code: TokenStoreErrorCode) {
    super(code);
    this.name = "TokenStoreError";
  }
}

type AccessTokenRecord = Pick<
  AccessToken,
  | "id"
  | "purpose"
  | "workspaceId"
  | "userId"
  | "targetEmail"
  | "intendedRole"
  | "createdByUserId"
  | "createdAt"
  | "targetMemberStateVersion"
>;

function normalizedTargetEmail(value: unknown): string {
  const email = normalizeEmail(value);
  if (!email || email.length > MAX_TARGET_EMAIL_LENGTH) {
    throw new TokenStoreError("invalid_input");
  }
  return email;
}

function requireId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TokenStoreError("invalid_input");
  }
  return value;
}

/**
 * Issue a workspace-invitation token record inside the caller's transaction.
 * The caller has already authorized this issuance; this primitive only writes
 * the hash-only row. Returns the raw token once — it is never stored.
 */
export async function issueWorkspaceInviteToken(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    targetEmail: string;
    intendedRole: MemberRole;
    createdByUserId: string;
    /** S1-F2C repair: generation of the target membership at issuance
     * (null = no member existed). Acceptance requires it to equal the
     * member's current state_version — causal freshness, clock-independent. */
    targetMemberStateVersion?: number | null;
  },
): Promise<{ tokenId: string; rawToken: RawAccessToken; expiresAt: Date }> {
  const workspaceId = requireId(input.workspaceId);
  const targetEmail = normalizedTargetEmail(input.targetEmail);
  const createdByUserId = requireId(input.createdByUserId);
  if (!INVITABLE_ROLES.includes(input.intendedRole)) {
    throw new TokenStoreError("invalid_input");
  }
  const snapshot = input.targetMemberStateVersion ?? null;
  if (snapshot !== null && (!Number.isInteger(snapshot) || snapshot < 0)) {
    throw new TokenStoreError("invalid_input");
  }
  const { rawToken, tokenHash } = generateAccessToken();
  const row = await tx.accessToken.create({
    data: {
      purpose: "WORKSPACE_INVITE",
      tokenHash,
      workspaceId,
      targetEmail,
      intendedRole: input.intendedRole,
      createdByUserId,
      targetMemberStateVersion: snapshot,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    },
    select: { id: true, expiresAt: true },
  });
  return { tokenId: row.id, rawToken, expiresAt: row.expiresAt };
}

/**
 * Issue a password-reset token record inside the caller's transaction. The
 * caller has already decided eligibility; this primitive only writes the
 * user-owned, hash-only row. Returns the raw token once.
 */
export async function issuePasswordResetToken(
  tx: Prisma.TransactionClient,
  input: { userId: string },
): Promise<{ tokenId: string; rawToken: RawAccessToken; expiresAt: Date }> {
  const userId = requireId(input.userId);
  const { rawToken, tokenHash } = generateAccessToken();
  const row = await tx.accessToken.create({
    data: {
      purpose: "PASSWORD_RESET",
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    },
    select: { id: true, expiresAt: true },
  });
  return { tokenId: row.id, rawToken, expiresAt: row.expiresAt };
}

/**
 * Revoke outstanding invites matching exactly one (workspace, email, role)
 * tuple — the founder-decided "replacement cancels previous matching links"
 * semantics. Only unconsumed, unrevoked, unexpired rows are touched.
 */
export async function revokeMatchingInviteTokens(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    targetEmail: string;
    intendedRole: MemberRole;
  },
): Promise<{ revokedCount: number }> {
  const workspaceId = requireId(input.workspaceId);
  const targetEmail = normalizedTargetEmail(input.targetEmail);
  const now = new Date();
  const result = await tx.accessToken.updateMany({
    where: {
      purpose: "WORKSPACE_INVITE",
      workspaceId,
      targetEmail,
      intendedRole: input.intendedRole,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { revokedAt: now },
  });
  return { revokedCount: result.count };
}

/**
 * Revoke outstanding reset tokens for exactly one user. Same active-only
 * semantics as invite revocation.
 */
export async function revokeUserResetTokens(
  tx: Prisma.TransactionClient,
  input: { userId: string },
): Promise<{ revokedCount: number }> {
  const userId = requireId(input.userId);
  const now = new Date();
  const result = await tx.accessToken.updateMany({
    where: {
      purpose: "PASSWORD_RESET",
      userId,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { revokedAt: now },
  });
  return { revokedCount: result.count };
}

/**
 * Atomically consume exactly one token inside the caller's transaction. The
 * conditional `updateMany` claims the row under its row lock — a concurrent
 * claim re-evaluates the predicates after the lock and matches nothing, so at
 * most one claim can succeed. Returns the minimum record the future
 * orchestrator needs to continue the transaction (bind user, update
 * membership, audit, …). It performs no other mutation.
 *
 * Every invalid outcome — malformed, missing, wrong purpose, wrong owner
 * scope, expired, revoked, consumed — returns the same `{ ok: false }`.
 * Unexpected database errors propagate; they are never reported as an invalid
 * token.
 */
export async function claimAccessToken(
  tx: Prisma.TransactionClient,
  input: {
    rawToken: unknown;
    purpose: AccessTokenPurpose;
    workspaceId?: string;
    userId?: string;
  },
): Promise<{ ok: true; token: AccessTokenRecord } | { ok: false }> {
  let tokenHash;
  try {
    tokenHash = hashAccessToken(input.rawToken);
  } catch (error) {
    if (error instanceof TokenError) return { ok: false };
    throw error;
  }
  const now = new Date();
  const claimed = await tx.accessToken.updateMany({
    where: {
      tokenHash,
      purpose: input.purpose,
      workspaceId: input.workspaceId,
      userId: input.userId,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });
  if (claimed.count === 0) return { ok: false };
  const token = await tx.accessToken.findUniqueOrThrow({
    where: { tokenHash },
    select: {
      id: true,
      purpose: true,
      workspaceId: true,
      userId: true,
      targetEmail: true,
      intendedRole: true,
      createdByUserId: true,
      createdAt: true,
      targetMemberStateVersion: true,
    },
  });
  return { ok: true, token };
}

/**
 * Read-only validity inspection. Deliberately minimal: `{valid:false}` for
 * malformed/missing/expired/revoked/consumed inputs — indistinguishable — and
 * `{valid:true, purpose, expiresAt}` for an active token. Never returns the
 * email, workspace, user, role, hash, or record identity.
 */
export async function inspectAccessToken(
  db:
    | Prisma.TransactionClient
    | PrismaClient
    | {
        accessToken: Pick<
          Prisma.TransactionClient["accessToken"],
          "findUnique"
        >;
      },
  rawToken: unknown,
): Promise<
  | { valid: false }
  | { valid: true; purpose: AccessTokenPurpose; expiresAt: Date }
> {
  let tokenHash;
  try {
    tokenHash = hashAccessToken(rawToken);
  } catch (error) {
    if (error instanceof TokenError) return { valid: false };
    throw error;
  }
  const row = await db.accessToken.findUnique({
    where: { tokenHash },
    select: {
      purpose: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
    },
  });
  if (!row || row.consumedAt || row.revokedAt || row.expiresAt <= new Date()) {
    return { valid: false };
  }
  return { valid: true, purpose: row.purpose, expiresAt: row.expiresAt };
}

/** S1-F2B: founder-approved retention — terminal rows deletable after 30 days. */
export const ACCESS_TOKEN_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Hard batch bound for a single cleanup call. */
export const ACCESS_TOKEN_CLEANUP_BATCH_LIMIT = 1000;

// The effective terminal timestamp T — MUST stay textually identical to the
// `access_token_terminal_cleanup_idx` expression index
// (migration 20260930180000_stage1_f2b_review_indexes) so the planner can use
// it for the WHERE range scan AND the ORDER BY … LIMIT bound.
const TERMINAL_TS_SQL = `GREATEST(
    COALESCE("consumed_at", 'epoch'::timestamptz),
    COALESCE("revoked_at", 'epoch'::timestamptz),
    CASE
      WHEN "consumed_at" IS NULL AND "revoked_at" IS NULL
      THEN "expires_at"
      ELSE 'epoch'::timestamptz
    END
  )`;

const CLEANUP_VICTIMS_SQL = `
WITH victims AS (
  SELECT "id" FROM "access_token"
  WHERE (${TERMINAL_TS_SQL}) < $1
  ORDER BY (${TERMINAL_TS_SQL}), "id"
  LIMIT ${ACCESS_TOKEN_CLEANUP_BATCH_LIMIT}
)
DELETE FROM "access_token" WHERE "id" IN (SELECT "id" FROM victims)
RETURNING "id"
`;

/**
 * S1-F2B bounded 30-day token cleanup — internal, not a route or a job.
 *
 * Deletes at most `ACCESS_TOKEN_CLEANUP_BATCH_LIMIT` terminal rows per call.
 * "Terminal" uses the most recent applicable terminal timestamp: the LATER of
 * consumed_at/revoked_at when both exist, consumed_at alone, revoked_at alone,
 * or expires_at for rows that expired without consumption/revocation. Each
 * must be older than `now − retention`. An active row (unconsumed, unrevoked,
 * unexpired) is structurally un-selectable — the predicate cannot match it.
 *
 * Retryable and concurrency-safe: two overlapping calls may race on the same
 * victims — each `DELETE … RETURNING` claims its rows once; the loser simply
 * deletes fewer. Repeat calls drain remaining eligible rows. The caller may
 * pass any Prisma client or transaction — nothing here opens a hidden global
 * connection. Errors are structural (`token_store_failed`); P2034 conflict
 * errors propagate for the caller's retry.
 */
export async function cleanupTerminalAccessTokens(
  db: PrismaClient | Prisma.TransactionClient,
  options?: { now?: Date; retentionMs?: number },
): Promise<{ deletedCount: number }> {
  const now = options?.now ?? new Date();
  const retention = options?.retentionMs ?? ACCESS_TOKEN_TERMINAL_RETENTION_MS;
  if (!(now instanceof Date) || Number.isNaN(now.getTime()))
    throw new TokenStoreError("invalid_input");
  const cutoff = new Date(now.getTime() - retention);
  try {
    const deleted = await db.$queryRawUnsafe<Array<{ id: string }>>(
      CLEANUP_VICTIMS_SQL,
      cutoff,
    );
    return { deletedCount: deleted.length };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    )
      throw error;
    throw new TokenStoreError("token_store_failed");
  }
}
