import { forbidden, notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCoachingTemplatesEnabled } from "@/lib/coaching/gate";
import { getTemplateVersionForWorkspace } from "@/lib/coaching/templates-boundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Template Version Preview" };

import type { TemplateVersionDefinition as VersionDefinition } from "@/lib/coaching/templates-boundary";

/**
 * P-014 — immutable published-version preview (zero mutation).
 *
 * Read-only server component on the same guarded read path — membership,
 * role, and workspace are re-resolved per request and every denial is the
 * identical non-disclosing 403. `v` selection is explicit: missing or
 * malformed → denial, never a silent fallback to another version.
 *
 * The preview mounts no form, no submit, no action import, and no
 * client-side mutation surface — it cannot persist anything.
 */
export default async function TemplatePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; templateId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    notFound();
  const { workspaceId, templateId } = await params;
  const { v } = await searchParams;
  const { session } = await requireSessionUser();

  const seq = /^[0-9]{1,9}$/.test(v ?? "") ? Number(v) : null;
  if (seq === null) forbidden();
  const result = await getTemplateVersionForWorkspace(session, {
    workspaceId,
    templateId,
    versionSeq: seq,
  });
  if (!result.ok) forbidden();
  const def: VersionDefinition = result.value.definition;

  return (
    <div className="catalog-page" data-testid="template-preview-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Published version</p>
        <h1 className="app-title">
          {def.title} — v{result.value.versionSeq}
        </h1>
        <p className="app-lede">
          Immutable snapshot published {result.value.publishedAt.slice(0, 10)}.
          This view cannot be edited.
        </p>
      </header>
      {def.sections.map((section) => (
        <section key={section.sectionId} data-testid="preview-section">
          <h2>{section.label}</h2>
          <ul>
            {[...section.items]
              .sort((a, b) => a.order - b.order)
              .map((item) => {
                const param = def.parameters[item.parameterId];
                return (
                  <li key={item.itemId} data-testid="preview-item">
                    <span data-testid="preview-item-label">
                      {param?.label ?? "(parameter)"}
                    </span>
                    {item.required ? <span aria-hidden="true"> *</span> : null}
                    {param?.kind ? (
                      <span className="auth-hint"> — {param.kind}</span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
