/**
 * Role-based access control matrix (S1-B).
 *
 * Closed unions plus the reviewed matrix from `docs/security/authorization-model.md`.
 * Every resource × principal role × action has an explicit scope. Unknown inputs
 * resolve to `undefined` and deny at runtime (the guard fails closed).
 *
 * TODO(human) permissions are NOT converted into grants here: SUPPORT is denied
 * client data, ASSISTANT_COACH writes are denied, owner/assistant cycle+bloodwork
 * are denied, PED/HRT is denied to everyone, clients cannot read coach notes, and
 * platform admins cannot read client health data or exports.
 */

export type Action = "read" | "write";

export type Scope = "own" | "assigned" | "workspace" | "platform" | "denied";

export const WORKSPACE_ROLES = [
  "WORKSPACE_OWNER",
  "COACH",
  "ASSISTANT_COACH",
  "SUPPORT",
  "CLIENT",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const PRINCIPAL_ROLES = ["PLATFORM_ADMIN", ...WORKSPACE_ROLES] as const;
export type PrincipalRole = (typeof PRINCIPAL_ROLES)[number];

export const RESOURCES = [
  "workspaceSettings",
  "membersInvitations",
  "clientInvitations",
  "clientAssignments",
  "clientProfiles",
  "dailyTracking",
  "mealPlans",
  "trainingPlansLogs",
  "checkinsCoachReviews",
  "cycleData",
  "bloodwork",
  "pedHrt",
  "coachNotes",
  "clientNotes",
  "consent",
  "foodExerciseMasterData",
  "exportsErasure",
  "auditLog",
  "privateMediaFiles",
  "onboardingFormTemplates",
  "onboardingAssignments",
  // P-014 (product-decisions #41–#42): workspace parameter/template library.
  "parameterDefinitions",
  "coachingTemplates",
  // P-016 (product-decisions #49–#57): client setup + template assignments.
  "clientSetups",
  // P-023 (product-decisions #82–#85): client-owned onboarding submissions.
  "onboardingSubmissions",
  // P-025-A (product-decisions #92–#97): staff-managed Check-In form
  // definitions.
  "checkinFormDefinitions",
  // P-025-B: one-off Check-In instance headers + schedule/cancel.
  "checkinInstances",
  // DASHBOARD-I1 (decision #108): persisted per-client dashboard layouts.
  "clientDashboards",
  // CLIENT-TASKS-I1 (decision 109): staff-assigned client tasks.
  "clientTasks",
  // HABITS-I1 (decision 110): staff-configured client habits + client
  // own-profile log marks.
  "habits",
  // P-024 (product-decisions #86–#91): staff onboarding-submission review.
  "onboardingSubmissionReviews",
  // CHECK-IN-FEEDBACK-I1: append-only staff text feedback on a reviewed
  // Check-In submission.
  "checkinFeedback",
] as const;
export type Resource = (typeof RESOURCES)[number];

export type ScopeCell = Record<Action, Scope>;

const c = (read: Scope, write: Scope): ScopeCell => ({ read, write });
const D = c("denied", "denied");

/** Reviewed matrix (R / W). See docs/security/authorization-model.md. */
export const RBAC_MATRIX: Record<Resource, Record<PrincipalRole, ScopeCell>> = {
  workspaceSettings: {
    PLATFORM_ADMIN: c("platform", "denied"),
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("workspace", "denied"),
    ASSISTANT_COACH: c("workspace", "denied"),
    SUPPORT: D,
    CLIENT: D,
  },
  membersInvitations: {
    PLATFORM_ADMIN: c("platform", "denied"),
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: D,
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: D,
  },
  // S1-F2C: a coach may create CLIENT invitations, but the staff-invitation
  // cell above stays untouched — widening `membersInvitations` for coaches is
  // exactly the accidental-authorization failure this split prevents.
  // Invitation listing/revocation is owner-only and lives on
  // `membersInvitations` (all read cells here are denied).
  clientInvitations: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("denied", "workspace"),
    COACH: c("denied", "workspace"),
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: D,
  },
  clientAssignments: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: D,
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: D,
  },
  clientProfiles: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  dailyTracking: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "denied"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  mealPlans: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "denied"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "denied"),
  },
  trainingPlansLogs: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "denied"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  checkinInstances: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "denied"),
  },
  // SOLO-COACH-I1 (decision 111 — amends #95): an owner may mark Check-In
  // submissions reviewed ONLY for clients they hold an ACTIVE
  // ClientAssignment to — assigned write scope, never workspace-wide.
  checkinsCoachReviews: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "assigned"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  cycleData: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: D,
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  bloodwork: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: D,
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  pedHrt: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: D,
    COACH: D,
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: D,
  },
  coachNotes: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "denied"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: D,
  },
  clientNotes: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "denied"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  consent: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: D,
    COACH: D,
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  foodExerciseMasterData: {
    PLATFORM_ADMIN: c("platform", "platform"),
    WORKSPACE_OWNER: c("workspace", "denied"),
    COACH: c("workspace", "denied"),
    ASSISTANT_COACH: c("workspace", "denied"),
    SUPPORT: D,
    CLIENT: c("workspace", "denied"),
  },
  exportsErasure: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("assigned", "denied"),
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  auditLog: {
    PLATFORM_ADMIN: c("platform", "denied"),
    WORKSPACE_OWNER: c("workspace", "denied"),
    COACH: D,
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: D,
  },
  privateMediaFiles: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "denied"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  // P-008 (owner decision #29): onboarding form DEFINITION management is
  // scoped to workspace owners and ACTIVE coaches — definitions only, no
  // submission domain exists. Assistant/support/client/platform denied.
  onboardingFormTemplates: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("workspace", "workspace"),
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: D,
  },
  // P-025-A (product-decision #95): Check-In form DEFINITION management —
  // workspace owners and coaches create/edit/publish/archive/schedule at
  // workspace scope with no coaching-assignment dependency; assistants,
  // clients, SUPPORT, and PLATFORM_ADMIN denied (the PLATFORM_ADMIN cell is
  // additionally deny-set enforced in guard.ts — dual-role inclusive).
  checkinFormDefinitions: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("workspace", "workspace"),
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: D,
  },
  // P-013 (product-decisions #31): staff-only onboarding-form assignment
  // RECORDS — assignment metadata, not answers. Coach/assistant access is
  // constrained to clients covered by their current ACTIVE ClientAssignment
  // ("assigned" scope resolves at query time; a coach's write here never
  // mutates ClientAssignment). Assistant reads but cannot mutate;
  // client/support/platform denied.
  onboardingAssignments: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: D,
  },
  // P-014 (product-decisions #41–#42): workspace-shared parameter
  // definitions + coaching templates — owner and ACTIVE coach manage at
  // workspace scope; no creator-only scope; assistant/client/support/
  // platform-admin denied outright (incl. dual-role membership).
  parameterDefinitions: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("workspace", "workspace"),
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: D,
  },
  coachingTemplates: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("workspace", "workspace"),
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: D,
  },
  // P-016 (product-decisions #51–#54): staff-only client setup + template
  // assignment RECORDS — assignment metadata, not client content. Same scope
  // shape as onboardingAssignments: owner workspace-wide; coach/assistant
  // constrained to clients covered by their current ACTIVE ClientAssignment
  // (any ACTIVE assigned coach may manage — D-11 resolved; never PRIMARY-only
  // and never confers ClientAssignment scope); assistant read-only;
  // client/support/platform-admin denied outright (incl. dual-role).
  clientSetups: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: D,
  },
  // DASHBOARD-I1 (decision #108): owner edits without an assignment;
  // assigned ACTIVE coaches edit; assistants view; clients view their
  // own server-filtered subset; support + platform-admin denied.
  clientDashboards: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "denied"),
  },
  // P-023 (product-decisions #82–#85): client-owned submission records —
  // read (own submitted view/list) and write (one-shot submit) for the
  // ACTIVE CLIENT on their own profile only. Every staff role, SUPPORT,
  // and PLATFORM_ADMIN are denied outright, including the dual-role
  // membership path.
  onboardingSubmissions: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: D,
    COACH: D,
    ASSISTANT_COACH: D,
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  // CLIENT-TASKS-I1 (decision 109): owner manages at workspace scope;
  // assigned ACTIVE coaches manage at assigned scope; assistants read
  // assigned; the CLIENT's "own" write is restricted to the completion
  // transition by the task service — a generic write grant here is never
  // the operation authority. SUPPORT/PLATFORM_ADMIN denied outright
  // (dual-role deny-set in guard.ts).
  clientTasks: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  // HABITS-I1 (decision 110): same reviewed shape as clientTasks —
  // owner manages at workspace scope; assigned ACTIVE coaches manage at
  // assigned scope; assistants read assigned only; the CLIENT's "own"
  // write is restricted to the habit-log desired-state op by the habit
  // service — a generic write grant here is never the operation
  // authority. SUPPORT/PLATFORM_ADMIN denied outright (dual-role
  // deny-set in guard.ts).
  habits: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "workspace"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "own"),
  },
  // P-024 (decision #37 direction, approved #86–#91): owner reads at
  // workspace scope; coach reads+marks at assigned scope;
  // assistant reads assigned, no mark; SUPPORT/CLIENT/PLATFORM_ADMIN denied
  // (the deny-set enforces the dual-role platform-admin case in guard.ts).
  onboardingSubmissionReviews: {
    PLATFORM_ADMIN: D,
    // SOLO-COACH-I1 (decision 111 — separately approved amendment to the
    // #37 general submission-authorization direction; this matrix is its
    // P-024 onboarding instantiation): an owner may mark onboarding
    // submissions reviewed ONLY where an ACTIVE ClientAssignment exists.
    WORKSPACE_OWNER: c("workspace", "assigned"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: D,
  },
  // CHECK-IN-FEEDBACK-I1 (#101 direction + owner answers): owner reads at
  // workspace scope but writes ONLY where an ACTIVE ClientAssignment
  // exists (assigned write — the #111 solo-coach shape); coach
  // reads+writes at assigned scope; assistant reads assigned, never
  // writes; client reads its own feedback only, never writes;
  // SUPPORT/PLATFORM_ADMIN denied outright (deny-set enforces dual-role).
  checkinFeedback: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "assigned"),
    COACH: c("assigned", "assigned"),
    ASSISTANT_COACH: c("assigned", "denied"),
    SUPPORT: D,
    CLIENT: c("own", "denied"),
  },
};

export function isResource(value: unknown): value is Resource {
  return (
    typeof value === "string" &&
    (RESOURCES as readonly string[]).includes(value)
  );
}
export function isAction(value: unknown): value is Action {
  return value === "read" || value === "write";
}
export function isPrincipalRole(value: unknown): value is PrincipalRole {
  return (
    typeof value === "string" &&
    (PRINCIPAL_ROLES as readonly string[]).includes(value)
  );
}

/** Returns the scope for a cell, or `undefined` when anything is unknown (deny). */
export function resolveScope(
  resource: Resource,
  action: Action,
  role: PrincipalRole,
): Scope | undefined {
  if (!isResource(resource) || !isAction(action) || !isPrincipalRole(role))
    return undefined;
  return RBAC_MATRIX[resource]?.[role]?.[action];
}
