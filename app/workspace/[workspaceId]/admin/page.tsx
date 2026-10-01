import {
  requireSessionUser,
  requireWorkspaceAccess,
} from "@/lib/auth/route-guard";

export const dynamic = "force-dynamic";

/**
 * S1-H owner-only area. Guards `workspaceSettings/write` (owner-only per the
 * reviewed matrix) so a non-owner member of the same workspace receives a real
 * HTTP 403. No settings are exposed or mutated here.
 */
export default async function WorkspaceAdminPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  await requireWorkspaceAccess(session, {
    resource: "workspaceSettings",
    action: "write",
    workspaceId,
  });

  return (
    <section className="shell__panel" data-testid="workspace-admin">
      <h1 className="app-title">Admin</h1>
      <p className="app-lede">
        Owner-only workspace administration area. Settings management is not
        implemented in this slice.
      </p>
    </section>
  );
}
