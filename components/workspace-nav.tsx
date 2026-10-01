import Link from "next/link";

import { resolveScope, type WorkspaceRole } from "@/lib/auth/rbac";

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
  const items = [
    {
      href: `/workspace/${workspaceId}`,
      label: "Overview",
      resource: "workspaceSettings",
      action: "read",
    },
    {
      href: `/workspace/${workspaceId}/daily`,
      label: "Daily Tracker",
      resource: "dailyTracking",
      action: "read",
    },
    {
      href: `/workspace/${workspaceId}/nutrition`,
      label: "Nutrition Database",
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
