import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  assignCoach,
  listAssignableCoachMembers,
  listClientAssignments,
  removeClientAssignment,
  setPrimaryCoach,
} from "../../lib/workspace/clients";

/**
 * SOLO-COACH-I1 real-PostgreSQL tests (decision 111): owner-managed coach
 * assignments — explicit owner self-assignment, WORKSPACE_OWNER eligibility
 * for PRIMARY|COACH, bounded eligible-member selector, removal ≠ membership
 * removal, and absolute platform-admin denial including the dual-role
 * PLATFORM_ADMIN + ACTIVE owner-membership path (deny-set correction:
 * `clientAssignments` was previously absent from PLATFORM_ADMIN_DENIED_RESOURCES).
 * Synthetic fixtures only. Dedicated disposable database via
 * INTEGRATION_DATABASE_URL.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("SOLO-COACH-I1 owner-as-coach (real PG)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `sc${++n}_${Date.now()}`;
  async function user(
    platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
    status: "ACTIVE" | "DEACTIVATED" = "ACTIVE",
  ) {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$x",
        name: `Fixture ${uid()}`,
        platformRole,
        status,
      },
    });
  }
  async function workspace() {
    return prisma.workspace.create({
      data: { name: `w${++n}`, slug: `sc${n}_${Date.now()}` },
    });
  }
  async function member(
    workspaceId: string,
    userId: string,
    role:
      | "WORKSPACE_OWNER"
      | "COACH"
      | "ASSISTANT_COACH"
      | "SUPPORT"
      | "CLIENT",
    status: "ACTIVE" | "SUSPENDED" | "REMOVED" = "ACTIVE",
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status },
    });
  }
  async function clientProfile(workspaceId: string) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId: null, name: "Client" },
    });
  }
  const s = (id: string) => ({ user: { id } }) as never;

  // ── Owner eligibility (decision 111 Q2 — PRIMARY|COACH) ────────────────

  it("owner self-assigns as PRIMARY through the service (explicit act, audited)", async () => {
    const owner = await user();
    const ws = await workspace();
    const ownerMember = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const c = await clientProfile(ws.id);

    const result = await assignCoach(
      s(owner.id),
      {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: ownerMember.id,
        role: "PRIMARY",
      },
      prisma,
    );
    expect(result.changed).toBe(true);

    const row = await prisma.clientAssignment.findFirstOrThrow({
      where: { clientProfileId: c.id, coachMemberId: ownerMember.id },
    });
    expect(row.role).toBe("PRIMARY");
    expect(row.status).toBe("ACTIVE");
    const audits = await prisma.auditEvent.findMany({
      where: { resourceId: row.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it("owner member is eligible as COACH; set-primary then promotes the owner row", async () => {
    const owner = await user();
    const ws = await workspace();
    const ownerMember = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const coach = await user();
    const coachMember = await member(ws.id, coach.id, "COACH");
    const c = await clientProfile(ws.id);
    await assignCoach(
      s(owner.id),
      {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: coachMember.id,
        role: "PRIMARY",
      },
      prisma,
    );
    await assignCoach(
      s(owner.id),
      {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: ownerMember.id,
        role: "COACH",
      },
      prisma,
    );
    // set-primary replacement: owner becomes PRIMARY, prior PRIMARY demotes.
    const promoted = await setPrimaryCoach(
      s(owner.id),
      {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: ownerMember.id,
      },
      prisma,
    );
    expect(promoted.changed).toBe(true);
    const rows = await prisma.clientAssignment.findMany({
      where: { clientProfileId: c.id, status: "ACTIVE" },
    });
    const ownerRow = rows.find((r) => r.coachMemberId === ownerMember.id);
    const coachRow = rows.find((r) => r.coachMemberId === coachMember.id);
    expect(ownerRow?.role).toBe("PRIMARY");
    expect(coachRow?.role).toBe("COACH");
  });

  it("removing an assignment leaves the workspace membership untouched", async () => {
    const owner = await user();
    const ws = await workspace();
    const ownerMember = await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const c = await clientProfile(ws.id);
    await assignCoach(
      s(owner.id),
      {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: ownerMember.id,
        role: "PRIMARY",
      },
      prisma,
    );
    const removed = await removeClientAssignment(
      s(owner.id),
      {
        workspaceId: ws.id,
        clientProfileId: c.id,
        coachMemberId: ownerMember.id,
      },
      prisma,
    );
    expect(removed.changed).toBe(true);
    const stillMember = await prisma.workspaceMember.findUniqueOrThrow({
      where: { id: ownerMember.id },
    });
    expect(stillMember.role).toBe("WORKSPACE_OWNER");
    expect(stillMember.status).toBe("ACTIVE");
  });

  // ── Bounded selector read ───────────────────────────────────────────────

  it("listAssignableCoachMembers returns minimal rows for ACTIVE eligible members only", async () => {
    const owner = await user();
    const ws = await workspace();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const coach = await user();
    await member(ws.id, coach.id, "COACH");
    const assistant = await user();
    await member(ws.id, assistant.id, "ASSISTANT_COACH");
    const support = await user();
    await member(ws.id, support.id, "SUPPORT");
    const suspended = await user();
    await member(ws.id, suspended.id, "COACH", "SUSPENDED");

    const items = await listAssignableCoachMembers(
      s(owner.id),
      { workspaceId: ws.id },
      prisma,
    );
    const roles = items.map((i) => i.role).sort();
    expect(roles).toEqual(
      ["ASSISTANT_COACH", "COACH", "WORKSPACE_OWNER"].sort(),
    );
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(
        ["displayName", "memberId", "role"].sort(),
      );
      expect(typeof item.displayName).toBe("string");
      expect(item.displayName.length).toBeGreaterThan(0);
    }
  });

  it("non-owner members cannot read the assignable-members selector", async () => {
    const owner = await user();
    const ws = await workspace();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const coach = await user();
    await member(ws.id, coach.id, "COACH");
    await expect(
      listAssignableCoachMembers(s(coach.id), { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  // ── Dual-role PLATFORM_ADMIN denial (deny-set correction) ───────────────

  it("PLATFORM_ADMIN + ACTIVE owner membership is denied on every assignment path with zero writes and zero audits", async () => {
    const admin = await user("PLATFORM_ADMIN");
    const ws = await workspace();
    const adminMember = await member(ws.id, admin.id, "WORKSPACE_OWNER");
    const c = await clientProfile(ws.id);
    const coach = await user();
    const coachMember = await member(ws.id, coach.id, "COACH");

    const beforeAssignments = await prisma.clientAssignment.count();
    const beforeAudits = await prisma.auditEvent.count();

    await expect(
      listClientAssignments(
        s(admin.id),
        { workspaceId: ws.id, clientProfileId: c.id },
        prisma,
      ),
    ).rejects.toMatchObject({ reason: "role_denied" });
    await expect(
      listAssignableCoachMembers(s(admin.id), { workspaceId: ws.id }, prisma),
    ).rejects.toMatchObject({ reason: "role_denied" });
    await expect(
      assignCoach(
        s(admin.id),
        {
          workspaceId: ws.id,
          clientProfileId: c.id,
          coachMemberId: coachMember.id,
        },
        prisma,
      ),
    ).rejects.toMatchObject({ reason: "role_denied" });
    await expect(
      setPrimaryCoach(
        s(admin.id),
        {
          workspaceId: ws.id,
          clientProfileId: c.id,
          coachMemberId: adminMember.id,
        },
        prisma,
      ),
    ).rejects.toMatchObject({ reason: "role_denied" });
    await expect(
      removeClientAssignment(
        s(admin.id),
        {
          workspaceId: ws.id,
          clientProfileId: c.id,
          coachMemberId: coachMember.id,
        },
        prisma,
      ),
    ).rejects.toMatchObject({ reason: "role_denied" });

    // Zero unauthorized assignment changes and zero unauthorized audits.
    expect(await prisma.clientAssignment.count()).toBe(beforeAssignments);
    expect(await prisma.auditEvent.count()).toBe(beforeAudits);
  });
});
