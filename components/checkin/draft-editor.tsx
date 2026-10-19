"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  archiveCheckInForm,
  publishCheckInForm,
  saveCheckInDraft,
} from "@/app/workspace/[workspaceId]/checkins/actions";
import {
  addDraftField,
  adoptSavedResult,
  initialDraftState,
  reseedDraftState,
  type CheckInDraftField,
  type CheckInDraftFieldKind,
  type CheckInDraftState,
} from "@/components/checkin/state";

type EditorDefinition = { title: string; fields: CheckInDraftState["fields"] };

const KINDS: readonly CheckInDraftFieldKind[] = [
  "shortText",
  "longText",
  "number",
  "date",
  "singleChoice",
  "multiChoice",
];

const isChoice = (kind: CheckInDraftFieldKind) =>
  kind === "singleChoice" || kind === "multiChoice";

const GENERIC_MESSAGE = "Something went wrong. Please try again in a moment.";

/**
 * Copy a draft field for the outgoing payload: an emptied helpText
 * normalizes to omission — the cleared string is never sent (local
 * state is untouched).
 */
const toPayloadField = ({
  helpText,
  ...field
}: CheckInDraftField): CheckInDraftField =>
  helpText ? { ...field, helpText } : field;

/**
 * P-025-A Check-In draft editor — metadata editing, structure ops, dirty
 * arming + `beforeunload`, props reseed, save/publish/archive wiring.
 *
 * All editing is client-local until an explicit control press; one shared
 * pending scope disables every mutation control while any action is in
 * flight. Publish requires a clean saved-current draft; archive is a
 * two-step destructive confirmation (press once → Confirm archive/Cancel,
 * mirroring the reviewed parameter-manager pattern). Dirty state arms a
 * `beforeunload` navigation warning that is removed after a successful
 * save and on unmount.
 */
export function CheckInDraftEditor({
  workspaceId,
  formId,
  initialName,
  initialRevision,
  initialDraft,
}: {
  workspaceId: string;
  formId: string;
  initialName: string;
  initialRevision: number;
  initialDraft: EditorDefinition;
}) {
  const router = useRouter();
  const [state, setState] = useState<CheckInDraftState>(() =>
    initialDraftState(initialName, initialRevision, initialDraft),
  );
  const [alert, setAlert] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [savePending, startSaveTransition] = useTransition();
  const [lifecyclePending, startLifecycleTransition] = useTransition();
  // One pending scope for the mounted branch: any in-flight mutation
  // (save or lifecycle) disables every mutation control.
  const pending = savePending || lifecyclePending;

  // Route incoming server props through the monotonic seam.
  const [prevSeed, setPrevSeed] = useState<
    readonly [string, number, EditorDefinition]
  >([initialName, initialRevision, initialDraft]);
  if (
    prevSeed[0] !== initialName ||
    prevSeed[1] !== initialRevision ||
    prevSeed[2] !== initialDraft
  ) {
    setPrevSeed([initialName, initialRevision, initialDraft]);
    setState((prev) =>
      reseedDraftState(
        prev,
        initialDraftState(initialName, initialRevision, initialDraft),
      ),
    );
  }

  // Dirty-form navigation warning — armed only while edits are unsaved,
  // removed after a successful save (dirty clears) and on unmount.
  useEffect(() => {
    if (!state.dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.dirty]);

  const updateName = (name: string) =>
    setState((prev) => ({ ...prev, name, dirty: true }));

  const addField = (kind: CheckInDraftFieldKind) =>
    setState((prev) => addDraftField(prev, kind));

  const removeField = (index: number) =>
    setState((prev) => ({
      ...prev,
      dirty: true,
      fields: prev.fields
        .filter((_, i) => i !== index)
        .map((f, i) => (f.order === i ? f : { ...f, order: i })),
    }));

  const moveFieldUp = (index: number) =>
    setState((prev) => {
      if (index <= 0 || index >= prev.fields.length) {
        return prev;
      }
      const fields = prev.fields.slice();
      [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
      return {
        ...prev,
        dirty: true,
        fields: fields.map((f, i) => (f.order === i ? f : { ...f, order: i })),
      };
    });

  const addOption = (fieldIndex: number) =>
    setState((prev) => ({
      ...prev,
      dirty: true,
      fields: prev.fields.map((f, i) =>
        i === fieldIndex
          ? { ...f, options: [...(f.options ?? []), { label: "" }] }
          : f,
      ),
    }));

  const removeOption = (fieldIndex: number, optionIndex: number) =>
    setState((prev) => ({
      ...prev,
      dirty: true,
      fields: prev.fields.map((f, i) =>
        i === fieldIndex
          ? {
              ...f,
              options: (f.options ?? []).filter((_, j) => j !== optionIndex),
            }
          : f,
      ),
    }));

  const updateField = (index: number, patch: Partial<CheckInDraftField>) =>
    setState((prev) => ({
      ...prev,
      dirty: true,
      fields: prev.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));

  const updateOption = (
    fieldIndex: number,
    optionIndex: number,
    label: string,
  ) =>
    setState((prev) => ({
      ...prev,
      dirty: true,
      fields: prev.fields.map((f, i) =>
        i === fieldIndex
          ? {
              ...f,
              options: (f.options ?? []).map((o, j) =>
                j === optionIndex ? { ...o, label } : o,
              ),
            }
          : f,
      ),
    }));

  const save = () => {
    // Explicit pending/clean guard — a press on a disabled control or a
    // double dispatch can never issue a second action call.
    if (pending || !state.dirty) {
      return;
    }
    setAlert("");
    const formData = new FormData();
    formData.set("formId", formId);
    formData.set("expectedRevision", String(state.revision));
    formData.set("name", state.name);
    formData.set(
      "draftJson",
      JSON.stringify({
        title: state.name,
        fields: state.fields.map(toPayloadField),
      }),
    );
    startSaveTransition(async () => {
      let result: Awaited<ReturnType<typeof saveCheckInDraft>>;
      try {
        result = await saveCheckInDraft(workspaceId, formData);
      } catch {
        // Transport rejection — the outcome is unknown (a committed-but-
        // lost response is possible). Surface the generic message only;
        // edits and the old revision stay so an explicit retry remains
        // stale-guarded. Never blindly retry, never echo internals.
        setAlert(GENERIC_MESSAGE);
        return;
      }
      if (result.ok) {
        setState((prev) => adoptSavedResult(prev, result.value));
      } else {
        setAlert(result.message);
      }
    });
  };

  const publish = () => {
    // Publish requires a saved-current clean draft and no in-flight
    // mutation — a dirty or already-pending press can never fire.
    if (pending || state.dirty) {
      return;
    }
    setAlert("");
    const formData = new FormData();
    formData.set("formId", formId);
    formData.set("expectedRevision", String(state.revision));
    startLifecycleTransition(async () => {
      let result: Awaited<ReturnType<typeof publishCheckInForm>>;
      try {
        result = await publishCheckInForm(workspaceId, formData);
      } catch {
        // Unknown outcome (a committed-but-lost response is possible):
        // generic alert only, state/revision preserved so an explicit
        // retry re-sends the SAME expectedRevision (replay-safe).
        setAlert(GENERIC_MESSAGE);
        return;
      }
      if (!result.ok) {
        setAlert(result.message);
        return;
      }
      // Success — request a client refresh so the consumed draft
      // remounts as the closed surface even when the action-side
      // revalidation was swallowed. Outside the action catch: a
      // refresh failure can never misreport the committed publish,
      // and an editable editor can never persist on a consumed draft.
      router.refresh();
    });
  };

  const archive = () => {
    // Archive is pressable even while dirty (the service preserves the
    // draft — the archived form renders it read-only) but never while a
    // mutation is in flight, and only through the two-step confirmation.
    if (pending) {
      return;
    }
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    setAlert("");
    const formData = new FormData();
    formData.set("formId", formId);
    startLifecycleTransition(async () => {
      let result: Awaited<ReturnType<typeof archiveCheckInForm>>;
      try {
        result = await archiveCheckInForm(workspaceId, formData);
      } catch {
        setAlert(GENERIC_MESSAGE);
        return;
      }
      if (!result.ok) {
        setAlert(result.message);
        setConfirmArchive(false);
        return;
      }
      // Outside the action catch — a navigation failure cannot misreport
      // the committed archive as a failed mutation.
      router.push(
        `/workspace/${encodeURIComponent(workspaceId)}/checkins/forms`,
      );
    });
  };

  return (
    <>
      <div className="auth-form">
        <label className="auth-field" htmlFor="checkin-form-name">
          Check-In form name
          <input
            className="auth-input"
            data-testid="checkin-form-name"
            disabled={pending}
            id="checkin-form-name"
            onChange={(e) => updateName(e.target.value)}
            type="text"
            value={state.name}
          />
        </label>
      </div>
      <fieldset data-testid="checkin-draft-editor" disabled={pending}>
        <div className="auth-form">
          {state.fields.map((field, index) => (
            <div className="auth-field" key={index}>
              <label htmlFor={`checkin-field-label-${index}`}>
                {`Field ${index + 1} (${field.kind})`}
                <input
                  className="auth-input"
                  data-testid={`checkin-field-label-${index}`}
                  id={`checkin-field-label-${index}`}
                  onChange={(e) =>
                    updateField(index, { label: e.target.value })
                  }
                  type="text"
                  value={field.label}
                />
              </label>
              <label htmlFor={`checkin-field-required-${index}`}>
                Required
                <input
                  data-testid={`checkin-field-required-${index}`}
                  id={`checkin-field-required-${index}`}
                  onChange={(e) =>
                    updateField(index, { required: e.target.checked })
                  }
                  checked={field.required}
                  type="checkbox"
                />
              </label>
              <label htmlFor={`checkin-field-help-${index}`}>
                Help text
                <input
                  className="auth-input"
                  data-testid={`checkin-field-help-${index}`}
                  id={`checkin-field-help-${index}`}
                  onChange={(e) =>
                    updateField(index, { helpText: e.target.value })
                  }
                  type="text"
                  value={field.helpText ?? ""}
                />
              </label>
              {isChoice(field.kind) ? (
                <div data-testid={`checkin-field-options-${index}`}>
                  {(field.options ?? []).map((option, oi) => (
                    <div key={oi}>
                      <input
                        aria-label={`Option ${oi + 1}`}
                        className="auth-input"
                        onChange={(e) =>
                          updateOption(index, oi, e.target.value)
                        }
                        placeholder="Option label"
                        type="text"
                        value={option.label}
                      />
                      <button
                        aria-label={`Remove option ${oi + 1}`}
                        className="auth-button"
                        onClick={() => removeOption(index, oi)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    className="auth-button"
                    data-testid={`checkin-add-option-${index}`}
                    onClick={() => addOption(index)}
                    type="button"
                  >
                    Add option
                  </button>
                </div>
              ) : null}
              <div>
                <button
                  aria-label={`Move field ${index + 1} up`}
                  className="auth-button"
                  disabled={index === 0}
                  onClick={() => moveFieldUp(index)}
                  type="button"
                >
                  Up
                </button>
                <button
                  aria-label={`Remove field ${index + 1}`}
                  className="auth-button"
                  onClick={() => removeField(index)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div>
            {KINDS.map((kind) => (
              <button
                className="auth-button"
                data-testid={`checkin-add-field-${kind}`}
                key={kind}
                onClick={() => addField(kind)}
                type="button"
              >
                {`Add ${kind}`}
              </button>
            ))}
          </div>
        </div>
      </fieldset>
      <div aria-live="polite" data-testid="checkin-alert" role="alert">
        {alert}
      </div>
      <button
        className="auth-button"
        data-testid="checkin-save-draft"
        disabled={pending || !state.dirty}
        onClick={save}
        type="button"
      >
        Save draft
      </button>
      <button
        className="auth-button"
        data-testid="checkin-publish-form"
        disabled={pending || state.dirty}
        onClick={publish}
        type="button"
      >
        Publish
      </button>
      {confirmArchive ? (
        <>
          <button
            className="auth-button"
            data-testid="checkin-archive-confirm"
            disabled={pending}
            onClick={archive}
            type="button"
          >
            Confirm archive
          </button>
          <button
            data-testid="checkin-archive-cancel"
            disabled={pending}
            onClick={() => setConfirmArchive(false)}
            type="button"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          className="auth-button"
          data-testid="checkin-archive-form"
          disabled={pending}
          onClick={archive}
          type="button"
        >
          Archive
        </button>
      )}
      <Link
        data-testid="checkin-preview-draft-link"
        href={`/workspace/${encodeURIComponent(workspaceId)}/checkins/forms/${formId}/preview`}
      >
        Preview draft
      </Link>
    </>
  );
}
