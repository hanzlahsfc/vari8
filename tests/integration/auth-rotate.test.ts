import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/v1/auth/refresh/route";
import { GET as GET_SESSION } from "../../app/api/v1/workspaces/[workspaceId]/session/route";
import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";

/**
 * AUTH-ROTATE: `POST /api/v1/auth/refresh` against the real migrated schema and
 * the real Better Auth pipeline. Each case here fails when the guard it covers
 * is removed (see `icm/05-build/reports/AUTH-ROTATE.md`, bite and restore).
 *
 * Only the evidence a click cannot give lives here: concurrency, replay
 * families, deactivation, membership loss, the throttle, token-in-logs, and
 * the reset-link membership rule.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";
const PASSWORD = "fixture-pass-1";
const COOKIE = "better-auth.session_token";

describe.skipIf(!enabled)("POST /api/v1/auth/refresh (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const issued: string[] = [];
  const mailboxDir = mkdtempSync(path.join(tmpdir(), "auth-rotate-mail-"));
  const mailbox = path.join(mailboxDir, "mailbox.jsonl");

  const tag = () => `ar${++n}_${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "spent_refresh_tokens","rate_limit","verifications","sessions","accounts","audit_event","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    // Slice 8 of the acceptance list: the tokens minted here are written
    // OUTSIDE the test log so the report can grep the captured output for
    // them. Nothing is printed.
    const leakFile = process.env.AUTH_ROTATE_TOKEN_FILE;
    if (leakFile && issued.length > 0) {
      writeFileSync(leakFile, issued.join("\n") + "\n", "utf8");
    }
    await prisma?.$disconnect();
  });

  async function fixture(
    role: "WORKSPACE_OWNER" | "COACH" | "CLIENT" | null,
    options: { status?: "ACTIVE" | "DEACTIVATED"; clientProfile?: boolean } = {},
  ) {
    const t = tag();
    const email = `${t}@example.test`;
    const workspace = await prisma.workspace.create({
      data: { name: t, slug: t, status: "ACTIVE" },
    });
    const user = await prisma.user.create({
      data: {
        email,
        name: t,
        passwordHash: "fixture",
        status: options.status ?? "ACTIVE",
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
    const member = role
      ? await prisma.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            role,
            status: "ACTIVE",
          },
        })
      : null;
    const clientProfile = options.clientProfile
      ? await prisma.clientProfile.create({
          data: { workspaceId: workspace.id, userId: user.id, name: t },
        })
      : null;
    return { user, workspace, member, clientProfile, email };
  }

  async function signIn(email: string): Promise<string> {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    issued.push(token as string);
    return token as string;
  }

  function refresh(
    token: string | null,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const all: Record<string, string> = { ...headers };
    if (token !== null) all.authorization = `Bearer ${token}`;
    return POST(
      new Request(`${BASE}/api/v1/auth/refresh`, { method: "POST", headers: all }),
    );
  }

  async function rotate(token: string): Promise<string> {
    const res = await refresh(token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    issued.push(body.token);
    return body.token;
  }

  function sessionRoute(token: string, workspaceId: string) {
    return GET_SESSION(
      new Request(`${BASE}/api/v1/workspaces/${workspaceId}/session`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      { params: Promise.resolve({ workspaceId }) },
    );
  }

  it("mints a new token and kills the old one server side", async () => {
    const { user, workspace, email } = await fixture("CLIENT");
    const token = await signIn(email);

    const res = await refresh(token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      expiresAt: string;
      rotateAt: string;
    };
    issued.push(body.token);
    expect(body.token).not.toBe(token);
    expect(body.token.length).toBeGreaterThanOrEqual(32);

    // Lifetimes: 7 days absolute, rotateAt at 80 percent of that.
    const life = Date.parse(body.expiresAt) - Date.now();
    expect(life).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
    expect(life).toBeLessThan(7.1 * 24 * 3600 * 1000);
    const toRotate = Date.parse(body.rotateAt) - Date.now();
    expect(toRotate / life).toBeGreaterThan(0.78);
    expect(toRotate / life).toBeLessThan(0.82);

    // A real request with the old token is 401; the new one works.
    expect((await sessionRoute(token, workspace.id)).status).toBe(401);
    expect((await sessionRoute(body.token, workspace.id)).status).toBe(200);

    const live = await prisma.session.findMany({
      where: { userId: user.id },
      select: { token: true, familyId: true },
    });
    expect(live.map((s) => s.token)).toEqual([body.token]);
  });

  it("lets exactly one of two concurrent refreshes with the same token win", async () => {
    const { user, email } = await fixture("CLIENT");
    const token = await signIn(email);

    const responses = await Promise.all([refresh(token), refresh(token)]);
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);

    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<{ token?: string }>),
    );
    const minted = bodies
      .map((b) => b.token)
      .filter((t): t is string => typeof t === "string");
    issued.push(...minted);
    expect(minted).toHaveLength(1);
    expect(minted[0]).not.toBe(token);

    // Nothing was minted twice: at most the winner's session survives the race.
    const rows = await prisma.session.findMany({ where: { userId: user.id } });
    expect(rows.length).toBeLessThanOrEqual(1);
  });

  it("replaying a rotated-out token kills the whole family", async () => {
    const { user, email } = await fixture("CLIENT");
    const first = await signIn(email);
    const second = await rotate(first);
    const third = await rotate(second);
    const newest = await rotate(third);

    // The newest token works before the replay.
    expect(await prisma.session.count({ where: { token: newest } })).toBe(1);

    const replay = await refresh(first);
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({
      error: { code: "unauthenticated" },
    });

    // The family is gone, newest token included.
    expect(await prisma.session.count({ where: { token: newest } })).toBe(0);
    expect((await refresh(newest)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("refuses a deactivated account", async () => {
    const { user, email } = await fixture("CLIENT");
    const token = await signIn(email);
    await prisma.user.update({
      where: { id: user.id },
      data: { status: "DEACTIVATED" },
    });

    expect((await refresh(token)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("refuses when the workspace membership is gone, and spends nothing", async () => {
    const { user, member, email } = await fixture("CLIENT");
    const token = await signIn(email);
    await prisma.workspaceMember.update({
      where: { id: member!.id },
      data: { status: "REMOVED" },
    });

    expect((await refresh(token)).status).toBe(401);
    // Fail closed without spending: the presented token still exists (so the
    // user sees a plain 401 rather than a family revocation).
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await prisma.spentRefreshToken.count({
        where: {
          tokenHash: createHash("sha256")
            .update(token.split(".")[0])
            .digest("hex"),
        },
      }),
    ).toBe(0);
  });

  it("trips the account throttle at 20 refreshes per 10 minutes", async () => {
    const { email } = await fixture("CLIENT");
    let token = await signIn(email);

    for (let i = 0; i < 20; i++) {
      const res = await refresh(token);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string };
      issued.push(body.token);
      token = body.token;
    }

    const blocked = await refresh(token);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: { code: "rate_limited" } });
    // The refused request spent nothing.
    expect(
      await prisma.session.count({ where: { token } }),
    ).toBe(1);
  });

  it("never accepts a cookie credential and never touches another session", async () => {
    const { workspace, email } = await fixture("CLIENT");
    const bearer = await signIn(email);
    const cookieToken = await signIn(email);
    const cookieHeader = { cookie: `${COOKIE}=${cookieToken}` };

    // Bearer only: a cookie session cannot rotate here.
    const refused = await refresh(null, cookieHeader);
    expect(refused.status).toBe(401);
    const noCredential = await POST(
      new Request(`${BASE}/api/v1/auth/refresh`, { method: "POST" }),
    );
    expect(noCredential.status).toBe(401);

    // Rotating the bearer session leaves the cookie session alive.
    await rotate(bearer);
    const still = await auth.api.getSession({
      headers: new Headers(cookieHeader),
    });
    expect(still?.user?.email).toBe(email);
    expect(
      await prisma.session.count({
        where: { token: cookieToken.split(".")[0] },
      }),
    ).toBe(1);
    const viaCookie = await GET_SESSION(
      new Request(`${BASE}/api/v1/workspaces/${workspace.id}/session`, {
        headers: cookieHeader,
      }),
      { params: Promise.resolve({ workspaceId: workspace.id }) },
    );
    expect(viaCookie.status).toBe(200);
  });

  it("writes no token into any log line", async () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map(
      (level) => vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const lines: string[] = [];
    spies.forEach((spy) =>
      spy.mockImplementation((...args: unknown[]) => {
        lines.push(args.map((a) => String(a)).join(" "));
      }),
    );

    const secrets: string[] = [];
    try {
      const { email } = await fixture("CLIENT");
      const first = await signIn(email);
      secrets.push(first, first.split(".")[0]);
      const second = await rotate(first);
      secrets.push(second);
      await refresh(first); // replay -> family kill, the noisiest path
      await refresh("not-a-real-token");
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }

    const captured = lines.join("\n");
    for (const secret of secrets) {
      expect(captured).not.toContain(secret);
    }
  });

  it("picks the /me reset link only for an ACTIVE CLIENT member", async () => {
    process.env.DEV_MAILBOX_FILE = mailbox;

    async function resetPath(email: string): Promise<string> {
      await auth.api.requestPasswordReset({
        body: { email },
        headers: new Headers(),
      });
      const lines = readFileSync(mailbox, "utf8").trim().split("\n");
      const text = JSON.parse(lines[lines.length - 1]).text as string;
      const link = /(https?:\/\/\S+)/.exec(text)?.[1] as string;
      return new URL(link).pathname;
    }

    const client = await fixture("CLIENT", { clientProfile: true });
    expect(await resetPath(client.email)).toBe("/me/reset");

    // A profile plus a STAFF membership is not a client.
    const coach = await fixture("COACH", { clientProfile: true });
    expect(await resetPath(coach.email)).toBe("/reset");

    // A profile with no membership at all is not a client either.
    const orphan = await fixture(null, { clientProfile: true });
    expect(await resetPath(orphan.email)).toBe("/reset");
  });
});
