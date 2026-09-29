import { execFileSync } from "node:child_process";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  authorizeHealthOperation,
  ConsentError,
  createStaticConsentPolicy,
  grantOwnConsent,
  readOwnConsentStatus,
  revokeOwnConsent,
} from "../../lib/consent";

/**
 * S1-D real-PostgreSQL consent tests: production services + real guard.
 * Synthetic fixtures only; dedicated disposable database.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

const V1 = createStaticConsentPolicy({
  PRIVACY_NOTICE: "test-v1",
  HEALTH_DATA: "test-v1",
  CYCLE: "test-v1",
  PHOTOS: "test-v1",
  BLOODWORK: "test-v1",
});
const V2 = createStaticConsentPolicy({
  PRIVACY_NOTICE: "test-v2",
  HEALTH_DATA: "test-v2",
  CYCLE: "test-v2",
  PHOTOS: "test-v2",
  BLOODWORK: "test-v2",
});

describe.skipIf(!enabled)("S1-D versioned consent", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "consent_record","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let n = 0;
  const uid = () => `u${++n}_${Date.now()}`;
  async function user(
    status: "ACTIVE" | "DEACTIVATED" = "ACTIVE",
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
  async function workspace(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
    return prisma.workspace.create({
      data: { name: `w${++n}`, slug: `ws${n}_${Date.now()}`, status },
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
  async function clientProfile(
    workspaceId: string,
    userId: string | null = null,
  ) {
    return prisma.clientProfile.create({
      data: { workspaceId, userId, name: "Client" },
    });
  }
  const s = (id: string) => ({ user: { id } }) as never;

  async function clientWithConsent(role: "CLIENT" = "CLIENT") {
    const ws = await workspace();
    const u = await user();
    await member(ws.id, u.id, role);
    const cp = await clientProfile(ws.id, u.id);
    return { ws, u, cp };
  }

  it("client self-grant then readOwnConsentStatus shows an active row", async () => {
    const { ws, u, cp } = await clientWithConsent();
    const result = await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    expect(result).toEqual({ kind: "HEALTH_DATA", changed: true });
    const page = await readOwnConsentStatus(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id },
      { client: prisma },
    );
    expect(
      page.items.some(
        (r) =>
          r.kind === "HEALTH_DATA" &&
          r.version === "test-v1" &&
          r.revokedAt === null,
      ),
    ).toBe(true);
    const stored = await prisma.consentRecord.findFirst({
      where: { clientProfileId: cp.id, kind: "HEALTH_DATA" },
    });
    expect(stored).toMatchObject({
      source: "CLIENT_SELF",
      grantedByUserId: u.id,
    });
  });

  it("duplicate grant is idempotent and concurrent grants leave one active row", async () => {
    const { ws, u, cp } = await clientWithConsent();
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

    const { ws: ws2, u: u2, cp: cp2 } = await clientWithConsent();
    const results = await Promise.allSettled([
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
    const active = await prisma.consentRecord.count({
      where: { clientProfileId: cp2.id, kind: "CYCLE", revokedAt: null },
    });
    expect(active).toBe(1);
    for (const r of results) {
      if (r.status === "rejected")
        expect(r.reason).toBeInstanceOf(ConsentError);
    }
  });

  it("denies PED_HRT self-grant even when the registry supplies a version", async () => {
    const { ws, u, cp } = await clientWithConsent();
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
    expect(
      await prisma.consentRecord.count({ where: { clientProfileId: cp.id } }),
    ).toBe(0);
  });

  it("readOwnConsentStatus is bounded, deterministic, and cursor-paginated", async () => {
    const { ws, u, cp } = await clientWithConsent();
    const total = 137;
    await prisma.consentRecord.createMany({
      data: Array.from({ length: total }, (_, i) => ({
        clientProfileId: cp.id,
        kind: "HEALTH_DATA" as const,
        version: `historical-${String(i).padStart(3, "0")}`,
        revokedAt: new Date("2026-01-01T00:00:00.000Z"),
      })),
    });
    const first = await readOwnConsentStatus(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, limit: 2 },
      { client: prisma },
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe(first.items[1].id);
    const second = await readOwnConsentStatus(
      s(u.id),
      {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        limit: 2,
        cursor: first.nextCursor as string,
      },
      { client: prisma },
    );
    expect(second.items).toHaveLength(2);
    const ids = [...first.items, ...second.items].map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
    expect([...ids].sort()).toEqual(ids);
    const third = await readOwnConsentStatus(
      s(u.id),
      {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        limit: 2,
        cursor: second.nextCursor as string,
      },
      { client: prisma },
    );
    expect(third.items).toHaveLength(2);
    const clamped = await readOwnConsentStatus(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, limit: 999 },
      { client: prisma },
    );
    expect(clamped.items).toHaveLength(100);
    expect(clamped.nextCursor).not.toBeNull();
    const remaining = await readOwnConsentStatus(
      s(u.id),
      {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        limit: 999,
        cursor: clamped.nextCursor as string,
      },
      { client: prisma },
    );
    expect(remaining.items).toHaveLength(total - 100);
    expect(remaining.nextCursor).toBeNull();
    const allIds = [...clamped.items, ...remaining.items].map((r) => r.id);
    expect(new Set(allIds).size).toBe(total);
    expect(allIds).toEqual([...allIds].sort());
    const defaultPage = await readOwnConsentStatus(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id },
      { client: prisma },
    );
    expect(defaultPage.items).toHaveLength(25);
    expect(defaultPage.nextCursor).not.toBeNull();
    expect(defaultPage.items.map((r) => r.id)).toEqual(allIds.slice(0, 25));
  });

  it("reports the real raw-index P2002 metadata", async () => {
    const { cp } = await clientWithConsent();
    const data = {
      clientProfileId: cp.id,
      kind: "CYCLE" as const,
      version: "raw-index-metadata-v1",
    };
    await prisma.consentRecord.create({ data });
    try {
      await prisma.consentRecord.create({ data });
      throw new Error("duplicate insert unexpectedly succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      const known = error as Prisma.PrismaClientKnownRequestError;
      expect(known.code).toBe("P2002");
      // Deliberately visible evidence from the real PostgreSQL raw partial index.
      console.info(
        "S1-D raw-index P2002 metadata:",
        JSON.stringify(known.meta),
      );
      expect(known.meta).toEqual({
        modelName: "ConsentRecord",
        target: ["client_profile_id", "kind", "version"],
      });
    }
  });

  it("runs a genuine concurrent duplicate grant through the production service", async () => {
    const { ws, u, cp } = await clientWithConsent();
    let arrived = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    const observed: Array<{ code: string; meta: unknown }> = [];
    // Synchronize only the test's two real transaction clients after both
    // initial PostgreSQL reads. All authorization, reads and writes still use
    // grantOwnConsent and Prisma against the real database.
    const raceClient = new Proxy(prisma, {
      get(target, property) {
        if (property !== "$transaction") return Reflect.get(target, property);
        return async (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: unknown,
        ) => {
          try {
            return await target.$transaction(
              async (tx) => {
                const txClient = new Proxy(tx, {
                  get(transaction, key) {
                    if (key !== "consentRecord")
                      return Reflect.get(transaction, key);
                    return new Proxy(transaction.consentRecord, {
                      get(delegate, operation) {
                        if (operation === "findFirst") {
                          return async (
                            args: Parameters<typeof delegate.findFirst>[0],
                          ) => {
                            const row = await delegate.findFirst(args);
                            if (arrived < 2) {
                              arrived++;
                              if (arrived === 2) release();
                              await bothRead;
                            }
                            return row;
                          };
                        }
                        return Reflect.get(delegate, operation);
                      },
                    });
                  },
                });
                return callback(txClient);
              },
              options as Parameters<typeof target.$transaction>[1],
            );
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError)
              observed.push({ code: error.code, meta: error.meta });
            throw error;
          }
        };
      },
    });
    const input = {
      workspaceId: ws.id,
      clientProfileId: cp.id,
      kind: "CYCLE" as const,
    };
    const outcomes = await Promise.allSettled([
      grantOwnConsent(s(u.id), input, { client: raceClient, registry: V1 }),
      grantOwnConsent(s(u.id), input, { client: raceClient, registry: V1 }),
    ]);
    expect(arrived).toBe(2);
    expect(
      await prisma.consentRecord.count({
        where: {
          clientProfileId: cp.id,
          kind: "CYCLE",
          version: "test-v1",
          revokedAt: null,
        },
      }),
    ).toBe(1);
    expect(
      outcomes.some(
        (outcome) => outcome.status === "fulfilled" && outcome.value.changed,
      ),
    ).toBe(true);
    expect(observed).toHaveLength(1);
    expect(["P2002", "P2034"]).toContain(observed[0].code);
    if (observed[0].code === "P2002")
      expect(observed[0].meta).toEqual({
        modelName: "ConsentRecord",
        target: ["client_profile_id", "kind", "version"],
      });
    console.info("S1-D concurrent grant errors:", JSON.stringify(observed));
    console.info(
      "S1-D concurrent grant outcomes:",
      JSON.stringify(
        outcomes.map((outcome) =>
          outcome.status === "fulfilled"
            ? outcome.value
            : { code: (outcome.reason as ConsentError).code },
        ),
      ),
    );
  });

  it("revoke applies across versions; re-grant creates a new historical row; old version fails after a bump", async () => {
    const { ws, u, cp } = await clientWithConsent();
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V2 },
    );
    expect(
      await prisma.consentRecord.count({
        where: { clientProfileId: cp.id, kind: "HEALTH_DATA", revokedAt: null },
      }),
    ).toBe(2);

    const revoked = await revokeOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma },
    );
    expect(revoked.changed).toBe(true);
    expect(
      await prisma.consentRecord.count({
        where: { clientProfileId: cp.id, kind: "HEALTH_DATA", revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.consentRecord.count({
        where: { clientProfileId: cp.id, kind: "HEALTH_DATA" },
      }),
    ).toBe(2); // history retained

    // version bump: old grant no longer satisfies exact-version consent
    const { ws: w3, u: u3, cp: cp3 } = await clientWithConsent();
    await grantOwnConsent(
      s(u3.id),
      { workspaceId: w3.id, clientProfileId: cp3.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    await expect(
      authorizeHealthOperation(
        s(u3.id),
        {
          resource: "dailyTracking",
          action: "read",
          workspaceId: w3.id,
          clientProfileId: cp3.id,
        },
        { client: prisma, registry: V2 },
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });

    // re-grant after revoke -> new row (history preserved)
    const before = await prisma.consentRecord.count({
      where: { clientProfileId: cp.id, kind: "HEALTH_DATA" },
    });
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    expect(
      await prisma.consentRecord.count({
        where: { clientProfileId: cp.id, kind: "HEALTH_DATA" },
      }),
    ).toBe(before + 1);
  });

  it("owner/coach/assistant/support/platform cannot grant or revoke", async () => {
    const ws = await workspace();
    const cp = await clientProfile(ws.id, null);
    for (const role of [
      "WORKSPACE_OWNER",
      "COACH",
      "ASSISTANT_COACH",
      "SUPPORT",
    ] as const) {
      const u = await user();
      await member(ws.id, u.id, role);
      await expect(
        grantOwnConsent(
          s(u.id),
          { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
          { client: prisma, registry: V1 },
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      await expect(
        revokeOwnConsent(
          s(u.id),
          { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
          { client: prisma },
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
    }
    const admin = await user("ACTIVE", "PLATFORM_ADMIN");
    await expect(
      grantOwnConsent(
        s(admin.id),
        { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
        { client: prisma, registry: V1 },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("workspace isolation and cross-workspace denial", async () => {
    const { ws, u, cp } = await clientWithConsent();
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    const wsB = await workspace();
    await expect(
      readOwnConsentStatus(
        s(u.id),
        { workspaceId: wsB.id, clientProfileId: cp.id },
        { client: prisma },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // An owner who is a member of BOTH workspaces must not read a client from the
    // other workspace via workspace scope.
    const owner = await user();
    await member(ws.id, owner.id, "WORKSPACE_OWNER");
    await member(wsB.id, owner.id, "WORKSPACE_OWNER");
    await expect(
      authorizeHealthOperation(
        s(owner.id),
        {
          resource: "coachNotes",
          action: "read",
          workspaceId: wsB.id,
          clientProfileId: cp.id,
        },
        { client: prisma, registry: V1 },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);

    // A workspace-scope call with no clientProfileId must fail closed (no filter drop).
    await expect(
      authorizeHealthOperation(
        s(owner.id),
        { resource: "dailyTracking", action: "read", workspaceId: ws.id },
        { client: prisma, registry: V1 },
      ),
    ).rejects.toBeInstanceOf(ConsentError);
  });

  it("unassigned coach denied despite client consent; assigned coach allowed", async () => {
    const { ws, u, cp } = await clientWithConsent();
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "PRIVACY_NOTICE" },
      { client: prisma, registry: V1 },
    );
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "CYCLE" },
      { client: prisma, registry: V1 },
    );

    const coach = await user();
    const cm = await member(ws.id, coach.id, "COACH");
    await expect(
      authorizeHealthOperation(
        s(coach.id),
        {
          resource: "cycleData",
          action: "read",
          workspaceId: ws.id,
          clientProfileId: cp.id,
        },
        { client: prisma, registry: V1 },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await prisma.clientAssignment.create({
      data: {
        workspaceId: ws.id,
        clientProfileId: cp.id,
        coachMemberId: cm.id,
        role: "COACH",
        status: "ACTIVE",
      },
    });
    await expect(
      authorizeHealthOperation(
        s(coach.id),
        {
          resource: "cycleData",
          action: "read",
          workspaceId: ws.id,
          clientProfileId: cp.id,
        },
        { client: prisma, registry: V1 },
      ),
    ).resolves.toMatchObject({ grantedScope: "assigned" });
  });

  it("inactive user/member/workspace fail closed", async () => {
    const { ws, u, cp } = await clientWithConsent();
    await prisma.user.update({
      where: { id: u.id },
      data: { status: "DEACTIVATED" },
    });
    await expect(
      grantOwnConsent(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
        { client: prisma, registry: V1 },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await prisma.user.update({
      where: { id: u.id },
      data: { status: "ACTIVE" },
    });
    const m = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: u.id } },
    });
    await prisma.workspaceMember.update({
      where: { id: m!.id },
      data: { status: "SUSPENDED" },
    });
    await expect(
      grantOwnConsent(
        s(u.id),
        { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
        { client: prisma, registry: V1 },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("client deletion is restricted while consent exists; deleting the granting user nulls the actor without deleting history", async () => {
    const { ws, u, cp } = await clientWithConsent();
    await grantOwnConsent(
      s(u.id),
      { workspaceId: ws.id, clientProfileId: cp.id, kind: "HEALTH_DATA" },
      { client: prisma, registry: V1 },
    );
    await expect(
      prisma.clientProfile.delete({ where: { id: cp.id } }),
    ).rejects.toThrow();

    // actor not a member: insert directly, then delete the user -> SetNull
    const granter = await user();
    const row = await prisma.consentRecord.create({
      data: {
        clientProfileId: cp.id,
        kind: "PHOTOS",
        version: "test-v1",
        grantedByUserId: granter.id,
        source: "CLIENT_SELF",
      },
    });
    await prisma.user.delete({ where: { id: granter.id } });
    const after = await prisma.consentRecord.findUnique({
      where: { id: row.id },
      select: { grantedByUserId: true },
    });
    expect(after?.grantedByUserId).toBeNull();
  });

  it("enforces the partial unique index for active grants", async () => {
    const { ws, cp } = await clientWithConsent();
    void ws;
    const idx = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'consent_record_active_version_key'",
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toContain("UNIQUE");
    expect(idx[0].indexdef).toContain("revoked_at IS NULL");

    await prisma.consentRecord.create({
      data: { clientProfileId: cp.id, kind: "CYCLE", version: "test-v1" },
    });
    await expect(
      prisma.consentRecord.create({
        data: { clientProfileId: cp.id, kind: "CYCLE", version: "test-v1" },
      }),
    ).rejects.toThrow();
  });
});
