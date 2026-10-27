import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AccessDeniedError,
  authorize,
  type WorkspaceRole,
} from "../../lib/auth/guard";
import { createPrismaAuthorizationRepo } from "../../lib/workspace/access";

/**
 * S1-B real-PostgreSQL authorization tests: the production guard + the real
 * Prisma access adapter (not a copy of the logic). Synthetic fixtures only.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("S1-B authorization (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let repo: ReturnType<typeof createPrismaAuthorizationRepo>;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    repo = createPrismaAuthorizationRepo(prisma);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  async function user(
    status: "ACTIVE" | "DEACTIVATED" | "INVITED" = "ACTIVE",
    platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
  ) {
    n += 1;
    return prisma.user.create({
      data: {
        email: `u${n}.${Date.now()}@example.test`,
        passwordHash: "scrypt$x",
        status,
        platformRole,
      },
    });
  }
  async function workspace() {
    n += 1;
    return prisma.workspace.create({
      data: { name: `w${n}`, slug: `ws${n}_${Date.now()}` },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    status: "ACTIVE" | "SUSPENDED" | "REMOVED" = "ACTIVE",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status },
    });
  }
  async function client(workspaceId: string, userId: string | null) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId, name: "C" },
    });
  }
  async function assign(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
  ) {
    await prisma.clientAssignment.create({
      data: { workspaceId, clientProfileId, coachMemberId, role: "COACH" },
    });
  }
  const s = (id: string) => ({ user: { id } }) as never;
  // D10/D22 widened the COACH read cell on dailyTracking to workspace;
  // clientProfiles keeps COACH assigned scope, so it remains the fixture
  // resource for the assigned-scope cases below.
  const req = (over: object) =>
    ({ resource: "clientProfiles", action: "read", ...over }) as never;
  async function reason(p: Promise<unknown>): Promise<string | undefined> {
    try {
      await p;
      return undefined;
    } catch (error) {
      return error instanceof AccessDeniedError
        ? error.reason
        : `other:${error}`;
    }
  }

  it("OWNER receives only the matrix's workspace permissions", async () => {
    const owner = await user();
    const ws = await workspace();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    expect(
      (await authorize(s(owner.id), req({ workspaceId: ws.id }), repo))
        .grantedScope,
    ).toBe("workspace");
    // owner is denied cycle data even with a client context
    const c = await client(ws.id, null);
    expect(
      await reason(
        authorize(
          s(owner.id),
          req({
            resource: "cycleData",
            action: "read",
            workspaceId: ws.id,
            clientProfileId: c.id,
          }),
          repo,
        ),
      ),
    ).toBe("role_denied");
  });

  it("COACH assigned access succeeds; unassigned COACH fails", async () => {
    const coach = await user();
    const clientUser = await user();
    const ws = await workspace();
    const m = await member(ws.id, coach.id, "COACH");
    const c = await client(ws.id, clientUser.id);
    expect(
      await reason(
        authorize(
          s(coach.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        ),
      ),
    ).toBe("not_assigned");
    await assign(ws.id, c.id, m.id);
    expect(
      (
        await authorize(
          s(coach.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        )
      ).grantedScope,
    ).toBe("assigned");
  });

  it("ASSISTANT assigned read succeeds; write fails", async () => {
    const assistant = await user();
    const clientUser = await user();
    const ws = await workspace();
    const m = await member(ws.id, assistant.id, "ASSISTANT_COACH");
    const c = await client(ws.id, clientUser.id);
    await assign(ws.id, c.id, m.id);
    expect(
      (
        await authorize(
          s(assistant.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        )
      ).grantedScope,
    ).toBe("assigned");
    expect(
      await reason(
        authorize(
          s(assistant.id),
          req({ action: "write", workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        ),
      ),
    ).toBe("role_denied");
  });

  it("SUPPORT is denied client data", async () => {
    const support = await user();
    const ws = await workspace();
    await member(ws.id, support.id, "SUPPORT");
    const c = await client(ws.id, (await user()).id);
    expect(
      await reason(
        authorize(
          s(support.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        ),
      ),
    ).toBe("role_denied");
  });

  it("CLIENT own access succeeds; another client in the same workspace fails", async () => {
    const clientUser = await user();
    const ws = await workspace();
    await member(ws.id, clientUser.id, "CLIENT");
    const own = await client(ws.id, clientUser.id);
    const other = await client(ws.id, (await user()).id);
    expect(
      (
        await authorize(
          s(clientUser.id),
          req({ workspaceId: ws.id, clientProfileId: own.id }),
          repo,
        )
      ).grantedScope,
    ).toBe("own");
    expect(
      await reason(
        authorize(
          s(clientUser.id),
          req({ workspaceId: ws.id, clientProfileId: other.id }),
          repo,
        ),
      ),
    ).toBe("not_owner");
  });

  it("cross-workspace access fails", async () => {
    const coach = await user();
    const otherClientUser = await user();
    const wsA = await workspace();
    const wsB = await workspace();
    const mA = await member(wsA.id, coach.id, "COACH");
    const cB = await client(wsB.id, otherClientUser.id);
    // assignment exists but in wsB, actor membership is in wsA
    await assign(wsB.id, cB.id, (await member(wsB.id, coach.id, "COACH")).id);
    expect(
      await reason(
        authorize(
          s(coach.id),
          req({ workspaceId: wsA.id, clientProfileId: cB.id }),
          repo,
        ),
      ),
    ).toBe("client_outside_workspace");
    expect(mA.id).toBeTruthy();
  });

  it("REMOVED/SUSPENDED membership fails immediately", async () => {
    const coach = await user();
    const ws = await workspace();
    const m = await member(ws.id, coach.id, "COACH");
    const c = await client(ws.id, (await user()).id);
    await assign(ws.id, c.id, m.id);
    expect(
      (
        await authorize(
          s(coach.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        )
      ).grantedScope,
    ).toBe("assigned");
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { status: "SUSPENDED" },
    });
    expect(
      await reason(
        authorize(
          s(coach.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        ),
      ),
    ).toBe("membership_missing_or_inactive");
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { status: "REMOVED" },
    });
    expect(
      await reason(
        authorize(
          s(coach.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        ),
      ),
    ).toBe("membership_missing_or_inactive");
  });

  it("DEACTIVATED User fails immediately", async () => {
    const u = await user();
    const ws = await workspace();
    await member(ws.id, u.id, "WORKSPACE_OWNER");
    await prisma.user.update({
      where: { id: u.id },
      data: { status: "DEACTIVATED" },
    });
    expect(
      await reason(authorize(s(u.id), req({ workspaceId: ws.id }), repo)),
    ).toBe("user_inactive");
  });

  it("removing an assignment fails the next check without session refresh", async () => {
    const coach = await user();
    const ws = await workspace();
    const m = await member(ws.id, coach.id, "COACH");
    const c = await client(ws.id, (await user()).id);
    const a = await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: m.id,
        role: "COACH",
      },
    });
    expect(
      (
        await authorize(
          s(coach.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        )
      ).grantedScope,
    ).toBe("assigned");
    await prisma.clientAssignment.update({
      where: { id: a.id },
      data: { status: "REMOVED" },
    });
    expect(
      await reason(
        authorize(
          s(coach.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        ),
      ),
    ).toBe("not_assigned");
  });

  it("a role change affects the next check without session refresh", async () => {
    const u = await user();
    const ws = await workspace();
    const m = await member(ws.id, u.id, "COACH");
    const c = await client(ws.id, (await user()).id);
    await assign(ws.id, c.id, m.id);
    expect(
      (
        await authorize(
          s(u.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        )
      ).grantedScope,
    ).toBe("assigned");
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { role: "SUPPORT" },
    });
    expect(
      await reason(
        authorize(
          s(u.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        ),
      ),
    ).toBe("role_denied");
  });

  it("platform admin cannot read health data or exports", async () => {
    const admin = await user("ACTIVE", "PLATFORM_ADMIN");
    expect(await reason(authorize(s(admin.id), req({}), repo))).toBe(
      "role_denied",
    );
    expect(
      await reason(
        authorize(s(admin.id), req({ resource: "exportsErasure" }), repo),
      ),
    ).toBe("role_denied");
    // platform admin with only platform scope on master data is allowed
    expect(
      (
        await authorize(
          s(admin.id),
          req({ resource: "foodExerciseMasterData" }),
          repo,
        )
      ).grantedScope,
    ).toBe("platform");
    // platform admin with a workspace membership still obeys the workspace role
    const ws = await workspace();
    await member(ws.id, admin.id, "SUPPORT");
    const c = await client(ws.id, (await user()).id);
    expect(
      await reason(
        authorize(
          s(admin.id),
          req({ workspaceId: ws.id, clientProfileId: c.id }),
          repo,
        ),
      ),
    ).toBe("role_denied");
  });

  it("PED/HRT fails for every role until policy approval", async () => {
    const admin = await user("ACTIVE", "PLATFORM_ADMIN");
    const ws = await workspace();
    const roles: WorkspaceRole[] = [
      "WORKSPACE_OWNER",
      "COACH",
      "ASSISTANT_COACH",
      "SUPPORT",
      "CLIENT",
    ];
    for (const role of roles) {
      const u = await user();
      const m = await member(ws.id, u.id, role);
      const c = await client(
        ws.id,
        role === "CLIENT" ? u.id : (await user()).id,
      );
      if (role === "COACH" || role === "ASSISTANT_COACH")
        await assign(ws.id, c.id, m.id);
      expect(
        await reason(
          authorize(
            s(u.id),
            req({
              resource: "pedHrt",
              action: "read",
              workspaceId: ws.id,
              clientProfileId: c.id,
            }),
            repo,
          ),
        ),
        role,
      ).toBe("role_denied");
    }
    expect(
      await reason(
        authorize(
          s(admin.id),
          req({ resource: "pedHrt", action: "read" }),
          repo,
        ),
      ),
    ).toBe("role_denied");
  });

  it("the adapter exposes only scoped queries (no unscoped client collections)", async () => {
    expect("listClients" in repo).toBe(false);
    expect("findAllClients" in repo).toBe(false);
    // A client in another workspace is never returned by the scoped lookup.
    const wsA = await workspace();
    const wsB = await workspace();
    const cB = await client(wsB.id, null);
    expect(await repo.getClientProfileInWorkspace(cB.id, wsA.id)).toBeNull();
  });
});
