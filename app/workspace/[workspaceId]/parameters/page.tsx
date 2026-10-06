import { notFound } from "next/navigation";
import { forbidden } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCoachingTemplatesEnabled } from "@/lib/coaching/gate";
import { listParametersForWorkspace } from "@/lib/coaching/parameters-boundary";
import { ParameterManager } from "./parameter-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Parameters" };

/**
 * P-014 — workspace parameter library (staff definitions only).
 *
 * Flag-off → real 404 (checked before the session gate). Session gate, then
 * the read goes through the boundary: the guarded service re-resolves
 * membership/role/workspace on every request — denied roles, revoked
 * memberships and foreign workspaces all fail closed to the repo-standard
 * non-disclosing HTTP 403. UI visibility is never authorization.
 */
export default async function ParametersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    notFound();
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  const result = await listParametersForWorkspace(session, { workspaceId });
  if (!result.ok) forbidden();
  return (
    <ParameterManager
      parameters={result.value.parameters}
      workspaceId={workspaceId}
    />
  );
}
