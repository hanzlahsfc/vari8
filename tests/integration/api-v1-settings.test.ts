import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  GET,
  PATCH,
} from "../../app/api/v1/workspaces/[workspaceId]/settings/route";

/**
 * W2-T1 settings route: calls GET/PATCH /api/v1/workspaces/:id/settings the
 * way the settings surface does (real Request, bearer credential from a real
 * sign-in) and asserts: the profile + full preference list contract, a
 * partial preference update that persists across a second sign-in, unknown
 * keys rejected, and fail-closed authorization for signed-out and
 * non-member callers.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function call(
  method: "GET" | "PATCH",
  workspaceId: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  const handler = method === "GET" ? GET : PATCH;
  return handler(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/settings`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

describe.skipIf(!enabled)("/api/v1/workspaces/:id/settings (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.230.0.${++n}`,
        },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return token as string;
  }

  async function memberWorkspace(role: "WORKSPACE_OWNER" | "COACH" | "CLIENT") {
    const tag = `t1${++n}_${Date.now()}`;
    const ws = await prisma.workspace.create({
      data: { name: tag, slug: tag, status: "ACTIVE" },
    });
    const email = `${tag}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: "fixture",
        name: tag,
        status: "ACTIVE",
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
    const member = await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        role,
        status: "ACTIVE",
      },
    });
    return { ws, user, member, email };
  }

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({
      datasources: { db: { url: url as string } },
    });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "member_preference","rate_limit","verifications","sessions","accounts","audit_event","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("a coach reads profile and the full preference list", async () => {
    const { ws, email, user } = await memberWorkspace("COACH");
    const token = await signInToken(email);
    const res = await call("GET", ws.id, {
      authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toEqual({
      name: user.name,
      email,
      role: "coach",
    });
    expect(body.preferences).toEqual(
      expect.arrayContaining([
        { key: "attention.unread_messages", enabled: true },
        { key: "attention.priority_messages", enabled: true },
        { key: "email.messages", enabled: true },
      ]),
    );
    expect(body.preferences).toHaveLength(3);
  });

  it("a coach changes a preference and a new session sees it persisted", async () => {
    const { ws, email } = await memberWorkspace("COACH");
    const first = await signInToken(email);
    const write = await call(
      "PATCH",
      ws.id,
      { authorization: `Bearer ${first}` },
      { preferences: [{ key: "email.messages", enabled: false }] },
    );
    expect(write.status).toBe(200);
    const wrote = await write.json();
    expect(wrote.preferences).toHaveLength(3);
    expect(
      wrote.preferences.find((p: { key: string }) => p.key === "email.messages")
        ?.enabled,
    ).toBe(false);

    // Separate session: the value comes back from the server, not memory.
    const second = await signInToken(email);
    const reread = await call("GET", ws.id, {
      authorization: `Bearer ${second}`,
    });
    const body = await reread.json();
    expect(
      body.preferences.find((p: { key: string }) => p.key === "email.messages")
        ?.enabled,
    ).toBe(false);
    expect(
      body.preferences.find(
        (p: { key: string }) => p.key === "attention.unread_messages",
      )?.enabled,
    ).toBe(true);
  });

  it("updates the display name and returns the full settings object", async () => {
    const { ws, email, user } = await memberWorkspace("WORKSPACE_OWNER");
    const token = await signInToken(email);
    const res = await call(
      "PATCH",
      ws.id,
      { authorization: `Bearer ${token}` },
      { name: "Coach Ada" },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.name).toBe("Coach Ada");
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    ).resolves.toMatchObject({ name: "Coach Ada" });
  });

  it("rejects unknown preference keys and foreign members' rows stay untouched", async () => {
    const { ws, email } = await memberWorkspace("COACH");
    const foreign = await memberWorkspace("WORKSPACE_OWNER");
    const token = await signInToken(email);
    const bad = await call(
      "PATCH",
      ws.id,
      { authorization: `Bearer ${token}` },
      { preferences: [{ key: "made.up", enabled: false }] },
    );
    expect(bad.status).toBe(400);
    // The write above was rejected; the caller's own list is unchanged.
    const res = await call("GET", ws.id, {
      authorization: `Bearer ${token}`,
    });
    const body = await res.json();
    expect(body.preferences.every((p: { enabled: boolean }) => p.enabled)).toBe(
      true,
    );
    // And the foreign member in another workspace never entered the picture.
    const foreignRows = await prisma.memberPreference.count({
      where: { memberId: foreign.member.id },
    });
    expect(foreignRows).toBe(0);
  });

  it("denies a signed-out caller and a non-member", async () => {
    const { ws } = await memberWorkspace("COACH");
    expect((await call("GET", ws.id)).status).toBe(401);
    const outsider = await memberWorkspace("WORKSPACE_OWNER");
    const token = await signInToken(outsider.email);
    expect(
      (await call("GET", ws.id, { authorization: `Bearer ${token}` })).status,
    ).toBe(403);
    expect(
      (
        await call(
          "PATCH",
          ws.id,
          { authorization: `Bearer ${token}` },
          { name: "Nope" },
        )
      ).status,
    ).toBe(403);
  });
});
