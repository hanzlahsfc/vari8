import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCoachingTemplatesEnabled } from "@/lib/coaching/gate";
import { listParametersForWorkspace } from "@/lib/coaching/parameters-boundary";
import { getTemplateForWorkspace } from "@/lib/coaching/templates-boundary";
import { TemplateEditor } from "./template-editor";
import { TemplateControls } from "./template-controls";

export const dynamic = "force-dynamic";

export const metadata = { title: "Coaching Template" };

/**
 * P-014 — coaching template detail/editor route.
 *
 * Flag-off → real 404. Session gate, then read via the boundary — the
 * guarded service re-resolves membership/role/workspace per request, so
 * denied roles, foreign template ids, nonexistent ids and malformed
 * segments all fail closed to the same non-disclosing 403.
 *
 * An ACTIVE template with an open draft mounts `TemplateEditor` (bounded
 * draft edits + save/publish). With no open draft, `TemplateControls`
 * offers reopen (seeded from the latest version), archive, and version
 * preview. Archived → read-only history; reopen is never offered.
 */
export default async function TemplatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; templateId: string }>;
}) {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    notFound();
  const { workspaceId, templateId } = await params;
  const { session } = await requireSessionUser();
  const result = await getTemplateForWorkspace(session, {
    workspaceId,
    templateId,
  });
  if (!result.ok) forbidden();
  const template = result.value;
  // The picker must see EVERY active parameter — page through the bounded
  // boundary until the cursor chain ends. The page cap is a fail-safe
  // (100 × 100 rows); normal workspaces never approach it.
  const parameters: import("@/lib/coaching/parameters-boundary").ParameterSummary[] =
    [];
  {
    let cursor: string | undefined;
    let pages = 0;
    do {
      const r = await listParametersForWorkspace(session, {
        workspaceId,
        ...(cursor !== undefined ? { cursor } : {}),
      });
      if (!r.ok) forbidden();
      parameters.push(...r.value.parameters);
      cursor = r.value.nextCursor ?? undefined;
    } while (cursor !== undefined && ++pages < 100);
  }
  const archived = template.status === "ARCHIVED";

  return (
    <div className="catalog-page" data-testid="template-editor-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Coaching Templates</p>
        <h1 className="app-title" data-testid="template-name-heading">
          {template.name}
        </h1>
      </header>
      {archived ? (
        <p className="auth-error" data-testid="archived-banner">
          This template is archived and permanently read-only.
        </p>
      ) : null}
      {template.draft !== null && !archived ? (
        <TemplateEditor
          activeParameters={parameters.filter((p) => p.status === "ACTIVE")}
          initialDraft={template.draft}
          initialRevision={template.draftRevision}
          templateId={templateId}
          templateName={template.name}
          workspaceId={workspaceId}
        />
      ) : (
        <>
          <p className="app-lede" data-testid="no-draft">
            No draft is open.
          </p>
          {!archived ? (
            <TemplateControls
              templateId={templateId}
              workspaceId={workspaceId}
            />
          ) : null}
        </>
      )}
      {template.versions.length > 0 ? (
        <section data-testid="version-history">
          <h2>Published versions</h2>
          <ul>
            {template.versions.map((v) => (
              <li key={v.versionSeq}>
                <Link
                  data-testid={`preview-v${v.versionSeq}`}
                  href={`/workspace/${encodeURIComponent(workspaceId)}/templates/${encodeURIComponent(templateId)}/preview?v=${v.versionSeq}`}
                >
                  v{v.versionSeq}
                </Link>{" "}
                — {v.publishedAt.slice(0, 10)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
