import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupTerminalAccessTokens,
  ACCESS_TOKEN_CLEANUP_BATCH_LIMIT,
} from "../../lib/tokens/store";

/**
 * S1-F2B 30-day bounded token cleanup against real migrated PostgreSQL.
 * Rows are seeded via raw SQL (only token_hash ever stored — synthetic
 * digests, never real tokens).
 */
const baseUrl = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof baseUrl === "string" && baseUrl.length > 0;

function runPrisma(args: string[], env: Record<string, string> = {}): void {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
}

let n = 0;
const NOW = new Date("2026-10-01T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe.skipIf(!enabled)("S1-F2B token cleanup (real PostgreSQL)", () => {
  const url = baseUrl as string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    runPrisma(["migrate", "deploy"], { DATABASE_URL: url });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$executeRawUnsafe('TRUNCATE "access_token" RESTART IDENTITY');
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let subjectUserId = "";
  /** Seed a reset-shaped token row (only token_hash stored — synthetic digests). */
  async function seed(opts: {
    consumedAt?: Date | null;
    revokedAt?: Date | null;
    expiresAt?: Date;
    createdAt?: Date;
  }) {
    const hash = `${++n}${"a".repeat(63)}`.slice(0, 64);
    const createdAt = opts.createdAt ?? daysAgo(100);
    const expiresAt =
      opts.expiresAt ?? new Date(createdAt.getTime() + 12 * 3_600_000);
    await prisma.accessToken.create({
      data: {
        tokenHash: hash,
        purpose: "PASSWORD_RESET",
        userId: subjectUserId,
        expiresAt,
        createdAt,
        consumedAt: opts.consumedAt ?? null,
        revokedAt: opts.revokedAt ?? null,
      },
    });
    return hash;
  }

  const remaining = () =>
    prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM "access_token"`,
    );

  it("deletes only terminal rows older than 30 days — all four shapes", async () => {
    const subject = await prisma.user.create({
      data: {
        email: `cleanup-subject-${Date.now()}@example.test`,
        passwordHash: "scrypt$x",
      },
    });
    subjectUserId = subject.id;
    const hashes = {
      oldConsumed: await seed({ consumedAt: daysAgo(31) }),
      oldRevoked: await seed({ revokedAt: daysAgo(45) }),
      oldExpiredOnly: await seed({ expiresAt: daysAgo(60) }),
      oldBoth: await seed({ consumedAt: daysAgo(40), revokedAt: daysAgo(31) }),
      // Boundary: exactly 30 days old is NOT yet eligible.
      freshConsumed: await seed({ consumedAt: daysAgo(29) }),
      recentRevoked: await seed({ revokedAt: daysAgo(10) }),
      // consumed+revoked where the LATER event is recent → retained.
      mixedRecent: await seed({
        consumedAt: daysAgo(90),
        revokedAt: daysAgo(5),
      }),
      active: await seed({ expiresAt: new Date(NOW.getTime() + DAY_MS) }),
    };
    const res = await cleanupTerminalAccessTokens(prisma, { now: NOW });
    expect(res.deletedCount).toBe(4);
    const rows = await prisma.$queryRawUnsafe<Array<{ token_hash: string }>>(
      `SELECT "token_hash" FROM "access_token"`,
    );
    const left = rows.map((r) => r.token_hash);
    for (const gone of [
      hashes.oldConsumed,
      hashes.oldRevoked,
      hashes.oldExpiredOnly,
      hashes.oldBoth,
    ]) {
      expect(left).not.toContain(gone);
    }
    for (const kept of [
      hashes.freshConsumed,
      hashes.recentRevoked,
      hashes.mixedRecent,
      hashes.active,
    ]) {
      expect(left).toContain(kept);
    }
    await prisma.$executeRawUnsafe('TRUNCATE "access_token" RESTART IDENTITY');
  });

  it("batch bound: removes exactly 1000 per call and drains on repeat", async () => {
    const hashPrefix = "b".repeat(55);
    const total = ACCESS_TOKEN_CLEANUP_BATCH_LIMIT + 7;
    for (let i = 0; i < total; i += 250) {
      const rows = [];
      for (let j = i; j < Math.min(i + 250, total); j++) {
        rows.push({
          tokenHash: `${hashPrefix}${String(j).padStart(9, "0")}`,
          purpose: "PASSWORD_RESET" as const,
          userId: subjectUserId,
          expiresAt: daysAgo(40),
          createdAt: daysAgo(100),
          consumedAt: daysAgo(40),
        });
      }
      await prisma.accessToken.createMany({ data: rows });
    }
    const first = await cleanupTerminalAccessTokens(prisma, { now: NOW });
    expect(first.deletedCount).toBe(ACCESS_TOKEN_CLEANUP_BATCH_LIMIT);
    const second = await cleanupTerminalAccessTokens(prisma, { now: NOW });
    expect(second.deletedCount).toBe(7);
    const third = await cleanupTerminalAccessTokens(prisma, { now: NOW });
    expect(third.deletedCount).toBe(0);
    expect((await remaining())[0].c).toBe(0);
  });

  it("concurrent calls are safe (no row deleted twice, no crash)", async () => {
    for (let i = 0; i < 50; i++) {
      await seed({ consumedAt: daysAgo(35) });
    }
    const [a, b, c] = await Promise.all([
      cleanupTerminalAccessTokens(prisma, { now: NOW }),
      cleanupTerminalAccessTokens(prisma, { now: NOW }),
      cleanupTerminalAccessTokens(prisma, { now: NOW }),
    ]);
    expect(a.deletedCount + b.deletedCount + c.deletedCount).toBe(50);
    expect((await remaining())[0].c).toBe(0);
  });

  it("errors are structural and non-secret", async () => {
    // A client whose connection is broken maps to a stable code, never SQL text.
    const broken = {
      $queryRawUnsafe: async () => {
        throw new Error("secret connection string internal://db");
      },
    };
    await expect(
      cleanupTerminalAccessTokens(broken as never, { now: NOW }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "token_store_failed" }),
    );
    try {
      await cleanupTerminalAccessTokens(broken as never, { now: NOW });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("internal://db");
    }
  });
});
