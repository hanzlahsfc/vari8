import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  GET,
  POST,
} from "../../app/api/v1/workspaces/[workspaceId]/invitations/route";
import { DELETE } from "../../app/api/v1/workspaces/[workspaceId]/invitations/[invitationId]/route";

/**
 * PR-SV4 invitations API — calls
 * `/api/v1/workspaces/:workspaceId/invitations` the way the roster Add
 * control will (real Request, bearer credential from a real sign-in) and
 * asserts the literal JSON contract, the D15/service auth matrix, and that
 * creation delivers through the PR-05 mail port (dev-file adapter).
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function call(
  method: "GET" | "POST" | "DELETE",
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["content-type"] =
      "application/json";
  }
  const workspaceId = path.split("/")[4];
  const invitationId = path.split("/")[6];
  const params: Record<string, string> = { workspaceId };
  if (invitationId) params.invitationId = invitationId;
  const route = method === "DELETE" ? DELETE : method === "POST" ? POST : GET;
  return route(new Request(`${BASE}${path}`, init), {
    params: Promise.resolve(params),
  });
}

describe.skipIf(!enabled)(
  "invitations API /api/v1/workspaces/:id/invitations (real PG)",
  () => {
    let prisma: PrismaClient;
    let n = 0;
    let mailboxDir: string;
    let mailboxFile: string;
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

    async function staffWorkspace(
      role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
    ) {
      const tag = `sv4${++n}_${Date.now()}`;
      const ws = await prisma.workspace.create({
        data: { name: tag, slug: tag, status: "ACTIVE" },
      });
      const email = `${tag}@example.test`;
      const user = await prisma.user.create({
        data: { email, passwordHash: "fixture", name: tag, status: "ACTIVE" },
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

    function mailboxLines(): Array<{
      to: string;
      subject: string;
      text: string;
    }> {
      return readFileSync(mailboxFile, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }

    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      mailboxDir = mkdtempSync(join(tmpdir(), "sv4-mailbox-"));
      mailboxFile = join(mailboxDir, "mailbox.jsonl");
      process.env.DEV_MAILBOX_FILE = mailboxFile;
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "rate_limit","verifications","sessions","accounts","audit_event","coach_profile","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });

    afterAll(async () => {
      delete process.env.DEV_MAILBOX_FILE;
      rmSync(mailboxDir, { recursive: true, force: true });
      await prisma?.$disconnect();
    });

    it("owner creates a CLIENT invitation: 200 JSON, hash-only row, mail delivered", async () => {
      const { ws, email } = await staffWorkspace("WORKSPACE_OWNER");
      const token = await signInToken(email);
      const res = await call(
        "POST",
        `/api/v1/workspaces/${ws.id}/invitations`,
        { authorization: `Bearer ${token}` },
        { targetEmail: "Invitee@Example.Test", intendedRole: "CLIENT" },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.delivered).toBe(true);
      expect(typeof body.invitationId).toBe("string");
      expect(typeof body.expiresAt).toBe("string");

      const row = await prisma.accessToken.findUniqueOrThrow({
        where: { id: body.invitationId },
      });
      expect(row.targetEmail).toBe("invitee@example.test");
      expect(row.purpose).toBe("WORKSPACE_INVITE");
      // Raw token never persisted — only the hash.
      const mail = mailboxLines().find((m) => m.to === "invitee@example.test");
      expect(mail).toBeTruthy();
      const link = /\/invite\?workspace=([^&]+)&token=(\S+)/.exec(mail!.text);
      expect(link).toBeTruthy();
      expect(link![1]).toBe(ws.id);
      expect(row.tokenHash).not.toBe(link![2]);
      expect(JSON.stringify(row)).not.toContain(link![2]);
    });

    it("GET returns the literal list for the owner, bounded and scoped", async () => {
      const { ws, email } = await staffWorkspace("WORKSPACE_OWNER");
      const token = await signInToken(email);
      for (const target of ["a1@example.test", "a2@example.test"]) {
        const res = await call(
          "POST",
          `/api/v1/workspaces/${ws.id}/invitations`,
          { authorization: `Bearer ${token}` },
          { targetEmail: target, intendedRole: "CLIENT" },
        );
        expect(res.status).toBe(200);
      }
      const res = await call("GET", `/api/v1/workspaces/${ws.id}/invitations`, {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.nextCursor).toBeNull();
      expect(body.items).toHaveLength(2);
      expect(body.items[0].targetEmail).toBe("a1@example.test");
      expect(body.items[0].intendedRole).toBe("CLIENT");
      expect(body.items[0].status).toBe("active");
      expect(Object.keys(body.items[0]).sort()).toEqual([
        "expiresAt",
        "id",
        "intendedRole",
        "status",
        "targetEmail",
      ]);
    });

    it("DELETE revokes exactly once; the list shows the revoked state", async () => {
      const { ws, email } = await staffWorkspace("WORKSPACE_OWNER");
      const token = await signInToken(email);
      const created = await (
        await call(
          "POST",
          `/api/v1/workspaces/${ws.id}/invitations`,
          { authorization: `Bearer ${token}` },
          { targetEmail: "rev@example.test", intendedRole: "CLIENT" },
        )
      ).json();
      const res = await call(
        "DELETE",
        `/api/v1/workspaces/${ws.id}/invitations/${created.invitationId}`,
        { authorization: `Bearer ${token}` },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ changed: true });
      // Second revoke is a structural no-change.
      const again = await call(
        "DELETE",
        `/api/v1/workspaces/${ws.id}/invitations/${created.invitationId}`,
        { authorization: `Bearer ${token}` },
      );
      expect(await again.json()).toEqual({ changed: false });
      const list = await (
        await call("GET", `/api/v1/workspaces/${ws.id}/invitations`, {
          authorization: `Bearer ${token}`,
        })
      ).json();
      expect(list.items[0].status).toBe("revoked");
    });

    it("coach may create a CLIENT invitation but not staff invitations, and cannot list or revoke", async () => {
      const { ws, email } = await staffWorkspace("COACH");
      const token = await signInToken(email);
      const ok = await call(
        "POST",
        `/api/v1/workspaces/${ws.id}/invitations`,
        { authorization: `Bearer ${token}` },
        { targetEmail: "coach-client@example.test", intendedRole: "CLIENT" },
      );
      expect(ok.status).toBe(200);
      for (const role of ["COACH", "ASSISTANT_COACH"]) {
        const res = await call(
          "POST",
          `/api/v1/workspaces/${ws.id}/invitations`,
          { authorization: `Bearer ${token}` },
          { targetEmail: `coach-${role}@example.test`, intendedRole: role },
        );
        expect(res.status).toBe(403);
      }
      const list = await call(
        "GET",
        `/api/v1/workspaces/${ws.id}/invitations`,
        { authorization: `Bearer ${token}` },
      );
      expect(list.status).toBe(403);
      const body = await ok.json();
      const revoke = await call(
        "DELETE",
        `/api/v1/workspaces/${ws.id}/invitations/${body.invitationId}`,
        { authorization: `Bearer ${token}` },
      );
      expect(revoke.status).toBe(403);
    });

    it("client members get 403 on all three operations", async () => {
      const { ws, email } = await staffWorkspace("CLIENT");
      const token = await signInToken(email);
      for (const [method, pathSuffix, body] of [
        ["POST", "", { targetEmail: "x@example.test", intendedRole: "CLIENT" }],
        ["GET", "", undefined],
        ["DELETE", "/some-id", undefined],
      ] as const) {
        const res = await call(
          method,
          `/api/v1/workspaces/${ws.id}/invitations${pathSuffix}`,
          { authorization: `Bearer ${token}` },
          body,
        );
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: { code: "forbidden" } });
      }
    });

    it("refuses unauthenticated and foreign-workspace callers", async () => {
      const { ws } = await staffWorkspace("WORKSPACE_OWNER");
      const noCreds = await call(
        "GET",
        `/api/v1/workspaces/${ws.id}/invitations`,
      );
      expect(noCreds.status).toBe(401);
      const foreign = await staffWorkspace("WORKSPACE_OWNER");
      const token = await signInToken(foreign.email);
      const res = await call(
        "POST",
        `/api/v1/workspaces/${ws.id}/invitations`,
        { authorization: `Bearer ${token}` },
        { targetEmail: "x@example.test", intendedRole: "CLIENT" },
      );
      expect(res.status).toBe(403);
    });

    it("rejects malformed bodies and non-invitable roles with 400", async () => {
      const { ws, email } = await staffWorkspace("WORKSPACE_OWNER");
      const token = await signInToken(email);
      for (const body of [
        { targetEmail: "not-an-email", intendedRole: "CLIENT" },
        { targetEmail: "x@example.test", intendedRole: "WORKSPACE_OWNER" },
        { targetEmail: "x@example.test" },
        {},
      ]) {
        const res = await call(
          "POST",
          `/api/v1/workspaces/${ws.id}/invitations`,
          { authorization: `Bearer ${token}` },
          body,
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("invalid_input");
      }
    });
  },
);
