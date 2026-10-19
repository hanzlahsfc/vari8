import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { GET } from "../../app/api/v1/workspaces/[workspaceId]/clients/route";

/**
 * PR-05 reference route behaviour test — calls
 * `GET /api/v1/workspaces/:workspaceId/clients` the way a client does
 * (real Request, bearer credential from a real sign-in) and asserts the
 * literal JSON contract plus the auth matrix: 200 coach, 403 foreign
 * workspace / client role, 401 without credentials, 400 on bad input.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function call(workspaceId: string, headers: Record<string, string> = {}, qs = "") {
  return GET(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/clients${qs}`, {
      headers,
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

describe.skipIf(!enabled)("GET /api/v1/workspaces/:id/clients (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  const PASSWORD = "fixture-pass-1";

  async function signInToken(email: string) {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.210.0.${++n}`,
        },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    const token = res.headers.get("set-auth-token");
    expect(token).toBeTruthy();
    return token as string;
  }

  async function staffWorkspace(role: "WORKSPACE_OWNER" | "COACH" | "CLIENT") {
    const tag = `w${++n}_${Date.now()}`;
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
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        role,
        status: "ACTIVE",
      },
    });
    return { ws, user, email };
  }

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "rate_limit","verifications","sessions","accounts","audit_event","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("returns the literal roster JSON for a coach", async () => {
    const { ws, email } = await staffWorkspace("COACH");
    const a = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "Alice Client" },
    });
    const b = await prisma.clientProfile.create({
      data: { workspaceId: ws.id, name: "Bob Client" },
    });
    const token = await signInToken(email);

    const res = await call(ws.id, { authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        { clientProfileId: a.id, name: "Alice Client" },
        { clientProfileId: b.id, name: "Bob Client" },
      ],
      nextCursor: null,
    });
  });

  it("refuses a member of another workspace with 403", async () => {
    const { ws } = await staffWorkspace("WORKSPACE_OWNER");
    const other = await prisma.workspace.create({
      data: { name: "other", slug: `other-${Date.now()}`, status: "ACTIVE" },
    });
    const token = await signInToken(
      (await prisma.user.findFirstOrThrow({ where: { name: ws.name } })).email,
    );
    const res = await call(other.id, { authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden" } });
  });

  it("refuses a CLIENT member (roster is a staff surface)", async () => {
    const { ws, email } = await staffWorkspace("CLIENT");
    const token = await signInToken(email);
    const res = await call(ws.id, { authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden" } });
  });

  it("refuses a request with no credentials", async () => {
    const { ws } = await staffWorkspace("COACH");
    const res = await call(ws.id);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthenticated" } });
  });

  it("rejects malformed input with 400 before any lookup", async () => {
    const { ws, email } = await staffWorkspace("COACH");
    const token = await signInToken(email);
    const res = await call(
      ws.id,
      { authorization: `Bearer ${token}` },
      "?limit=not-a-number",
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_input");
  });
});
