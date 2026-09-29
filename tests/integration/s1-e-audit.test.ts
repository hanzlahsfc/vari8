import { execFileSync } from "node:child_process";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { AuditError, listAuditEvents, writeAuditEvent } from "../../lib/audit";
import {
  createStaticConsentPolicy,
  grantOwnConsent,
  revokeOwnConsent,
} from "../../lib/consent";
import {
  assignCoach,
  removeClientAssignment,
  setPrimaryCoach,
} from "../../lib/workspace/clients";

/**
 * S1-E real-PostgreSQL audit tests: production mutation services must commit
 * exactly one metadata-only audit event inside the same transaction — never
 * without it, never for denied/failed/idempotent operations.
 * Synthetic fixtures only; dedicated disposable database.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const V1 = createStaticConsentPolicy({
  PRIVACY_NOTICE: "test-v1",
  HEALTH_DATA: "test-v1",
  CYCLE: "test-v1",
});

describe.skipIf(!enabled)("S1-E metadata-only audit", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "audit_event","consent_record","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `u${++n}_${Date.now()}`;
  async function user(status: "ACTIVE" | "DEACTIVATED" = "ACTIVE") {
    return prisma.user.create({
      data: {
        email: `${uid()}@example.test`,
        passwordHash: "scrypt$x",
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
      data: { workspaceId, userId, name: "Client" },
    });
  }
  const s = (id: string) => ({ user: { id } }) as never;

  async function clientFixture() {
    const ws = await workspace();
    const u = await user();
    await member(ws.id, u.id, "CLIENT");
    const cp = await clientProfile(ws.id, u.id);
    return { ws, u, cp };
  }
  async function ownerFixture() {
    const ws = await workspace();
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    const cp = await clientProfile(ws.id);
    return { ws, owner, cp };
  }

  /** Wraps a real PrismaClient so tx.auditEvent.create throws once per call. */
  function auditFailClient(target: PrismaClient): PrismaClient {
    return new Proxy(target, {
      get(t, property) {
        if (property !== "$transaction") return Reflect.get(t, property);
        return async (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: unknown,
        ) =>
          t.$transaction(
            async (tx) => {
              const txClient = new Proxy(tx, {
                get(transaction, key) {
                  if (key !== "auditEvent")
                    return Reflect.get(transaction, key);
                  return new Proxy(transaction.auditEvent, {
                    get(delegate, operation) {
                      if (operation !== "create")
                        return Reflect.get(delegate, operation);
                      return async () => {
                        throw new Error("forced audit failure");
                      };
                    },
                  });
                },
              });
              return callback(txClient);
            },
            options as Parameters<typeof t.$transaction>[1],
          );
      },
    });
  }

  it("successful grant commits consent row and exactly one GRANT audit event", async () => {
    const { ws, u, cp } = await clientFixture();
    const result = await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    expect(result.changed).toBe(true);
    const events = await prisma.auditEvent.findMany({
      where: { workspaceId: ws.id },
    });
    expect(events).toHaveLength(1);
    const event = events[0];
    const consent = await prisma.consentRecord.findFirst({
      where: { clientProfileId: cp.id },
    });
    expect(event).toMatchObject({
      workspaceId: ws.id,
      actorUserId: u.id,
      actorRole: "CLIENT",
      action: "GRANT",
      resourceType: "consent",
      resourceId: consent!.id,
      subjectClientProfileId: cp.id,
      result: "ALLOW",
      reason: null,
      ip: null,
    });
    expect(event.meta).toEqual({ kind: "HEALTH_DATA", version: "test-v1" });
  });

  it("revoke commits one REVOKE event with structural meta only", async () => {
    const { ws, u, cp } = await clientFixture();
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "CYCLE" },
      { client: prisma, registry: V1 },
    );
    const revoked = await revokeOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "CYCLE" },
      { client: prisma },
    );
    expect(revoked.changed).toBe(true);
    const event = await prisma.auditEvent.findFirst({
      where: { workspaceId: ws.id, action: "REVOKE" },
    });
    expect(event).toMatchObject({
      actorUserId: u.id,
      actorRole: "CLIENT",
      resourceType: "consent",
      subjectClientProfileId: cp.id,
      result: "ALLOW",
    });
    expect(event!.meta).toEqual({ kind: "CYCLE", count: 1 });
  });

  it("assignment mutations each commit their audit event", async () => {
    const { ws, owner, cp } = await ownerFixture();
    const coach = await user();
    const cm = await member(ws.id, coach.id, "COACH");

    await assignCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: cm.id },
      prisma,
    );
    const assigned = await prisma.clientAssignment.findUnique({
      where: {
        clientProfileId_coachMemberId: {
          clientProfileId: cp.id,
          coachMemberId: cm.id,
        },
      },
    });
    const grant = await prisma.auditEvent.findFirst({
      where: { workspaceId: ws.id, action: "ASSIGN" },
    });
    expect(grant).toMatchObject({
      actorUserId: owner.id,
      actorRole: "WORKSPACE_OWNER",
      resourceType: "client_assignment",
      resourceId: assigned!.id,
      subjectClientProfileId: cp.id,
      result: "ALLOW",
      meta: { role: "COACH", status: "ACTIVE" },
    });

    await setPrimaryCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: cm.id },
      prisma,
    );
    const primary = await prisma.auditEvent.findFirst({
      where: {
        workspaceId: ws.id,
        action: "UPDATE",
        meta: { equals: { role: "PRIMARY", status: "ACTIVE" } },
      },
    });
    expect(primary).not.toBeNull();

    await removeClientAssignment(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: cm.id },
      prisma,
    );
    const removed = await prisma.auditEvent.findFirst({
      where: {
        workspaceId: ws.id,
        action: "UPDATE",
        meta: { equals: { role: "PRIMARY", status: "REMOVED" } },
      },
    });
    expect(removed).not.toBeNull();
    expect(
      await prisma.auditEvent.count({ where: { workspaceId: ws.id } }),
    ).toBe(3);
  });

  it("forced audit failure rolls the business mutation back", async () => {
    const { ws, u, cp } = await clientFixture();
    const failing = auditFailClient(prisma);
    await expect(
      grantOwnConsent(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
        { client: failing, registry: V1 },
      ),
    ).rejects.toThrow();
    // Nothing may remain: no consent row and no audit row.
    expect(
      await prisma.consentRecord.count({ where: { clientProfileId: cp.id } }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { workspaceId: ws.id } }),
    ).toBe(0);
  });

  it("denied and failed mutations create neither mutation nor audit event", async () => {
    const { ws, u, cp } = await clientFixture();
    const auditCount = () =>
      prisma.auditEvent.count({ where: { workspaceId: ws.id } });
    const base = await auditCount();

    // RBAC denial (owner cannot grant client consent).
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    await expect(
      grantOwnConsent(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
        { client: prisma, registry: V1 },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // Policy denial (PED_HRT not approved).
    await expect(
      grantOwnConsent(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: cp.id, kind: "PED_HRT" },
        {
          client: prisma,
          registry: createStaticConsentPolicy({ PED_HRT: "test-v1" }),
        },
      ),
    ).rejects.toMatchObject({ code: "ped_hrt_not_approved" });

    // Invalid input.
    await expect(
      grantOwnConsent(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: cp.id, kind: "NOPE" as never },
        { client: prisma, registry: V1 },
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });

    // Unconfigured policy fails closed.
    await expect(
      grantOwnConsent(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
        { client: prisma },
      ),
    ).rejects.toMatchObject({ code: "policy_not_configured" });

    expect(await auditCount()).toBe(base);
    expect(
      await prisma.consentRecord.count({ where: { clientProfileId: cp.id } }),
    ).toBe(0);
  });

  it("cross-workspace attempts write no mutation and no audit row", async () => {
    const { ws: wsA, cp } = await clientFixture();
    const wsB = await workspace();
    const intruder = await user();
    await member(wsB.id, intruder.id, "CLIENT");
    const foreignClient = await clientProfile(wsB.id, intruder.id);
    void foreignClient;

    await expect(
      grantOwnConsent(
        s(intruder.id),
        { workspaceId: wsB.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
        { client: prisma, registry: V1 },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(
      await prisma.auditEvent.count({ where: { workspaceId: wsB.id } }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { workspaceId: wsA.id } }),
    ).toBe(0);
    expect(
      await prisma.consentRecord.count({ where: { clientProfileId: cp.id } }),
    ).toBe(0);
  });

  it("idempotent grant/revoke and racing grants leave exactly one GRANT event", async () => {
    const { ws, u, cp } = await clientFixture();
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    const again = await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    expect(again.changed).toBe(false);
    expect(
      await prisma.auditEvent.count({
        where: { workspaceId: ws.id, action: "GRANT" },
      }),
    ).toBe(1);

    // Idempotent revoke when nothing is active writes nothing.
    await revokeOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "CYCLE" },
      { client: prisma },
    );
    expect(
      await prisma.auditEvent.count({
        where: { workspaceId: ws.id, action: "REVOKE" },
      }),
    ).toBe(0);

    // Concurrent duplicate grant: still exactly one GRANT event.
    const { ws: ws2, u: u2, cp: cp2 } = await clientFixture();
    const outcomes = await Promise.allSettled([
      grantOwnConsent(
        s(u2.id),
        { workspaceId: ws2.id, clientProfileId: cp2.id, kind: "CYCLE" },
        { client: prisma, registry: V1 },
      ),
      grantOwnConsent(
        s(u2.id),
        { workspaceId: ws2.id, clientProfileId: cp2.id, kind: "CYCLE" },
        { client: prisma, registry: V1 },
      ),
    ]);
    expect(
      await prisma.auditEvent.count({
        where: { workspaceId: ws2.id, action: "GRANT" },
      }),
    ).toBe(1);
    expect(
      await prisma.consentRecord.count({
        where: { clientProfileId: cp2.id, kind: "CYCLE", revokedAt: null },
      }),
    ).toBe(1);
    void outcomes;
  });

  it("listAuditEvents is owner-scoped, tenant-isolated, and bounded", async () => {
    const { ws } = await ownerFixture();
    const ownerRow = await prisma.workspaceMember.findFirst({
      where: { workspaceId: ws.id, role: "WORKSPACE_OWNER" },
    });
    const ownerId = ownerRow!.userId;
    const { cp } = await clientFixture();
    void cp;

    // 101 synthetic structural events in ws and 1 in a foreign workspace.
    const total = 101;
    await prisma.auditEvent.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        workspaceId: ws.id,
        actorUserId: ownerId,
        actorRole: "WORKSPACE_OWNER" as const,
        action: "GRANT" as const,
        resourceType: "consent",
        subjectClientProfileId: null,
        result: "ALLOW" as const,
        meta: { kind: "HEALTH_DATA", version: `hist-${i}` },
      })),
    });
    const wsB = await workspace();
    await prisma.auditEvent.create({
      data: {
        workspaceId: wsB.id,
        action: "GRANT",
        resourceType: "consent",
        result: "ALLOW",
      },
    });

    const first = await listAuditEvents(
      s(ownerId),
      { workspaceId: ws.id, limit: 999 },
      prisma,
    );
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).not.toBeNull();
    expect(first.items.every((e) => e.workspaceId === ws.id)).toBe(true);
    const rest = await listAuditEvents(
      s(ownerId),
      {
        workspaceId: ws.id,
        limit: 999,
        cursor: first.nextCursor as string,
      },
      prisma,
    );
    expect(rest.items).toHaveLength(total - 100);
    expect(rest.nextCursor).toBeNull();

    const defaulted = await listAuditEvents(
      s(ownerId),
      { workspaceId: ws.id },
      prisma,
    );
    expect(defaulted.items).toHaveLength(25);

    // Tenant isolation: owner of wsB cannot read ws events; coach denied.
    const wsBOwner = await user();
    await member(wsB.id, wsBOwner.id, "WORKSPACE_OWNER");
    const foreign = await listAuditEvents(
      s(wsBOwner.id),
      { workspaceId: wsB.id },
      prisma,
    );
    expect(foreign.items).toHaveLength(1);
    await expect(
      listAuditEvents(s(wsBOwner.id), { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const coach = await user();
    await member(ws.id, coach.id, "COACH");
    await expect(
      listAuditEvents(s(coach.id), { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // A member of wsA as CLIENT cannot read audit either.
    const cu = await user();
    await member(ws.id, cu.id, "CLIENT");
    await expect(
      listAuditEvents(s(cu.id), { workspaceId: ws.id }, prisma),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("prototype-key canary metadata can never reach the database", async () => {
    const { ws, u, cp } = await clientFixture();
    const ctx = {
      userId: u.id,
      platformRole: "USER" as const,
      workspaceId: ws.id,
      workspaceMemberId: "m1",
      workspaceRole: "CLIENT" as const,
      grantedScope: "own" as const,
      clientProfileId: cp.id,
    };
    const canary = `canary-${Date.now()}-health-marker`;
    for (const key of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
    ]) {
      const meta = JSON.parse(`{"${key}":{"note":"${canary}"}}`);
      await expect(
        prisma.$transaction(async (tx) =>
          writeAuditEvent(tx, ctx, {
            action: "GRANT",
            resourceType: "consent",
            subjectClientProfileId: cp.id,
            meta,
          }),
        ),
      ).rejects.toBeInstanceOf(AuditError);
    }
    const leaked = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      `SELECT COUNT(*)::int AS c FROM "audit_event" WHERE "meta"::text LIKE $1`,
      `%${canary}%`,
    );
    expect(leaked[0]?.c).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { workspaceId: ws.id } }),
    ).toBe(0);
  });

  it("setPrimaryCoach is a no-op when the coach is already the sole active primary", async () => {
    const { ws, owner, cp } = await ownerFixture();
    const c1 = await user();
    const m1 = await member(ws.id, c1.id, "COACH");
    const c2 = await user();
    const m2 = await member(ws.id, c2.id, "COACH");

    const first = await setPrimaryCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: m1.id },
      prisma,
    );
    expect(first.changed).toBe(true);
    expect(
      await prisma.auditEvent.count({ where: { workspaceId: ws.id } }),
    ).toBe(1);

    // Repeat: no state change, no second event.
    const again = await setPrimaryCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: m1.id },
      prisma,
    );
    expect(again).toMatchObject({
      changed: false,
      role: "PRIMARY",
      status: "ACTIVE",
      coachMemberId: m1.id,
    });
    const third = await setPrimaryCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: m1.id },
      prisma,
    );
    expect(third.changed).toBe(false);
    expect(
      await prisma.auditEvent.count({ where: { workspaceId: ws.id } }),
    ).toBe(1);
    const row = await prisma.clientAssignment.findUnique({
      where: {
        clientProfileId_coachMemberId: {
          clientProfileId: cp.id,
          coachMemberId: m1.id,
        },
      },
    });
    expect(row).toMatchObject({ role: "PRIMARY", status: "ACTIVE" });

    // Genuine change to a different eligible coach: one new event.
    const second = await setPrimaryCoach(
      s(owner.id),
      { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: m2.id },
      prisma,
    );
    expect(second.changed).toBe(true);
    const events = await prisma.auditEvent.findMany({
      where: { workspaceId: ws.id, action: "UPDATE" },
    });
    expect(events).toHaveLength(2);
    const primary = await prisma.clientAssignment.findMany({
      where: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
    expect(primary).toHaveLength(1);
    expect(primary[0].coachMemberId).toBe(m2.id);
  });

  it("setPrimaryCoach denials write no mutation and no audit event", async () => {
    const { ws, owner, cp } = await ownerFixture();
    const base = await prisma.auditEvent.count({
      where: { workspaceId: ws.id },
    });

    // Ineligible target (assistant cannot be PRIMARY).
    const assistant = await user();
    const am = await member(ws.id, assistant.id, "ASSISTANT_COACH");
    await expect(
      setPrimaryCoach(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: am.id },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "member_not_eligible" });

    // Cross-workspace client.
    const wsB = await workspace();
    const foreignClient = await clientProfile(wsB.id);
    await expect(
      setPrimaryCoach(
        s(owner.id),
        {
          workspaceId: ws.id,
          clientProfileId: foreignClient.id,
          coachMemberId: am.id,
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "client_not_accessible" });

    // Cross-workspace coach member.
    const foreignCoach = await user();
    const fcm = await member(wsB.id, foreignCoach.id, "COACH");
    await expect(
      setPrimaryCoach(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: fcm.id },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "member_not_eligible" });

    expect(
      await prisma.auditEvent.count({ where: { workspaceId: ws.id } }),
    ).toBe(base);
    expect(
      await prisma.clientAssignment.count({ where: { workspaceId: ws.id } }),
    ).toBe(0);
  });

  it("forced audit failure rolls back a genuine primary change", async () => {
    const { ws, owner, cp } = await ownerFixture();
    const coach = await user();
    const cm = await member(ws.id, coach.id, "COACH");
    const failing = auditFailClient(prisma);
    await expect(
      setPrimaryCoach(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: cm.id },
        failing,
      ),
    ).rejects.toThrow();
    expect(
      await prisma.clientAssignment.count({
        where: { workspaceId: ws.id, status: "ACTIVE" },
      }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { workspaceId: ws.id } }),
    ).toBe(0);
  });

  it("concurrent primary changes resolve to exactly one audited primary", async () => {
    const { ws, owner, cp } = await ownerFixture();
    const c1 = await user();
    const m1 = await member(ws.id, c1.id, "COACH");
    const c2 = await user();
    const m2 = await member(ws.id, c2.id, "COACH");

    const outcomes = await Promise.allSettled([
      setPrimaryCoach(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: m1.id },
        prisma,
      ),
      setPrimaryCoach(
        s(owner.id),
        { workspaceId: ws.id, clientProfileId: cp.id, coachMemberId: m2.id },
        prisma,
      ),
    ]);
    const committed = outcomes.filter(
      (o) => o.status === "fulfilled" && o.value.changed,
    ).length;
    // Losers fail structurally (no raw errors, no partial state).
    for (const o of outcomes) {
      if (o.status === "rejected")
        expect(String((o.reason as Error).name)).toMatch(
          /WorkspaceServiceError|AuditError/,
        );
    }
    const primaries = await prisma.clientAssignment.findMany({
      where: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        role: "PRIMARY",
        status: "ACTIVE",
      },
    });
    expect(primaries).toHaveLength(1);
    expect(
      await prisma.auditEvent.count({
        where: { workspaceId: ws.id, action: "UPDATE" },
      }),
    ).toBe(committed);
    expect(committed).toBe(1);
  });

  it("the workspace/id read index and all prior raw constraints coexist", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE indexname IN (
         'audit_event_workspace_id_at_idx',
         'audit_event_workspace_id_id_idx',
         'consent_record_active_version_key',
         'client_assignment_one_active_primary_key'
       )`,
    );
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      "audit_event_workspace_id_at_idx",
      "audit_event_workspace_id_id_idx",
      "client_assignment_one_active_primary_key",
      "consent_record_active_version_key",
    ]);
    const fks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT conname FROM pg_constraint WHERE conname IN (
         'client_assignment_client_workspace_fkey',
         'client_assignment_member_workspace_fkey'
       )`,
    );
    expect(fks).toHaveLength(2);
  });
});
