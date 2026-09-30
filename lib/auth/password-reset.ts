import { Prisma, PrismaClient } from "@prisma/client";

import { writeAccountAuditEvent } from "../audit";
import { normalizeEmail } from "../credentials";
import { hashPassword } from "../password";
import { validatePasswordPolicy } from "../password-policy";
import { prisma } from "../db";
import { hashAccessToken, type RawAccessToken } from "../tokens/crypto";
import { claimAccessToken, issuePasswordResetToken } from "../tokens/store";

/**
 * S1-F2D — password-reset orchestration (internal services only).
 *
 * Deliberate product decision (Aleks, 2026-09-30): the request response DOES
 * distinguish account existence (`ACCOUNT_EXISTS`/`ACCOUNT_NOT_FOUND`) — an
 * accepted enumeration risk. It must never widen: no status, role, workspace,
 * membership, or client detail ever leaves this surface.
 *
 * Transaction design (one Serializable transaction per attempt):
 *
 * - Lock order is always `users → access_token` — the same global order as
 *   S1-F2C (users row first). Request and consume cannot deadlock each other
 *   because both acquire the account's user row before touching token rows.
 * - The `users ... FOR UPDATE` row lock is the per-account serialization
 *   point AND the freshness barrier: a status change committed while we wait
 *   forces 40001 (P2010 → bounded retry → fresh snapshot → deny).
 * - Sibling revocation uses a `FOR UPDATE` scan keyed by PK: locking reads
 *   see rows committed after the tx snapshot, so a concurrent winner's fresh
 *   token is never invisible to a waiter's stale snapshot (the failure that
 *   motivated S1-F2C's second repair).
 * - Bounded retries (MAX_ATTEMPTS = 2) only for genuine serialization
 *   failures (P2034, or P2010 carrying SQLSTATE 40001/40P01). Unrelated or
 *   malformed P2002 never retries and never claims `serialization_conflict`.
 *
 * The raw token leaves the service exactly once — post-commit, inside the
 * private `ResetDeliveryPayload`. It is never stored, logged, audited, or
 * included in errors. Provider, sender, domain, and URLs do not exist yet;
 * `assertPasswordResetOrchestrationExternallyExposable` fails closed. No
 * `app/**` file may import this module.
 */

export type PasswordResetErrorCode =
  | "invalid_input"
  | "invalid_token"
  | "account_ineligible"
  | "serialization_conflict"
  | "reset_failed"
  | "resets_not_exposable";

export class PasswordResetError extends Error {
  constructor(readonly code: PasswordResetErrorCode) {
    super(code);
    this.name = "PasswordResetError";
  }
}

const MAX_EMAIL_LENGTH = 254;

function normalizedEmail(value: unknown): string {
  const email = normalizeEmail(value);
  // Minimal structural shape (same spirit as the store's length bound):
  // a non-empty local part and domain — no full RFC validation here.
  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+$/.test(email)
  )
    throw new PasswordResetError("invalid_input");
  return email;
}

/** SQLSTATEs that are genuine serialization artifacts over raw SQL. */
const RAW_SERIALIZATION_SQLSTATES = new Set(["40001", "40P01"]);

function isSerializationFailure(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
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

function isRetryableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    isSerializationFailure(error)
  );
}

/** Bounded retries — enough to outlast a small concurrent burst; never
 * an unbounded loop. Genuine serialization conflicts only. */
const MAX_ATTEMPTS = 3;

const STRUCTURAL_ERRORS = new Set([
  "PasswordResetError",
  "PasswordPolicyError",
  "TokenError",
  "TokenStoreError",
  "AuditError",
]);

/** Structural codes only — never a raw Prisma/SQL message or input echo. */
function mapResetError(error: unknown): never {
  if (error instanceof Error && STRUCTURAL_ERRORS.has(error.name)) throw error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    isSerializationFailure(error)
  )
    throw new PasswordResetError("serialization_conflict");
  // Unrelated/malformed P2002 and every other database failure land here —
  // never silently retried, never mislabeled as a serialization conflict.
  throw new PasswordResetError("reset_failed");
}

// --- request ------------------------------------------------------------------

/** Public outcome — existence only. Contains NO private delivery data when
 * the account is missing or not ACTIVE. */
export type PasswordResetRequestResult = {
  outcome: "ACCOUNT_EXISTS" | "ACCOUNT_NOT_FOUND";
  /** Private delivery data — present ONLY for an ACTIVE account that was
   * issued a token. Structurally separate from the public existence bit. */
  delivery?: ResetDeliveryPayload;
};

/** Private delivery payload — post-commit only, never part of the public
 * existence outcome's wire semantics. */
export type ResetDeliveryPayload = {
  kind: "password_reset";
  to: string;
  rawToken: RawAccessToken;
  expiresAt: Date;
};

/**
 * Request a password reset for `email`. Any existing account returns
 * `ACCOUNT_EXISTS` (INVITED/DEACTIVATED included — but only ACTIVE accounts
 * are issued a token). The ACTIVE path runs in one Serializable transaction:
 * lock the user row → re-verify ACTIVE → lock+revoke outstanding siblings →
 * issue → audit. Audit failure rolls back revocation + issuance, so the
 * previous valid token is preserved when the replacement never committed.
 */
export async function requestPasswordReset(
  input: { email: unknown },
  client: PrismaClient = prisma,
): Promise<PasswordResetRequestResult> {
  const email = normalizedEmail(input.email);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const account = await client.user.findUnique({
        where: { email },
        select: { id: true, status: true },
      });
      // Existence outcome for every status — but nothing is issued before the
      // in-transaction ACTIVE re-check.
      if (!account) return { outcome: "ACCOUNT_NOT_FOUND" };

      const delivery = await client.$transaction(
        async (tx) => {
          // 1. Serialize same-account requests + detect concurrent status
          //    changes: users row lock FIRST (global order users →
          //    access_token; consume locks in the same order).
          const rows = await tx.$queryRawUnsafe<
            Array<{ id: string; status: string }>
          >(
            `SELECT "id", "status" FROM "users" WHERE "id" = $1 FOR UPDATE`,
            account.id,
          );
          const current = rows[0];
          if (!current || current.status !== "ACTIVE") return null; // exists-only; zero mutations
          // 2. Locking scan of outstanding siblings — sees rows committed
          //    after our snapshot, so a concurrent winner's fresh token is
          //    never invisible here.
          const siblings = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT "id" FROM "access_token"
             WHERE "user_id" = $1
               AND "purpose" = 'PASSWORD_RESET'::"AccessTokenPurpose"
               AND "consumed_at" IS NULL
               AND "revoked_at" IS NULL
               AND "expires_at" > now()
             FOR UPDATE`,
            account.id,
          );
          if (siblings.length > 0) {
            await tx.accessToken.updateMany({
              where: { id: { in: siblings.map((s) => s.id) } },
              data: { revokedAt: new Date() },
            });
          }
          const issued = await issuePasswordResetToken(tx, {
            userId: account.id,
          });
          await writeAccountAuditEvent(tx, {
            subjectUserId: account.id,
            actorUserId: null,
            action: "PASSWORD_RESET",
            resourceType: "access_token",
            resourceId: issued.tokenId,
            meta: { resetStage: "REQUESTED" },
          });
          return {
            kind: "password_reset" as const,
            to: email,
            rawToken: issued.rawToken,
            expiresAt: issued.expiresAt,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return delivery
        ? { outcome: "ACCOUNT_EXISTS", delivery }
        : { outcome: "ACCOUNT_EXISTS" };
    } catch (error) {
      if (isRetryableConflict(error) && attempt < MAX_ATTEMPTS) continue;
      throw mapResetError(error);
    }
  }
  throw new PasswordResetError("serialization_conflict");
}

// --- consume ------------------------------------------------------------------

export type PasswordResetConsumeResult = {
  changed: true;
};

/**
 * Consume a password-reset token. Password policy + hashing run BEFORE the
 * transaction (a policy failure can never have claimed the token). Inside one
 * Serializable transaction: resolve the token's bound user → lock the user
 * row → require ACTIVE → atomic conditional claim → lock+revoke siblings →
 * passwordHash + sessionVersion++ → account audit → commit. Every failure
 * rolls back every effect including the claim.
 */
export async function resetPasswordWithToken(
  input: { rawToken: unknown; password: unknown },
  client: PrismaClient = prisma,
): Promise<PasswordResetConsumeResult> {
  // Structural token validation happens inside claimAccessToken; validating
  // the password first guarantees a policy failure cannot consume the token.
  const normalizedPassword = validatePasswordPolicy(input.password);
  const passwordHash = await hashPassword(normalizedPassword);
  // Malformed token input fails structurally before any database work.
  const tokenHash = safeTokenHash(input.rawToken);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.$transaction(
        async (tx) => {
          // Resolve the bound user via the unique hash — a plain read is safe
          // because the claim below re-verifies every predicate atomically.
          const row = await tx.accessToken.findUnique({
            where: { tokenHash },
            select: { userId: true, purpose: true },
          });
          const userId = row?.purpose === "PASSWORD_RESET" ? row.userId : null;
          if (!userId) throw new PasswordResetError("invalid_token");

          // users row lock FIRST (shared order) — serializes against request
          // and any concurrent sibling consume; a committed status change
          // during the wait forces a serialization retry.
          const users = await tx.$queryRawUnsafe<
            Array<{ id: string; status: string }>
          >(
            `SELECT "id", "status" FROM "users" WHERE "id" = $1 FOR UPDATE`,
            userId,
          );
          if (!users[0] || users[0].status !== "ACTIVE")
            throw new PasswordResetError("invalid_token");

          // Atomic claim — exactly one concurrent winner per token.
          const claim = await claimAccessToken(tx, {
            rawToken: input.rawToken,
            purpose: "PASSWORD_RESET",
            userId,
          });
          if (!claim.ok) throw new PasswordResetError("invalid_token");

          // Lock + revoke outstanding siblings (locking read sees the freshest
          // committed rows even under this tx's older snapshot).
          const siblings = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT "id" FROM "access_token"
             WHERE "user_id" = $1
               AND "purpose" = 'PASSWORD_RESET'::"AccessTokenPurpose"
               AND "consumed_at" IS NULL
               AND "revoked_at" IS NULL
               AND "expires_at" > now()
             FOR UPDATE`,
            userId,
          );
          if (siblings.length > 0) {
            await tx.accessToken.updateMany({
              where: { id: { in: siblings.map((s) => s.id) } },
              data: { revokedAt: new Date() },
            });
          }

          // Conditional update — status changed concurrently → fail closed.
          const updated = await tx.user.updateMany({
            where: { id: userId, status: "ACTIVE" },
            data: {
              passwordHash,
              sessionVersion: { increment: 1 },
            },
          });
          if (updated.count === 0)
            throw new PasswordResetError("invalid_token");

          await writeAccountAuditEvent(tx, {
            subjectUserId: userId,
            actorUserId: userId,
            action: "PASSWORD_RESET",
            resourceType: "access_token",
            resourceId: claim.token.id,
            meta: { resetStage: "COMPLETED" },
          });
          return { changed: true as const };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isRetryableConflict(error) && attempt < MAX_ATTEMPTS) continue;
      throw mapResetError(error);
    }
  }
  throw new PasswordResetError("serialization_conflict");
}

/** Hash-or-die — malformed input becomes the shared invalid surface. */
function safeTokenHash(rawToken: unknown): string {
  try {
    return hashAccessToken(rawToken);
  } catch {
    throw new PasswordResetError("invalid_token");
  }
}

/**
 * Fail-closed exposure assertion. Reset orchestration stays internal until
 * the routing slice adds reviewed routes/actions, a decided provider +
 * sender + base URL, and rate limiting — and passes independent review.
 */
export function assertPasswordResetOrchestrationExternallyExposable(): never {
  throw new PasswordResetError("resets_not_exposable");
}
