import { describe, expect, it } from "vitest";

import {
  type Action,
  type PrincipalRole,
  type Resource,
  RBAC_MATRIX,
  RESOURCES,
  resolveScope,
  WORKSPACE_ROLES,
} from "../../lib/auth/rbac";

type Cell = [string, string];

// Exact reviewed matrix from docs/security/authorization-model.md (R / W).
const EXPECTED: Record<Resource, Record<string, Cell>> = {
  workspaceSettings: {
    PLATFORM_ADMIN: ["platform", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["workspace", "denied"],
    ASSISTANT_COACH: ["workspace", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  membersInvitations: {
    PLATFORM_ADMIN: ["platform", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["denied", "denied"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  // S1-F2C: coach→client invitation gets a distinct resource so the staff-
  // invitation permission above is never accidentally broadened.
  clientInvitations: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["denied", "workspace"],
    COACH: ["denied", "workspace"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  clientAssignments: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["denied", "denied"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  clientProfiles: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  dailyTracking: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "denied"],
    // D10/D22: coach reads every workspace client; write stays assigned.
    COACH: ["workspace", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  // MEAL-PLAN-I1 (decision 115): owner write is `assigned` — an owner
  // authors meal plans only for clients they hold an ACTIVE
  // ClientAssignment to; owner read stays workspace-wide. Same
  // reviewed amendment shape as checkinsCoachReviews/checkinFeedback.
  mealPlans: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "assigned"],
    // D10/D22: coach reads every workspace client; write stays assigned.
    COACH: ["workspace", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "denied"],
  },
  // TRAINING-I1A: owner write prospectively amended denied→assigned (owners
  // author programs for clients they hold an ACTIVE assignment to). CLIENT
  // write stays `own` for the future logging surface; program-management
  // writes are rejected in the service layer.
  trainingPlansLogs: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "assigned"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  // SOLO-COACH-I1 (decision 111): owner write is `assigned` — an owner
  // marks Check-In submissions reviewed only for clients they hold an
  // ACTIVE ClientAssignment to (amends #95). Read stays workspace-wide.
  checkinsCoachReviews: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "assigned"],
    // D10/D22: coach reads every workspace client; write stays assigned.
    COACH: ["workspace", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  cycleData: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["denied", "denied"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  bloodwork: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["denied", "denied"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  pedHrt: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["denied", "denied"],
    COACH: ["denied", "denied"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  coachNotes: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "denied"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  clientNotes: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "denied"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  consent: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["denied", "denied"],
    COACH: ["denied", "denied"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  foodExerciseMasterData: {
    PLATFORM_ADMIN: ["platform", "platform"],
    WORKSPACE_OWNER: ["workspace", "denied"],
    COACH: ["workspace", "denied"],
    ASSISTANT_COACH: ["workspace", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["workspace", "denied"],
  },
  exportsErasure: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["assigned", "denied"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  auditLog: {
    PLATFORM_ADMIN: ["platform", "denied"],
    WORKSPACE_OWNER: ["workspace", "denied"],
    COACH: ["denied", "denied"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  privateMediaFiles: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "denied"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  // P-008 scoped approval (product-decisions #29): owner + active coach only.
  onboardingFormTemplates: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["workspace", "workspace"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  // P-013 (product-decisions #31/#37 direction): staff-only assignment
  // records — owner workspace scope, coach assigned-scope read/write,
  // assistant assigned-scope read only; client/support/platform denied.
  onboardingAssignments: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  // P-014 (product-decisions #41–#42): workspace-shared parameter/template
  // library — owner + coach read/write at workspace scope; every other role
  // denied outright (platform admin denied even with dual membership).
  parameterDefinitions: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["workspace", "workspace"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  coachingTemplates: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["workspace", "workspace"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  // P-016 (product-decisions #51–#54): owner workspace; coach/assistant
  // assigned scope via ACTIVE ClientAssignment (assistant read-only);
  // client/support/platform denied.
  clientSetups: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  clientDashboards: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "denied"],
  },
  clientTasks: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  // HABITS-I1 (decision 110): same reviewed shape as clientTasks — owner
  // manages at workspace scope; assigned ACTIVE coaches manage at
  // assigned scope; assistants read assigned only; the CLIENT's "own"
  // write is restricted to the log desired-state op by the habit
  // service. SUPPORT/PLATFORM_ADMIN denied outright (dual-role deny-set
  // in guard.ts).
  habits: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  // P-023 (decisions #82–#85): client-owned onboarding submissions —
  // ACTIVE CLIENT own read/write; every staff role, SUPPORT, and
  // PLATFORM_ADMIN denied outright.
  onboardingSubmissions: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["denied", "denied"],
    COACH: ["denied", "denied"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "own"],
  },
  checkinFormDefinitions: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    COACH: ["workspace", "workspace"],
    ASSISTANT_COACH: ["denied", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  checkinInstances: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "workspace"],
    // D10/D22: coach reads every workspace client; write stays assigned.
    COACH: ["workspace", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "denied"],
  },
  // P-024 (decisions #86–#91): owner workspace read; coach
  // assigned read+mark; assistant assigned read, no mark; rest denied.
  // SOLO-COACH-I1 (decision 111): owner write is `assigned` — the owner
  // marks onboarding submissions reviewed only for clients they hold an
  // ACTIVE ClientAssignment to (amends #37/P-024 authorization).
  onboardingSubmissionReviews: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "assigned"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["denied", "denied"],
  },
  // CHECK-IN-FEEDBACK-I1 (#101 direction + owner answers): owner reads
  // workspace-wide but writes only where an ACTIVE assignment exists;
  // coach assigned read+send; assistant assigned read-only; client own
  // read only; SUPPORT + PLATFORM_ADMIN denied (dual-role via deny-set).
  checkinFeedback: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "assigned"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "denied"],
  },
  supplementPlans: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "assigned"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "denied"],
  },
  // Issue #169 (Stage 5 card 07): same reviewed posture as supplementPlans,
  // staff author activity targets only for clients they hold an ACTIVE
  // assignment to; owner reads workspace-wide; assistants read-only;
  // clients read their own versions and never write.
  activityTargets: {
    PLATFORM_ADMIN: ["denied", "denied"],
    WORKSPACE_OWNER: ["workspace", "assigned"],
    COACH: ["assigned", "assigned"],
    ASSISTANT_COACH: ["assigned", "denied"],
    SUPPORT: ["denied", "denied"],
    CLIENT: ["own", "denied"],
  },
};

const PRINCIPAL_ROLES: PrincipalRole[] = [
  "PLATFORM_ADMIN",
  "WORKSPACE_OWNER",
  "COACH",
  "ASSISTANT_COACH",
  "SUPPORT",
  "CLIENT",
];

describe("RBAC matrix", () => {
  it("covers every resource × principal role × action", () => {
    expect(RESOURCES).toHaveLength(34);
    for (const resource of RESOURCES) {
      for (const role of PRINCIPAL_ROLES) {
        const cell = RBAC_MATRIX[resource]?.[role];
        expect(cell, `${resource}/${role}`).toBeDefined();
        for (const action of ["read", "write"] as Action[]) {
          expect([
            "own",
            "assigned",
            "workspace",
            "platform",
            "denied",
          ]).toContain(cell[action]);
        }
      }
    }
    expect(WORKSPACE_ROLES).toEqual([
      "WORKSPACE_OWNER",
      "COACH",
      "ASSISTANT_COACH",
      "SUPPORT",
      "CLIENT",
    ]);
  });

  it("matches the reviewed matrix exactly", () => {
    for (const resource of RESOURCES) {
      for (const role of PRINCIPAL_ROLES) {
        const expected = EXPECTED[resource][role];
        expect(
          [RBAC_MATRIX[resource][role].read, RBAC_MATRIX[resource][role].write],
          `${resource}/${role}`,
        ).toEqual(expected);
      }
    }
  });

  it("onboardingFormTemplates: direct per-role resolveScope cells (P-008)", () => {
    // Direct per-role assertions against the live boundary — not just matrix
    // shape. Owner decision #29: owner + ACTIVE coach read AND write at
    // workspace scope; assistant/support/client/platform denied outright.
    const expected: Record<PrincipalRole, Cell> = {
      PLATFORM_ADMIN: ["denied", "denied"],
      WORKSPACE_OWNER: ["workspace", "workspace"],
      COACH: ["workspace", "workspace"],
      ASSISTANT_COACH: ["denied", "denied"],
      SUPPORT: ["denied", "denied"],
      CLIENT: ["denied", "denied"],
    };
    for (const role of PRINCIPAL_ROLES) {
      expect(resolveScope("onboardingFormTemplates", "read", role)).toBe(
        expected[role][0],
      );
      expect(resolveScope("onboardingFormTemplates", "write", role)).toBe(
        expected[role][1],
      );
    }
  });

  it("fails closed for unknown resource/action/role", () => {
    expect(resolveScope("nope" as Resource, "read", "COACH")).toBeUndefined();
    expect(
      resolveScope("dailyTracking", "delete" as Action, "COACH"),
    ).toBeUndefined();
    expect(
      resolveScope("dailyTracking", "read", "GHOST" as PrincipalRole),
    ).toBeUndefined();
  });

  it("pins the security-critical denials", () => {
    const ws = (r: Resource, a: Action) =>
      resolveScope(r, a, "WORKSPACE_OWNER");
    const asst = (r: Resource, a: Action) =>
      resolveScope(r, a, "ASSISTANT_COACH");
    const support = (r: Resource, a: Action) => resolveScope(r, a, "SUPPORT");
    const client = (r: Resource, a: Action) => resolveScope(r, a, "CLIENT");
    const plat = (r: Resource, a: Action) =>
      resolveScope(r, a, "PLATFORM_ADMIN");
    // SUPPORT denied client data
    for (const r of [
      "dailyTracking",
      "clientProfiles",
      "cycleData",
      "bloodwork",
      "privateMediaFiles",
    ] as Resource[]) {
      expect(support(r, "read")).toBe("denied");
      expect(support(r, "write")).toBe("denied");
    }
    // ASSISTANT writes denied
    for (const r of RESOURCES) expect(asst(r, "write")).toBe("denied");
    // Owner/assistant cycle & bloodwork denied
    expect(ws("cycleData", "read")).toBe("denied");
    expect(ws("bloodwork", "write")).toBe("denied");
    expect(asst("cycleData", "read")).toBe("denied");
    // PED/HRT denied to everyone
    for (const role of PRINCIPAL_ROLES) {
      expect(RBAC_MATRIX.pedHrt[role].read).toBe("denied");
      expect(RBAC_MATRIX.pedHrt[role].write).toBe("denied");
    }
    // Client cannot read coach notes
    expect(client("coachNotes", "read")).toBe("denied");
    // Platform admin cannot read health or exports
    expect(plat("dailyTracking", "read")).toBe("denied");
    expect(plat("exportsErasure", "read")).toBe("denied");
    expect(plat("pedHrt", "read")).toBe("denied");
  });
});
