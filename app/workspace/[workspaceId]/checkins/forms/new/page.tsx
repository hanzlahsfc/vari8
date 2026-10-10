import { notFound } from "next/navigation";

import {
  requireSessionUser,
  requireWorkspaceAccess,
} from "@/lib/auth/route-guard";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";

import { CreateCheckInForm } from "./create-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "New Check-In Form" };

/**
 * P-025-A — create a Check-In form definition.
 *
 * Feature resolver FIRST (disabled/untrusted → 404), then session gate,
 * then a per-page WRITE authorization that re-resolves the current
 * membership/role/workspace on every request — the parent layout grant is
 * never reused as authority. Denied roles, foreign workspaces and
 * malformed segments fail closed to the repo-standard non-disclosing 403;
 * the mutation itself is enforced again inside the `createCheckInForm`
 * server action through the boundary.
 */
export default async function NewCheckInFormPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isCheckInsEnabled()) notFound();
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  await requireWorkspaceAccess(session, {
    resource: "checkinFormDefinitions",
    action: "write",
    workspaceId,
  });

  return (
    <div className="catalog-page" data-testid="new-checkin-form-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace</p>
        <h1 className="app-title">New Check-In form</h1>
        <p className="app-lede">
          Name the Check-In form definition. Fields are added in the editor
          after creation.
        </p>
      </header>
      <CreateCheckInForm workspaceId={workspaceId} />
    </div>
  );
}
