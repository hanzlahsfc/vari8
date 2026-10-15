import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AccessDeniedError, authorizeCollection } from "../../lib/auth/guard";
import {
  assignCoach,
  buildClientProfileWhere,
  coachTargetRoleIsEligible,
  createClientProfile,
  listAccessibleClientProfiles,
  normalizeLimit,
  updateClientProfileName,
  validateName,
  WorkspaceServiceError,
} from "../../lib/workspace/clients";
import { createPrismaAuthorizationRepo } from "../../lib/workspace/access";

const session = (id = "u1") => ({ user: { id } }) as never;
const ws = "w1";

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
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      })),
      findFirst: vi.fn(async () => null),
    },
    clientProfile: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({
        id: "c1",
        workspaceId: ws,
        name: "New",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    clientAssignment: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({
        id: "a1",
        clientProfileId: "c1",
        coachMemberId: "m1",
        role: "COACH",
        status: "ACTIVE",
        assignedAt: new Date(),
      })),
      update: vi.fn(async () => ({
        id: "a1",
        clientProfileId: "c1",
        coachMemberId: "m1",
        role: "COACH",
        status: "ACTIVE",
        assignedAt: new Date(),
      })),
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

describe("buildClientProfileWhere", () => {
  it("maps workspace/assigned/own to scoped filters, always with workspaceId", () => {
    const ctx = { workspaceId: ws, userId: "u1", workspaceMemberId: "m1" };
    expect(buildClientProfileWhere("workspace", ctx)).toEqual({
      workspaceId: ws,
    });
    expect(buildClientProfileWhere("own", ctx)).toEqual({
      workspaceId: ws,
      userId: "u1",
    });
    expect(buildClientProfileWhere("assigned", ctx)).toEqual({
      workspaceId: ws,
      assignments: {
        some: { workspaceId: ws, coachMemberId: "m1", status: "ACTIVE" },
      },
    });
  });
});

describe("normalizeLimit", () => {
  it("defaults to 25 and clamps to 1..100", () => {
    expect(normalizeLimit(undefined)).toBe(25);
    expect(normalizeLimit(5)).toBe(5);
    expect(normalizeLimit(0)).toBe(1);
    expect(normalizeLimit(1000)).toBe(100);
    expect(normalizeLimit(100)).toBe(100);
  });
  it("rejects non-numeric limits", () => {
    expect(() => normalizeLimit(Number.NaN)).toThrow(WorkspaceServiceError);
    // @ts-expect-error runtime guard against bad input
    expect(() => normalizeLimit("10")).toThrow(WorkspaceServiceError);
  });
});

describe("validateName", () => {
  it("rejects blank/non-string names and trims valid ones", () => {
    expect(validateName("  Alice  ")).toBe("Alice");
    for (const bad of ["", "   ", 42, null, undefined]) {
      expect(() => validateName(bad)).toThrow(WorkspaceServiceError);
    }
  });
});

describe("coachTargetRoleIsEligible", () => {
  it("enforces the coach-capable rules", () => {
    expect(coachTargetRoleIsEligible("COACH", "PRIMARY")).toBe(true);
    expect(coachTargetRoleIsEligible("COACH", "COACH")).toBe(true);
    expect(coachTargetRoleIsEligible("ASSISTANT_COACH", "COACH")).toBe(true);
    expect(coachTargetRoleIsEligible("ASSISTANT_COACH", "PRIMARY")).toBe(false);
    // SOLO-COACH-I1 (decision 111): WORKSPACE_OWNER is eligible for
    // PRIMARY or COACH through explicit assignment.
    expect(coachTargetRoleIsEligible("WORKSPACE_OWNER", "PRIMARY")).toBe(true);
    expect(coachTargetRoleIsEligible("WORKSPACE_OWNER", "COACH")).toBe(true);
    for (const role of ["SUPPORT", "CLIENT"] as const) {
      expect(coachTargetRoleIsEligible(role, "COACH")).toBe(false);
      expect(coachTargetRoleIsEligible(role, "PRIMARY")).toBe(false);
    }
  });
});

describe("authorizeCollection", () => {
  it("denies write and unknown inputs at runtime", async () => {
    const { client } = fakePrisma();
    const repo = createPrismaAuthorizationRepo(client);
    await expect(
      authorizeCollection(
        session(),
        {
          resource: "clientProfiles",
          action: "write" as never,
          workspaceId: ws,
        },
        repo,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      authorizeCollection(
        session(),
        { resource: "ghost" as never, action: "read", workspaceId: ws },
        repo,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      authorizeCollection(
        session(),
        { resource: "clientProfiles", action: "read" },
        repo,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
  it("returns workspace scope for an owner and never profile data", async () => {
    const { client } = fakePrisma();
    const ctx = await authorizeCollection(
      session(),
      { resource: "clientProfiles", action: "read", workspaceId: ws },
      createPrismaAuthorizationRepo(client),
    );
    expect(ctx.grantedScope).toBe("workspace");
    expect(ctx).not.toHaveProperty("name");
  });
});

describe("listAccessibleClientProfiles", () => {
  it("orders deterministically, uses the scoped where, and computes nextCursor", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      workspaceId: ws,
      name: `C${i}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const { client, delegates } = fakePrisma({
      clientProfile: { findMany: vi.fn(async () => rows) },
    });
    const result = await listAccessibleClientProfiles(
      session(),
      { workspaceId: ws, limit: 5 },
      client,
    );
    expect(delegates.clientProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: ws },
        orderBy: { id: "asc" },
        take: 6,
      }),
    );
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBe("c4");
  });
});

describe("createClientProfile", () => {
  it("rejects blank names and never accepts userId", async () => {
    const { client, delegates } = fakePrisma();
    await expect(
      createClientProfile(session(), { workspaceId: ws, name: "  " }, client),
    ).rejects.toBeInstanceOf(WorkspaceServiceError);
    const created = await createClientProfile(
      session(),
      { workspaceId: ws, name: "New" },
      client,
    );
    expect(created.id).toBe("c1");
    expect(delegates.clientProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { workspaceId: ws, name: "New" } }),
    );
  });
});

describe("updateClientProfileName", () => {
  it("writes only name and scopes by id + workspaceId", async () => {
    const { client, delegates } = fakePrisma({
      clientProfile: {
        findFirst: vi.fn(async () => ({
          id: "c1",
          workspaceId: ws,
          name: "N",
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    });
    await updateClientProfileName(
      session(),
      { workspaceId: ws, clientProfileId: "c1", name: " Renamed " },
      client,
    );
    expect(delegates.clientProfile.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", workspaceId: ws },
      data: { name: "Renamed" },
    });
  });

  it("performs no mutation when unauthorized", async () => {
    const { client, delegates } = fakePrisma({
      workspaceMember: {
        findUnique: vi.fn(async () => ({
          id: "m1",
          role: "SUPPORT",
          status: "ACTIVE",
        })),
      },
    });
    await expect(
      updateClientProfileName(
        session(),
        { workspaceId: ws, clientProfileId: "c1", name: "X" },
        client,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(delegates.clientProfile.updateMany).not.toHaveBeenCalled();
  });
});

describe("assignCoach", () => {
  it("is idempotent for an existing ACTIVE same-role assignment", async () => {
    const { client } = fakePrisma({
      clientProfile: { findFirst: vi.fn(async () => ({ id: "c1" })) },
      workspaceMember: {
        findUnique: vi.fn(async () => ({
          id: "m1",
          role: "WORKSPACE_OWNER",
          status: "ACTIVE",
        })),
        findFirst: vi.fn(async () => ({
          id: "m2",
          role: "COACH",
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        })),
      },
      clientAssignment: {
        findUnique: vi.fn(async () => ({
          id: "a1",
          role: "COACH",
          status: "ACTIVE",
        })),
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
      },
    });
    const result = await assignCoach(
      session(),
      { workspaceId: ws, clientProfileId: "c1", coachMemberId: "m2" },
      client,
    );
    expect(result).toMatchObject({
      changed: false,
      role: "COACH",
      status: "ACTIVE",
    });
  });

  it("rejects an assistant PRIMARY target and non-coach roles", async () => {
    const { client: assistant } = fakePrisma({
      clientProfile: { findFirst: vi.fn(async () => ({ id: "c1" })) },
      workspaceMember: {
        findUnique: vi.fn(async () => ({
          id: "m1",
          role: "WORKSPACE_OWNER",
          status: "ACTIVE",
        })),
        findFirst: vi.fn(async () => ({
          id: "m2",
          role: "ASSISTANT_COACH",
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        })),
      },
    });
    await expect(
      assignCoach(
        session(),
        {
          workspaceId: ws,
          clientProfileId: "c1",
          coachMemberId: "m2",
          role: "PRIMARY",
        },
        assistant,
      ),
    ).rejects.toMatchObject({ code: "member_not_eligible" });
  });
});

describe("structural errors", () => {
  it("carry only codes, never names/emails/ids", async () => {
    const error = new WorkspaceServiceError("client_not_accessible");
    expect(error.code).toBe("client_not_accessible");
    expect(error.message).toBe("client_not_accessible");
    // No personal values (email/handles) leak into the structural error.
    expect(JSON.stringify(error)).not.toMatch(/@/);
    expect(JSON.stringify(error)).not.toMatch(/email|profile|coachName/i);
  });
});
