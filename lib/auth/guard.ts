import { prismaAuthorizationRepo } from "../workspace/access";
import {
  type Action,
  isAction,
  isResource,
  type Resource,
  resolveScope,
  type Scope,
  type WorkspaceRole,
} from "./rbac";

/**
 * Default-deny authorization guard (S1-B).
 *
 * The session supplies identity ONLY (`session.user.id`). Every call re-reads
 * current database state (user status, platform role, workspace, membership,
 * role, client ownership, active assignment) so a status/assignment/role change
 * takes effect on the very next call without a session refresh.
 *
 * On success it returns a minimal authorization context and never any health or
 * profile data. On denial it throws a typed `AccessDeniedError` (403) carrying
 * only structural fields.
 */

export type PlatformRole = "USER" | "PLATFORM_ADMIN";
export type UserStatus = "ACTIVE" | "DEACTIVATED" | "INVITED";
export type WorkspaceStatus = "ACTIVE" | "SUSPENDED";
export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";

export type { WorkspaceRole } from "./rbac";

export type DenialReason =
  | "unauthenticated"
  | "user_missing"
  | "user_inactive"
  | "workspace_required"
  | "workspace_missing_or_inactive"
  | "membership_missing_or_inactive"
  | "role_denied"
  | "client_required"
  | "client_outside_workspace"
  | "not_owner"
  | "not_assigned"
  | "invalid_resource"
  | "invalid_action";

export class AccessDeniedError extends Error {
  readonly status = 403;
  constructor(
    readonly reason: DenialReason,
    readonly resource: string,
    readonly action: string,
  ) {
    // Structural message only: no ids, names, or health values.
    super(`Authorization denied (${reason})`);
    this.name = "AccessDeniedError";
  }
}

export type AuthorizationContext = {
  userId: string;
  platformRole: PlatformRole;
  workspaceId?: string;
  workspaceMemberId?: string;
  workspaceRole?: WorkspaceRole;
  grantedScope: Exclude<Scope, "denied">;
  clientProfileId?: string;
};

export type AuthorizationRequest = {
  resource: Resource;
  action: Action;
  workspaceId?: string;
  clientProfileId?: string;
};

export type AuthorizationRepo = {
  getUser(id: string): Promise<{
    id: string;
    platformRole: PlatformRole;
    status: UserStatus;
  } | null>;
  getWorkspace(
    id: string,
  ): Promise<{ id: string; status: WorkspaceStatus } | null>;
  getMembership(
    userId: string,
    workspaceId: string,
  ): Promise<{
    id: string;
    role: WorkspaceRole;
    status: MembershipStatus;
  } | null>;
  getClientProfileInWorkspace(
    clientProfileId: string,
    workspaceId: string,
  ): Promise<{ id: string; workspaceId: string; userId: string | null } | null>;
  getActiveAssignment(input: {
    workspaceId: string;
    clientProfileId: string;
    coachMemberId: string;
  }): Promise<{ id: string } | null>;
};

export type SessionLike =
  { user?: { id?: string | null } | null } | null | undefined;

/** Collection (list) authorization — read-only, never returns profile data. */
export type CollectionScope = "workspace" | "assigned" | "own";

export type CollectionContext = {
  userId: string;
  platformRole: PlatformRole;
  workspaceId: string;
  workspaceMemberId: string;
  workspaceRole: WorkspaceRole;
  grantedScope: CollectionScope;
};

function deny(reason: DenialReason, resource: string, action: string): never {
  throw new AccessDeniedError(reason, resource, action);
}

/**
 * PD29 (engineering interpretation of product decision #29 under the
 * user-delegated least-privilege choice): resources a PLATFORM_ADMIN account
 * is denied even when the same account holds an ACTIVE workspace membership
 * whose role would otherwise be granted. Deliberately resource-specific —
 * every other resource keeps its existing membership-derived rules.
 */
const PLATFORM_ADMIN_DENIED_RESOURCES: ReadonlySet<Resource> =
  new Set<Resource>([
    "onboardingFormTemplates",
    "onboardingAssignments",
    // P-014: workspace parameter/template definitions (product-decision #42).
    "parameterDefinitions",
    "coachingTemplates",
    // P-016: client setup + template assignments (product-decision #54 —
    // denied including dual-role platform administrators).
    "clientSetups",
    // P-023: client-owned onboarding submissions — denied including
    // dual-role platform administrators.
    "onboardingSubmissions",
    // P-025 (decisions #92–#97 — binding security requirement, not an owner
    // choice): Check-In resources deny PLATFORM_ADMIN including a dual-role
    // administrator with an ACTIVE membership of any role. All three
    // Check-In resources are members: definitions (P-025-A), instances
    // (P-025-B), and the client submission/review resource (P-025-B).
    "checkinFormDefinitions",
    "checkinInstances",
    // DASHBOARD-I1: layout records deny PLATFORM_ADMIN including the
    // dual-role membership path (same posture as the other health surfaces).
    "clientDashboards",
    // CLIENT-TASKS-I1 (decision 109): client task records deny
    // PLATFORM_ADMIN including a dual-role administrator with an ACTIVE
    // membership of any role — the matrix cell alone only covers the
    // no-membership path.
    "clientTasks",
    // HABITS-I1 (decision 110): habit records and log marks deny
    // PLATFORM_ADMIN including a dual-role administrator with an ACTIVE
    // membership of any role.
    "habits",
    // SOLO-COACH-I1 (decision 111): client coach assignments deny
    // PLATFORM_ADMIN including a dual-role administrator holding an ACTIVE
    // WORKSPACE_OWNER membership — without this entry the fall-through would
    // resolve the membership role's owner scope on this slice's new surface.
    "clientAssignments",
    "checkinsCoachReviews",
    // P-024 (decisions #86–#91 — binding requirement): staff onboarding
    // submission reviews deny PLATFORM_ADMIN including a dual-role
    // administrator with an ACTIVE membership of any role.
    "onboardingSubmissionReviews",
    // CHECK-IN-FEEDBACK-I1: Check-In feedback records deny PLATFORM_ADMIN
    // including a dual-role administrator holding an ACTIVE membership of
    // any role — the matrix cell alone only covers the no-membership path.
    "checkinFeedback",
    // MEAL-PLAN-I1 (decision #115 — binding security requirement): meal
    // plans and their published versions deny PLATFORM_ADMIN including a
    // dual-role administrator with an ACTIVE membership of any role — the
    // matrix cell alone only covers the no-membership path.
    "mealPlans",
    // TRAINING-I1A (PROMPT 244 — same binding posture): training
    // programs and their published versions deny PLATFORM_ADMIN
    // including the dual-role membership path.
    "trainingPlansLogs",
    // PR-SUPP (same binding posture): supplement plans deny
    // PLATFORM_ADMIN including a dual-role administrator holding an
    // ACTIVE membership of any role.
    "supplementPlans",
  ]);

/**
 * Authorize a workspace collection read. Re-reads DB state, resolves the matrix,
 * and returns only `workspace | assigned | own` scope. Denies write, unknown
 * inputs, platform scope, and anything not explicitly a listable scope.
 */
export async function authorizeCollection(
  session: SessionLike,
  request: { resource: Resource; action: Action; workspaceId?: string },
  repo: AuthorizationRepo = prismaAuthorizationRepo,
): Promise<CollectionContext> {
  const { resource, action } = request;
  const userId = session?.user?.id;
  if (!userId) deny("unauthenticated", resource, action);
  if (action !== "read") deny("invalid_action", resource, action);
  if (!isResource(resource)) deny("invalid_resource", resource, action);

  const user = await repo.getUser(userId);
  if (!user) deny("user_missing", resource, action);
  if (user.status !== "ACTIVE") deny("user_inactive", resource, action);

  if (!request.workspaceId) deny("workspace_required", resource, action);
  const workspace = await repo.getWorkspace(request.workspaceId);
  if (!workspace || workspace.status !== "ACTIVE")
    deny("workspace_missing_or_inactive", resource, action);
  const membership = await repo.getMembership(userId, request.workspaceId);
  if (!membership || membership.status !== "ACTIVE")
    deny("membership_missing_or_inactive", resource, action);
  if (
    user.platformRole === "PLATFORM_ADMIN" &&
    PLATFORM_ADMIN_DENIED_RESOURCES.has(resource)
  )
    deny("role_denied", resource, action);

  const scope = resolveScope(resource, "read", membership.role);
  if (!scope || scope === "denied" || scope === "platform")
    deny("role_denied", resource, action);

  return {
    userId,
    platformRole: user.platformRole,
    workspaceId: request.workspaceId,
    workspaceMemberId: membership.id,
    workspaceRole: membership.role,
    grantedScope: scope as CollectionScope,
  };
}

export async function authorize(
  session: SessionLike,
  request: AuthorizationRequest,
  repo: AuthorizationRepo = prismaAuthorizationRepo,
): Promise<AuthorizationContext> {
  const resource = request.resource;
  const action = request.action;

  const userId = session?.user?.id;
  if (!userId) deny("unauthenticated", resource, action);

  if (!isAction(action)) deny("invalid_action", resource, action);
  if (!isResource(resource)) deny("invalid_resource", resource, action);

  const user = await repo.getUser(userId);
  if (!user) deny("user_missing", resource, action);
  if (user.status !== "ACTIVE") deny("user_inactive", resource, action);
  const platformRole = user.platformRole;

  let role: import("./rbac").PrincipalRole;
  let membership: {
    id: string;
    role: WorkspaceRole;
    status: MembershipStatus;
  } | null = null;

  if (request.workspaceId) {
    const workspace = await repo.getWorkspace(request.workspaceId);
    if (!workspace || workspace.status !== "ACTIVE")
      deny("workspace_missing_or_inactive", resource, action);
    membership = await repo.getMembership(userId, request.workspaceId);
    if (!membership || membership.status !== "ACTIVE")
      deny("membership_missing_or_inactive", resource, action);
    if (
      platformRole === "PLATFORM_ADMIN" &&
      PLATFORM_ADMIN_DENIED_RESOURCES.has(resource)
    )
      deny("role_denied", resource, action);
    role = membership.role;
  } else if (platformRole === "PLATFORM_ADMIN") {
    role = "PLATFORM_ADMIN";
  } else {
    deny("workspace_required", resource, action);
  }

  const scope = resolveScope(resource, action, role);
  if (!scope || scope === "denied") deny("role_denied", resource, action);

  switch (scope) {
    case "platform": {
      if (platformRole !== "PLATFORM_ADMIN")
        deny("role_denied", resource, action);
      return { userId, platformRole, grantedScope: "platform" };
    }
    case "workspace": {
      // Role was derived from an ACTIVE membership, so workspace context exists.
      return {
        userId,
        platformRole,
        workspaceId: request.workspaceId as string,
        workspaceMemberId: membership?.id,
        workspaceRole: role as WorkspaceRole,
        grantedScope: "workspace",
      };
    }
    case "own":
    case "assigned": {
      if (!request.workspaceId) deny("workspace_required", resource, action);
      if (!request.clientProfileId) deny("client_required", resource, action);
      const client = await repo.getClientProfileInWorkspace(
        request.clientProfileId,
        request.workspaceId,
      );
      if (!client) deny("client_outside_workspace", resource, action);

      if (scope === "own") {
        if (client.userId !== userId) deny("not_owner", resource, action);
      } else {
        const assignment = await repo.getActiveAssignment({
          workspaceId: request.workspaceId,
          clientProfileId: request.clientProfileId,
          coachMemberId: membership?.id as string,
        });
        if (!assignment) deny("not_assigned", resource, action);
      }

      return {
        userId,
        platformRole,
        workspaceId: request.workspaceId,
        workspaceMemberId: membership?.id,
        workspaceRole: role as WorkspaceRole,
        grantedScope: scope,
        clientProfileId: request.clientProfileId,
      };
    }
  }
}
