import {
  requireSessionUser,
  requireWorkspaceAccess,
} from "@/lib/auth/route-guard";

export const dynamic = "force-dynamic";

/**
 * S1-H workspace overview. Re-runs the server-side guard itself (layouts are not
 * re-executed on client-side navigation) and renders no sensitive data.
 */
export default async function WorkspaceOverviewPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  await requireWorkspaceAccess(session, {
    resource: "workspaceSettings",
    action: "read",
    workspaceId,
  });

  return (
    <section className="shell__panel" data-testid="workspace-overview">
      <h1 className="app-title">Overview</h1>
      <p className="app-lede">
        This is the authenticated workspace shell. Product modules (tracking,
        plans, check-ins, and client data) arrive in later slices and will be
        server-authorized and workspace-scoped.
      </p>
    </section>
  );
}
