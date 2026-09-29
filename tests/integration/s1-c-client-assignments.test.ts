import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  assignCoach,
  createClientProfile,
  listAccessibleClientProfiles,
  listClientAssignments,
  readClientProfile,
  removeClientAssignment,
  setPrimaryCoach,
  updateClientProfileName,
  WorkspaceServiceError,
} from "../../lib/workspace/clients";

/**
 * S1-C real-PostgreSQL tests: the production services + real Prisma-backed guard.
 * Synthetic fixtures only. Dedicated disposable database via INTEGRATION_DATABASE_URL.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("S1-C client ownership & assignments", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `u${++n}_${Date.now()}`;
  async function user(
    platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
    status: "ACTIVE" | "DEACTIVATED" = "ACTIVE",
  ) {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$x",
        platformRole,
        status,
      },
    });
  }
  async function workspace() {
    return prisma.workspace.create({
      data: { name: `w${++n}`, slug: `ws${n}_${Date.now()}` },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT",
    status: "ACTIVE" | "SUSPENDED" | "REMOVED" = "ACTIVE",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status },
    });
  }
  async function clientProfile(
    workspaceId: string,
    userId: string | null = null,
  ) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId, name: "Client" },
    });
  }
  async function assign(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
    role: "PRIMARY" | "COACH" = "COACH",
    status: "ACTIVE" | "REMOVED" = "ACTIVE",
  ) {
    return prisma.clientAssignment.create({
      data: { workspaceId, clientProfileId, coachMemberId, role, status },
    });
  }
  const s = (id: string) => ({ user: { id } }) as never;

  it("OWNER lists only clients in their workspace; foreign-workspace profiles are never returned", async () => {
    const owner = await user();
    const wsA = await workspace();
    await member(wsA.id, owner.id, "WORKSPACE_OWNER");
    const inA = await clientProfile(wsA.id);
    const wsB = await workspace();
    const inB = await clientProfile(wsB.id);
    const list = await listAccessibleClientProfiles(
      s(owner.id),
      { workspaceId: wsA.id },
      prisma,
    );
    expect(list.items.map((i) => i.id)).toEqual([inA.id]);
    await expect(
      readClientProfile(
        s(owner.id),
        { workspaceId: wsA.id, clientProfileId: inB.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(WorkspaceServiceError);
  });

  it("COACH and ASSISTANT list only ACTIVE assigned clients; REMOVED assignment drops access immediately", async () => {
    const ws = await workspace();
    const coach = await user();
    const cm = await member(ws.id, coach.id, "COACH");
    const c1 = await clientProfile(ws.id);
    const c2 = await clientProfile(ws.id);
    await assign(ws.id, c1.id, cm.id, "COACH", "ACTIVE");
    await assign(ws.id, c2.id, cm.id, "COACH", "REMOVED");
    let list = await listAccessibleClientProfiles(
      s(coach.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(list.items.map((i) => i.id)).toEqual([c1.id]);

    const assistant = await user();
    const am = await member(ws.id, assistant.id, "ASSISTANT_COACH");
    await assign(ws.id, c2.id, am.id, "COACH", "ACTIVE");
    const alist = await listAccessibleClientProfiles(
      s(assistant.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(alist.items.map((i) => i.id)).toEqual([c2.id]);

    // REMOVED assignment removes the client from the coach list on the next call.
    await prisma.clientAssignment.updateMany({
      where: { clientProfileId: c1.id, coachMemberId: cm.id },
      data: { status: "REMOVED" },
    });
    list = await listAccessibleClientProfiles(
      s(coach.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(list.items).toHaveLength(0);
  });

  it("CLIENT lists/reads only their own profile; SUPPORT and platform admin denied", async () => {
    const ws = await workspace();
    const clientUser = await user();
    await member(ws.id, clientUser.id, "CLIENT");
    const own = await clientProfile(ws.id, clientUser.id);
    const other = await clientProfile(ws.id, (await user()).id);
    const list = await listAccessibleClientProfiles(
      s(clientUser.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(list.items.map((i) => i.id)).toEqual([own.id]);
    expect(
      (
        await readClientProfile(
          s(clientUser.id),
          { workspaceId: ws.id, clientProfileId: own.id },
          prisma,
        )
      ).id,
    ).toBe(own.id);
    await expect(
      readClientProfile(
        s(clientUser.id),
        { workspaceId: ws.id, clientProfileId: other.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    const support = await user();
    await member(ws.id, support.id, "SUPPORT");
    await expect(
      listAccessibleClientProfiles(
        s(support.id),
        { workspaceId: ws.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    const admin = await user("PLATFORM_ADMIN");
    await expect(
      listAccessibleClientProfiles(s(admin.id), { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("SUSPENDED/REMOVED membership and DEACTIVATED user lose access immediately", async () => {
    const ws = await workspace();
    const owner = await user();
    const m = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    await expect(
      listAccessibleClientProfiles(s(owner.id), { workspaceId: ws.id }, prisma),
    ).resolves.toBeDefined();
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      listAccessibleClientProfiles(s(owner.id), { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await prisma.workspaceMember.update({
      where: { id: m.id },
      data: { status: "REMOVED" },
    });
    await expect(
      listAccessibleClientProfiles(s(owner.id), { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    const owner2 = await user();
    const m2 = await member(ws.id, owner2.id, "WORKSPACE_OWNER");
    void m2;
    await prisma.user.update({
      where: { id: owner2.id },
      data: { status: "DEACTIVATED" },
    });
    await expect(
      listAccessibleClientProfiles(
        s(owner2.id),
        { workspaceId: ws.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("OWNER creates an unlinked client and cannot set userId; OWNER/assigned COACH/CLIENT update names; others denied", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const created = await createClientProfile(
      s(owner.id),
      { workspaceId: ws.id, name: " New Client " },
      prisma,
    );
    expect(created.name).toBe("New Client");
    const raw = await prisma.clientProfile.findUnique({
      where: { id: created.id },
      select: { userId: true },
    });
    expect(raw?.userId).toBeNull();
    // A caller-supplied userId is ignored (never persisted).
    const withUser = await createClientProfile(
      s(owner.id),
      { workspaceId: ws.id, name: "X", userId: "evil" } as never,
      prisma,
    );
    expect(
      (
        await prisma.clientProfile.findUnique({
          where: { id: withUser.id },
          select: { userId: true },
        })
      )?.userId,
    ).toBeNull();

    // owner updates
    expect(
      (
        await updateClientProfileName(
          s(owner.id),
          { workspaceId: ws.id, clientProfileId: created.id, name: "Owned" },
          prisma,
        )
      ).name,
    ).toBe("Owned");

    // assigned coach updates, unassigned coach denied, assistant denied
    const coach = await user();
    const cm = await member(ws.id, coach.id, "COACH");
    const assignedClient = await clientProfile(ws.id);
    await assign(ws.id, assignedClient.id, cm.id);
    expect(
      (
        await updateClientProfileName(
          s(coach.id),
          {
            workspaceId: ws.id,
            clientProfileId: assignedClient.id,
            name: "By Coach",
          },
          prisma,
        )
      ).name,
    ).toBe("By Coach");
    const unassigned = await user();
    await member(ws.id, unassigned.id, "COACH");
    await expect(
      updateClientProfileName(
        s(unassigned.id),
        { workspaceId: ws.id, clientProfileId: assignedClient.id, name: "No" },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const assistant = await user();
    await member(ws.id, assistant.id, "ASSISTANT_COACH");
    await expect(
      updateClientProfileName(
        s(assistant.id),
        { workspaceId: ws.id, clientProfileId: assignedClient.id, name: "No" },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // client updates own only
    const cu = await user();
    await member(ws.id, cu.id, "CLIENT");
    const own = await clientProfile(ws.id, cu.id);
    expect(
      (
        await updateClientProfileName(
          s(cu.id),
          { workspaceId: ws.id, clientProfileId: own.id, name: "Mine" },
          prisma,
        )
      ).name,
    ).toBe("Mine");
    await expect(
      updateClientProfileName(
        s(cu.id),
        {
          workspaceId: ws.id,
          clientProfileId: assignedClient.id,
          name: "Theirs",
        },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // workspace/user cannot be changed and no delete exists
    const after = await prisma.clientProfile.findUnique({
      where: { id: own.id },
      select: { workspaceId: true, userId: true },
    });
    expect(after).toEqual({ workspaceId: ws.id, userId: cu.id });
    const services = await import("../../lib/workspace/clients");
    expect("deleteClientProfile" in services).toBe(false);
  });

  it("assignment target rules and owner-only mutations", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const c = await clientProfile(ws.id);

    // eligible coach
    const coach = await user();
    const cm = await member(ws.id, coach.id, "COACH");
    await assignCoach(
      s(owner.id),
      {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: cm.id,
        role: "COACH",
      },
      prisma,
    );

    // eligible assistant as non-primary; assistant PRIMARY rejected
    const assistant = await user();
    const am = await member(ws.id, assistant.id, "ASSISTANT_COACH");
    await assignCoach(
      s(owner.id),
      {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: am.id,
        role: "COACH",
      },
      prisma,
    );
    await expect(
      assignCoach(
        s(owner.id),
        {
          workspaceId: ws.id,
          clientProfileId: c.id,
          coachMemberId: am.id,
          role: "PRIMARY",
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "member_not_eligible" });

    // non-coach target roles rejected
    for (const role of ["WORKSPACE_OWNER", "SUPPORT", "CLIENT"] as const) {
      const u = await user();
      const m = await member(ws.id, u.id, role);
      await expect(
        assignCoach(
          s(owner.id),
          { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: m.id },
          prisma,
        ),
      ).rejects.toMatchObject({ code: "member_not_eligible" });
    }

    // inactive target member/user rejected
    const dead = await user();
    const dm = await member(ws.id, dead.id, "COACH", "SUSPENDED");
    await expect(
      assignCoach(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: dm.id },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "member_not_eligible" });
    const deadUser = await user("USER", "DEACTIVATED");
    const dm2 = await member(ws.id, deadUser.id, "COACH");
    await expect(
      assignCoach(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: dm2.id },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "member_not_eligible" });

    // cross-workspace target/client rejected
    const wsB = await workspace();
    const foreignCoach = await user();
    const fcm = await member(wsB.id, foreignCoach.id, "COACH");
    await expect(
      assignCoach(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: fcm.id },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "member_not_eligible" });
    const foreignClient = await clientProfile(wsB.id);
    await expect(
      assignCoach(
        s(owner.id),
        {
          workspaceId: ws.id,
          clientProfileId: foreignClient.id,
          coachMemberId: cm.id,
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "client_not_accessible" });

    // non-owner cannot list or mutate
    await expect(
      listClientAssignments(
        s(coach.id),
        { workspaceId: ws.id, clientProfileId: c.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      assignCoach(
        s(coach.id),
        { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: cm.id },
        prisma,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("duplicate assignment is idempotent; REMOVED reactivates; multiple non-primary coaches allowed", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const c = await clientProfile(ws.id);
    const ch1 = await user();
    const m1 = await member(ws.id, ch1.id, "COACH");
    const ch2 = await user();
    const m2 = await member(ws.id, ch2.id, "COACH");

    const first = await assignCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: m1.id },
      prisma,
    );
    expect(first.changed).toBe(true);
    const again = await assignCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: m1.id },
      prisma,
    );
    expect(again.changed).toBe(false);
    await assignCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: m2.id },
      prisma,
    );

    // remove then reactivate
    await removeClientAssignment(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: m2.id },
      prisma,
    );
    expect(
      (await prisma.clientProfile.findUnique({ where: { id: c.id } }))?.id,
    ).toBe(c.id);
    const reactivated = await assignCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: m2.id },
      prisma,
    );
    expect(reactivated).toMatchObject({ status: "ACTIVE", changed: true });
    const active = await listClientAssignments(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: c.id },
      prisma,
    );
    expect(active.items.filter((a) => a.status === "ACTIVE")).toHaveLength(2);
  });

  it("setPrimaryCoach leaves exactly one ACTIVE PRIMARY; conflicts fail safely; removal clears access", async () => {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const c = await clientProfile(ws.id);
    const ch1 = await user();
    const m1 = await member(ws.id, ch1.id, "COACH");
    const ch2 = await user();
    const m2 = await member(ws.id, ch2.id, "COACH");

    await setPrimaryCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: m1.id },
      prisma,
    );
    const r = await setPrimaryCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: m2.id },
      prisma,
    );
    expect(r.role).toBe("PRIMARY");
    const primaries = await prisma.clientAssignment.findMany({
      where: {
        workspaceId: ws.id,
        clientProfileId: c.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
    expect(primaries).toHaveLength(1);
    expect(primaries[0].coachMemberId).toBe(m2.id);
    // first coach remains an ACTIVE non-primary COACH
    const firstStill = await prisma.clientAssignment.findUnique({
      where: {
        clientProfileId_coachMemberId: {
          clientProfileId: c.id,
          coachMemberId: m1.id,
        },
      },
    });
    expect(firstStill).toMatchObject({ role: "COACH", status: "ACTIVE" });

    // assignCoach PRIMARY while another primary already active -> conflict
    const ch3 = await user();
    const m3 = await member(ws.id, ch3.id, "COACH");
    await expect(
      assignCoach(
        s(owner.id),
        {
          workspaceId: ws.id,
          clientProfileId: c.id,
          coachMemberId: m3.id,
          role: "PRIMARY",
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "assignment_conflict" });

    // remove m2 assignment -> coach m2 loses access to c
    await removeClientAssignment(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: c.id, coachMemberId: m2.id },
      prisma,
    );
    const list = await listAccessibleClientProfiles(
      s(ch2.id),
      { workspaceId: ws.id },
      prisma,
    );
    expect(list.items.find((i) => i.id === c.id)).toBeUndefined();
  });

  it("all list queries stay workspace-scoped with a bounded limit", async () => {
    const wsA = await workspace();
    const owner = await user();
    await member(wsA.id, owner.id, "WORKSPACE_OWNER");
    for (let i = 0; i < 3; i += 1) await clientProfile(wsA.id);
    const wsB = await workspace();
    await clientProfile(wsB.id);
    const page = await listAccessibleClientProfiles(
      s(owner.id),
      { workspaceId: wsA.id, limit: 2 },
      prisma,
    );
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    expect(page.items.every((i) => i.workspaceId === wsA.id)).toBe(true);
    await expect(
      listAccessibleClientProfiles(
        s(owner.id),
        { workspaceId: wsA.id, limit: 500 },
        prisma,
      ),
    ).resolves.toBeDefined();
  });
});
