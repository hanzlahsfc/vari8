import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { exportClientData, exportOwnData } from "../../lib/gdpr/export";

/**
 * S1-G real-PostgreSQL export tests: the allowlist export resolves the client
 * from the actor on the own path, enforces the locked `exportsErasure` matrix
 * on the scoped path, paginates explicitly, and fails loudly rather than
 * truncating. Synthetic fixtures only; dedicated disposable database.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("S1-G export", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","access_token","consent_record","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `u${++n}_${Date.now()}`;
  async function user(
    status: "ACTIVE" | "DEACTIVATED" | "INVITED" = "ACTIVE",
    platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
  ) {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$x",
        status,
        platformRole,
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
  ) {
    return prisma.workspaceMember.create({
      data: { workspaceId, userId, role, status: "ACTIVE" },
    });
  }
  async function clientProfile(
    workspaceId: string,
    userId: string | null = null,
  ) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId, name: `Client ${++n}` },
    });
  }
  async function consent(
    clientProfileId: string,
    kind:
      | "PRIVACY_NOTICE"
      | "HEALTH_DATA"
      | "CYCLE"
      | "PHOTOS"
      | "BLOODWORK" = "HEALTH_DATA",
    version = "v1",
    revoked = false,
  ) {
    return prisma.consentRecord.create({
      data: {
        clientProfileId,
        kind,
        version,
        revokedAt: revoked ? new Date() : null,
      },
    });
  }
  async function assignment(
    workspaceId: string,
    clientProfileId: string,
    coachMemberId: string,
    role: "PRIMARY" | "COACH" = "PRIMARY",
    status: "ACTIVE" | "REMOVED" = "ACTIVE",
  ) {
    return prisma.clientAssignment.create({
      data: { workspaceId, clientProfileId, coachMemberId, role, status },
    });
  }
  const s = (id: string) => ({ user: { id } }) as never;

  async function exportAuditRows(clientProfileId: string) {
    return prisma.auditEvent.findMany({
      where: {
        scope: "WORKSPACE",
        action: "EXPORT",
        resourceType: "client_export",
        subjectClientProfileId: clientProfileId,
      },
    });
  }

  async function clientFixture() {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const coach = await user();
    const coachMember = await member(ws.id, coach.id, "COACH");
    const clientUser = await user();
    await member(ws.id, clientUser.id, "CLIENT");
    const cp = await clientProfile(ws.id, clientUser.id);
    await assignment(ws.id, cp.id, coachMember.id);
    return { ws, owner, coach, coachMember, clientUser, cp };
  }

  it("own export returns allowlisted sections with a counts manifest and one audit event", async () => {
    const { ws, clientUser, cp } = await clientFixture();
    await consent(cp.id, "PRIVACY_NOTICE", "v1");
    await consent(cp.id, "HEALTH_DATA", "v1");
    await consent(cp.id, "CYCLE", "v1", true);

    const doc = await exportOwnData(
      s(clientUser.id),
      { workspaceId: ws.id },
      prisma,
    );

    expect(doc.formatVersion).toBe(1);
    expect(Object.keys(doc.sections).sort()).toEqual(
      ["assignments", "clientProfile", "consents"].sort(),
    );
    expect(doc.sections.clientProfile).toEqual({
      name: cp.name,
      createdAt: cp.createdAt.toISOString(),
    });
    expect(doc.sections.consents).toHaveLength(3);
    for (const row of doc.sections.consents) {
      expect(Object.keys(row).sort()).toEqual(
        ["grantedAt", "kind", "revokedAt", "source", "version"].sort(),
      );
    }
    expect(doc.sections.assignments).toEqual([
      expect.objectContaining({ role: "PRIMARY", status: "ACTIVE" }),
    ]);
    expect(Object.keys(doc.sections.assignments[0]).sort()).toEqual([
      "assignedAt",
      "role",
      "status",
    ]);
    expect(doc.manifest.sections).toEqual({
      clientProfile: 1,
      consents: 3,
      assignments: 1,
    });
    expect(doc.manifest.totalRecords).toBe(5);

    const audit = await exportAuditRows(cp.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      workspaceId: ws.id,
      actorUserId: clientUser.id,
      actorRole: "CLIENT",
      action: "EXPORT",
      resourceType: "client_export",
      result: "ALLOW",
      meta: { count: 5 },
    });
  });

  it("own export cannot select a foreign client via a supplied clientProfileId", async () => {
    const { ws, clientUser, cp } = await clientFixture();
    const other = await user();
    await member(ws.id, other.id, "CLIENT");
    const otherCp = await clientProfile(ws.id, other.id);
    await consent(otherCp.id, "HEALTH_DATA", "v1");

    const doc = await exportOwnData(
      s(clientUser.id),
      { workspaceId: ws.id, clientProfileId: otherCp.id } as never,
      prisma,
    );
    expect(doc.sections.clientProfile.name).toBe(cp.name);
    expect(doc.sections.consents).toHaveLength(0);
    expect(await exportAuditRows(otherCp.id)).toHaveLength(0);
  });

  it("denies clients with no linked profile, foreign workspaces, and non-ACTIVE users", async () => {
    const { ws } = await clientFixture();
    const noProfile = await user();
    await member(ws.id, noProfile.id, "CLIENT");
    await expect(
      exportOwnData(s(noProfile.id), { workspaceId: ws.id }, prisma),
    ).rejects.toMatchObject({
      name: "GdprError",
      code: "client_not_accessible",
    });

    const foreign = await user();
    const wsB = await workspace();
    await member(wsB.id, foreign.id, "CLIENT");
    await clientProfile(wsB.id, foreign.id);
    await expect(
      exportOwnData(s(foreign.id), { workspaceId: ws.id }, prisma),
    ).rejects.toThrow(AccessDeniedError);

    const deactivated = await user("DEACTIVATED");
    await member(ws.id, deactivated.id, "CLIENT");
    await clientProfile(ws.id, deactivated.id);
    await expect(
      exportOwnData(s(deactivated.id), { workspaceId: ws.id }, prisma),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("scoped export honors the matrix: owner workspace, assigned coach allowed; others denied", async () => {
    const { ws, owner, coach, cp } = await clientFixture();
    await consent(cp.id, "HEALTH_DATA", "v1");

    const ownerDoc = await exportClientData(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: cp.id },
      prisma,
    );
    expect(ownerDoc.manifest.totalRecords).toBe(3); // profile + consent + assignment

    const coachDoc = await exportClientData(
      s(coach.id),
      { workspaceId: ws.id, clientProfileId: cp.id },
      prisma,
    );
    expect(coachDoc.manifest.totalRecords).toBe(3);

    const unassigned = await user();
    await member(ws.id, unassigned.id, "COACH");
    await expect(
      exportClientData(
        s(unassigned.id),
        { workspaceId: ws.id, clientProfileId: cp.id },
        prisma,
      ),
    ).rejects.toThrow(AccessDeniedError);

    const assistant = await user();
    await member(ws.id, assistant.id, "ASSISTANT_COACH");
    await expect(
      exportClientData(
        s(assistant.id),
        { workspaceId: ws.id, clientProfileId: cp.id },
        prisma,
      ),
    ).rejects.toThrow(AccessDeniedError);

    const support = await user();
    await member(ws.id, support.id, "SUPPORT");
    await expect(
      exportClientData(
        s(support.id),
        { workspaceId: ws.id, clientProfileId: cp.id },
        prisma,
      ),
    ).rejects.toThrow(AccessDeniedError);

    const adminNoMembership = await user("ACTIVE", "PLATFORM_ADMIN");
    await expect(
      exportClientData(
        s(adminNoMembership.id),
        { workspaceId: ws.id, clientProfileId: cp.id },
        prisma,
      ),
    ).rejects.toThrow(AccessDeniedError);
  });

  it("client cannot use the scoped path even for their own profile", async () => {
    const { ws, clientUser, cp } = await clientFixture();
    await expect(
      exportClientData(
        s(clientUser.id),
        { workspaceId: ws.id, clientProfileId: cp.id },
        prisma,
      ),
    ).rejects.toThrow(AccessDeniedError);
    expect(await exportAuditRows(cp.id)).toHaveLength(0);
  });

  it("cross-workspace client id is denied and writes no audit", async () => {
    const { ws, owner } = await clientFixture();
    const wsB = await workspace();
    const foreignClient = await user();
    await member(wsB.id, foreignClient.id, "CLIENT");
    const foreignCp = await clientProfile(wsB.id, foreignClient.id);

    await expect(
      exportClientData(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: foreignCp.id },
        prisma,
      ),
    ).rejects.toThrow(AccessDeniedError);
    expect(await exportAuditRows(foreignCp.id)).toHaveLength(0);
  });

  it("paginates a section beyond one page and emits every row", async () => {
    const { ws, clientUser, cp } = await clientFixture();
    for (let i = 0; i < 7; i++) {
      await consent(cp.id, "HEALTH_DATA", `v${i}`, i % 2 === 0);
    }
    const doc = await exportOwnData(
      s(clientUser.id),
      { workspaceId: ws.id },
      prisma,
      { pageSize: 3 },
    );
    expect(doc.sections.consents).toHaveLength(7);
    expect(doc.manifest.sections.consents).toBe(7);
    expect(doc.manifest.totalRecords).toBe(9);
  });

  it("fails export_too_large instead of truncating, with no audit row", async () => {
    const { ws, clientUser, cp } = await clientFixture();
    for (let i = 0; i < 5; i++) {
      await consent(cp.id, "HEALTH_DATA", `v${i}`);
    }
    await expect(
      exportOwnData(s(clientUser.id), { workspaceId: ws.id }, prisma, {
        maxSectionRows: 3,
      }),
    ).rejects.toMatchObject({
      name: "GdprError",
      code: "export_too_large",
    });
    expect(await exportAuditRows(cp.id)).toHaveLength(0);
  });

  it("rejects malformed input structurally", async () => {
    const { clientUser } = await clientFixture();
    await expect(
      exportOwnData(s(clientUser.id), { workspaceId: "" }, prisma),
    ).rejects.toMatchObject({ name: "GdprError", code: "invalid_input" });
    await expect(
      exportOwnData(s(clientUser.id), { workspaceId: 5 as never }, prisma),
    ).rejects.toMatchObject({ name: "GdprError", code: "invalid_input" });
  });
});
