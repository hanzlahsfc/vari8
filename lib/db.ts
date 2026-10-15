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
