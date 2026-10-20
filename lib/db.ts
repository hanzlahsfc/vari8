import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Serialization conflicts arrive in two shapes: typed-query/transaction
 * failures surface as P2034, while raw-statement failures (the FOR UPDATE
 * member/profile/assignment locks) surface as P2010 "raw query failed"
 * with the PostgreSQL SQLSTATE in `meta.code` (40001 conflict, 40P01
 * deadlock). Both are the same retryable transient class. Any other raw
 * SQLSTATE, integrity violation, or non-Prisma error is NOT retryable.
 */
export function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code === "P2010") {
    const sqlstate = (error.meta as { code?: string } | undefined)?.code;
    return sqlstate === "40001" || sqlstate === "40P01";
  }
  return false;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Options for `withSerializedRetry`. The merged per-module copies differed
 * only in these values; every call site keeps its own attempts, backoff,
 * cap, and thrown error (BACKEND-REDUCTION F8).
 */
export type SerializedRetryOptions = {
  /** Total attempts, the first call included. */
  maxAttempts: number;
  /** Linear backoff: before retry n the loop sleeps min(base * n, cap) ms.
   *  Omit `backoffBaseMs` for no backoff. */
  backoffBaseMs?: number;
  backoffCapMs?: number;
  /** Retryable-error predicate; defaults to `isSerializationConflict`.
   *  May throw to short-circuit the retry decision entirely. */
  isRetryable?: (error: unknown) => boolean;
  /** Error thrown when the last allowed attempt still fails retryably.
   *  Default: the raw error is rethrown unchanged. */
  onExhausted?: (error: unknown) => unknown;
  /** Maps a non-retryable failure just before it is rethrown (for example
   *  pool timeouts mapped to a domain error). */
  onMiss?: (error: unknown) => void;
};

/**
 * The one serialization-retry loop. Retries `fn` while `isRetryable` says
 * the failure is a transient serialization conflict and attempts remain;
 * on the last attempt `onExhausted` decides the thrown error, and a
 * non-retryable failure passes through `onMiss` before being rethrown.
 */
export async function withSerializedRetry<T>(
  fn: () => Promise<T>,
  options: SerializedRetryOptions,
): Promise<T> {
  const isRetryable = options.isRetryable ?? isSerializationConflict;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (isRetryable(error)) {
        if (++attempt < options.maxAttempts) {
          if (options.backoffBaseMs !== undefined)
            await sleep(
              Math.min(
                options.backoffBaseMs * attempt,
                options.backoffCapMs ?? Number.POSITIVE_INFINITY,
              ),
            );
          continue;
        }
        if (options.onExhausted !== undefined) throw options.onExhausted(error);
        throw error;
      }
      options.onMiss?.(error);
      throw error;
    }
  }
}
