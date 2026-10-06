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
  checkinsCoachReviews: {
    PLATFORM_ADMIN: D,
    WORKSPACE_OWNER: c("workspace", "denied"),
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
