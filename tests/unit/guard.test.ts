import { describe, expect, it, vi } from "vitest";

import {
  AccessDeniedError,
  authorize,
  type AuthorizationRepo,
} from "../../lib/auth/guard";

type State = {
  user: {
    id: string;
    platformRole: "USER" | "PLATFORM_ADMIN";
    status: "ACTIVE" | "DEACTIVATED" | "INVITED";
  } | null;
  workspace: { id: string; status: "ACTIVE" | "SUSPENDED" } | null;
  membership: {
    id: string;
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";
    status: "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED";
  } | null;
  client: { id: string; workspaceId: string; userId: string | null } | null;
  assignment: { id: string } | null;
};

function makeRepo(overrides: Partial<State> = {}) {
  const state: State = {
    user: { id: "u1", platformRole: "USER", status: "ACTIVE" },
    workspace: { id: "w1", status: "ACTIVE" },
    membership: { id: "m1", role: "COACH", status: "ACTIVE" },
    client: { id: "c1", workspaceId: "w1", userId: "u1" },
    assignment: { id: "a1" },
    ...overrides,
  };
  const calls = {
    getClientProfileInWorkspace: vi.fn(async () => state.client),
    getActiveAssignment: vi.fn(async () => state.assignment),
  };
  const repo: AuthorizationRepo = {
    getUser: async () => state.user,
    getWorkspace: async () => state.workspace,
    getMembership: async () => state.membership,
    getClientProfileInWorkspace: calls.getClientProfileInWorkspace,
    getActiveAssignment: calls.getActiveAssignment,
  };
  return { repo, calls };
}

const session = (id = "u1") => ({ user: { id } }) as never;
const w = "w1";
const c = "c1";

async function reason(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return error instanceof AccessDeniedError ? error.reason : `other:${error}`;
  }
}

describe("authorize — default deny", () => {
  it("denies a missing session", async () => {
    const { repo } = makeRepo();
    expect(
      await reason(() =>
        authorize(
          undefined as never,
          {
            resource: "dailyTracking",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          repo,
        ),
      ),
    ).toBe("unauthenticated");
  });
  it("denies a missing user", async () => {
    const { repo } = makeRepo({ user: null });
    expect(
      await reason(() =>
        authorize(
          session(),
          {
            resource: "dailyTracking",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          repo,
        ),
      ),
    ).toBe("user_missing");
  });
  it("denies INVITED/DEACTIVATED users", async () => {
    for (const status of ["INVITED", "DEACTIVATED"] as const) {
      const { repo } = makeRepo({
        user: { id: "u1", platformRole: "USER", status },
      });
      expect(
        await reason(() =>
          authorize(
            session(),
            {
              resource: "dailyTracking",
              action: "read",
              workspaceId: w,
              clientProfileId: c,
            },
            repo,
          ),
        ),
      ).toBe("user_inactive");
    }
  });
  it("denies missing/inactive workspace", async () => {
    for (const workspace of [
      null,
      { id: "w1", status: "SUSPENDED" as const },
    ]) {
      const { repo } = makeRepo({ workspace });
      expect(
        await reason(() =>
          authorize(
            session(),
            {
              resource: "dailyTracking",
              action: "read",
              workspaceId: w,
              clientProfileId: c,
            },
            repo,
          ),
        ),
      ).toBe("workspace_missing_or_inactive");
    }
  });
  it("denies missing/inactive membership", async () => {
    for (const membership of [
      null,
      { id: "m1", role: "COACH" as const, status: "SUSPENDED" as const },
    ]) {
      const { repo } = makeRepo({ membership });
      expect(
        await reason(() =>
          authorize(
            session(),
            {
              resource: "dailyTracking",
              action: "read",
              workspaceId: w,
              clientProfileId: c,
            },
            repo,
          ),
        ),
      ).toBe("membership_missing_or_inactive");
    }
  });
  it("performs no client/assignment lookup when the matrix denies", async () => {
    const { repo, calls } = makeRepo({
      membership: { id: "m1", role: "SUPPORT", status: "ACTIVE" },
    });
    expect(
      await reason(() =>
        authorize(
          session(),
          {
            resource: "dailyTracking",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          repo,
        ),
      ),
    ).toBe("role_denied");
    expect(calls.getClientProfileInWorkspace).not.toHaveBeenCalled();
    expect(calls.getActiveAssignment).not.toHaveBeenCalled();
  });
  it("fails closed on unknown inputs", async () => {
    const { repo } = makeRepo();
    expect(
      await reason(() =>
        authorize(
          session(),
          { resource: "ghost" as never, action: "read" },
          repo,
        ),
      ),
    ).toBe("invalid_resource");
    expect(
      await reason(() =>
        authorize(
          session(),
          { resource: "dailyTracking", action: "delete" as never },
          repo,
        ),
      ),
    ).toBe("invalid_action");
  });
});

describe("authorize — scopes", () => {
  it("workspace scope succeeds only inside the selected workspace", async () => {
    const { repo } = makeRepo({
      membership: { id: "m1", role: "WORKSPACE_OWNER", status: "ACTIVE" },
    });
    const ctx = await authorize(
      session(),
      { resource: "dailyTracking", action: "read", workspaceId: w },
      repo,
    );
    expect(ctx).toMatchObject({
      userId: "u1",
      workspaceId: w,
      workspaceMemberId: "m1",
      workspaceRole: "WORKSPACE_OWNER",
      grantedScope: "workspace",
    });
    // owner with no workspace cannot obtain workspace scope (workspace is required)
    expect(
      await reason(() =>
        authorize(
          session(),
          { resource: "dailyTracking", action: "read" },
          repo,
        ),
      ),
    ).toBe("workspace_required");
  });
  it("own scope requires matching ClientProfile.userId and workspace", async () => {
    const { repo } = makeRepo({
      membership: { id: "m1", role: "CLIENT", status: "ACTIVE" },
      client: { id: "c1", workspaceId: "w1", userId: "u1" },
    });
    const ctx = await authorize(
      session(),
      {
        resource: "dailyTracking",
        action: "read",
        workspaceId: w,
        clientProfileId: c,
      },
      repo,
    );
    expect(ctx).toMatchObject({ grantedScope: "own", clientProfileId: c });
    const { repo: other } = makeRepo({
      membership: { id: "m1", role: "CLIENT", status: "ACTIVE" },
      client: { id: "c1", workspaceId: "w1", userId: "someone-else" },
    });
    expect(
      await reason(() =>
        authorize(
          session(),
          {
            resource: "dailyTracking",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          other,
        ),
      ),
    ).toBe("not_owner");
  });
  it("assigned scope requires an ACTIVE assignment; REMOVED/absent is denied", async () => {
    const { repo } = makeRepo({
      membership: { id: "m1", role: "COACH", status: "ACTIVE" },
    });
    expect(
      (
        await authorize(
          session(),
          {
            resource: "dailyTracking",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          repo,
        )
      ).grantedScope,
    ).toBe("assigned");
    const { repo: removed } = makeRepo({
      membership: { id: "m1", role: "COACH", status: "ACTIVE" },
      assignment: null,
    });
    expect(
      await reason(() =>
        authorize(
          session(),
          {
            resource: "dailyTracking",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          removed,
        ),
      ),
    ).toBe("not_assigned");
  });
  it("denies a cross-workspace client and client_required when absent", async () => {
    const { repo } = makeRepo({
      membership: { id: "m1", role: "COACH", status: "ACTIVE" },
      client: null,
    });
    expect(
      await reason(() =>
        authorize(
          session(),
          {
            resource: "dailyTracking",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          repo,
        ),
      ),
    ).toBe("client_outside_workspace");
    const { repo: r2 } = makeRepo({
      membership: { id: "m1", role: "COACH", status: "ACTIVE" },
    });
    expect(
      await reason(() =>
        authorize(
          session(),
          { resource: "dailyTracking", action: "read", workspaceId: w },
          r2,
        ),
      ),
    ).toBe("client_required");
  });
  it("platform scope works only on explicitly platform cells", async () => {
    const { repo } = makeRepo({
      user: { id: "u1", platformRole: "PLATFORM_ADMIN", status: "ACTIVE" },
    });
    expect(
      (
        await authorize(
          session(),
          { resource: "foodExerciseMasterData", action: "read" },
          repo,
        )
      ).grantedScope,
    ).toBe("platform");
    // With a workspace membership the workspace cell applies (assigned), not platform.
    const ctx = await authorize(
      session(),
      {
        resource: "dailyTracking",
        action: "read",
        workspaceId: w,
        clientProfileId: c,
      },
      repo,
    );
    expect(ctx.grantedScope).toBe("assigned");
  });
  it("platform admin cannot bypass health/export denial", async () => {
    const { repo } = makeRepo({
      user: { id: "u1", platformRole: "PLATFORM_ADMIN", status: "ACTIVE" },
    });
    expect(
      await reason(() =>
        authorize(
          session(),
          { resource: "dailyTracking", action: "read" },
          repo,
        ),
      ),
    ).toBe("role_denied");
    expect(
      await reason(() =>
        authorize(
          session(),
          { resource: "exportsErasure", action: "read" },
          repo,
        ),
      ),
    ).toBe("role_denied");
    expect(
      await reason(() =>
        authorize(
          session(),
          {
            resource: "pedHrt",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          repo,
        ),
      ),
    ).toBe("role_denied");
    // platform admin with an ACTIVE workspace role still obeys workspace rules (needs assignment)
    const { repo: adminCoach } = makeRepo({
      user: { id: "u1", platformRole: "PLATFORM_ADMIN", status: "ACTIVE" },
      membership: { id: "m1", role: "COACH", status: "ACTIVE" },
      assignment: null,
    });
    expect(
      await reason(() =>
        authorize(
          session(),
          {
            resource: "dailyTracking",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          adminCoach,
        ),
      ),
    ).toBe("not_assigned");
  });
  it("AccessDeniedError carries only structural fields", async () => {
    const { repo } = makeRepo({
      membership: { id: "m1", role: "SUPPORT", status: "ACTIVE" },
    });
    let error: AccessDeniedError | undefined;
    try {
      await authorize(
        session(),
        {
          resource: "dailyTracking",
          action: "read",
          workspaceId: w,
          clientProfileId: c,
        },
        repo,
      );
    } catch (caught) {
      error = caught as AccessDeniedError;
    }
    expect(error).toBeInstanceOf(AccessDeniedError);
    expect(error?.status).toBe(403);
    expect(error?.reason).toBe("role_denied");
    expect(error?.resource).toBe("dailyTracking");
    expect(error?.action).toBe("read");
    expect(Object.keys(error ?? {})).not.toContain("clientName");
    expect(String(error?.message)).not.toMatch(/c1|w1|u1|client|workspace/i);
  });
});
