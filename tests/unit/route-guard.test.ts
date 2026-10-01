import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S1-H route-guard unit tests — the server-side guard wiring for the
 * authenticated workspace shell. `@/auth` and `next/navigation` are mocked so
 * no Next runtime or database is required; the authorization repo is a fake
 * PrismaLike (same shape the real guard adapter reads).
 */

class RedirectSentinel extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
    this.name = "RedirectSentinel";
  }
}
class ForbiddenSentinel extends Error {
  constructor() {
    super("forbidden");
    this.name = "ForbiddenSentinel";
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSentinel(url);
  }),
  forbidden: vi.fn(() => {
    throw new ForbiddenSentinel();
  }),
}));

vi.mock("../../auth", () => ({ auth: vi.fn() }));

import { auth } from "../../auth";

const authMock = auth as unknown as {
  mockReset: () => void;
  mockResolvedValue: (value: unknown) => void;
};
import { forbidden, redirect } from "next/navigation";
import {
  getAuthorizedWorkspaceSummary,
  listSessionWorkspaces,
  requireSessionUser,
  requireWorkspaceAccess,
  resolveWorkspaceAccess,
} from "../../lib/auth/route-guard";

type Status = "ACTIVE" | "INVITED" | "DEACTIVATED";
type WsStatus = "ACTIVE" | "SUSPENDED";
type Role =
  "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";
type MStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED";

function fakeClient(state: {
  user?: {
    id: string;
    platformRole: "USER" | "PLATFORM_ADMIN";
    status: Status;
  } | null;
  workspace?: { id: string; status: WsStatus; name?: string } | null;
  membership?: { id: string; role: Role; status: MStatus } | null;
}) {
  return {
    user: { findUnique: async () => state.user ?? null },
    workspace: {
      findUnique: async () =>
        state.workspace
          ? { id: state.workspace.id, status: state.workspace.status }
          : null,
    },
    workspaceMember: { findUnique: async () => state.membership ?? null },
    clientProfile: { findFirst: async () => null },
    clientAssignment: { findFirst: async () => null },
  };
}

const owner = {
  user: { id: "u1", platformRole: "USER" as const, status: "ACTIVE" as const },
  workspace: { id: "w1", status: "ACTIVE" as const, name: "Alpha" },
  membership: {
    id: "m1",
    role: "WORKSPACE_OWNER" as const,
    status: "ACTIVE" as const,
  },
};

beforeEach(() => {
  authMock.mockReset();
  vi.mocked(redirect).mockClear();
  vi.mocked(forbidden).mockClear();
});

describe("resolveWorkspaceAccess", () => {
  it("returns the context when the guard allows", async () => {
    const ctx = await resolveWorkspaceAccess(
      { user: { id: "u1" } },
      { resource: "workspaceSettings", action: "read", workspaceId: "w1" },
      fakeClient(owner) as never,
    );
    expect(ctx).toMatchObject({
      userId: "u1",
      workspaceId: "w1",
      workspaceRole: "WORKSPACE_OWNER",
    });
  });

  it("returns null (not throw) on every authorization denial", async () => {
    const cases = [
      // unauthenticated
      [null, owner],
      // inactive user
      [
        { user: { id: "u1" } },
        { ...owner, user: { ...owner.user, status: "DEACTIVATED" as const } },
      ],
      // suspended workspace
      [
        { user: { id: "u1" } },
        {
          ...owner,
          workspace: { ...owner.workspace, status: "SUSPENDED" as const },
        },
      ],
      // non-member
      [{ user: { id: "u1" } }, { ...owner, membership: null }],
      // role denied (CLIENT cannot read workspaceSettings)
      [
        { user: { id: "u1" } },
        {
          ...owner,
          membership: { ...owner.membership, role: "CLIENT" as const },
        },
      ],
    ] as const;
    for (const [session, state] of cases) {
      const ctx = await resolveWorkspaceAccess(
        session as never,
        { resource: "workspaceSettings", action: "read", workspaceId: "w1" },
        fakeClient(state as never) as never,
      );
      expect(ctx).toBeNull();
    }
  });

  it("does not swallow unexpected errors", async () => {
    const boom = {
      user: {
        findUnique: async () => {
          throw new Error("db exploded");
        },
      },
      workspace: { findUnique: async () => null },
      workspaceMember: { findUnique: async () => null },
      clientProfile: { findFirst: async () => null },
      clientAssignment: { findFirst: async () => null },
    };
    await expect(
      resolveWorkspaceAccess(
        { user: { id: "u1" } },
        { resource: "workspaceSettings", action: "read", workspaceId: "w1" },
        boom as never,
      ),
    ).rejects.toThrow("db exploded");
  });
});

describe("requireWorkspaceAccess", () => {
  it("returns the context when allowed", async () => {
    const ctx = await requireWorkspaceAccess(
      { user: { id: "u1" } },
      { resource: "workspaceSettings", action: "read", workspaceId: "w1" },
      fakeClient(owner) as never,
    );
    expect(ctx.workspaceId).toBe("w1");
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("calls forbidden() exactly when the guard denies", async () => {
    await expect(
      requireWorkspaceAccess(
        { user: { id: "u1" } },
        { resource: "workspaceSettings", action: "write", workspaceId: "w1" },
        fakeClient({
          ...owner,
          membership: { ...owner.membership, role: "COACH" },
        }) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenSentinel);
    expect(forbidden).toHaveBeenCalledTimes(1);
  });
});

describe("requireSessionUser", () => {
  it("redirects to /login when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireSessionUser()).rejects.toMatchObject({ url: "/login" });
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects when the session has no user id", async () => {
    authMock.mockResolvedValue({ user: {} });
    await expect(requireSessionUser()).rejects.toMatchObject({ url: "/login" });
  });

  it("returns { userId, session } when authenticated", async () => {
    const session = { user: { id: "u1" } };
    authMock.mockResolvedValue(session);
    const result = await requireSessionUser();
    expect(result.userId).toBe("u1");
    expect(result.session).toBe(session);
  });
});

describe("listSessionWorkspaces", () => {
  it("scopes by user + ACTIVE membership + ACTIVE workspace + staff role, minimal fields", async () => {
    const calls: unknown[] = [];
    const client = {
      workspaceMember: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return [
            { role: "WORKSPACE_OWNER", workspace: { id: "w1", name: "Alpha" } },
            { role: "COACH", workspace: { id: "w2", name: "Beta" } },
          ];
        },
      },
    };
    const rows = await listSessionWorkspaces("u1", client as never);
    expect(rows).toEqual([
      { id: "w1", name: "Alpha", role: "WORKSPACE_OWNER" },
      { id: "w2", name: "Beta", role: "COACH" },
    ]);
    const args = calls[0] as {
      where: Record<string, unknown>;
      select: unknown;
    };
    expect(args.where).toMatchObject({
      userId: "u1",
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    });
    expect(args.where.role).toEqual({
      in: ["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"],
    });
    expect(args.select).toMatchObject({
      role: true,
      workspace: { select: { id: true, name: true } },
    });
  });
});

describe("getAuthorizedWorkspaceSummary", () => {
  it("reads the name for the authorized workspace id", async () => {
    const client = {
      workspace: { findUnique: async () => ({ id: "w1", name: "Alpha" }) },
    };
    const summary = await getAuthorizedWorkspaceSummary(
      { workspaceId: "w1" } as never,
      client as never,
    );
    expect(summary).toEqual({ id: "w1", name: "Alpha" });
  });

  it("fails closed when the context has no workspace id", async () => {
    const client = {
      workspace: { findUnique: async () => ({ id: "w1", name: "Alpha" }) },
    };
    await expect(
      getAuthorizedWorkspaceSummary({} as never, client as never),
    ).rejects.toThrow();
  });
});
