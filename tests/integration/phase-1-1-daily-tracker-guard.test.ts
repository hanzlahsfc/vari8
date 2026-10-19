import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// route-guard imports next/navigation (forbidden/redirect) at top level.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden");
  }),
}));

import { requireDailyTrackerAccess } from "../../lib/auth/route-guard";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)(
  "Phase 1.1 Daily Tracker route guard (real PG)",
  () => {
    let prisma: PrismaClient;
    let n = 0;
    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "audit_event","coach_profile","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    const uid = () => `p11${++n}_${Date.now()}`;
    async function user(status: "ACTIVE" | "DEACTIVATED" = "ACTIVE") {
      return prisma.user.create({
        data: {
          email: `${uid()}@example.test`,
          passwordHash: "scrypt$fixture",
          name: `F ${uid()}`,
          status,
        },
      });
    }
    async function workspace(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
      return prisma.workspace.create({
        data: { name: `W ${uid()}`, slug: `ws-${uid()}`, status },
      });
    }
    async function member(
      workspaceId: string,
      userId: string,
      role:
        "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
      status: "ACTIVE" | "SUSPENDED" = "ACTIVE",
    ) {
      return prisma.workspaceMember.create({
        data: { workspaceId, userId, role, status },
      });
    }
    const session = (userId: string) => ({ user: { id: userId } });

    it("allows every role with a granted dailyTracking read scope", async () => {
      const ws = await workspace();
      for (const role of [
        "WORKSPACE_OWNER",
        "COACH",
        "ASSISTANT_COACH",
        "CLIENT",
      ] as const) {
        const u = await user();
        await member(ws.id, u.id, role);
        const ctx = await requireDailyTrackerAccess(
          session(u.id),
          ws.id,
          prisma,
        );
        expect(ctx).toMatchObject({
          userId: u.id,
          workspaceId: ws.id,
          workspaceRole: role,
        });
        expect(["workspace", "assigned", "own"]).toContain(ctx.grantedScope);
      }
    });

    it("denies SUPPORT, non-members, inactive users/workspaces/memberships", async () => {
      const ws = await workspace();

      const support = await user();
      await member(ws.id, support.id, "SUPPORT");
      await expect(
        requireDailyTrackerAccess(session(support.id), ws.id, prisma),
      ).rejects.toThrow("forbidden");

      const nonmember = await user();
      await expect(
        requireDailyTrackerAccess(session(nonmember.id), ws.id, prisma),
      ).rejects.toThrow("forbidden");

      const dead = await user("DEACTIVATED");
      await member(ws.id, dead.id, "WORKSPACE_OWNER");
      await expect(
        requireDailyTrackerAccess(session(dead.id), ws.id, prisma),
      ).rejects.toThrow("forbidden");

      const susp = await user();
      await member(ws.id, susp.id, "WORKSPACE_OWNER", "SUSPENDED");
      await expect(
        requireDailyTrackerAccess(session(susp.id), ws.id, prisma),
      ).rejects.toThrow("forbidden");

      const deadWs = await workspace("SUSPENDED");
      const m = await user();
      await member(deadWs.id, m.id, "WORKSPACE_OWNER");
      await expect(
        requireDailyTrackerAccess(session(m.id), deadWs.id, prisma),
      ).rejects.toThrow("forbidden");

      await expect(
        requireDailyTrackerAccess(null, ws.id, prisma),
      ).rejects.toThrow("forbidden");
    });
  },
);
