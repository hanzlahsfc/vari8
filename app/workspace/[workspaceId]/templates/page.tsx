import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCoachingTemplatesEnabled } from "@/lib/coaching/gate";
import { listTemplatesForWorkspace } from "@/lib/coaching/templates-boundary";
import { CreateTemplateForm } from "./create-template";

export const dynamic = "force-dynamic";

export const metadata = { title: "Coaching Templates" };

type TemplateSummary =
  import("@/lib/coaching/templates-boundary").TemplateSummary;

function statusLabel(t: TemplateSummary): string {
  if (t.status === "ARCHIVED") return "ARCHIVED";
  return t.hasDraft ? "DRAFT" : "PUBLISHED";
}

/**
 * P-014 — workspace coaching template library (staff definitions only).
 *
 * Flag-off → real 404. Session gate first, then the read goes through the
 * boundary: membership/role/workspace re-resolved per request; denied
 * roles, foreign workspaces, and malformed segments fail closed to the
 * non-disclosing 403. No client-facing rendering exists.
 */
export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    notFound();
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  const result = await listTemplatesForWorkspace(session, { workspaceId });
  if (!result.ok) forbidden();
  const templates = result.value.templates;

  return (
    <div className="catalog-page" data-testid="templates-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace</p>
        <h1 className="app-title">Coaching Templates</h1>
        <p className="app-lede">
          Reusable check-in and tracker structures. Drafts are editable;
          published versions are immutable snapshots.
        </p>
      </header>

      <CreateTemplateForm workspaceId={workspaceId} />

      {templates.length === 0 ? (
        <div className="empty-state" data-testid="templates-empty">
          <p className="app-lede">No templates yet.</p>
        </div>
      ) : (
        <table className="catalog-table" data-testid="templates-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Status</th>
              <th scope="col">Version</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link
                    href={`/workspace/${encodeURIComponent(workspaceId)}/templates/${encodeURIComponent(t.id)}`}
                  >
                    {t.name}
                  </Link>
                </td>
                <td>
                  <span data-testid="template-status">{statusLabel(t)}</span>
                </td>
                <td data-testid="template-version">
                  {t.latestVersionSeq === null ? "—" : `v${t.latestVersionSeq}`}
                </td>
                <td>{t.updatedAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
