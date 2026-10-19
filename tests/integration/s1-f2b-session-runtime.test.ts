import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { auth as rootAuth } from "../../auth";
import { auth as authServer } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { setTestHeaders } from "./stubs/next-headers";

/**
 * S1-F2B runtime regression — the REAL exported auth pipeline.
 *
 * PR-05 rewiring: the old file forged Auth.js JWT session cookies through
 * `@auth/core/jwt` to hit `auth()`/`handlers`. That machinery is gone. These
 * tests exercise the live contract end-to-end: real sign-in through
 * `auth.handler` (minting a `sessions` row + Set-Cookie), `auth()` from the
 * repo-root seam resolving through the stubbed `next/headers`, revocation by
 * row deletion, expiry sweeps, deactivation, fail-closed store errors, and
 * cookie clearing on sign-out.
 */
const baseUrl = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof baseUrl === "string" && baseUrl.length > 0;
const BASE = "http://127.0.0.1:3000";

function runPrisma(args: string[], env: Record<string, string> = {}): void {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
}

async function signIn(email: string, password: string) {
  return authServer.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
}

async function authForCookie(cookie: string) {
  setTestHeaders(
    new Headers({
      cookie,
      host: "127.0.0.1",
    }),
  );
  return rootAuth();
}

async function authForBearer(bearer: string) {
  setTestHeaders(
    new Headers({ authorization: `Bearer ${bearer}`, host: "127.0.0.1" }),
  );
  return rootAuth();
}

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

describe.skipIf(!enabled)(
  "S1-F2B session revocation through the real auth pipeline",
  () => {
    const url = baseUrl as string;
    let prisma: PrismaClient;
    let n = 0;
    const PASSWORD = "runtime-session-pw-1";

    beforeAll(async () => {
      runPrisma(["migrate", "deploy"], { DATABASE_URL: url });
      prisma = new PrismaClient({ datasources: { db: { url } } });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });
    beforeEach(() => {
      setTestHeaders(new Headers());
    });

    const mkUser = (
      over: Partial<import("@prisma/client").User> = {},
    ) =>
      prisma.user.create({
        data: {
          email: `rt_${Date.now()}_${++n}_${Math.random()
            .toString(36)
            .slice(2, 8)}@example.test`,
          passwordHash: "fixture",
          status: "ACTIVE",
          ...over,
        },
      });
    async function mkCredentialUser(
      status: "ACTIVE" | "DEACTIVATED" | "INVITED" = "ACTIVE",
    ) {
      const u = await mkUser({ status });
      await prisma.account.create({
        data: {
          userId: u.id,
          accountId: u.id,
          providerId: "credential",
          password: await hashPassword(PASSWORD),
        },
      });
      return u;
    }

    it("a live session authenticates through real auth() — cookie and bearer", async () => {
      const u = await mkCredentialUser();
      const res = await signIn(u.email, PASSWORD);
      expect(res.status).toBe(200);
      const cookie = cookieOf(res);
      const bearer = res.headers.get("set-auth-token")!;

      const session = await authForCookie(cookie);
      expect(session?.user?.id).toBe(u.id);
      const viaBearer = await authForBearer(bearer);
      expect(viaBearer?.user?.id).toBe(u.id);
    });

    it("deleting the session row makes real auth() unauthenticated; a fresh sign-in works", async () => {
      const u = await mkCredentialUser();
      const res = await signIn(u.email, PASSWORD);
      const cookie = cookieOf(res);
      expect((await authForCookie(cookie))?.user?.id).toBe(u.id);

      // Row deletion is the revocation primitive (was: sessionVersion bump).
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await expect(authForCookie(cookie)).resolves.toBeNull();

      const fresh = await signIn(u.email, PASSWORD);
      expect(fresh.status).toBe(200);
      expect((await authForCookie(cookieOf(fresh)))?.user?.id).toBe(u.id);
    });

    it("forged, malformed, and expired credentials all fail closed through auth()", async () => {
      const u = await mkCredentialUser();
      for (const cookie of [
        "better-auth.session_token=forged-value",
        "better-auth.session_token=",
        "authjs.session-token=forged-authjs-legacy",
        "unrelated=1",
        "",
      ]) {
        await expect(
          authForCookie(cookie),
          `cookie=${cookie}`,
        ).resolves.toBeNull();
      }
      for (const bearer of ["deadbeef", "Bearer", "x.y.z"]) {
        await expect(authForBearer(bearer)).resolves.toBeNull();
      }
      // A planted expired session row resolves anonymous (and is swept).
      const staleToken = `expired_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const staleRow = await prisma.session.create({
        data: {
          userId: u.id,
          token: staleToken,
          expiresAt: new Date(Date.now() - 60_000),
        },
      });
      await expect(authForBearer(staleToken)).resolves.toBeNull();
      expect(
        await prisma.session.findUnique({ where: { id: staleRow.id } }),
      ).toBeNull();
    });

    it("non-ACTIVE and deleted users are unauthenticated through real auth()", async () => {
      // Deactivated mid-session: the hook deletes the rows and the session
      // endpoint resolves anonymous.
      const u = await mkCredentialUser();
      const res = await signIn(u.email, PASSWORD);
      const cookie = cookieOf(res);
      expect((await authForCookie(cookie))?.user?.id).toBe(u.id);
      await prisma.user.update({
        where: { id: u.id },
        data: { status: "DEACTIVATED" },
      });
      await expect(authForCookie(cookie)).resolves.toBeNull();
      expect(await prisma.session.count({ where: { userId: u.id } })).toBe(
        0,
      );

      // Deleted user: session rows cascade away; the credential is dead.
      const u2 = await mkCredentialUser();
      const res2 = await signIn(u2.email, PASSWORD);
      const cookie2 = cookieOf(res2);
      await prisma.user.delete({ where: { id: u2.id } });
      await expect(authForCookie(cookie2)).resolves.toBeNull();
    });

    it("a session-store failure fails closed to anonymous", async () => {
      const u = await mkCredentialUser();
      const res = await signIn(u.email, PASSWORD);
      const cookie = cookieOf(res);
      expect((await authForCookie(cookie))?.user?.id).toBe(u.id);
      // The viewer seam must fail closed when the user lookup cannot run.
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "users" RENAME TO "users_off_rt"',
      );
      try {
        await expect(authForCookie(cookie)).resolves.toBeNull();
      } finally {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "users_off_rt" RENAME TO "users"',
        );
      }
      // Sanity: restored, the same cookie resolves again.
      expect((await authForCookie(cookie))?.user?.id).toBe(u.id);
    });

    it("GET /api/auth/get-session returns JSON null for invalid credentials", async () => {
      const res = await authServer.handler(
        new Request(`${BASE}/api/auth/get-session`, {
          headers: { cookie: "better-auth.session_token=zzz" },
        }),
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toBeNull();

      // And for a formerly-valid session whose row was revoked.
      const u = await mkCredentialUser();
      const signin = await signIn(u.email, PASSWORD);
      const cookie = cookieOf(signin);
      await prisma.session.deleteMany({ where: { userId: u.id } });
      const dead = await authServer.handler(
        new Request(`${BASE}/api/auth/get-session`, {
          headers: { cookie },
        }),
      );
      expect(dead.status).toBe(200);
      await expect(dead.json()).resolves.toBeNull();
    });

    it("POST /api/auth/sign-out clears the session cookie and deletes the row", async () => {
      const u = await mkCredentialUser();
      const signin = await signIn(u.email, PASSWORD);
      const cookie = cookieOf(signin);
      expect(await prisma.session.count({ where: { userId: u.id } })).toBe(
        1,
      );

      const res = await authServer.handler(
        new Request(`${BASE}/api/auth/sign-out`, {
          method: "POST",
          headers: { cookie, origin: BASE },
        }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(
        res.headers
          .getSetCookie()
          .some(
            (c) =>
              c.startsWith("better-auth.session_token=") &&
              /Max-Age=0/i.test(c),
          ),
      ).toBe(true);
      expect(await prisma.session.count({ where: { userId: u.id } })).toBe(
        0,
      );
      await expect(authForCookie(cookie)).resolves.toBeNull();
    });
  },
);
