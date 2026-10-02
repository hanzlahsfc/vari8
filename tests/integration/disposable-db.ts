import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

/**
 * Disposable-database safety helpers for integration tests.
 *
 * An environment-supplied URL is NEVER assumed disposable. To qualify, the
 * URL must be postgres on a loopback host AND its database name must carry
 * the test-owned prefix; derived databases get a unique run-owned name under
 * the same prefix. Destructive statements only ever target a database this
 * run created and verified by name via current_database().
 */

export const DISPOSABLE_DB_PREFIX = "p8r_";
const NAME_RE = /^p8r_[a-z0-9_]{1,48}$/;
const OWNED_RE = /^p8r_rb_[a-z0-9_]{1,48}$/;
const APPROVED_BASE_NAMES = new Set(["app_integration_test"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function parseAndValidate(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("disposable_db: unparseable URL");
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:")
    throw new Error("disposable_db: protocol must be postgres");
  if (!LOOPBACK_HOSTS.has(u.hostname))
    throw new Error("disposable_db: host must be loopback (disposable scope)");
  const dbname = u.pathname.replace(/^\//, "");
  if (!NAME_RE.test(dbname) && !APPROVED_BASE_NAMES.has(dbname))
    throw new Error(
      "disposable_db: base database is not an approved disposable name",
    );
  return u;
}

/** The maintenance database URL on the same (validated) host. */
export function maintenanceDbUrl(base: string): string {
  const u = parseAndValidate(base);
  u.pathname = "/postgres";
  return u.toString();
}

/** Return `base` with its pathname replaced by an owned-run `name`. */
export function disposableDbUrl(base: string, name: string): string {
  const u = parseAndValidate(base);
  if (!OWNED_RE.test(name))
    throw new Error(
      "disposable_db: derived targets must be run-owned p8r_rb_* names",
    );
  if (name === u.pathname.replace(/^\//, ""))
    throw new Error("disposable_db: target name must be distinct from base");
  u.pathname = `/${name}`;
  return u.toString();
}

/** Databases this process successfully created — the only droppable names. */
const createdThisRun = new Set<string>();

export type OwnedDbDeps = {
  generateName?: () => string;
  migrate?: (url: string) => Promise<void> | void;
  verifyOwnership?: (client: PrismaClient, name: string) => Promise<string>;
  onName?: (name: string) => void;
};

const defaultMigrate = (url: string) =>
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });

const defaultVerifyOwnership = async (
  client: PrismaClient,
  _name: string,
): Promise<string> =>
  (
    await client.$queryRawUnsafe<Array<{ current_database: string }>>(
      "SELECT current_database()",
    )
  )[0].current_database;

async function adminOn(base: string): Promise<PrismaClient> {
  return new PrismaClient({
    datasources: { db: { url: maintenanceDbUrl(base) } },
  });
}

/** Drop ONLY a database created by createOwnedDisposableDb in this process. */
export async function dropOwnedDb(base: string, name: string): Promise<void> {
  parseAndValidate(base);
  // Registry check BEFORE any SQL — a well-formed name that this run did not
  // create is still refused.
  if (!createdThisRun.has(name))
    throw new Error("disposable_db: refusing to drop a non-run-owned database");
  const admin = await adminOn(base);
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    createdThisRun.delete(name);
  } finally {
    await admin.$disconnect();
  }
}

/**
 * Create a uniquely named, run-owned disposable database migrated from the
 * current schema. On any post-CREATE failure the DB we created is dropped and
 * the client disconnected; a failed CREATE (e.g. collision on a preexisting
 * name) never triggers a drop. `cleanup()` disconnects the client and drops
 * the exact owned name.
 */
export async function createOwnedDisposableDb(
  base: string,
  deps: OwnedDbDeps = {},
): Promise<{
  name: string;
  url: string;
  client: PrismaClient;
  cleanup: () => Promise<void>;
}> {
  parseAndValidate(base);
  const name =
    deps.generateName?.() ??
    `${DISPOSABLE_DB_PREFIX}rb_${randomBytes(4).toString("hex")}`;
  if (!OWNED_RE.test(name))
    throw new Error("disposable_db: owned name must match p8r_rb_*");
  deps.onName?.(name);

  const admin = await adminOn(base);
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    createdThisRun.add(name);
  } finally {
    await admin.$disconnect();
  }
  if (!created) {
    // CREATE failed (e.g. collision) — nothing of ours exists; never drop what
    // may be a preexisting database.
    createdThisRun.delete(name);
    throw new Error("disposable_db: CREATE DATABASE failed");
  }

  const ownedUrl = disposableDbUrl(base, name);
  let client: PrismaClient | null = null;
  const cleanupCreated = async () => {
    await client?.$disconnect();
    await dropOwnedDb(base, name);
  };
  try {
    await (deps.migrate ?? defaultMigrate)(ownedUrl);
    client = new PrismaClient({ datasources: { db: { url: ownedUrl } } });
    const current = await (deps.verifyOwnership ?? defaultVerifyOwnership)(
      client,
      name,
    );
    if (current !== name)
      throw new Error("disposable_db: ownership check failed");
  } catch (e) {
    await cleanupCreated();
    throw e;
  }

  const boundClient = client;
  return {
    name,
    url: ownedUrl,
    client: boundClient,
    cleanup: async () => {
      await boundClient.$disconnect();
      await dropOwnedDb(base, name);
    },
  };
}
