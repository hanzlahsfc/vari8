import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { listCheckInFormsForWorkspace } from "@/lib/checkin/forms-boundary";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Check-In Forms" };

type CheckInFormSummary = import("@/lib/checkin/forms").CheckInFormSummary;

function statusLabel(
  form: CheckInFormSummary,
): "DRAFT" | "PUBLISHED" | "ARCHIVED" {
  if (form.status === "ARCHIVED") return "ARCHIVED";
  return form.hasDraft ? "DRAFT" : "PUBLISHED";
}

/**
 * P-025-A — staff Check-In form library (definitions only).
 *
 * The shared feature resolver runs FIRST: unset/off/untrusted environment
 * 404s the route before session access or database work. Then the session
 * gate (unauthenticated → `/login`), then the per-page resource read goes
 * through the boundary — the guarded service re-resolves current
 * membership/role/workspace on EVERY request. Denied roles, revoked or
 * inactive memberships, foreign workspaces and malformed segments all fail
 * closed to the repo-standard non-disclosing HTTP 403.
 *
 * No client/instance/submission surface exists in this slice.
 */
export default async function CheckInFormsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isCheckInsEnabled()) notFound();
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  const result = await listCheckInFormsForWorkspace(session, { workspaceId });
  if (!result.ok) forbidden();
  const forms = result.value.forms;
  const newFormHref = `/workspace/${workspaceId}/checkins/forms/new`;

  return (
    <div className="catalog-page" data-testid="checkin-forms-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace</p>
        <h1 className="app-title">Check-In Forms</h1>
        <p className="app-lede">
          Form definitions staff publish and later schedule for clients as
          Check-Ins. Only definitions live here — scheduling and submissions
          arrive in later slices.
        </p>
      </header>

      {forms.length === 0 ? (
        <div className="empty-state" data-testid="checkin-empty-state">
          <p className="app-lede">No Check-In forms yet.</p>
          <Link
            className="auth-button"
            data-testid="new-checkin-form"
            href={newFormHref}
          >
            New form
          </Link>
        </div>
      ) : (
        <>
          <p>
            <Link
              className="auth-button"
              data-testid="new-checkin-form"
              href={newFormHref}
            >
              New form
            </Link>
          </p>
          <table className="catalog-table" data-testid="checkin-forms-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">Version</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => (
                <tr key={form.id}>
                  <td>
                    <Link
                      href={`/workspace/${workspaceId}/checkins/forms/${form.id}`}
                    >
                      {form.name}
                    </Link>
                  </td>
                  <td>
                    <span data-testid="checkin-form-status-badge">
                      {statusLabel(form)}
                    </span>
                  </td>
                  <td data-testid="checkin-form-version">
                    {form.latestVersionSeq === null
                      ? "—"
                      : `v${form.latestVersionSeq}`}
                  </td>
                  <td>{form.updatedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
