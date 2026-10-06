import Link from "next/link";
import { forbidden } from "next/navigation";

import { DraftEditor } from "@/components/onboarding/draft-editor";
import { OpenDraftButton } from "@/components/onboarding/open-draft-button";
import { requireSessionUser } from "@/lib/auth/route-guard";
import { getFormForWorkspace } from "@/lib/onboarding/forms-boundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Onboarding Form" };

type FormDefinition = import("@/lib/onboarding/forms").FormDefinition;
type FormField = import("@/lib/onboarding/forms").FormField;

/**
 * P-008 5C-2a — canonical editor route, MOUNT + READ GUARDS only.
 *
 * Session gate first, then the per-page resource read goes through the
 * boundary (`getFormForWorkspace`): the guarded service re-resolves
 * membership/role/workspace on every request and scopes the lookup to the
 * current workspace, so denied roles, foreign form ids, nonexistent ids and
 * malformed segments all fail closed to the same non-disclosing HTTP 403.
 *
 * ES-2 mount wiring: an OPEN draft on a non-archived form mounts the
 * callable `DraftEditor` scaffold (editor-ready surface, inert handlers —
 * editing/save behaviors land in their own increments).
 *
 * ES-4a closed-branch wiring: a NON-archived form with no open draft
 * mounts `OpenDraftButton` (reopen + archive are the only controls on
 * that surface). Every other state — archived (with or without a
 * preserved draft) — stays the fully read-only rendering from 5C-2a:
 * reopen is never offered on an archived form.
 */
function OrderedDraftFields({ draft }: { draft: FormDefinition }) {
  const fields = [...draft.fields].sort((a, b) => a.order - b.order);
  return (
    <fieldset data-testid="draft-editor" disabled>
      {fields.map((field) => (
        <FieldReadOnly field={field} key={field.fieldId} />
      ))}
    </fieldset>
  );
}

function FieldReadOnly({ field }: { field: FormField }) {
  const id = `field-${field.fieldId}`;
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

export default async function OnboardingFormEditorPage({
  params,
}: {
  params: Promise<{ workspaceId: string; formId: string }>;
}) {
  const { workspaceId, formId } = await params;
  const { session } = await requireSessionUser();
  const result = await getFormForWorkspace(session, { workspaceId, formId });
  if (!result.ok) forbidden();
  const form = result.value;
  const archived = form.status === "ARCHIVED";

  return (
    <div className="catalog-page" data-testid="onboarding-form-editor">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Onboarding Forms</p>
        <h1 className="app-title">Form definition</h1>
      </header>
      {archived ? (
        <p className="auth-error" data-testid="archived-banner">
          This form is archived and permanently read-only.
        </p>
      ) : null}
      {form.draft !== null && !archived ? (
        <DraftEditor
          formId={formId}
          initialDraft={form.draft}
          initialName={form.name}
          initialRevision={form.draftRevision}
          workspaceId={workspaceId}
        />
      ) : (
        <>
          <div className="auth-form">
            <label className="auth-field" htmlFor="onboarding-form-name">
              Form name
              <input
                className="auth-input"
                data-testid="form-name"
                defaultValue={form.name}
                disabled
                id="onboarding-form-name"
                readOnly
                type="text"
              />
            </label>
          </div>
          {form.draft !== null ? (
            <OrderedDraftFields draft={form.draft} />
          ) : (
            <>
              <p className="app-lede" data-testid="no-draft">
                No draft is open.
              </p>
              {!archived ? (
                <OpenDraftButton formId={formId} workspaceId={workspaceId} />
              ) : null}
              {!archived && form.versions.length > 0 ? (
                <Link
                  data-testid="preview-version-link"
                  href={`/workspace/${encodeURIComponent(workspaceId)}/onboarding/forms/${formId}/preview?src=version`}
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
