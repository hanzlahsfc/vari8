import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import {
  listSessionWorkspaces,
  requireSessionUser,
} from "@/lib/auth/route-guard";

export const dynamic = "force-dynamic";

/**
 * S1-H workspace list — the signed-in user's ACTIVE staff workspaces, resolved
 * entirely server-side from the session (self-scoped; no cross-tenant record).
 */
export default async function WorkspaceListPage() {
  const { userId } = await requireSessionUser();
  const workspaces = await listSessionWorkspaces(userId);

  return (
    <main className="app-main" data-testid="workspace-list">
      <AppNav />
      <h1 className="app-title">Your workspaces</h1>
      {workspaces.length === 0 ? (
        <p className="app-lede">
          You have no active workspaces yet. Ask a workspace owner for an
          invitation.
        </p>
      ) : (
        <ul className="workspace-list">
          {workspaces.map((workspace) => (
            <li key={workspace.id} className="workspace-list__item">
              <Link href={`/workspace/${workspace.id}`}>{workspace.name}</Link>
              <span className="workspace-list__meta">{workspace.role}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
