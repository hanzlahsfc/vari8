import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  buildClientProfileWhere,
  createClientProfile,
  listAccessibleClientProfiles,
  normalizeLimit,
  validateName,
  WorkspaceServiceError,
} from "../../lib/workspace/clients";

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
        // PR-M1 (D27): the roster query hides archived profiles by default.
        where: { workspaceId: ws, archivedAt: null },
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
