import Link from "next/link";

import {
  resolveScope,
  type Action,
  type Resource,
  type WorkspaceRole,
} from "@/lib/auth/rbac";
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
      href: `/workspace/${workspaceId}/client-setup`,
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
