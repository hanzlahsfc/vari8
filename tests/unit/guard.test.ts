import { describe, expect, it, vi } from "vitest";

import {
  AccessDeniedError,
  authorize,
  authorizeCollection,
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
    // D10/D22 widened COACH reads to workspace on plan/client-data
    // resources; clientProfiles keeps the assigned cell and exercises the
    // assigned-scope machinery.
    const { repo } = makeRepo({
      membership: { id: "m1", role: "COACH", status: "ACTIVE" },
    });
    expect(
      (
        await authorize(
          session(),
          {
            resource: "clientProfiles",
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
            resource: "clientProfiles",
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
            resource: "clientProfiles",
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
          { resource: "clientProfiles", action: "read", workspaceId: w },
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
        resource: "clientProfiles",
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
            resource: "clientProfiles",
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

// D10/D22 (owner ruling 2026-10-27, w2/coach-reads): staff read every client
// of their own workspace on the plan + client-data resources behind the
// coach profile reads: no ACTIVE ClientAssignment needed for READ. WRITE
// stays assigned per decision #111.
describe("authorize: D10/D22 coach workspace-wide reads", () => {
  const WIDENED = [
    "mealPlans",
    "checkinInstances",
    "checkinsCoachReviews",
    "dailyTracking",
  ] as const;
  it("COACH read resolves workspace scope without an assignment on the widened resources", async () => {
    for (const resource of WIDENED) {
      const { repo, calls } = makeRepo({
        membership: { id: "m1", role: "COACH", status: "ACTIVE" },
        assignment: null,
      });
      const ctx = await authorize(
        session(),
        {
          resource,
          action: "read",
          workspaceId: w,
          clientProfileId: c,
        },
        repo,
      );
      expect(ctx.grantedScope, resource).toBe("workspace");
      expect(ctx.workspaceId, resource).toBe(w);
      expect(calls.getActiveAssignment, resource).not.toHaveBeenCalled();
    }
  });
  it("COACH write still requires an ACTIVE assignment on the widened resources", async () => {
    for (const resource of WIDENED) {
      const { repo } = makeRepo({
        membership: { id: "m1", role: "COACH", status: "ACTIVE" },
        assignment: null,
      });
      expect(
        await reason(() =>
          authorize(
            session(),
            {
              resource,
              action: "write",
              workspaceId: w,
              clientProfileId: c,
            },
            repo,
          ),
        ),
        resource,
      ).toBe("not_assigned");
    }
  });
  it("non-member of the workspace is still denied on a widened resource", async () => {
    const { repo } = makeRepo({ membership: null });
    expect(
      await reason(() =>
        authorize(
          session(),
          {
            resource: "checkinInstances",
            action: "read",
            workspaceId: w,
            clientProfileId: c,
          },
          repo,
        ),
      ),
    ).toBe("membership_missing_or_inactive");
  });
});

// PD29 dual-role repair (Apollo f88468e4, least privilege): a
// PLATFORM_ADMIN account is denied onboarding form DEFINITIONS even when
// the same account holds an ACTIVE WORKSPACE_OWNER/COACH membership.
// Resource-specific — other resources keep their existing dual-role rules.
describe("authorize — PD29 platform-admin dual-role on onboardingFormTemplates", () => {
  const admin = {
    id: "u1",
    platformRole: "PLATFORM_ADMIN",
    status: "ACTIVE",
  } as const;
  const forms = "onboardingFormTemplates" as const;

  for (const role of ["WORKSPACE_OWNER", "COACH"] as const) {
    it(`dual-role PLATFORM_ADMIN + ACTIVE ${role} is role_denied read AND write`, async () => {
      const { repo } = makeRepo({
        user: admin,
        membership: { id: "m1", role, status: "ACTIVE" },
      });
      for (const action of ["read", "write"] as const) {
        expect(
          await reason(() =>
            authorize(
              session(),
              { resource: forms, action, workspaceId: w },
              repo,
            ),
          ),
        ).toBe("role_denied");
      }
    });

    it(`dual-role PLATFORM_ADMIN + ACTIVE ${role} is role_denied on the collection (list) path`, async () => {
      const { repo } = makeRepo({
        user: admin,
        membership: { id: "m1", role, status: "ACTIVE" },
      });
      expect(
        await reason(() =>
          authorizeCollection(
            session(),
            { resource: forms, action: "read", workspaceId: w },
            repo,
          ),
        ),
      ).toBe("role_denied");
    });

    it(`control: USER + ACTIVE ${role} keeps workspace scope (authorize + collection)`, async () => {
      const { repo } = makeRepo({
        membership: { id: "m1", role, status: "ACTIVE" },
      });
      for (const action of ["read", "write"] as const) {
        const ctx = await authorize(
          session(),
          { resource: forms, action, workspaceId: w },
          repo,
        );
        expect(ctx.grantedScope).toBe("workspace");
        expect(ctx.platformRole).toBe("USER");
      }
      const col = await authorizeCollection(
        session(),
        { resource: forms, action: "read", workspaceId: w },
        repo,
      );
      expect(col.grantedScope).toBe("workspace");
    });
  }

  it("no-membership PLATFORM_ADMIN stays a membership-gate denial (old leg, distinct reason)", async () => {
    const { repo } = makeRepo({ user: admin, membership: null });
    expect(
      await reason(() =>
        authorize(
          session(),
          { resource: forms, action: "read", workspaceId: w },
          repo,
        ),
      ),
    ).toBe("membership_missing_or_inactive");
    expect(
      await reason(() =>
        authorizeCollection(
          session(),
          { resource: forms, action: "read", workspaceId: w },
          repo,
        ),
      ),
    ).toBe("membership_missing_or_inactive");
    // No workspace at all: the matrix PLATFORM_ADMIN cell already denies.
    expect(
      await reason(() =>
        authorize(session(), { resource: forms, action: "read" }, repo),
      ),
    ).toBe("role_denied");
  });

  it("non-regression: dual-role admin-owner keeps other resources' workspace rules", async () => {
    const { repo } = makeRepo({
      user: admin,
      membership: { id: "m1", role: "WORKSPACE_OWNER", status: "ACTIVE" },
    });
    for (const action of ["read", "write"] as const) {
      const ctx = await authorize(
        session(),
        { resource: "workspaceSettings", action, workspaceId: w },
        repo,
      );
      expect(ctx.grantedScope).toBe("workspace");
    }
    const col = await authorizeCollection(
      session(),
      { resource: "workspaceSettings", action: "read", workspaceId: w },
      repo,
    );
    expect(col.grantedScope).toBe("workspace");
    const { repo: adminCoach } = makeRepo({
      user: admin,
      membership: { id: "m1", role: "COACH", status: "ACTIVE" },
    });
    const assigned = await authorize(
      session(),
      {
        resource: "clientProfiles",
        action: "read",
        workspaceId: w,
        clientProfileId: c,
      },
      adminCoach,
    );
    expect(assigned.grantedScope).toBe("assigned");
  });
});

describe("CLIENT-TASKS-I1 (decision 109) — platform-admin deny-set", () => {
  const adminRoles: {
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";
    label: string;
  }[] = [
    { role: "WORKSPACE_OWNER", label: "workspace-owner member" },
    { role: "COACH", label: "assigned-coach member" },
    { role: "ASSISTANT_COACH", label: "assistant member" },
    { role: "SUPPORT", label: "support member" },
    { role: "CLIENT", label: "client member" },
  ];
  for (const { role, label } of adminRoles) {
    it(`denies a PLATFORM_ADMIN with an ACTIVE ${label} on clientTasks (read + write)`, async () => {
      const { repo } = makeRepo({
        user: {
          id: "u1",
          platformRole: "PLATFORM_ADMIN",
          status: "ACTIVE",
        },
        membership: { id: "m1", role, status: "ACTIVE" },
        client: { id: c, workspaceId: w, userId: "u1" },
        assignment: { id: "a1" },
      });
      for (const action of ["read", "write"] as const)
        expect(
          await reason(() =>
            authorize(
              session(),
              {
                resource: "clientTasks",
                action,
                workspaceId: w,
                clientProfileId: c,
              },
              repo,
            ),
          ),
        ).toBe("role_denied");
    });
  }
});

describe("HABITS-I1 (decision 110) — platform-admin deny-set", () => {
  const adminRoles: {
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";
    label: string;
  }[] = [
    { role: "WORKSPACE_OWNER", label: "workspace-owner member" },
    { role: "COACH", label: "assigned-coach member" },
    { role: "ASSISTANT_COACH", label: "assistant member" },
    { role: "SUPPORT", label: "support member" },
    { role: "CLIENT", label: "client member" },
  ];
  for (const { role, label } of adminRoles) {
    it(`denies a PLATFORM_ADMIN with an ACTIVE ${label} on habits (read + write)`, async () => {
      const { repo } = makeRepo({
        user: {
          id: "u1",
          platformRole: "PLATFORM_ADMIN",
          status: "ACTIVE",
        },
        membership: { id: "m1", role, status: "ACTIVE" },
        client: { id: c, workspaceId: w, userId: "u1" },
        assignment: { id: "a1" },
      });
      for (const action of ["read", "write"] as const)
        expect(
          await reason(() =>
            authorize(
              session(),
              {
                resource: "habits",
                action,
                workspaceId: w,
                clientProfileId: c,
              },
              repo,
            ),
          ),
        ).toBe("role_denied");
    });
  }
});

describe("SOLO-COACH-I1 (decision 111) — platform-admin deny-set: clientAssignments", () => {
  const adminRoles: {
    role:
      "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";
    label: string;
  }[] = [
    { role: "WORKSPACE_OWNER", label: "workspace-owner member" },
    { role: "COACH", label: "assigned-coach member" },
    { role: "ASSISTANT_COACH", label: "assistant member" },
    { role: "SUPPORT", label: "support member" },
    { role: "CLIENT", label: "client member" },
  ];
  for (const { role, label } of adminRoles) {
    it(`denies a PLATFORM_ADMIN with an ACTIVE ${label} on clientAssignments (read + write + collection)`, async () => {
      const { repo } = makeRepo({
        user: {
          id: "u1",
          platformRole: "PLATFORM_ADMIN",
          status: "ACTIVE",
        },
        membership: { id: "m1", role, status: "ACTIVE" },
        client: { id: c, workspaceId: w, userId: "u1" },
        assignment: { id: "a1" },
      });
      for (const action of ["read", "write"] as const)
        expect(
          await reason(() =>
            authorize(
              session(),
              {
                resource: "clientAssignments",
                action,
                workspaceId: w,
                clientProfileId: c,
              },
              repo,
            ),
          ),
        ).toBe("role_denied");
      expect(
        await reason(() =>
          authorizeCollection(
            session(),
            {
              resource: "clientAssignments",
              action: "read",
              workspaceId: w,
            },
            repo,
          ),
        ),
      ).toBe("role_denied");
    });
  }

  it("non-regression: an ordinary owner still resolves workspace scope on clientAssignments", async () => {
    const { repo } = makeRepo({
      membership: { id: "m1", role: "WORKSPACE_OWNER", status: "ACTIVE" },
    });
    const ctx = await authorize(
      session(),
      {
        resource: "clientAssignments",
        action: "write",
        workspaceId: w,
      },
      repo,
    );
    expect(ctx.grantedScope).toBe("workspace");
  });
});
