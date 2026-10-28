import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth } from "../../lib/auth/server";
import { hashPassword } from "../../lib/password";
import {
  GET as GET_PREFERENCES,
  PATCH as PATCH_PREFERENCES,
} from "../../app/api/v1/workspaces/[workspaceId]/preferences/route";
import {
  GET as GET_SIDEBAR,
  PATCH as PATCH_SIDEBAR,
} from "../../app/api/v1/workspaces/[workspaceId]/preferences/sidebar/route";

/**
 * PR-M2 — workspace appearance/preferences and member sidebar routes, called
 * the way the canvas wiring calls them: real Request objects, bearer tokens
 * from a real sign-in, a real migrated PostgreSQL lane database.
 *
 * Proves: the literal canvas-vocabulary contract, persistence across reads,
 * the card acceptance (accent and mode differ between two workspaces),
 * workspace isolation on write, role enforcement (staff vs client),
 * per-member sidebar isolation, and fail-closed auth.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;
const BASE = "http://127.0.0.1:3000";

function getPreferences(workspaceId: string, headers = {}) {
  return GET_PREFERENCES(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/preferences`, {
      headers,
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function patchPreferences(
  workspaceId: string,
  body: string,
  headers: Record<string, string> = {},
) {
  return PATCH_PREFERENCES(
    new Request(`${BASE}/api/v1/workspaces/${workspaceId}/preferences`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function getSidebar(workspaceId: string, headers = {}) {
  return GET_SIDEBAR(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/preferences/sidebar`,
      { headers },
    ),
    { params: Promise.resolve({ workspaceId }) },
  );
}

function patchSidebar(
  workspaceId: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return PATCH_SIDEBAR(
    new Request(
      `${BASE}/api/v1/workspaces/${workspaceId}/preferences/sidebar`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ workspaceId }) },
  );
}

describe.skipIf(!enabled)(
  "/api/v1/workspaces/:id/preferences (real PG)",
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

    async function addMember(
      ws: { id: string },
      role: "WORKSPACE_OWNER" | "COACH" | "CLIENT",
    ) {
      const tag = `u${++n}_${Date.now()}`;
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
        data: { workspaceId: ws.id, userId: user.id, role, status: "ACTIVE" },
      });
      return { user, member, email };
    }

    async function memberWorkspace(
      role: "WORKSPACE_OWNER" | "COACH" | "CLIENT" = "WORKSPACE_OWNER",
    ) {
      const tag = `ws${++n}_${Date.now()}`;
      const ws = await prisma.workspace.create({
        data: { name: tag, slug: tag, status: "ACTIVE" },
      });
      const { user, member, email } = await addMember(ws, role);
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
        'TRUNCATE "rate_limit","verifications","sessions","accounts","audit_event","media_object","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("GET returns the canvas-vocabulary defaults for a fresh workspace", async () => {
      const { ws, email } = await memberWorkspace();
      const token = await signInToken(email);
      const res = await getPreferences(ws.id, {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        mode: "dark",
        accent: "#EB91B8",
        font: "sans",
        density: "comfortable",
        logoMediaId: null,
        availability: "",
        notifications: true,
        priorityNotifications: true,
      });
    });

    it("PATCH persists and GET re-reads the written values", async () => {
      const { ws, email } = await memberWorkspace();
      const token = await signInToken(email);
      const authz = { authorization: `Bearer ${token}` };

      const patched = await patchPreferences(
        ws.id,
        JSON.stringify({
          mode: "light",
          accent: "#3565b7",
          font: "mono",
          density: "compact",
          availability: "Weekends only",
          notifications: false,
          priorityNotifications: true,
        }),
        authz,
      );
      expect(patched.status).toBe(200);
      const reread = await getPreferences(ws.id, authz);
      expect(await reread.json()).toEqual({
        mode: "light",
        accent: "#3565B7",
        font: "mono",
        density: "compact",
        logoMediaId: null,
        availability: "Weekends only",
        notifications: false,
        priorityNotifications: true,
      });
    });

    it("acceptance: accent and mode persist per workspace and differ", async () => {
      const first = await memberWorkspace();
      const second = await memberWorkspace();
      const tokenA = await signInToken(first.email);
      const tokenB = await signInToken(second.email);

      await patchPreferences(
        first.ws.id,
        JSON.stringify({ mode: "light", accent: "#2B7157" }),
        { authorization: `Bearer ${tokenA}` },
      );
      await patchPreferences(
        second.ws.id,
        JSON.stringify({ accent: "#3565B7" }),
        { authorization: `Bearer ${tokenB}` },
      );

      expect(
        await (
          await getPreferences(first.ws.id, {
            authorization: `Bearer ${tokenA}`,
          })
        ).json(),
      ).toMatchObject({ mode: "light", accent: "#2B7157" });
      expect(
        await (
          await getPreferences(second.ws.id, {
            authorization: `Bearer ${tokenB}`,
          })
        ).json(),
      ).toMatchObject({ mode: "dark", accent: "#3565B7" });
    });

    it("client role is denied read and write (D15)", async () => {
      const { ws, email } = await memberWorkspace("CLIENT");
      const token = await signInToken(email);
      const authz = { authorization: `Bearer ${token}` };
      expect((await getPreferences(ws.id, authz)).status).toBe(403);
      expect(
        (
          await patchPreferences(
            ws.id,
            JSON.stringify({ accent: "#3565B7" }),
            authz,
          )
        ).status,
      ).toBe(403);
    });

    it("a member of another workspace gets 403, not the data", async () => {
      const { email } = await memberWorkspace();
      const other = await memberWorkspace();
      const token = await signInToken(email);
      const res = await getPreferences(other.ws.id, {
        authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: { code: "forbidden" } });
    });

    it("signed-out requests get 401 on both routes", async () => {
      const { ws } = await memberWorkspace();
      expect((await getPreferences(ws.id)).status).toBe(401);
      expect((await getSidebar(ws.id)).status).toBe(401);
    });

    it.each([
      [JSON.stringify({ accent: "rose" }), "bad accent"],
      [JSON.stringify({ accent: "#12345" }), "short accent"],
      [JSON.stringify({ font: "comic-sans" }), "bad font enum"],
      [JSON.stringify({ mode: "auto" }), "bad mode enum"],
      [JSON.stringify({ notifications: "yes" }), "non-boolean toggle"],
      ["{not json", "malformed JSON"],
    ])("PATCH rejects %s (%s) with 400 and writes nothing", async (body) => {
      const { ws, email } = await memberWorkspace();
      const token = await signInToken(email);
      const authz = { authorization: `Bearer ${token}` };
      const res = await patchPreferences(ws.id, body, authz);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_input");
      const reread = await getPreferences(ws.id, authz);
      expect((await reread.json()).accent).toBe("#EB91B8");
    });

    it("sidebar flag persists per member inside one workspace", async () => {
      const { ws, email } = await memberWorkspace();
      const second = await addMember(ws, "COACH");
      const tokenA = await signInToken(email);
      const tokenB = await signInToken(second.email);

      expect(
        (await getSidebar(ws.id, { authorization: `Bearer ${tokenA}` })).status,
      ).toBe(200);
      expect(
        await (
          await getSidebar(ws.id, { authorization: `Bearer ${tokenA}` })
        ).json(),
      ).toEqual({ sidebarCollapsed: false });

      const patched = await patchSidebar(
        ws.id,
        { sidebarCollapsed: true },
        { authorization: `Bearer ${tokenA}` },
      );
      expect(patched.status).toBe(200);
      expect(await patched.json()).toEqual({ sidebarCollapsed: true });

      // The other member's flag in the same workspace is untouched.
      expect(
        await (
          await getSidebar(ws.id, { authorization: `Bearer ${tokenB}` })
        ).json(),
      ).toEqual({ sidebarCollapsed: false });
      // And the writer's flag survives a re-read.
      expect(
        await (
          await getSidebar(ws.id, { authorization: `Bearer ${tokenA}` })
        ).json(),
      ).toEqual({ sidebarCollapsed: true });
    });

    it("a client member may toggle their own sidebar (own.write)", async () => {
      const { ws, email } = await memberWorkspace("CLIENT");
      const token = await signInToken(email);
      const res = await patchSidebar(
        ws.id,
        { sidebarCollapsed: true },
        { authorization: `Bearer ${token}` },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sidebarCollapsed: true });
    });

    it("sidebar PATCH rejects a non-boolean flag with 400", async () => {
      const { ws, email } = await memberWorkspace();
      const token = await signInToken(email);
      const res = await patchSidebar(
        ws.id,
        { sidebarCollapsed: "yes" },
        { authorization: `Bearer ${token}` },
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_input");
    });
  },
);
