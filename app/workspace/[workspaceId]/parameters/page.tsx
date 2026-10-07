import Link from "next/link";
import { notFound } from "next/navigation";
import { forbidden } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCoachingTemplatesEnabled } from "@/lib/coaching/gate";
import { isParameterClassificationEnabled } from "@/lib/coaching/parameter-classification-gate";
import {
  listClassificationContext,
  listParametersForWorkspace,
} from "@/lib/coaching/parameters-boundary";
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
 *
 * Pagination is server-side keyset navigation via `?cursor=` — the opaque
 * cursor is resolved inside the workspace scope; foreign/unknown cursors
 * fail closed as invalid input (non-disclosing denial via the boundary).
 */
export default async function ParametersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    notFound();
  const { workspaceId } = await params;
  const { cursor } = await searchParams;
  const { session } = await requireSessionUser();
  const result = await listParametersForWorkspace(session, {
    workspaceId,
    ...(typeof cursor === "string" ? { cursor } : {}),
  });
  if (!result.ok) forbidden();
  // P-020A: the classification control exists only while the exact-match
  // classification gate is on; the selection context binds the browser's
  // positional choice to a server-recomputed authorized list fingerprint.
  const classificationEnabled = isParameterClassificationEnabled(
    process.env.ENABLE_PARAMETER_CLASSIFICATION,
  );
  const classification = classificationEnabled
    ? await listClassificationContext(session, { workspaceId })
    : null;
  const base = `/workspace/${encodeURIComponent(workspaceId)}/parameters`;
  return (
    <>
      <ParameterManager
        classification={
          classification?.ok
            ? {
                fingerprint: classification.value.fingerprint,
                indexByParameterId: classification.value.indexByParameterId,
              }
            : undefined
        }
        parameters={result.value.parameters}
        workspaceId={workspaceId}
      />
      <nav
        aria-label="Parameter pages"
        className="catalog-page"
        data-testid="parameter-pagination"
      >
        {cursor ? (
          <Link className="auth-button" data-testid="first-page" href={base}>
            ← First page
          </Link>
        ) : null}
        {result.value.nextCursor ? (
          <Link
            className="auth-button"
            data-testid="next-page"
            href={`${base}?cursor=${encodeURIComponent(result.value.nextCursor)}`}
          >
            Next page →
          </Link>
        ) : null}
      </nav>
    </>
  );
}
