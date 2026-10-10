import { forbidden, notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { getCheckInFormForWorkspace } from "@/lib/checkin/forms-boundary";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Check-In Form Preview" };

type CheckInField = import("@/lib/checkin/forms").CheckInField;

/**
 * P-025-A — zero-mutation Check-In form definition preview.
 *
 * Read-only server component on the SAME guarded read as the editor
 * (`getCheckInFormForWorkspace` re-resolves membership/role/workspace per
 * request — denied roles, foreign form ids, nonexistent ids all fail
 * closed to the identical non-disclosing 403). The preview mounts no
 * <form>, no submit/button, no action import, no client/storage touch —
 * it cannot persist anything.
 *
 * `src` selection is explicit with NO silent fallback: missing or
 * `src=draft` → the current OPEN draft (none → same safe fail);
 * `src=version` → the LATEST frozen published version (zero history →
 * same fail); an unknown, malformed, or duplicated `src` → the same
 * non-disclosing denial — never a draft fallback, never a fabricated
 * empty version. Archived forms keep their published history readable —
 * archived means permanently read-only, not unreadable.
 */
function PreviewField({ field }: { field: CheckInField }) {
  const id = `checkin-preview-field-${field.fieldId}`;
  const label = (
    <>
      <span data-testid="checkin-preview-field-label">{field.label}</span>
      {field.required ? <span aria-hidden="true"> *</span> : null}
    </>
  );
  if (field.kind === "singleChoice" || field.kind === "multiChoice") {
    return (
      <fieldset className="auth-field" disabled>
        <legend>{label}</legend>
        {field.helpText ? <p className="auth-hint">{field.helpText}</p> : null}
        {(field.options ?? []).map((option) => (
          <label key={option.optionId}>
            <input
              disabled
              type={field.kind === "singleChoice" ? "radio" : "checkbox"}
            />{" "}
            {option.label}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      {field.helpText ? (
        <p className="auth-hint" id={`${id}-hint`}>
          {field.helpText}
        </p>
      ) : null}
      {field.kind === "longText" ? (
        <textarea className="auth-input" disabled id={id} rows={3} />
      ) : (
        <input
          className="auth-input"
          disabled
          id={id}
          type={
            field.kind === "number"
              ? "number"
              : field.kind === "date"
                ? "date"
                : "text"
          }
        />
      )}
    </div>
  );
}

export default async function CheckInFormPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; formId: string }>;
  searchParams: Promise<{ src?: string | string[] }>;
}) {
  if (!isCheckInsEnabled()) notFound();
  const { workspaceId, formId } = await params;
  const { src: rawSrc } = await searchParams;
  const { session } = await requireSessionUser();
  const result = await getCheckInFormForWorkspace(session, {
    workspaceId,
    formId,
  });
  if (!result.ok) forbidden();
  const form = result.value;

  // Explicit src resolution — a duplicated ?src arrives as an array and
  // is malformed; anything other than draft|version fails closed. No
  // defaulting, no fallback.
  const src = rawSrc === undefined ? "draft" : rawSrc;
  if (src !== "draft" && src !== "version") forbidden();
  const resolved =
    src === "draft"
      ? form.draft === null
        ? null
        : { definition: form.draft, source: "draft" as const }
      : form.versions.length === 0
        ? null
        : {
            definition: form.versions[form.versions.length - 1].definition,
            source:
              `version ${form.versions[form.versions.length - 1].versionSeq}` as const,
          };
  // No open draft / no published history → the same non-disclosing
  // denial — never an empty or fabricated surface.
  if (resolved === null) forbidden();
  const { definition } = resolved;

  return (
    <div className="catalog-page" data-testid="checkin-form-preview">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Check-In Forms</p>
        <h1 className="app-title">Form preview</h1>
      </header>
      <p className="app-lede" data-testid="checkin-preview-source">
        Previewing {resolved.source}
      </p>
      <div data-testid="checkin-preview-fields">
        {[...definition.fields]
          .sort((a, b) => a.order - b.order)
          .map((field) => (
            <PreviewField field={field} key={field.fieldId} />
          ))}
      </div>
    </div>
  );
}
