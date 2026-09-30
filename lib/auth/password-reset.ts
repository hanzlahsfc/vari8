import { Prisma, PrismaClient } from "@prisma/client";

import { writeAccountAuditEvent } from "../audit";
import { normalizeEmail } from "../credentials";
import { hashPassword } from "../password";
import { validatePasswordPolicy } from "../password-policy";
import { prisma } from "../db";
import {
  hashAccessToken,
  TokenError,
  type RawAccessToken,
} from "../tokens/crypto";
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
 * - The `users ... FOR UPDATE` row lock serializes writers on the EXISTING
 *   user row and preserves lock ordering. It does NOT see rows inserted after
 *   this transaction's snapshot — no locking read does. Correctness against
 *   concurrent inserts comes from PostgreSQL SSI: the predicate read and the
 *   concurrent insert conflict, one transaction is aborted (40001 → P2010),
 *   and the bounded retry gives it a fresh snapshot that sees the winner's
 *   row. Sibling revocation therefore relies on SSI + retry, not on
 *   snapshot-transcending reads.
 * - Bounded retries (MAX_ATTEMPTS below, plus small deterministic backoff)
 *   only for genuine serialization failures (P2034, or P2010 carrying
 *   SQLSTATE 40001/40P01). Unrelated or malformed P2002, application errors,
 *   and delivery failures never retry and never claim `serialization_conflict`.
 *
 * The raw token leaves the service exactly once — post-commit, through the
 * injected `deliver` sink. It is never stored, logged, audited, or included
 * in errors. Provider, sender, domain, and URLs do not exist yet;
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

/**
 * Bounded retries: enough headroom that an eight-way same-account burst
 * resolves without `serialization_conflict` rejections (proven on real
 * PostgreSQL), while staying a hard bound — never an unbounded loop.
 * A small deterministic backoff between attempts lets waiters pass the
 * user-row lock before colliding again.
 */
const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 10;
const BACKOFF_CAP_MS = 50;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

/** Public outcome — existence ONLY. Never carries delivery data, status,
 * role, workspace, or any other account detail. */
export type PasswordResetRequestResult = {
  outcome: "ACCOUNT_EXISTS" | "ACCOUNT_NOT_FOUND";
};

/** Private delivery payload — passed to the injected sink post-commit only,
 * never part of the public existence result. */
export type ResetDeliveryPayload = {
  kind: "password_reset";
  to: string;
  rawToken: RawAccessToken;
  expiresAt: Date;
};

/** Provider-neutral delivery port. Runs exactly once, after a successful
 * commit, outside the transaction and outside the retry loop. A thrown
 * delivery error surfaces as `reset_failed` and can never replay the
 * committed mutation. */
export type ResetDeliverySink = (
  payload: ResetDeliveryPayload,
) => void | Promise<void>;

/**
 * Request a password reset for `email`. Any existing account returns
 * `ACCOUNT_EXISTS` (INVITED/DEACTIVATED included — but only ACTIVE accounts
 * are issued a token). The ACTIVE path runs in one Serializable transaction:
 * lock the user row → re-verify ACTIVE → revoke outstanding siblings →
 * issue → audit. Audit failure rolls back revocation + issuance, so the
 * previous valid token is preserved when the replacement never committed.
 *
 * On success for an ACTIVE account the delivery sink is invoked exactly once
 * with the private payload after the transaction commits. It is never called
 * for missing accounts, non-ACTIVE accounts, or rolled-back issuance.
 */
export async function requestPasswordReset(
  input: { email: unknown },
  options: { deliver: ResetDeliverySink },
  client: PrismaClient = prisma,
): Promise<PasswordResetRequestResult> {
  // The delivery sink is MANDATORY — without it, a successful issuance would
  // discard the only copy of the raw token. Reject before any lookup,
  // transaction, revocation, issuance, or audit (JavaScript callers cannot
  // bypass a merely-typed contract).
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.deliver !== "function"
  )
    throw new PasswordResetError("invalid_input");
  const email = normalizedEmail(input.email);

  let delivery: ResetDeliveryPayload | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const account = await client.user.findUnique({
        where: { email },
        select: { id: true, status: true },
      });
      // Existence outcome for every status — but nothing is issued before the
      // in-transaction ACTIVE re-check.
      if (!account) return { outcome: "ACCOUNT_NOT_FOUND" };

      delivery = await client.$transaction(
        async (tx) => {
          // 1. Lock the existing user row first (global order users →
          //    access_token — consume uses the same order, so request and
          //    consume cannot deadlock each other). This serializes
          //    same-account requests and turns a status change committed
          //    during the wait into a 40001/P2010 serialization failure →
          //    bounded retry → fresh snapshot → deny.
          const rows = await tx.$queryRawUnsafe<
            Array<{ id: string; status: string }>
          >(
            `SELECT "id", "status" FROM "users" WHERE "id" = $1 FOR UPDATE`,
            account.id,
          );
          const current = rows[0];
          if (!current || current.status !== "ACTIVE") return null; // exists-only; zero mutations
          // 2. Lock the user's currently-visible outstanding reset tokens.
          //    This coordinates EXISTING rows only — a concurrent winner's
          //    insert committed after our snapshot is not visible here; that
          //    race is caught by the SSI predicate-read/insert conflict, which
          //    aborts one transaction into the bounded retry above.
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
      break;
    } catch (error) {
      if (isRetryableConflict(error) && attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(attempt * BACKOFF_BASE_MS, BACKOFF_CAP_MS));
        continue;
      }
      throw mapResetError(error);
    }
  }
  if (delivery) {
    // Private delivery runs exactly once, post-commit, outside the retry
    // loop — a delivery error maps to reset_failed and cannot replay the
    // committed issuance.
    try {
      await options.deliver?.(delivery);
    } catch {
      throw new PasswordResetError("reset_failed");
    }
  }
  return { outcome: "ACCOUNT_EXISTS" };
}

// --- consume ------------------------------------------------------------------

export type PasswordResetConsumeResult = {
  changed: true;
};

/**
 * Consume a password-reset token. Order is deliberate: the raw token is
 * validated structurally FIRST (malformed input never triggers password
 * work or a database mutation), then the password policy + scrypt hash run
 * BEFORE the transaction (a policy failure can never have claimed the
 * token). Inside one Serializable transaction: resolve the token's bound
 * user → lock the user row → require ACTIVE → atomic conditional claim →
 * revoke siblings → passwordHash + sessionVersion++ → account audit →
 * commit. Every failure rolls back every effect including the claim.
 */
export async function resetPasswordWithToken(
  input: { rawToken: unknown; password: unknown },
  client: PrismaClient = prisma,
): Promise<PasswordResetConsumeResult> {
  // 1. Structural token validation — malformed input dies here, before any
  //    password hashing or database work.
  const tokenHash = safeTokenHash(input.rawToken);
  // 2. Password policy + hashing — still outside the transaction, so a
  //    policy failure cannot have claimed anything.
  const normalizedPassword = validatePasswordPolicy(input.password);
  const passwordHash = await hashPassword(normalizedPassword);

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

          // users row lock FIRST (shared order users → access_token) —
          // serializes this consume against same-account requests and sibling
          // consumes on the EXISTING user row; a committed status change
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

          // Lock + revoke outstanding siblings — coordinates existing rows;
          // post-snapshot inserts are handled by the SSI conflict + retry.
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

          // Consumption is authenticated by the bearer token, NOT a user
          // session — actor stays null; the account itself is the subject.
          await writeAccountAuditEvent(tx, {
            subjectUserId: userId,
            actorUserId: null,
            actorRole: null,
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
      if (isRetryableConflict(error) && attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(attempt * BACKOFF_BASE_MS, BACKOFF_CAP_MS));
        continue;
      }
      throw mapResetError(error);
    }
  }
  throw new PasswordResetError("serialization_conflict");
}

/**
 * Structural hash-or-die. A `TokenError` means the input is malformed → the
 * shared `invalid_token` surface. Any OTHER (unexpected internal) failure is
 * `reset_failed` — never misclassified, never echoing the original message
 * or the submitted token.
 */
function safeTokenHash(rawToken: unknown): string {
  try {
    return hashAccessToken(rawToken);
  } catch (error) {
    if (error instanceof TokenError)
      throw new PasswordResetError("invalid_token");
    throw new PasswordResetError("reset_failed");
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
