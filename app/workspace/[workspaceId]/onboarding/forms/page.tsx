import Link from "next/link";
import { forbidden } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { listFormsForWorkspace } from "@/lib/onboarding/forms-boundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Onboarding Forms" };

type FormSummary = import("@/lib/onboarding/forms").FormSummary;

function statusLabel(form: FormSummary): "DRAFT" | "PUBLISHED" | "ARCHIVED" {
  if (form.status === "ARCHIVED") return "ARCHIVED";
  return form.hasDraft ? "DRAFT" : "PUBLISHED";
}

/**
 * P-008 5C-1 — staff onboarding form library (definitions only).
 *
 * Session gate first (unauthenticated → `/login`), then the per-page
 * resource read goes through the boundary: the guarded service re-resolves
 * current membership/role/workspace on EVERY request — the parent layout
 * grant is never reused as authority. Denied roles, revoked/inactive
 * memberships, foreign workspaces and malformed segments all fail closed to
 * the repo-standard non-disclosing HTTP 403.
 *
 * Row links target the canonical editor route, which is not yet implemented
 * (5C-2 dependency, disclosed). No submission/intake surface exists.
 */
export default async function OnboardingFormsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  const result = await listFormsForWorkspace(session, { workspaceId });
  if (!result.ok) forbidden();
  const forms = result.value.forms;
  const newFormHref = `/workspace/${workspaceId}/onboarding/forms/new`;

  return (
    <div className="catalog-page" data-testid="onboarding-forms-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace</p>
        <h1 className="app-title">Onboarding Forms</h1>
        <p className="app-lede">
          Form definitions clients fill in during onboarding. Only definitions
          live here — no submissions exist yet.
        </p>
      </header>

      {forms.length === 0 ? (
        <div className="empty-state" data-testid="onboarding-empty-state">
          <p className="app-lede">No onboarding forms yet.</p>
          <Link
            className="auth-button"
            data-testid="new-onboarding-form"
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
              data-testid="new-onboarding-form"
              href={newFormHref}
            >
              New form
            </Link>
          </p>
          <table className="catalog-table" data-testid="onboarding-forms-table">
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
                      href={`/workspace/${workspaceId}/onboarding/forms/${form.id}`}
                    >
                      {form.name}
                    </Link>
                  </td>
                  <td>
                    <span data-testid="form-status-badge">
                      {statusLabel(form)}
                    </span>
                  </td>
                  <td data-testid="form-version">
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
