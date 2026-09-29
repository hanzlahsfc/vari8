import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AccessDeniedError } from "../../lib/auth/guard";
import {
  assertConsentMutationsExternallyExposable,
  authorizeHealthOperation,
  BASE_CONSENTS,
  ConsentError,
  createStaticConsentPolicy,
  grantOwnConsent,
  hasExactActiveConsent,
  requiredConsentsFor,
} from "../../lib/consent";
import type { Resource } from "../../lib/auth/rbac";

const session = (id = "u1") => ({ user: { id } }) as never;
const ws = "w1";
const cp = "c1";

function fakePrisma(overrides: Record<string, unknown> = {}) {
  const delegates = {
    user: {
      findUnique: vi.fn(async () => ({
        id: "u1",
        platformRole: "USER",
        status: "ACTIVE",
      })),
    },
    workspace: {
      findUnique: vi.fn(async () => ({ id: ws, status: "ACTIVE" })),
    },
    workspaceMember: {
      findUnique: vi.fn(async () => ({
        id: "m1",
        role: "CLIENT",
        status: "ACTIVE",
      })),
      findFirst: vi.fn(async () => null),
    },
    clientProfile: {
      findFirst: vi.fn(async () => ({ id: cp, workspaceId: ws, userId: "u1" })),
    },
    consentRecord: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: "r1" })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    ...overrides,
  };
  const client = {
    ...delegates,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn(async (cb: any) => cb(delegates)),
  };
  return { client: client as unknown as PrismaClient, delegates };
}

const ACTIVE_INDEX_META = {
  modelName: "ConsentRecord",
  target: ["client_profile_id", "kind", "version"],
};
function p2002(meta?: unknown) {
  return new Prisma.PrismaClientKnownRequestError("synthetic conflict", {
    code: "P2002",
    clientVersion: "test",
    ...(meta === undefined ? {} : { meta: meta as Record<string, unknown> }),
  });
}

function racingPrisma(meta?: unknown, overrides: Record<string, unknown> = {}) {
  const conflictMeta = arguments.length === 0 ? ACTIVE_INDEX_META : meta;
  const findFirst = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValue({ id: "r1" });
  const create = vi.fn(async () => {
    throw p2002(conflictMeta);
  });
  const fake = fakePrisma({
    consentRecord: {
      findFirst,
      findMany: vi.fn(async () => []),
      create,
      updateMany: vi.fn(),
    },
    ...overrides,
  });
  return { ...fake, findFirst, create };
}

describe("protected-operation mapping", () => {
  it("maps every consent-protected resource and nothing else", () => {
    const protectedResources: Resource[] = [
      "dailyTracking",
      "mealPlans",
      "trainingPlansLogs",
      "checkinsCoachReviews",
      "coachNotes",
      "clientNotes",
      "privateMediaFiles",
      "cycleData",
      "bloodwork",
      "pedHrt",
    ];
    for (const r of protectedResources)
      expect(requiredConsentsFor(r)).toBeDefined();
    for (const r of [
      "workspaceSettings",
      "membersInvitations",
      "clientAssignments",
      "clientProfiles",
      "consent",
      "foodExerciseMasterData",
      "exportsErasure",
      "auditLog",
    ] as Resource[]) {
      expect(requiredConsentsFor(r)).toBeUndefined();
    }
    expect(requiredConsentsFor("dailyTracking")).toEqual([...BASE_CONSENTS]);
    expect(requiredConsentsFor("privateMediaFiles")).toEqual([
      ...BASE_CONSENTS,
      "PHOTOS",
    ]);
    expect(requiredConsentsFor("cycleData")).toEqual([
      ...BASE_CONSENTS,
      "CYCLE",
    ]);
    expect(requiredConsentsFor("bloodwork")).toEqual([
      ...BASE_CONSENTS,
      "BLOODWORK",
    ]);
    expect(requiredConsentsFor("pedHrt")).toEqual([
      ...BASE_CONSENTS,
      "PED_HRT",
    ]);
  });
});

describe("hasExactActiveConsent", () => {
  const rows = [
    { kind: "HEALTH_DATA", version: "v1", revokedAt: null },
    { kind: "CYCLE", version: "v1", revokedAt: new Date() },
  ];
  it("requires an exact version and an unrevoked row", () => {
    expect(hasExactActiveConsent(rows, "HEALTH_DATA", "v1")).toBe(true);
    expect(hasExactActiveConsent(rows, "HEALTH_DATA", "v2")).toBe(false);
    expect(hasExactActiveConsent(rows, "CYCLE", "v1")).toBe(false);
  });
});

describe("grantOwnConsent", () => {
  it("fails closed when the policy registry is unconfigured", async () => {
    const { client } = fakePrisma();
    await expect(
      grantOwnConsent(
        session(),
        { workspaceId: ws, clientProfileId: cp, kind: "HEALTH_DATA" },
        { client },
      ),
    ).rejects.toMatchObject({ code: "policy_not_configured" });
  });
  it("rejects the coach-attested source as unsupported", async () => {
    const { client } = fakePrisma();
    const registry = createStaticConsentPolicy({ HEALTH_DATA: "test-v1" });
    await expect(
      grantOwnConsent(
        session(),
        {
          workspaceId: ws,
          clientProfileId: cp,
          kind: "HEALTH_DATA",
          source: "COACH_ATTESTED",
        } as never,
        { client, registry },
      ),
    ).rejects.toMatchObject({ code: "coach_attested_unsupported" });
    // CLIENT_SELF is allowed
    await expect(
      grantOwnConsent(
        session(),
        {
          workspaceId: ws,
          clientProfileId: cp,
          kind: "HEALTH_DATA",
          source: "CLIENT_SELF",
        } as never,
        { client, registry },
      ),
    ).resolves.toMatchObject({ changed: true });
  });

  it("rejects an unknown kind", async () => {
    const { client } = fakePrisma();
    await expect(
      grantOwnConsent(
        session(),
        { workspaceId: ws, clientProfileId: cp, kind: "NOPE" as never },
        { client },
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("uses the registry version + CLIENT_SELF and is idempotent", async () => {
    const { client, delegates } = fakePrisma();
    const registry = createStaticConsentPolicy({ HEALTH_DATA: "test-v1" });
    const first = await grantOwnConsent(
      session(),
      { workspaceId: ws, clientProfileId: cp, kind: "HEALTH_DATA" },
      { client, registry },
    );
    expect(first).toEqual({ kind: "HEALTH_DATA", changed: true });
    expect(delegates.consentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: "test-v1",
          source: "CLIENT_SELF",
          grantedByUserId: "u1",
          clientProfileId: cp,
          kind: "HEALTH_DATA",
        }),
      }),
    );
    // existing active row -> idempotent
    const withExisting = fakePrisma({
      consentRecord: {
        findFirst: vi.fn(async () => ({ id: "r1" })),
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    const again = await grantOwnConsent(
      session(),
      { workspaceId: ws, clientProfileId: cp, kind: "HEALTH_DATA" },
      { client: withExisting.client, registry },
    );
    expect(again).toEqual({ kind: "HEALTH_DATA", changed: false });
  });

  it("denies unauthorized callers before the registry is consulted", async () => {
    const { client } = fakePrisma({
      workspaceMember: {
        findUnique: vi.fn(async () => ({
          id: "m1",
          role: "SUPPORT",
          status: "ACTIVE",
        })),
        findFirst: vi.fn(async () => null),
      },
    });
    const currentVersion = vi.fn(() => "test-v1");
    await expect(
      grantOwnConsent(
        session(),
        { workspaceId: ws, clientProfileId: cp, kind: "HEALTH_DATA" },
        { client, registry: { currentVersion } },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(currentVersion).not.toHaveBeenCalled();
  });

  it("denies unauthorized COACH_ATTESTED input by RBAC before the source policy", async () => {
    const { client } = fakePrisma({
      workspaceMember: {
        findUnique: vi.fn(async () => ({
          id: "m1",
          role: "SUPPORT",
          status: "ACTIVE",
        })),
        findFirst: vi.fn(async () => null),
      },
    });
    await expect(
      grantOwnConsent(
        session(),
        {
          workspaceId: ws,
          clientProfileId: cp,
          kind: "HEALTH_DATA",
          source: "COACH_ATTESTED",
        } as never,
        {
          client,
          registry: createStaticConsentPolicy({ HEALTH_DATA: "test-v1" }),
        },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("denies PED_HRT granting even when the registry supplies a version", async () => {
    const { client, delegates } = fakePrisma();
    await expect(
      grantOwnConsent(
        session(),
        { workspaceId: ws, clientProfileId: cp, kind: "PED_HRT" },
        { client, registry: createStaticConsentPolicy({ PED_HRT: "test-v1" }) },
      ),
    ).rejects.toMatchObject({ code: "ped_hrt_not_approved" });
    expect(delegates.consentRecord.create).not.toHaveBeenCalled();
  });

  const grant = (
    client: PrismaClient,
    registry = createStaticConsentPolicy({ HEALTH_DATA: "v1" }),
  ) =>
    grantOwnConsent(
      session(),
      { workspaceId: ws, clientProfileId: cp, kind: "HEALTH_DATA" },
      { client, registry },
    );

  it("recovers an exact raw-index race only after fresh transaction-bound authorization", async () => {
    const { client, delegates, findFirst } = racingPrisma();
    await expect(grant(client)).resolves.toEqual({
      kind: "HEALTH_DATA",
      changed: false,
    });
    expect(client.$transaction).toHaveBeenCalledTimes(2);
    expect(delegates.user.findUnique).toHaveBeenCalledTimes(2);
    expect(delegates.workspace.findUnique).toHaveBeenCalledTimes(2);
    expect(delegates.workspaceMember.findUnique).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        clientProfileId: cp,
        clientProfile: { workspaceId: ws },
        kind: "HEALTH_DATA",
        version: "v1",
        revokedAt: null,
      },
      select: { id: true },
    });
  });

  it.each(["DEACTIVATED", "INVITED"] as const)(
    "does not query consent when user becomes %s before recovery",
    async (status) => {
      const userFind = vi
        .fn()
        .mockResolvedValueOnce({
          id: "u1",
          platformRole: "USER",
          status: "ACTIVE",
        })
        .mockResolvedValue({ id: "u1", platformRole: "USER", status });
      const { client, findFirst } = racingPrisma(ACTIVE_INDEX_META, {
        user: { findUnique: userFind },
      });
      await expect(grant(client)).rejects.toMatchObject({
        reason: "user_inactive",
        resource: "consent",
        action: "write",
      });
      expect(client.$transaction).toHaveBeenCalledTimes(2);
      expect(findFirst).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["SUSPENDED", "REMOVED", null] as const)(
    "does not query consent when membership becomes %s before recovery",
    async (status) => {
      const membershipFind = vi
        .fn()
        .mockResolvedValueOnce({ id: "m1", role: "CLIENT", status: "ACTIVE" })
        .mockResolvedValue(
          status === null ? null : { id: "m1", role: "CLIENT", status },
        );
      const { client, findFirst } = racingPrisma(ACTIVE_INDEX_META, {
        workspaceMember: { findUnique: membershipFind, findFirst: vi.fn() },
      });
      await expect(grant(client)).rejects.toMatchObject({
        reason: "membership_missing_or_inactive",
        resource: "consent",
        action: "write",
      });
      expect(findFirst).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      "ownership",
      { id: cp, workspaceId: ws, userId: "someone-else" },
      "not_owner",
    ],
    ["workspace", null, "client_outside_workspace"],
  ] as const)(
    "does not query consent when client %s changes before recovery",
    async (_, changed, reason) => {
      const clientFind = vi
        .fn()
        .mockResolvedValueOnce({ id: cp, workspaceId: ws, userId: "u1" })
        .mockResolvedValueOnce({ id: cp, workspaceId: ws, userId: "u1" })
        .mockResolvedValue(changed);
      const { client, findFirst } = racingPrisma(ACTIVE_INDEX_META, {
        clientProfile: { findFirst: clientFind },
      });
      await expect(grant(client)).rejects.toMatchObject({
        reason,
        resource: "consent",
        action: "write",
      });
      expect(findFirst).toHaveBeenCalledTimes(1);
    },
  );

  it("does not query consent when the workspace becomes suspended before recovery", async () => {
    const workspaceFind = vi
      .fn()
      .mockResolvedValueOnce({ id: ws, status: "ACTIVE" })
      .mockResolvedValue({ id: ws, status: "SUSPENDED" });
    const { client, findFirst } = racingPrisma(ACTIVE_INDEX_META, {
      workspace: { findUnique: workspaceFind },
    });
    await expect(grant(client)).rejects.toMatchObject({
      reason: "workspace_missing_or_inactive",
      resource: "consent",
      action: "write",
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects policy version drift before the recovery consent query", async () => {
    const currentVersion = vi
      .fn()
      .mockReturnValueOnce("v1")
      .mockReturnValue("v2");
    const { client, findFirst } = racingPrisma();
    await expect(grant(client, { currentVersion })).rejects.toMatchObject({
      code: "consent_conflict",
    });
    expect(currentVersion).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects an exact-target P2002 when no active row appears after authorization", async () => {
    const { client, findFirst } = racingPrisma();
    findFirst.mockResolvedValue(null);
    await expect(grant(client)).rejects.toMatchObject({
      code: "consent_conflict",
    });
    expect(client.$transaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["unrelated target", { modelName: "ConsentRecord", target: ["id"] }],
    ["missing metadata", undefined],
    [
      "malformed metadata",
      { modelName: "ConsentRecord", target: "client_profile_id,kind,version" },
    ],
    [
      "unknown index",
      { modelName: "ConsentRecord", target: ["consent_record_other_key"] },
    ],
    [
      "ambiguous metadata",
      { ...ACTIVE_INDEX_META, constraint: "some_other_key" },
    ],
  ])(
    "rejects %s without any recovery consent query, even with an exact row",
    async (_, meta) => {
      const { client, findFirst } = racingPrisma(meta);
      await expect(grant(client)).rejects.toMatchObject({
        code: "consent_conflict",
      });
      expect(client.$transaction).toHaveBeenCalledTimes(1);
      expect(findFirst).toHaveBeenCalledTimes(1);
    },
  );
});

describe("authorizeHealthOperation", () => {
  it("denies unmapped/unknown resources", async () => {
    const { client } = fakePrisma();
    await expect(
      authorizeHealthOperation(
        session(),
        {
          resource: "clientAssignments",
          action: "read",
          workspaceId: ws,
          clientProfileId: cp,
        },
        { client },
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("rejects a health operation with no clientProfileId", async () => {
    const { client, delegates } = fakePrisma();
    await expect(
      authorizeHealthOperation(
        session(),
        { resource: "dailyTracking", action: "read", workspaceId: ws },
        {
          client,
          registry: createStaticConsentPolicy({
            PRIVACY_NOTICE: "v1",
            HEALTH_DATA: "v1",
          }),
        },
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(delegates.consentRecord.findMany).not.toHaveBeenCalled();
  });

  it("authorizes before any consent lookup (unassigned support denied first)", async () => {
    const { client, delegates } = fakePrisma({
      workspaceMember: {
        findUnique: vi.fn(async () => ({
          id: "m1",
          role: "SUPPORT",
          status: "ACTIVE",
        })),
        findFirst: vi.fn(async () => null),
      },
    });
    await expect(
      authorizeHealthOperation(
        session(),
        {
          resource: "dailyTracking",
          action: "read",
          workspaceId: ws,
          clientProfileId: cp,
        },
        {
          client,
          registry: createStaticConsentPolicy({
            PRIVACY_NOTICE: "v1",
            HEALTH_DATA: "v1",
          }),
        },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(delegates.consentRecord.findMany).not.toHaveBeenCalled();
  });
  it("requires exact-version consent and fails closed without a version", async () => {
    const registry = createStaticConsentPolicy({
      PRIVACY_NOTICE: "v1",
      HEALTH_DATA: "v1",
    });
    const ok = fakePrisma({
      consentRecord: {
        findMany: vi.fn(async () => [
          { kind: "PRIVACY_NOTICE", version: "v1", revokedAt: null },
          { kind: "HEALTH_DATA", version: "v1", revokedAt: null },
        ]),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await expect(
      authorizeHealthOperation(
        session(),
        {
          resource: "mealPlans",
          action: "read",
          workspaceId: ws,
          clientProfileId: cp,
        },
        { client: ok.client, registry },
      ),
    ).resolves.toMatchObject({ grantedScope: "own" });

    const missing = fakePrisma({
      consentRecord: {
        findMany: vi.fn(async () => [
          { kind: "PRIVACY_NOTICE", version: "v1", revokedAt: null },
        ]),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await expect(
      authorizeHealthOperation(
        session(),
        {
          resource: "mealPlans",
          action: "read",
          workspaceId: ws,
          clientProfileId: cp,
        },
        { client: missing.client, registry },
      ),
    ).rejects.toMatchObject({ code: "consent_missing" });

    await expect(
      authorizeHealthOperation(
        session(),
        {
          resource: "mealPlans",
          action: "read",
          workspaceId: ws,
          clientProfileId: cp,
        },
        { client: ok.client },
      ),
    ).rejects.toMatchObject({ code: "policy_not_configured" });
  });
  it("keeps PED/HRT fail-closed even with a stored consent row", async () => {
    const registry = createStaticConsentPolicy({
      PRIVACY_NOTICE: "v1",
      HEALTH_DATA: "v1",
      PED_HRT: "v1",
    });
    // The RBAC matrix denies PED/HRT to every role, so the guard fails closed
    // before the consent/PED gate; the explicit gate is defense in depth for when
    // the matrix later grants coach access after legal sign-off.
    const { client, delegates } = fakePrisma({
      consentRecord: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await expect(
      authorizeHealthOperation(
        session(),
        {
          resource: "pedHrt",
          action: "read",
          workspaceId: ws,
          clientProfileId: cp,
        },
        { client, registry },
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(delegates.consentRecord.findMany).not.toHaveBeenCalled();
  });

  it("loads only the required active (kind, version) rows with the workspace predicate", async () => {
    const findMany = vi.fn(async () => [
      { kind: "PRIVACY_NOTICE", version: "v1", revokedAt: null },
      { kind: "HEALTH_DATA", version: "v1", revokedAt: null },
    ]);
    const { client } = fakePrisma({
      consentRecord: {
        findMany,
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await authorizeHealthOperation(
      session(),
      {
        resource: "mealPlans",
        action: "read",
        workspaceId: ws,
        clientProfileId: cp,
      },
      {
        client,
        registry: createStaticConsentPolicy({
          PRIVACY_NOTICE: "v1",
          HEALTH_DATA: "v1",
        }),
      },
    );
    const call = findMany.mock.calls[0] as unknown[] | undefined;
    const where = (call?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({
      clientProfileId: cp,
      clientProfile: { workspaceId: ws },
      revokedAt: null,
    });
    expect(where.OR).toEqual([
      { kind: "PRIVACY_NOTICE", version: "v1" },
      { kind: "HEALTH_DATA", version: "v1" },
    ]);
  });
});

describe("structural errors", () => {
  it("expose codes only and never identifiers", () => {
    const error = new ConsentError("consent_missing");
    expect(error.message).toBe("consent_missing");
    expect(JSON.stringify(error)).not.toMatch(/@/);
    expect(() => assertConsentMutationsExternallyExposable()).toThrow(
      ConsentError,
    );
    expect(() => assertConsentMutationsExternallyExposable()).toThrowError(
      /audit_not_wired_for_external_use/,
    );
  });
});
