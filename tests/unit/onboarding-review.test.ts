import { describe, expect, it } from "vitest";

import {
  type PrincipalRole,
  RESOURCES,
  resolveScope,
} from "../../lib/auth/rbac";

/**
 * P-024 (decisions #86–#91 + the R2 binding contract) — unit surface for
 * the staff onboarding-submission review resource. The role matrix is the
 * settled #37 direction: owner workspace-read (no mark), coach assigned
 * read+mark, assistant assigned read-only, everyone else denied; the
 * resource joins PLATFORM_ADMIN_DENIED_RESOURCES so dual-role platform
 * admins are denied even through an ACTIVE membership.
 */
describe("onboardingSubmissionReviews — resource and matrix (P-024)", () => {
  it("is a declared resource", () => {
    expect(RESOURCES).toContain("onboardingSubmissionReviews");
  });

  it("resolves the settled per-role cells exactly", () => {
    const expected: Record<PrincipalRole, [string, string]> = {
      PLATFORM_ADMIN: ["denied", "denied"],
      WORKSPACE_OWNER: ["workspace", "denied"],
      COACH: ["assigned", "assigned"],
      ASSISTANT_COACH: ["assigned", "denied"],
      SUPPORT: ["denied", "denied"],
      CLIENT: ["denied", "denied"],
    };
    for (const role of Object.keys(expected) as PrincipalRole[]) {
      expect(
        resolveScope("onboardingSubmissionReviews", "read", role),
        `${role}/read`,
      ).toBe(expected[role][0]);
      expect(
        resolveScope("onboardingSubmissionReviews", "write", role),
        `${role}/write`,
      ).toBe(expected[role][1]);
    }
  });
});

describe("onboardingSubmissionReviews — dual-role platform-admin denial", () => {
  // A PLATFORM_ADMIN holding an ACTIVE workspace membership of ANY role is
  // still denied — the resource sits in PLATFORM_ADMIN_DENIED_RESOURCES.
  // Behavioural assert through `authorize`, not set introspection, so a
  // removed deny-set entry is caught.
  it("denies a dual-role admin holding ACTIVE COACH membership (read+write)", async () => {
    const { authorize } = await import("../../lib/auth/guard");
    const session = {
      user: { id: "u-admin", platformRole: "PLATFORM_ADMIN" as const },
    };
    const repo = {
      getUser: async () => ({
        id: "u-admin",
        platformRole: "PLATFORM_ADMIN" as const,
        status: "ACTIVE" as const,
      }),
      getWorkspace: async () => ({
        id: "w1",
        status: "ACTIVE" as const,
      }),
      getMembership: async () => ({
        id: "m1",
        role: "COACH" as const,
        status: "ACTIVE" as const,
      }),
      getClientProfileInWorkspace: async () => ({
        id: "c1",
        workspaceId: "w1",
        userId: null,
      }),
      getActiveAssignment: async () => ({ id: "asg1" }),
    };
    for (const action of ["read", "write"] as const) {
      await expect(
        authorize(
          session,
          {
            resource: "onboardingSubmissionReviews",
            action,
            workspaceId: "w1",
            clientProfileId: "c1",
          },
          repo,
        ),
      ).rejects.toMatchObject({ reason: "role_denied" });
    }
  });
});

describe("onboardingSubmissionReviews — consent mapping (P-024)", () => {
  it("maps BASE_CONSENTS like its sibling protected resources", async () => {
    const { requiredConsentsFor, BASE_CONSENTS } =
      await import("../../lib/consent");
    expect(requiredConsentsFor("onboardingSubmissionReviews")).toEqual([
      ...BASE_CONSENTS,
    ]);
  });
});

describe("audit resource — onboarding_submission_review (P-024)", () => {
  it("is a single closed AUDIT_RESOURCE_TYPES entry after onboarding_submission", async () => {
    const { AUDIT_RESOURCE_TYPES } = await import("../../lib/audit");
    const occurrences = AUDIT_RESOURCE_TYPES.filter(
      (r) => r === "onboarding_submission_review",
    );
    expect(occurrences).toHaveLength(1);
    const idx = AUDIT_RESOURCE_TYPES.indexOf("onboarding_submission_review");
    expect(AUDIT_RESOURCE_TYPES[idx - 1]).toBe("onboarding_submission");
  });
});
