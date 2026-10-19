import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import { GET } from "../../app/api/v1/workspaces/[workspaceId]/session/route";

/**
 * PR-05 session export — calls `GET /api/v1/workspaces/:workspaceId/session`
 * the way a canvas screen does (real Request, bearer credential from a real
 * sign-in) and asserts the literal JSON contract: user id, workspace id,
 * member id, resolved D15 role, and the caller's scope for every capability.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function call(workspaceId: string, headers: Record<string, string> = {}) {
  return GET(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/session`, {
      headers,
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

describe.skipIf(!enabled)(
  "GET /api/v1/workspaces/:id/session (real PG)",
  () => {
    let prisma: PrismaClient;
    let n = 0;
    const PASSWORD = "fixture-pass-1";

    async function signInToken(email: string) {
      const res = await auth.handler(
        new Request(`${BASE}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.220.0.${++n}`,
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
      const tag = `s${++n}_${Date.now()}`;
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
      prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "rate_limit","verifications","sessions","accounts","audit_event","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("returns the literal session JSON for a coach", async () => {
      const { ws, user, member, email } = await memberWorkspace("COACH");
      const token = await signInToken(email);

      const res = await call(ws.id, { authorization: `Bearer ${token}` });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        user: { id: user.id, email, name: ws.name },
        workspace: { id: ws.id, memberId: member.id },
        role: "coach",
        capabilities: {
          "roster.read": "workspace",
          "plan.read": "workspace",
          "plan.write": "workspace",
          "clientData.read": "workspace",
          "own.read": "own",
          "own.write": "own",
          "notes.write": "workspace",
          "tasks.manage": "workspace",
          "library.manage": "workspace",
          "message.write": "workspace",
          "appearance.write": "workspace",
          "member.invite": "workspace",
        },
      });
    });

    it("returns the client's self-scoped capability map", async () => {
      const { ws, member, email } = await memberWorkspace("CLIENT");
      const token = await signInToken(email);

      const res = await call(ws.id, { authorization: `Bearer ${token}` });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("client");
      expect(body.workspace).toEqual({ id: ws.id, memberId: member.id });
      expect(body.capabilities["plan.write"]).toBe("deny");
      expect(body.capabilities["plan.read"]).toBe("own");
      expect(body.capabilities["roster.read"]).toBe("deny");
    });

    it("refuses a member of another workspace with 403", async () => {
      const { email } = await memberWorkspace("WORKSPACE_OWNER");
      const other = await prisma.workspace.create({
        data: { name: `other-${Date.now()}`, slug: `other-${Date.now()}`, status: "ACTIVE" },
      });
      const token = await signInToken(email);
      const res = await call(other.id, { authorization: `Bearer ${token}` });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "forbidden" } });
    });

    it("refuses a request with no credentials", async () => {
      const { ws } = await memberWorkspace("COACH");
      const res = await call(ws.id);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: "unauthenticated" } });
    });
  },
);
