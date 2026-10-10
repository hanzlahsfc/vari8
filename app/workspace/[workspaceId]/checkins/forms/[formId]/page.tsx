import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { CheckInDraftEditor } from "@/components/checkin/draft-editor";
import { CheckInOpenDraftButton } from "@/components/checkin/open-draft-button";
import { requireSessionUser } from "@/lib/auth/route-guard";
import { getCheckInFormForWorkspace } from "@/lib/checkin/forms-boundary";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Check-In Form" };

type CheckInDefinition = import("@/lib/checkin/forms").CheckInDefinition;
type CheckInField = import("@/lib/checkin/forms").CheckInField;

/**
 * P-025-A — canonical editor route.
 *
 * Feature resolver FIRST (disabled/untrusted → 404), then session gate,
 * then the per-page resource read goes through the boundary
 * (`getCheckInFormForWorkspace` re-resolves membership/role/workspace per
 * request and scopes the lookup to the current workspace — denied roles,
 * foreign ids, missing ids and malformed segments all fail closed to the
 * same non-disclosing HTTP 403).
 *
 * An OPEN draft on a non-archived form mounts the callable
 * `CheckInDraftEditor`. A non-archived form with no open draft mounts
 * `CheckInOpenDraftButton` (reopen + archive are the only controls).
 * Every other state — archived with or without a preserved draft — stays
 * fully read-only: reopen is never offered on an archived form.
 */
function OrderedDraftFields({ draft }: { draft: CheckInDefinition }) {
  const fields = [...draft.fields].sort((a, b) => a.order - b.order);
  return (
    <fieldset data-testid="checkin-draft-editor" disabled>
      {fields.map((field) => (
        <FieldReadOnly field={field} key={field.fieldId} />
      ))}
    </fieldset>
  );
}

function FieldReadOnly({ field }: { field: CheckInField }) {
  const id = `checkin-field-${field.fieldId}`;
  return (
    <div className="auth-field">
      <label htmlFor={id}>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      {field.helpText ? (
        <p className="auth-hint" id={`${id}-hint`}>
          {field.helpText}
        </p>
      ) : null}
      {field.kind === "longText" ? (
        <textarea className="auth-input" disabled id={id} rows={3} />
      ) : field.kind === "singleChoice" || field.kind === "multiChoice" ? (
        <select className="auth-input" disabled id={id}>
          {(field.options ?? []).map((option) => (
            <option key={option.optionId}>{option.label}</option>
          ))}
        </select>
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

export default async function CheckInFormEditorPage({
  params,
}: {
  params: Promise<{ workspaceId: string; formId: string }>;
}) {
  if (!isCheckInsEnabled()) notFound();
  const { workspaceId, formId } = await params;
  const { session } = await requireSessionUser();
  const result = await getCheckInFormForWorkspace(session, {
    workspaceId,
    formId,
  });
  if (!result.ok) forbidden();
  const form = result.value;
  const archived = form.status === "ARCHIVED";

  return (
    <div className="catalog-page" data-testid="checkin-form-editor">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Check-In Forms</p>
        <h1 className="app-title">Form definition</h1>
      </header>
      {archived ? (
        <p className="auth-error" data-testid="checkin-archived-banner">
          This form is archived and permanently read-only.
        </p>
      ) : null}
      {form.draft !== null && !archived ? (
        <CheckInDraftEditor
          formId={formId}
          initialDraft={form.draft}
          initialName={form.name}
          initialRevision={form.draftRevision}
          workspaceId={workspaceId}
        />
      ) : (
        <>
          <div className="auth-form">
            <label className="auth-field" htmlFor="checkin-form-name">
              Check-In form name
              <input
                className="auth-input"
                data-testid="checkin-form-name"
                defaultValue={form.name}
                disabled
                id="checkin-form-name"
                readOnly
                type="text"
              />
            </label>
          </div>
          {form.draft !== null ? (
            <OrderedDraftFields draft={form.draft} />
          ) : (
            <>
              <p className="app-lede" data-testid="checkin-no-draft">
                No draft is open.
              </p>
              {!archived ? (
                <CheckInOpenDraftButton
                  formId={formId}
                  workspaceId={workspaceId}
                />
              ) : null}
              {!archived && form.versions.length > 0 ? (
                <Link
                  data-testid="checkin-preview-version-link"
                  href={`/workspace/${encodeURIComponent(workspaceId)}/checkins/forms/${formId}/preview?src=version`}
                >
                  Preview latest version
                </Link>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
