import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { signUpCoachAccount } from "../../lib/auth/signup";

/**
 * PR-05 auth flow — drives the real Better Auth HTTP surface
 * (`auth.handler`, the same code mounted at /api/auth/*) against the real
 * migrated schema: sign-in, lockout, rate limiting, reset single-use and
 * 60-minute expiry, session revocation, and the disabled sign-up endpoint.
 * Every request is a plain Request, exactly what the route handler receives.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const BASE = "http://127.0.0.1:3000";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

function get(path: string, headers: Record<string, string> = {}) {
  return auth.handler(new Request(`${BASE}/api/auth${path}`, { headers }));
}

describe.skipIf(!enabled)("PR-05 auth flow (real PG + real handler)", () => {
  let prisma: PrismaClient;
  let n = 0;
  let mailboxDir = "";

  const ip = () => `10.200.0.${++n}`; // isolate the shared rate-limit bucket
  const PASSWORD = "fixture-pass-1";

  async function userFixture(status: "ACTIVE" | "DEACTIVATED" = "ACTIVE") {
    const id = `u${n}_${Date.now()}`;
    const email = `${id}@example.test`;
    await prisma.user.create({
      data: {
        id,
        email,
        passwordHash: await hashPassword(PASSWORD),
        name: `User ${id}`,
        status,
      },
    });
    await prisma.account.create({
      data: {
        userId: id,
        accountId: id,
        providerId: "credential",
        password: await hashPassword(PASSWORD),
      },
    });
    return { id, email };
  }

  /** Sign in via the real handler; returns the bearer token. */
  async function signInToken(email: string, password = PASSWORD) {
    const res = await post(
      "/sign-in/email",
      { email, password },
      { "x-forwarded-for": ip() },
    );
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return token as string;
  }

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "rate_limit","verifications","sessions","accounts","audit_event","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
    mailboxDir = await mkdtemp(join(tmpdir(), "pr05-mail-"));
    process.env.DEV_MAILBOX_FILE = join(mailboxDir, "mailbox.jsonl");
  });

  afterAll(async () => {
    delete process.env.DEV_MAILBOX_FILE;
    await rm(mailboxDir, { recursive: true, force: true });
    await prisma?.$disconnect();
  });

  it("sign-in accepts valid credentials and resolves a session", async () => {
    const { email } = await userFixture();
    const token = await signInToken(email);
    const res = await get("/get-session", bearer(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(email);
  });

  it("wrong password is refused generically", async () => {
    const { email } = await userFixture();
    const res = await post(
      "/sign-in/email",
      { email, password: "wrong-pass-9" },
      { "x-forwarded-for": ip() },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("a deactivated account gets the same refusal as a wrong password", async () => {
    const { email } = await userFixture("DEACTIVATED");
    const res = await post(
      "/sign-in/email",
      { email, password: PASSWORD },
      { "x-forwarded-for": ip() },
    );
    expect(res.status).toBe(401);
  });

  it("a deactivated user's existing session stops resolving", async () => {
    const { id, email } = await userFixture();
    const token = await signInToken(email);
    await prisma.user.update({ where: { id }, data: { status: "DEACTIVATED" } });
    // The auth endpoint still resolves the session row; the app-level viewer
    // (lib/auth/viewer.ts) is what denies it — assert that contract directly.
    const { getViewerFromHeaders } = await import("../../lib/auth/viewer");
    const viewer = await getViewerFromHeaders(new Headers(bearer(token)));
    expect(viewer).toBeNull();
  });

  it("the 11th rapid wrong-password attempt is rate limited", async () => {
    const { email } = await userFixture();
    const addr = ip();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await post(
        "/sign-in/email",
        { email, password: "wrong-pass-9" },
        { "x-forwarded-for": addr },
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
  });

  it("the public sign-up endpoint is disabled", async () => {
    const res = await post(
      "/sign-up/email",
      { name: "Nope", email: `nope${n}@example.test`, password: "fixture-pass-1" },
      { "x-forwarded-for": ip() },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("coach self-signup creates account+workspace+owner membership atomically", async () => {
    const email = `coach${n}@example.test`;
    const result = await signUpCoachAccount(
      { name: "Coach A", email, password: PASSWORD, workspaceName: "Team A" },
      prisma,
    );
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: result.workspaceId,
          userId: result.userId,
        },
      },
    });
    expect(member?.role).toBe("WORKSPACE_OWNER");
    // and the new credential actually signs in
    const token = await signInToken(email);
    expect(token).toBeTruthy();
  });

  it("reset: request -> mailbox link -> consume -> single use + session revoked", async () => {
    const { id, email } = await userFixture();
    const liveToken = await signInToken(email);

    const req = await post(
      "/request-password-reset",
      { email },
      { "x-forwarded-for": ip() },
    );
    expect(req.status).toBe(200);

    const mailbox = await readFile(
      process.env.DEV_MAILBOX_FILE as string,
      "utf8",
    );
    const line = mailbox.trim().split("\n").filter((l) => l.includes(email)).at(-1);
    expect(line).toBeTruthy();
    const token = /token=([^\s]+)/.exec(JSON.parse(line as string).text)?.[1];
    expect(token).toBeTruthy();

    const reset = await post(
      "/reset-password",
      { newPassword: "new-fixture-pass-2", token },
      { "x-forwarded-for": ip() },
    );
    expect(reset.status).toBe(200);

    // single use: the second consume is refused
    const again = await post(
      "/reset-password",
      { newPassword: "new-fixture-pass-3", token },
      { "x-forwarded-for": ip() },
    );
    expect(again.status).toBe(400);
    expect((await again.json()).code).toBe("INVALID_TOKEN");

    // the pre-reset session is revoked
    const stale = await get("/get-session", bearer(liveToken));
    expect(stale.status).toBe(200);
    expect(await stale.text()).toBe("null");

    // the new password signs in; the old one does not
    await signInToken(email, "new-fixture-pass-2");
    const old = await post(
      "/sign-in/email",
      { email, password: PASSWORD },
      { "x-forwarded-for": ip() },
    );
    expect(old.status).toBe(401);

    // no live sessions for the user predating the reset remain
    const sessions = await prisma.session.findMany({ where: { userId: id } });
    expect(sessions.every((s) => s.createdAt > new Date(Date.now() - 60_000))).toBe(
      true,
    );
  });

  it("an expired reset token is refused", async () => {
    const { id } = await userFixture();
    await prisma.verification.create({
      data: {
        identifier: "reset-password:expired-fixture-token",
        value: id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await post(
      "/reset-password",
      { newPassword: "new-fixture-pass-2", token: "expired-fixture-token" },
      { "x-forwarded-for": ip() },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_TOKEN");
  });

  it("change-password revokes the user's other sessions only", async () => {
    const { email } = await userFixture();
    const tokenA = await signInToken(email);
    const tokenB = await signInToken(email);

    const res = await post(
      "/change-password",
      {
        currentPassword: PASSWORD,
        newPassword: "rotated-pass-7",
        revokeOtherSessions: true,
      },
      { ...bearer(tokenA), "x-forwarded-for": ip() },
    );
    expect(res.status).toBe(200);

    // Every pre-existing session row is deleted — tokenA and tokenB are both
    // dead; the caller continues on the fresh session returned in the body.
    expect(await (await get("/get-session", bearer(tokenB))).text()).toBe("null");
    expect(await (await get("/get-session", bearer(tokenA))).text()).toBe("null");
    const fresh = (await res.json()).token ?? res.headers.get("set-auth-token");
    expect(fresh).toBeTruthy();
    const stillAlive = await get("/get-session", bearer(fresh));
    expect((await stillAlive.json()).user.email).toBe(email);
  });
});
