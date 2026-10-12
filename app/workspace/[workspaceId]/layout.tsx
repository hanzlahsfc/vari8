import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceNav } from "@/components/workspace-nav";
import {
  getAuthorizedWorkspaceSummary,
  listSessionWorkspaces,
  requireSessionUser,
  requireWorkspaceAccess,
} from "@/lib/auth/route-guard";

export const dynamic = "force-dynamic";

/**
 * S1-H authenticated workspace shell. Session gate first (unauthenticated →
 * `/login`), then server-side authorization (denied → HTTP 403), then the
 * authorized workspace name. Renders the workspace header, role-aware nav, a
 * workspace switcher, and sign-out.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { userId, session } = await requireSessionUser();
  const ctx = await requireWorkspaceAccess(session, {
    resource: "workspaceSettings",
    action: "read",
    workspaceId,
  });
  const { name } = await getAuthorizedWorkspaceSummary(
    ctx as typeof ctx & { workspaceId: string },
  );
  const switcher = await listSessionWorkspaces(userId);

  return (
    <div className="shell" data-testid="workspace-shell">
      <aside className="shell__sidebar" data-testid="shell-sidebar">
        <div className="shell__header">
          <span className="shell__brand">{name}</span>
          <span className="shell__role" data-testid="shell-role">
            {ctx.workspaceRole}
          </span>
        </div>
        <WorkspaceNav workspaceId={workspaceId} role={ctx.workspaceRole!} />
        <nav className="shell__switcher" aria-label="Your workspaces">
          <span className="shell__switcher-title">Workspaces</span>
          {switcher.map((workspace) => (
            <Link key={workspace.id} href={`/workspace/${workspace.id}`}>
              {workspace.name}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
        <SignOutButton />
      </aside>
      <main className="shell__main" data-testid="shell-main">
        {children}
      </main>
    </div>
  );
}
