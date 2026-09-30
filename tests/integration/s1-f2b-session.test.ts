import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authConfig } from "../../auth.config";
import {
  createSessionCallbacks,
  type BaseCallbacks,
  type SessionUserGateLookup,
} from "../../lib/auth/session";
import { authorizeCredentials } from "../../lib/credentials";
import { hashPassword } from "../../lib/password";

/**
 * S1-F2B sessionVersion → JWT enforcement against real PostgreSQL, exercising
 * the ACTUAL callback composition wired into NextAuth (`auth.ts`).
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
const PASSWORD = "integration-test-password!";

async function createUser(
  prisma: PrismaClient,
  status: "ACTIVE" | "DEACTIVATED" | "INVITED" = "ACTIVE",
) {
  return prisma.user.create({
    data: {
      email: `sv${++n}_${Date.now()}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      status,
    },
  });
}

describe.skipIf(!enabled)("S1-F2B session version (real PostgreSQL)", () => {
  const url = baseUrl as string;
  let prisma: PrismaClient;
  // The same factory `auth.ts` wires into NextAuth, composed with a lookup
  // bound to THIS disposable DB (the production binding is prismaSessionUserLookup).
  let sessionCallbacks: ReturnType<typeof createSessionCallbacks>;

  beforeAll(async () => {
    runPrisma(["migrate", "deploy"], { DATABASE_URL: url });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","consent_record","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
    const lookup: SessionUserGateLookup = (id) =>
      prisma.user.findUnique({
        where: { id },
        select: { id: true, status: true, sessionVersion: true },
      });
    sessionCallbacks = createSessionCallbacks(
      authConfig.callbacks as unknown as BaseCallbacks,
      lookup,
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const lookupFor = (prismaClient: PrismaClient) => (email: string) =>
    prismaClient.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        status: true,
        sessionVersion: true,
      },
    });

  const session = (token: Record<string, unknown>) =>
    sessionCallbacks.session({
      session: { user: {}, expires: "" } as never,
      token: token as never,
    });

  it("sign-in embeds the DB sessionVersion; matching sv yields a session", async () => {
    const u = await createUser(prisma);
    const authorized = await authorizeCredentials(
      { email: u.email, password: PASSWORD },
      lookupFor(prisma),
    );
    expect(authorized?.sessionVersion).toBe(0);
    const token = await sessionCallbacks.jwt({
      token: {} as never,
      user: authorized as never,
    });
    expect((token as Record<string, unknown>).sv).toBe(0);
    expect((token as Record<string, unknown>).sub).toBe(u.id);
    const s = await session({ sub: u.id, sv: 0 });
    expect(s).not.toBeNull();
    expect(s?.user?.id).toBe(u.id);
  });

  it("incrementing sessionVersion invalidates the old JWT; fresh sign-in works", async () => {
    const u = await createUser(prisma);
    const authorized = await authorizeCredentials(
      { email: u.email, password: PASSWORD },
      lookupFor(prisma),
    );
    const token = await sessionCallbacks.jwt({
      token: {} as never,
      user: authorized as never,
    });
    expect(await session({ sub: u.id, sv: token.sv })).not.toBeNull();

    // The reset path's core: bump the version (what S1-F2D will do atomically).
    await prisma.user.update({
      where: { id: u.id },
      data: { sessionVersion: { increment: 1 } },
    });

    // Old JWT now stale — same as an expired session (null, no reason given).
    expect(await session({ sub: u.id, sv: token.sv })).toBeNull();

    // A fresh sign-in embeds version 1 and works again.
    const reauthorized = await authorizeCredentials(
      { email: u.email, password: PASSWORD },
      lookupFor(prisma),
    );
    const fresh = await sessionCallbacks.jwt({
      token: {} as never,
      user: reauthorized as never,
    });
    expect((fresh as Record<string, unknown>).sv).toBe(1);
    expect(await session({ sub: u.id, sv: fresh.sv })).not.toBeNull();
  });

  it("DEACTIVATED and INVITED users are rejected even with a matching sv", async () => {
    for (const status of ["DEACTIVATED", "INVITED"] as const) {
      const u = await createUser(prisma, status);
      expect(await session({ sub: u.id, sv: 0 })).toBeNull();
    }
  });

  it("missing, malformed, non-integer, and negative sv are all rejected", async () => {
    const u = await createUser(prisma);
    expect(await session({ sub: u.id })).toBeNull();
    expect(await session({ sub: u.id, sv: "0" })).toBeNull();
    expect(await session({ sub: u.id, sv: 0.5 })).toBeNull();
    expect(await session({ sub: u.id, sv: -1 })).toBeNull();
    expect(await session({ sub: u.id, sv: null })).toBeNull();
    expect(await session({ sub: u.id, sv: {} })).toBeNull();
  });

  it("unknown user and missing sub are rejected", async () => {
    expect(await session({ sub: "no-such-user", sv: 0 })).toBeNull();
    expect(await session({ sv: 0 })).toBeNull();
    expect(await session({})).toBeNull();
  });

  it("invalid credentials remain generic null (no session is produced)", async () => {
    const u = await createUser(prisma);
    for (const creds of [
      { email: u.email, password: "wrong-password" },
      { email: "ghost@example.test", password: PASSWORD },
    ]) {
      expect(await authorizeCredentials(creds, lookupFor(prisma))).toBeNull();
    }
  });
});
