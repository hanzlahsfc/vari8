import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { auth as authServer } from "../../lib/auth/server";
import { getViewerFromHeaders } from "../../lib/auth/viewer";
import { hashPassword } from "../../lib/password";
import { setTestHeaders } from "./stubs/next-headers";

/**
 * S1-F2B session enforcement against real PostgreSQL — PR-05 rewiring.
 *
 * The Auth.js machinery this file exercised is gone (auth.config.ts,
 * lib/auth/session.ts JWT callbacks, sessionVersion claims). Under Better
 * Auth a session is a `sessions` row: sign-in mints it, revocation is row
 * deletion, and expiry/deactivation checks run inside the real pipeline
 * (`auth.handler`/`auth.api.*` + the viewer seam in lib/auth/viewer.ts).
 * Every surviving invariant is exercised end-to-end; JWT/sessionVersion
 * assertions were CUT-AT-REPLACE with the engine.
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

let n = 0;
const PASSWORD = "integration-test-password-1";

async function createUser(
  prisma: PrismaClient,
  status: "ACTIVE" | "DEACTIVATED" | "INVITED" = "ACTIVE",
) {
  const email = `sv_${++n}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD), // legacy mirror column
      status,
      name: `Fixture ${n}`,
    },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPassword(PASSWORD),
    },
  });
  return user;
}

async function signIn(email: string, password = PASSWORD) {
  const res = await authServer.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const body = (await res.json().catch(() => null)) as {
    token?: string;
  } | null;
  const bearer = res.headers.get("set-auth-token");
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { res, body, bearer, cookie };
}

const bearerHeaders = (bearer: string) =>
  new Headers({ authorization: `Bearer ${bearer}` });
const cookieHeaders = (cookie: string) => new Headers({ cookie });

describe.skipIf(!enabled)("S1-F2B session lifecycle (real PostgreSQL)", () => {
  const url = baseUrl as string;
  let prisma: PrismaClient;

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

  it("sign-in establishes a session row; bearer and cookie credentials resolve the same user", async () => {
    const u = await createUser(prisma);
    const { res, body, bearer, cookie } = await signIn(u.email);
    expect(res.status).toBe(200);
    expect(body?.token).toBeTruthy();

    // The credential is a real `sessions` row keyed on the bare token.
    const rows = await prisma.session.findMany({
      where: { userId: u.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(body?.token);
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Both credential forms resolve through the viewer seam.
    const viaBearer = await getViewerFromHeaders(bearerHeaders(bearer!));
    expect(viaBearer?.id).toBe(u.id);
    expect(viaBearer?.email).toBe(u.email);
    const viaCookie = await getViewerFromHeaders(cookieHeaders(cookie));
    expect(viaCookie?.id).toBe(u.id);
  });

  it("deleting the session row revokes the credential; a fresh sign-in works", async () => {
    const u = await createUser(prisma);
    const first = await signIn(u.email);
    expect(first.res.status).toBe(200);
    expect((await getViewerFromHeaders(bearerHeaders(first.bearer!)))?.id).toBe(
      u.id,
    );

    // Revocation = row deletion. The dead credential resolves anonymous on
    // both transports — the old sessionVersion-bump invariant, restated.
    await prisma.session.deleteMany({ where: { userId: u.id } });
    await expect(
      getViewerFromHeaders(bearerHeaders(first.bearer!)),
    ).resolves.toBeNull();
    await expect(
      getViewerFromHeaders(cookieHeaders(first.cookie)),
    ).resolves.toBeNull();

    // A fresh sign-in mints a new row and resolves again.
    const second = await signIn(u.email);
    expect(second.res.status).toBe(200);
    expect(
      (await getViewerFromHeaders(bearerHeaders(second.bearer!)))?.id,
    ).toBe(u.id);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(1);
  });

  it("non-ACTIVE users are denied at sign-in; deactivation deletes the live session rows", async () => {
    // Sign-in denial is the same generic failure as a bad password.
    for (const status of ["DEACTIVATED", "INVITED"] as const) {
      const u = await createUser(prisma, status);
      const { res } = await signIn(u.email);
      expect(res.status).toBe(401);
      expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    }

    // A session that was live dies on the next resolution once the account
    // leaves ACTIVE — the viewer seam denies on BOTH transports and the
    // session rows are deleted by the auth hook.
    const u = await createUser(prisma);
    const { bearer, cookie } = await signIn(u.email);
    expect((await getViewerFromHeaders(bearerHeaders(bearer!)))?.id).toBe(u.id);
    await prisma.user.update({
      where: { id: u.id },
      data: { status: "DEACTIVATED" },
    });
    // Authorization boundary (app routes go through the viewer): dead on
    // bearer and cookie alike.
    await expect(
      getViewerFromHeaders(bearerHeaders(bearer!)),
    ).resolves.toBeNull();
    await expect(
      getViewerFromHeaders(cookieHeaders(cookie)),
    ).resolves.toBeNull();
    // The cookie-bound session path also sweeps the rows (the before-hook's
    // getSessionFromCtx sees cookie auth; bearer auth is injected later —
    // a deactivated user's bearer still resolves on BA's own endpoints,
    // reported as a residual gap in product code).
    await expect(
      authServer.api.getSession({ headers: cookieHeaders(cookie) }),
    ).resolves.toBeNull();
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
  });

  it("unknown, malformed, and expired credentials resolve to anonymous", async () => {
    const u = await createUser(prisma);
    const good = await signIn(u.email);

    // Garbage bearer/garbage cookie — no session row matches.
    await expect(
      getViewerFromHeaders(bearerHeaders("not-a-real-token")),
    ).resolves.toBeNull();
    await expect(
      getViewerFromHeaders(cookieHeaders("better-auth.session_token=zzz")),
    ).resolves.toBeNull();

    // Expired session row: resolves to anonymous and is swept on read.
    const stale = await prisma.session.create({
      data: {
        userId: u.id,
        token: `exp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(
      getViewerFromHeaders(bearerHeaders(stale.token)),
    ).resolves.toBeNull();
    expect(
      await prisma.session.findUnique({ where: { id: stale.id } }),
    ).toBeNull();

    // The live credential still works.
    expect((await getViewerFromHeaders(bearerHeaders(good.bearer!)))?.id).toBe(
      u.id,
    );
  });

  it("sign-out deletes the session row and expires the session cookie", async () => {
    const u = await createUser(prisma);
    const { bearer, cookie } = await signIn(u.email);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(1);

    const res = await authServer.handler(
      new Request(`${BASE}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          cookie,
          origin: BASE,
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    // Cookie cleared via Set-Cookie expiry.
    const setCookies = res.headers.getSetCookie();
    expect(
      setCookies.some(
        (c) =>
          c.startsWith("better-auth.session_token=") && /Max-Age=0/i.test(c),
      ),
    ).toBe(true);
    // Row gone; both credential forms resolve anonymous.
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    await expect(
      getViewerFromHeaders(bearerHeaders(bearer!)),
    ).resolves.toBeNull();
    await expect(
      getViewerFromHeaders(cookieHeaders(cookie)),
    ).resolves.toBeNull();
  });

  it("invalid sign-in attempts fail generically and mint no session", async () => {
    const u = await createUser(prisma);
    for (const creds of [
      { email: u.email, password: "wrong-password" },
      { email: `ghost_${Date.now()}@example.test`, password: PASSWORD },
    ]) {
      const { res, body } = await signIn(
        u.email === creds.email ? u.email : creds.email,
        creds.password,
      );
      expect(res.status).toBe(401);
      expect(body?.token).toBeUndefined();
    }
    // Ghost + bad password share one indistinguishable response shape.
    const bad = await authServer.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: u.email, password: "nope" }),
      }),
    );
    const ghost = await authServer.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `ghost2_${Date.now()}@example.test`,
          password: PASSWORD,
        }),
      }),
    );
    expect(bad.status).toBe(ghost.status);
    expect(await bad.json()).toEqual(await ghost.json());
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
  });
});
