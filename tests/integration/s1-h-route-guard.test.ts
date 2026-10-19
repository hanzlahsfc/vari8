import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The guard module imports `next/navigation` (forbidden/redirect) at top level;
// stub it so the real DB authorization paths run under vitest node.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden");
  }),
}));

import {
  getAuthorizedWorkspaceSummary,
  listSessionWorkspaces,
  requireWorkspaceAccess,
  resolveWorkspaceAccess,
} from "../../lib/auth/route-guard";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("S1-H route guard (real PG)", () => {
  let prisma: PrismaClient;
  let n = 0;
  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","coach_profile","client_profile","client_assignment","access_token","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const uid = () => `s1h${++n}_${Date.now()}`;
  async function user(status: "ACTIVE" | "DEACTIVATED" | "INVITED" = "ACTIVE") {
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
    status: "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED" = "ACTIVE",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status },
    });
  }
  const session = (userId: string) => ({ user: { id: userId } });
  const read = (workspaceId: string) =>
    ({ resource: "workspaceSettings", action: "read", workspaceId }) as const;
  const write = (workspaceId: string) =>
    ({ resource: "workspaceSettings", action: "write", workspaceId }) as const;

  it("staff roles resolve workspaceSettings/read; others deny", async () => {
    const ws = await workspace();
    for (const role of [
      "WORKSPACE_OWNER",
      "COACH",
      "ASSISTANT_COACH",
    ] as const) {
      const u = await user();
      await member(ws.id, u.id, role);
      const ctx = await resolveWorkspaceAccess(
        session(u.id),
        read(ws.id),
        prisma,
      );
      expect(ctx).toMatchObject({
        userId: u.id,
        workspaceId: ws.id,
        workspaceRole: role,
      });
    }
    for (const role of ["SUPPORT", "CLIENT"] as const) {
      const u = await user();
      await member(ws.id, u.id, role);
      expect(
        await resolveWorkspaceAccess(session(u.id), read(ws.id), prisma),
      ).toBeNull();
    }
  });

  it("write is owner-only", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    expect(
      await resolveWorkspaceAccess(session(owner.id), write(ws.id), prisma),
    ).not.toBeNull();
    for (const role of [
      "COACH",
      "ASSISTANT_COACH",
      "SUPPORT",
      "CLIENT",
    ] as const) {
      const u = await user();
      await member(ws.id, u.id, role);
      expect(
        await resolveWorkspaceAccess(session(u.id), write(ws.id), prisma),
      ).toBeNull();
    }
  });

  it("denies inactive user, inactive membership, inactive workspace, non-member, cross-workspace", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");

    const dead = await user("DEACTIVATED");
    await member(ws.id, dead.id, "WORKSPACE_OWNER");
    expect(
      await resolveWorkspaceAccess(session(dead.id), read(ws.id), prisma),
    ).toBeNull();

    const susp = await user();
    await member(ws.id, susp.id, "WORKSPACE_OWNER", "SUSPENDED");
    expect(
      await resolveWorkspaceAccess(session(susp.id), read(ws.id), prisma),
    ).toBeNull();

    const deadWs = await workspace("SUSPENDED");
    const m = await user();
    await member(deadWs.id, m.id, "WORKSPACE_OWNER");
    expect(
      await resolveWorkspaceAccess(session(m.id), read(deadWs.id), prisma),
    ).toBeNull();

    const nonmember = await user();
    expect(
      await resolveWorkspaceAccess(session(nonmember.id), read(ws.id), prisma),
    ).toBeNull();

    // member of A, asking for B
    const other = await workspace();
    expect(
      await resolveWorkspaceAccess(session(owner.id), read(other.id), prisma),
    ).toBeNull();
  });

  it("requireWorkspaceAccess throws (forbidden) on denial, returns context on allow", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const coach = await user();
    await member(ws.id, coach.id, "COACH");

    await expect(
      requireWorkspaceAccess(session(owner.id), read(ws.id), prisma),
    ).resolves.toMatchObject({ workspaceId: ws.id });
    await expect(
      requireWorkspaceAccess(session(coach.id), write(ws.id), prisma),
    ).rejects.toThrow("forbidden");
  });

  it("listSessionWorkspaces returns only the user's ACTIVE staff workspaces", async () => {
    const u = await user();
    const active = await workspace();
    await member(active.id, u.id, "COACH");
    const suspendedWs = await workspace("SUSPENDED");
    await member(suspendedWs.id, u.id, "COACH");
    const suspendedMember = await workspace();
    await member(suspendedMember.id, u.id, "COACH", "SUSPENDED");
    const clientWs = await workspace();
    await member(clientWs.id, u.id, "CLIENT"); // excluded from the staff shell
    const otherWs = await workspace();
    const otherUser = await user();
    await member(otherWs.id, otherUser.id, "WORKSPACE_OWNER");

    const rows = await listSessionWorkspaces(u.id, prisma);
    expect(rows.map((r) => r.id)).toEqual([active.id]);
    expect(rows[0]).toMatchObject({
      id: active.id,
      name: active.name,
      role: "COACH",
    });
  });

  it("getAuthorizedWorkspaceSummary reads the authorized workspace name", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const ctx = await requireWorkspaceAccess(
      session(owner.id),
      read(ws.id),
      prisma,
    );
    const summary = await getAuthorizedWorkspaceSummary(
      ctx as typeof ctx & { workspaceId: string },
      prisma,
    );
    expect(summary).toEqual({ id: ws.id, name: ws.name });
  });
});
