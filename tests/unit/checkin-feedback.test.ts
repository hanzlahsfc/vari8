// CHECK-IN-FEEDBACK-I1 — staff written feedback on Check-In submissions
// (reviewed P3 contract + P3-R1 refinements; decisions #96/#101, owner
// answers: same consent gate as answers; author departure persists rows
// for currently authorized readers only). New resource `checkinFeedback`,
// deny-set + audit registry membership, and the action-layer contract.
// Mirrors the guard.test.ts makeRepo pattern.

import { describe, expect, it } from "vitest";

import {
  authorize,
  authorizeCollection,
  AccessDeniedError,
  type AuthorizationRepo,
} from "../../lib/auth/guard";
import { RESOURCES, resolveScope } from "../../lib/auth/rbac";

describe("CHECK-IN-FEEDBACK-I1 RBAC — checkinFeedback", () => {
  it("resource is declared in the closed union", () => {
    expect(RESOURCES).toContain("checkinFeedback");
  });

  it("owner reads workspace-wide but writes only assigned (#111 shape)", () => {
    expect(resolveScope("checkinFeedback", "read", "WORKSPACE_OWNER")).toBe(
      "workspace",
    );
    expect(resolveScope("checkinFeedback", "write", "WORKSPACE_OWNER")).toBe(
      "assigned",
    );
  });

  it("coach reads + writes assigned; assistant reads assigned, write denied", () => {
    expect(resolveScope("checkinFeedback", "read", "COACH")).toBe("assigned");
    expect(resolveScope("checkinFeedback", "write", "COACH")).toBe("assigned");
    expect(resolveScope("checkinFeedback", "read", "ASSISTANT_COACH")).toBe(
      "assigned",
    );
    expect(resolveScope("checkinFeedback", "write", "ASSISTANT_COACH")).toBe(
      "denied",
    );
  });

  it("client reads own, write denied; SUPPORT and PLATFORM_ADMIN denied", () => {
    expect(resolveScope("checkinFeedback", "read", "CLIENT")).toBe("own");
    expect(resolveScope("checkinFeedback", "write", "CLIENT")).toBe("denied");
    for (const role of ["SUPPORT", "PLATFORM_ADMIN"] as const) {
      expect(resolveScope("checkinFeedback", "read", role)).toBe("denied");
      expect(resolveScope("checkinFeedback", "write", role)).toBe("denied");
    }
  });
});

describe("CHECK-IN-FEEDBACK-I1 dual-role PLATFORM_ADMIN denial", () => {
  type State = {
    user: {
      id: string;
      platformRole: "USER" | "PLATFORM_ADMIN";
      status: "ACTIVE";
    } | null;
    workspace: { id: string; status: "ACTIVE" } | null;
    membership: {
      id: string;
      role:
        "WORKSPACE_OWNER" | "COACH" | "ASSISTANT_COACH" | "SUPPORT" | "CLIENT";
      status: "ACTIVE";
    } | null;
    client: {
      id: string;
      workspaceId: string;
      userId: string | null;
    } | null;
    assignment: { id: string } | null;
  };

  function makeRepo(overrides: Partial<State> = {}) {
    const state: State = {
      user: { id: "u1", platformRole: "USER", status: "ACTIVE" },
      workspace: { id: "w1", status: "ACTIVE" },
      membership: { id: "m1", role: "WORKSPACE_OWNER", status: "ACTIVE" },
      client: null,
      assignment: null,
      ...overrides,
    };
    const repo: AuthorizationRepo = {
      getUser: async () => state.user,
      getWorkspace: async () => state.workspace,
      getMembership: async () => state.membership,
      getClientProfileInWorkspace: async () => state.client,
      getActiveAssignment: async () => state.assignment,
    };
    return { repo };
  }

  const session = (id = "u1") => ({ user: { id } }) as never;
  async function reason(fn: () => Promise<unknown>) {
    try {
      await fn();
      return undefined;
    } catch (error) {
      return error instanceof AccessDeniedError
        ? error.reason
        : `other:${error}`;
    }
  }

  const admin = {
    id: "u1",
    platformRole: "PLATFORM_ADMIN",
    status: "ACTIVE",
  } as const;

  for (const role of [
    "WORKSPACE_OWNER",
    "COACH",
    "ASSISTANT_COACH",
    "CLIENT",
  ] as const) {
    it(`dual-role PLATFORM_ADMIN + ACTIVE ${role} is role_denied read AND write on checkinFeedback`, async () => {
      const { repo } = makeRepo({
        user: admin,
        membership: { id: "m1", role, status: "ACTIVE" },
      });
      for (const action of ["read", "write"] as const) {
        expect(
          await reason(() =>
            authorize(
              session(),
              { resource: "checkinFeedback", action, workspaceId: "w1" },
              repo,
            ),
          ),
        ).toBe("role_denied");
      }
      expect(
        await reason(() =>
          authorizeCollection(
            session(),
            {
              resource: "checkinFeedback",
              action: "read",
              workspaceId: "w1",
            },
            repo,
          ),
        ),
      ).toBe("role_denied");
    });
  }

  it("control: ordinary USER + ACTIVE owner resolves workspace/assigned", async () => {
    const { repo } = makeRepo({
      client: { id: "cp1", workspaceId: "w1", userId: "other" },
      assignment: { id: "a1" },
    });
    const ctx = await authorize(
      session(),
      { resource: "checkinFeedback", action: "read", workspaceId: "w1" },
      repo,
    );
    expect(ctx.grantedScope).toBe("workspace");
    const w = await authorize(
      session(),
      {
        resource: "checkinFeedback",
        action: "write",
        workspaceId: "w1",
        clientProfileId: "cp1",
      },
      repo,
    );
    expect(w.grantedScope).toBe("assigned");
  });
});
