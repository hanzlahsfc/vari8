import { FirstRunChecklist } from "@/components/canvas/coach/first-run-checklist";
import {
  requireSessionUser,
  requireWorkspaceAccess,
} from "@/lib/auth/route-guard";
import { readFirstRunChecklist } from "@/lib/dashboard/first-run";

export const dynamic = "force-dynamic";

/**
 * S1-H workspace overview. Re-runs the server-side guard itself (layouts are not
 * re-executed on client-side navigation) and renders no sensitive data.
 *
 * W2-T4 (R1): the derived first-run checklist mounts here for a fresh
 * workspace and disappears once the workspace has a client, a form and a plan.
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
  const checklist = await readFirstRunChecklist(session, { workspaceId });

  return (
    <section className="shell__panel" data-testid="workspace-overview">
      <h1 className="app-title">Overview</h1>
      {checklist.visible ? (
        <FirstRunChecklist
          workspaceId={workspaceId}
          flags={checklist}
          statusUrl={`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/first-run`}
        />
      ) : (
        <p className="app-lede">
          This is the authenticated workspace shell. Product modules (tracking,
          plans, check-ins, and client data) arrive in later slices and will be
          server-authorized and workspace-scoped.
        </p>
      )}
    </section>
  );
}
