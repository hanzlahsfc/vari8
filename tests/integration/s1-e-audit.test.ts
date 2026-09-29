import { execFileSync } from "node:child_process";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import { listAuditEvents } from "../../lib/audit";
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
});
