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
  if (!NAME_RE.test(dbname))
    throw new Error(
      "disposable_db: base database name must carry the p8r_ disposable prefix",
    );
  return u;
}

/** Return `base` with its pathname replaced by `name` (validated, distinct). */
export function disposableDbUrl(base: string, name: string): string {
  const u = parseAndValidate(base);
  if (!NAME_RE.test(name))
    throw new Error("disposable_db: target name must carry the p8r_ prefix");
  const original = u.pathname.replace(/^\//, "");
  if (name === original)
    throw new Error("disposable_db: target name must be distinct from base");
  u.pathname = `/${name}`;
  return u.toString();
}

/**
 * Create a uniquely named, run-owned disposable database migrated from the
 * current schema, and return a client bound to it. The caller owns cleanup —
 * `dropOwnedDb` only drops names this run created.
 */
export async function createOwnedDisposableDb(base: string): Promise<{
  name: string;
  url: string;
  client: PrismaClient;
}> {
  const baseUrl = parseAndValidate(base);
  const name = `${DISPOSABLE_DB_PREFIX}rb_${randomBytes(4).toString("hex")}`;
  // Admin connects to the maintenance `postgres` database on the same host.
  const adminU = new URL(baseUrl.toString());
  adminU.pathname = "/postgres";
  const adminClient = new PrismaClient({
    datasources: { db: { url: adminU.toString() } },
  });
  try {
    await adminClient.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await adminClient.$disconnect();
  }
  const ownedUrl = disposableDbUrl(base, name);
  if (ownedUrl === base)
    throw new Error("disposable_db: distinct check failed");
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: ownedUrl },
  });
  const client = new PrismaClient({ datasources: { db: { url: ownedUrl } } });
  // Ownership proof BEFORE any destructive statement is permitted.
  const [{ current_database }] = await client.$queryRawUnsafe<
    Array<{ current_database: string }>
  >("SELECT current_database()");
  if (current_database !== name)
    throw new Error("disposable_db: connected database is not the owned name");
  return { name, url: ownedUrl, client };
}

/** Drop ONLY a database created by createOwnedDisposableDb in this run. */
export async function dropOwnedDb(base: string, name: string): Promise<void> {
  const u = parseAndValidate(base);
  if (!NAME_RE.test(name) || !name.startsWith(`${DISPOSABLE_DB_PREFIX}rb_`))
    throw new Error("disposable_db: refusing to drop a non-owned database");
  u.pathname = "/postgres";
  const admin = new PrismaClient({
    datasources: { db: { url: u.toString() } },
  });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await admin.$disconnect();
  }
}
