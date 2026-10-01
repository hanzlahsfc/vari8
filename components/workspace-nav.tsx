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
      href: `/workspace/${workspaceId}/admin`,
      label: "Admin",
      resource: "workspaceSettings",
      action: "write",
    },
  ] as const;

  const visible = items.filter(
    (item) => resolveScope(item.resource, item.action, role) === "workspace",
  );

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
