import { describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

import {
  DISPOSABLE_DB_PREFIX,
  createOwnedDisposableDb,
  disposableDbUrl,
  dropOwnedDb,
  maintenanceDbUrl,
} from "./disposable-db";

const BASE =
  "postgresql://app:app_dev_password@127.0.0.1:5445/p8r_int?schema=public";
const CI_BASE =
  "postgresql://app:app_dev_password@127.0.0.1:5432/app_integration_test?schema=public";
const enabled =
  typeof process.env.INTEGRATION_DATABASE_URL === "string" &&
  process.env.INTEGRATION_DATABASE_URL.length > 0;

describe("disposable-db URL safety contract", () => {
  it("swaps the pathname to the owned name, preserving query + credentials", () => {
    const out = disposableDbUrl(BASE, `${DISPOSABLE_DB_PREFIX}rb_x1`);
    const u = new URL(out);
    expect(u.pathname).toBe(`/${DISPOSABLE_DB_PREFIX}rb_x1`);
    expect(u.search).toBe("?schema=public");
    expect(u.hostname).toBe("127.0.0.1");
    expect(out).not.toBe(BASE);
  });

  it("works when the base URL has no query string", () => {
    const out = disposableDbUrl(
      "postgresql://app:pw@127.0.0.1:5445/p8r_base",
      `${DISPOSABLE_DB_PREFIX}rb_y`,
    );
    expect(new URL(out).pathname).toBe(`/${DISPOSABLE_DB_PREFIX}rb_y`);
  });

  it("fails closed on non-loopback hosts — an env URL is never assumed disposable", () => {
    for (const host of [
      "db.internal.example.com",
      "10.0.0.5",
      "db.prod.local",
    ]) {
      expect(() =>
        disposableDbUrl(
          `postgresql://u:p@${host}:5432/p8r_int`,
          `${DISPOSABLE_DB_PREFIX}rb_z`,
        ),
      ).toThrowError(/host|loopback|disposable/i);
    }
  });

  it("fails closed on non-postgres protocols and unparseable URLs", () => {
    expect(() =>
      disposableDbUrl(
        "https://127.0.0.1/p8r_int",
        `${DISPOSABLE_DB_PREFIX}rb_a`,
      ),
    ).toThrowError(/protocol/i);
    expect(() =>
      disposableDbUrl("not a url", `${DISPOSABLE_DB_PREFIX}rb_a`),
    ).toThrowError();
  });

  it("requires the BASE database to be an approved disposable name", () => {
    expect(() =>
      disposableDbUrl(
        "postgresql://app:pw@127.0.0.1:5432/production",
        `${DISPOSABLE_DB_PREFIX}rb_a`,
      ),
    ).toThrowError(/disposable|approved/i);
  });

  it("accepts the repository-approved CI base app_integration_test", () => {
    const out = disposableDbUrl(CI_BASE, `${DISPOSABLE_DB_PREFIX}rb_ci1`);
    expect(new URL(out).pathname).toBe(`/${DISPOSABLE_DB_PREFIX}rb_ci1`);
  });

  it("requires the target name to carry the disposable prefix", () => {
    for (const bad of ["otherdb", "prod_1", "p8r-thing (dash)", "../x", ""]) {
      expect(() => disposableDbUrl(BASE, bad)).toThrowError(
        /disposable|prefix|name/i,
      );
    }
  });

  it("asserts the derived URL can never equal the supplied database", () => {
    // p8r_int is the base itself — rejected before any URL is produced.
    expect(() => disposableDbUrl(BASE, "p8r_int")).toThrowError(
      /same|distinct|owned/i,
    );
  });

  it("only owned-run name shapes are ever derived (cleanup targets)", () => {
    for (const bad of [
      "p8r_int",
      "app_integration_test",
      "postgres",
      "p8r_user_data",
    ]) {
      expect(() => disposableDbUrl(BASE, bad)).toThrowError(
        /same|owned|rb_|prefix/i,
      );
    }
  });
});

// Live-PG ownership behavior — skipped without an approved disposable base.
describe.skipIf(!enabled)(
  "disposable-db ownership enforcement (real PG)",
  () => {
    const base = process.env.INTEGRATION_DATABASE_URL as string;
    const adminUrl = maintenanceDbUrl(base);

    async function admin(): Promise<PrismaClient> {
      const a = new PrismaClient({ datasources: { db: { url: adminUrl } } });
      await a.$queryRawUnsafe("SELECT 1");
      return a;
    }
    const exists = async (a: PrismaClient, name: string) =>
      (
        await a.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT count(*)::int AS n FROM pg_database WHERE datname='${name}'`,
        )
      )[0].n === 1;

    it("rejects cleanup of a name this process never created — before any SQL", async () => {
      await expect(dropOwnedDb(base, "p8r_rb_never_made")).rejects.toThrowError(
        /run-owned|not created/i,
      );
      await expect(dropOwnedDb(base, "p8r_int")).rejects.toThrowError(
        /run-owned|owned/i,
      );
    });

    it("creates, verifies ownership, and cleans up only its own database", async () => {
      const owned = await createOwnedDisposableDb(base);
      expect(owned.name).toMatch(/^p8r_rb_[a-z0-9_]+$/);
      const a = await admin();
      try {
        expect(await exists(a, owned.name)).toBe(true);
        await owned.cleanup();
        expect(await exists(a, owned.name)).toBe(false);
        // A second cleanup of the same name still refuses (registry revoked).
        await expect(dropOwnedDb(base, owned.name)).rejects.toThrowError(
          /run-owned|not created/i,
        );
      } finally {
        await a.$disconnect();
      }
    });

    it("a CREATE collision on a preexisting name never drops that database", async () => {
      const a = await admin();
      const victim = `p8r_rb_victim_${Date.now()}`;
      try {
        await a.$executeRawUnsafe(`CREATE DATABASE "${victim}"`);
        expect(await exists(a, victim)).toBe(true);
        await expect(
          createOwnedDisposableDb(base, { generateName: () => victim }),
        ).rejects.toThrow();
        // The preexisting DB survives — create failure must not trigger cleanup.
        expect(await exists(a, victim)).toBe(true);
      } finally {
        await a.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${victim}"`);
        await a.$disconnect();
      }
    });

    it("a migration failure cleans up the DB it created", async () => {
      const a = await admin();
      let leakedName = "";
      try {
        await expect(
          createOwnedDisposableDb(base, {
            migrate: async () => {
              throw new Error("injected migrate failure");
            },
            onName: (n) => (leakedName = n),
          }),
        ).rejects.toThrowError(/injected migrate failure/);
        expect(leakedName).not.toBe("");
        expect(await exists(a, leakedName)).toBe(false);
      } finally {
        await a.$disconnect();
      }
    });

    it("an ownership-check failure cleans up the DB it created", async () => {
      const a = await admin();
      let leakedName = "";
      try {
        await expect(
          createOwnedDisposableDb(base, {
            verifyOwnership: async () => "not_our_db",
            onName: (n) => (leakedName = n),
          }),
        ).rejects.toThrowError(/owned|current_database|ownership/i);
        expect(await exists(a, leakedName)).toBe(false);
      } finally {
        await a.$disconnect();
      }
    });
  },
);
