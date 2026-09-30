import { execFileSync } from "node:child_process";

import { encode } from "@auth/core/jwt";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth, handlers } from "../../auth";
import { setTestHeaders } from "./stubs/next-headers";

/**
 * S1-F2B runtime regression — the REAL exported NextAuth pipeline.
 *
 * These tests exercise `auth()` (the RSC/`getSession` path) and `handlers`
 * (`/api/auth/session`) from `../../auth` end-to-end: real JWT decode, real
 * `authNodeCallbacks` (the exact object `auth.ts` wires into NextAuth — bound
 * to this disposable DB via `DATABASE_URL`), real cookie cleaning.
 *
 * RED history: on the original `null as unknown as Session` implementation,
 * `auth()` returned a token-derived default session even when the session
 * callback returned null — because `getSession` wraps the callback with
 * `?? { ...args[0].session, expires }`. These tests reproduced that bypass.
 */
const baseUrl = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof baseUrl === "string" && baseUrl.length > 0;
const AUTH_SECRET = "integration-test-auth-secret-not-for-production";
const COOKIE_NAME = "authjs.session-token";

function runPrisma(args: string[], env: Record<string, string> = {}): void {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
}

async function sessionJwtCookie(claims: Record<string, unknown>) {
  const jwt = await encode({
    token: { iat: Math.floor(Date.now() / 1000), ...claims } as never,
    secret: AUTH_SECRET,
    salt: COOKIE_NAME,
    maxAge: 30 * 24 * 60 * 60,
  });
  return `${COOKIE_NAME}=${jwt}`;
}

async function authForCookie(cookie: string) {
  setTestHeaders(
    new Headers({
      cookie,
      host: "localhost",
      "x-forwarded-proto": "http",
    }),
  );
  return auth();
}

async function sessionEndpoint(cookie: string) {
  return handlers.GET(
    new NextRequest("http://localhost/api/auth/session", {
      headers: { cookie },
    }),
  );
}

describe.skipIf(!enabled)(
  "S1-F2B session revocation through the real Auth.js pipeline",
  () => {
    const url = baseUrl as string;
    let prisma: PrismaClient;

    beforeAll(async () => {
      runPrisma(["migrate", "deploy"], { DATABASE_URL: url });
      prisma = new PrismaClient({ datasources: { db: { url } } });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "users" RESTART IDENTITY CASCADE',
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    const mkUser = (over: Partial<import("@prisma/client").User> = {}) =>
      prisma.user.create({
        data: {
          email: `rt-${Date.now()}-${Math.random()}@example.test`,
          passwordHash: "scrypt$x",
          status: "ACTIVE",
          ...over,
        },
      });

    it("valid current session authenticates through real auth()", async () => {
      const u = await mkUser();
      const cookie = await sessionJwtCookie({ sub: u.id, sv: 0 });
      const session = await authForCookie(cookie);
      expect(session?.user?.id).toBe(u.id);
    });

    it("sessionVersion bump makes real auth() unauthenticated", async () => {
      const u = await mkUser();
      const cookie = await sessionJwtCookie({ sub: u.id, sv: 0 });
      await prisma.user.update({
        where: { id: u.id },
        data: { sessionVersion: { increment: 1 } },
      });
      await expect(authForCookie(cookie)).resolves.toBeNull();
      // Fresh sign-in level claim (sv=1) works again.
      const fresh = await sessionJwtCookie({ sub: u.id, sv: 1 });
      const session = await authForCookie(fresh);
      expect(session?.user?.id).toBe(u.id);
    });

    it("missing, malformed, non-integer, negative sv all fail closed", async () => {
      const u = await mkUser();
      for (const sv of [undefined, "0", 0.5, -1, NaN, null, true, {}]) {
        const cookie = await sessionJwtCookie({ sub: u.id, sv });
        await expect(
          authForCookie(cookie),
          `sv=${JSON.stringify(sv)}`,
        ).resolves.toBeNull();
      }
    });

    it("non-ACTIVE and unknown/deleted users are unauthenticated", async () => {
      const invited = await mkUser({ status: "INVITED" });
      const deactivated = await mkUser({ status: "DEACTIVATED" });
      for (const u of [invited, deactivated]) {
        const cookie = await sessionJwtCookie({ sub: u.id, sv: 0 });
        await expect(authForCookie(cookie)).resolves.toBeNull();
      }
      const ghost = await sessionJwtCookie({
        sub: "user-does-not-exist",
        sv: 0,
      });
      await expect(authForCookie(ghost)).resolves.toBeNull();
    });

    it("malformed/missing subject fails closed; DB failure fails closed", async () => {
      const u = await mkUser();
      for (const sub of [undefined, null, 42, "", {}]) {
        const cookie = await sessionJwtCookie({ sub, sv: 0 });
        await expect(authForCookie(cookie)).resolves.toBeNull();
      }
      // DB failure: rename users table → lookup throws → gate must fail closed.
      const cookie = await sessionJwtCookie({ sub: u.id, sv: 0 });
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "users" RENAME TO "users_off"',
      );
      try {
        await expect(authForCookie(cookie)).resolves.toBeNull();
      } finally {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "users_off" RENAME TO "users"',
        );
      }
    });

    it("/api/auth/session returns null and clears the cookie on invalidation", async () => {
      const u = await mkUser();
      const cookie = await sessionJwtCookie({ sub: u.id, sv: 0 });
      await prisma.user.update({
        where: { id: u.id },
        data: { sessionVersion: { increment: 1 } },
      });
      const res = await sessionEndpoint(cookie);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toBeNull();
      const setCookies = res.headers.getSetCookie();
      expect(
        setCookies.some(
          (c) =>
            c.startsWith(`${COOKIE_NAME}=`) &&
            /(Max-Age=0|Expires=Thu, 01 Jan 1970|expires=Thu, 01 Jan 1970)/i.test(
              c,
            ),
        ),
      ).toBe(true);
    });

    it("update payloads cannot inject or refresh sv through the real pipeline", async () => {
      const u = await mkUser();
      const cookie = await sessionJwtCookie({ sub: u.id, sv: 0 });
      await prisma.user.update({
        where: { id: u.id },
        data: { sessionVersion: { increment: 1 } },
      });
      // Client sends {data:{sv:1}} — the update path must NOT trust it.
      const res = await handlers.POST(
        new NextRequest("http://localhost/api/auth/session", {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ data: { sv: 1 } }),
        }),
      );
      const body = await res.json().catch(() => null);
      // Either the update is rejected or the session stays unauthenticated —
      // never a session whose sv was resurrected from client input.
      expect(body === null || res.status !== 200).toBe(true);
      const after = await authForCookie(cookie);
      expect(after).toBeNull();
    });
  },
);
