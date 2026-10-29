import Link from "next/link";

import {
  resolveScope,
  type Action,
  type Resource,
  type WorkspaceRole,
} from "@/lib/auth/rbac";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import { isOnboardingAssignmentsEnabled } from "@/lib/onboarding/assignments-gate";
import { isCoachingTemplatesEnabled } from "@/lib/coaching/gate";
import { isClientSetupEnabled } from "@/lib/coaching/client-setup-gate";

type NavItem = {
  href: string;
  label: string;
  resource: Resource;
  action: Action;
  /**
   * Optional explicit role pin for staff-only surfaces whose resource scope is
   * non-empty for a non-staff role (e.g. `clientProfiles/read` resolves `own`
   * for CLIENT, but the roster is staff-only by product contract). Cosmetic
   * only — it narrows, never widens, what the scope filter would show.
   */
  roles?: readonly WorkspaceRole[];
  /** Optional dev-flag pin — falsy hides the item regardless of role. */
  enabled?: boolean;
};

/**
 * Role-aware workspace navigation (S1-H). This is COSMETIC only: it hides links
 * a role cannot use, but every destination re-authorizes server-side — UI
 * visibility is never authorization.
 */
export function WorkspaceNav({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: WorkspaceRole;
}) {
  const items: readonly NavItem[] = [
    {
      href: `/workspace/${workspaceId}`,
      label: "Overview",
      resource: "workspaceSettings",
      action: "read",
    },
    {
      href: `/workspace/${workspaceId}/clients`,
      label: "Clients",
      resource: "clientProfiles",
      action: "read",
      roles: ["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"],
    },
    {
      href: `/workspace/${workspaceId}/daily`,
      label: "Daily Tracker",
      resource: "dailyTracking",
      action: "read",
    },
    {
      href: `/workspace/${workspaceId}/onboarding/forms`,
      label: "Onboarding Forms",
      resource: "onboardingFormTemplates",
      action: "read",
    },
    // P-013: staff-only assignment surface — dev-flagged AND pinned to the
    // three staff roles (the scope cells already deny CLIENT/SUPPORT; the pin
    // keeps intent explicit like the roster entry). Cosmetic only.
    {
      href: `/workspace/${workspaceId}/onboarding/assignments`,
      label: "Onboarding Assignments",
      resource: "onboardingAssignments",
      action: "read",
      roles: ["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"],
      enabled: isOnboardingAssignmentsEnabled(
        process.env.ENABLE_ONBOARDING_ASSIGNMENTS,
      ),
    },
    // P-014: parameter/template library — dev-flagged AND owner/coach-pinned
    // (the scope cells already deny assistant/client/support; the pin keeps
    // intent explicit). Cosmetic only — routes re-authorize server-side.
    {
      href: `/workspace/${workspaceId}/parameters`,
      label: "Parameters",
      resource: "parameterDefinitions",
      action: "read",
      roles: ["WORKSPACE_OWNER", "COACH"],
      enabled: isCoachingTemplatesEnabled(
        process.env.ENABLE_COACHING_TEMPLATES,
      ),
    },
    {
      href: `/workspace/${workspaceId}/templates`,
      label: "Templates",
      resource: "coachingTemplates",
      action: "read",
      roles: ["WORKSPACE_OWNER", "COACH"],
      enabled: isCoachingTemplatesEnabled(
        process.env.ENABLE_COACHING_TEMPLATES,
      ),
    },
    // P-016: staff-only client setup / template assignment surface —
    // dev-flagged AND pinned to the three staff roles (the scope cells
    // already deny CLIENT/SUPPORT; the pin keeps intent explicit). Cosmetic
    // only — the route re-authorizes server-side.
    {
      href: `/workspace/${workspaceId}/client-setups`,
      label: "Client Setup",
      resource: "clientSetups",
      action: "read",
      roles: ["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"],
      enabled: isClientSetupEnabled(process.env.ENABLE_CLIENT_SETUP),
    },
    {
      href: `/workspace/${workspaceId}/nutrition`,
      label: "Nutrition Database",
      resource: "foodExerciseMasterData",
      action: "read",
    },
    {
      href: `/workspace/${workspaceId}/exercises`,
      label: "Exercise Database",
      resource: "foodExerciseMasterData",
      action: "read",
    },
    // Dev-only workbook reference (/sheets): intentionally not linked from
    // navigation; the flag-gated route is reached directly.

    // P-025-A: staff Check-In form-definition library — gated by the shared
    // resolver (ENABLE_CHECK_INS + trusted dev/test runtime) and pinned to
    // owner/coach (the scope cell denies every other role; the explicit pin
    // keeps the cosmetic gate honest). Every destination re-authorizes
    // server-side.
    {
      href: `/workspace/${workspaceId}/checkins/forms`,
      label: "Check-In Forms",
      resource: "checkinFormDefinitions",
      action: "read",
      roles: ["WORKSPACE_OWNER", "COACH"],
      enabled: isCheckInsEnabled(),
    },
    // CHECK-IN-OVERVIEW-I1: staff "awaiting review" queue — same flag
    // gate, pinned to the three read-scope roles (owner workspace-read;
    // coach/assistant assigned-read; the deny-set covers CLIENT/SUPPORT
    // and dual-role PLATFORM_ADMIN). Cosmetic only — the route
    // re-authorizes server-side.
    {
      href: `/workspace/${workspaceId}/checkins/review-queue`,
      label: "Check-In Reviews",
      resource: "checkinsCoachReviews",
      action: "read",
      roles: ["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"],
      enabled: isCheckInsEnabled(),
    },
    // W2-T1: member settings surface - read-scoped like the route itself;
    // every write still goes through the own-scope settings API.
    {
      href: `/workspace/${workspaceId}/settings`,
      label: "Settings",
      resource: "workspaceSettings",
      action: "read",
    },
    {
      href: `/workspace/${workspaceId}/admin`,
      label: "Admin",
      resource: "workspaceSettings",
      action: "write",
    },
  ] as const;

  const visible = items.filter((item) => {
    if (item.enabled === false) return false;
    if (item.roles !== undefined && !item.roles.includes(role)) return false;
    const scope = resolveScope(item.resource, item.action, role);
    return scope === "workspace" || scope === "assigned" || scope === "own";
  });

  return (
    <nav className="shell__nav" aria-label="Workspace">
      {visible.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
