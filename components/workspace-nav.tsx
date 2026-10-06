import Link from "next/link";

import {
  resolveScope,
  type Action,
  type Resource,
  type WorkspaceRole,
} from "@/lib/auth/rbac";

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
