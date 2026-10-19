"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveForm,
  publishForm,
  saveDraft,
} from "@/app/workspace/[workspaceId]/onboarding/actions";
import {
  addDraftField,
  adoptSavedResult,
  initialDraftState,
  reseedDraftState,
  type DraftField,
  type DraftFieldKind,
  type DraftState,
} from "@/components/onboarding/state";

type EditorDefinition = { title: string; fields: DraftState["fields"] };

const KINDS: readonly DraftFieldKind[] = [
  "shortText",
  "longText",
  "number",
  "date",
  "singleChoice",
  "multiChoice",
];

const isChoice = (kind: DraftFieldKind) =>
  kind === "singleChoice" || kind === "multiChoice";

const GENERIC_MESSAGE = "Something went wrong. Please try again in a moment.";

/**
 * Copy a draft field for the outgoing payload: an emptied helpText
 * normalizes to omission — the cleared string is never sent (local
 * state is untouched).
 */
const toPayloadField = ({ helpText, ...field }: DraftField): DraftField =>
  helpText ? { ...field, helpText } : field;

/**
 * P-008-R ES-2A + ES-2B + ES-3 — metadata editing, structure ops, dirty
 * arming, props reseed, save wiring.
 *
 * Editing EXISTING metadata (form name, field label/required/help, option
 * label) updates local state and arms the save control; all of it is
 * client-local — no action invocation, no network/storage/DB delta.
 * Incoming server props flow through `reseedDraftState`: dirty local
 * edits are never clobbered, clean state adopts only a same-or-newer
 * revision (monotonic). ES-2B adds client-local structure operations —
 * add/remove/move-up field and add/remove option — all immutable updates
 * with contiguous 0..n-1 `order`, surviving ids preserved, new rows
 * id-less, retired ids never reassigned.
 *
 * ES-3 save wiring: an explicit press issues ONE saveDraft call with the
 * bounded payload (formId, expectedRevision, name, draftJson). While the
 * action is in flight the whole fieldset plus the outside name/save
 * controls disable. A press clears the prior alert; a typed rejection
 * surfaces the boundary's safe message and a transport rejection the
 * generic message (never internals, ids, or payload text) — edits and
 * the old revision stay, so an explicit retry re-sends the same
 * expectedRevision and stays stale-guarded. Success adopts the
 * server-normalized definition wholesale via `adoptSavedResult`.
 *
 * ES-4a lifecycle controls (publish/archive) sit outside the fieldset
 * and share the save pending scope — ANY in-flight mutation disables
 * name/fieldset/save/publish/archive together. Publish additionally
 * requires a clean saved-current draft (dirty gates it off); archive
 * stays pressable while dirty. On publish success nothing local is
 * faked: `router.refresh()` requests a client remount so the route
 * re-renders as the closed no-draft surface even when the action-side
 * revalidation was swallowed. On archive success the router navigates
 * to the canonical list — refresh/navigation sit OUTSIDE the action
 * catch so either failure can never misreport a committed mutation.
 */
export function DraftEditor({
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
  const [state, setState] = useState<DraftState>(() =>
    initialDraftState(initialName, initialRevision, initialDraft),
  );
  const [alert, setAlert] = useState("");
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

  const updateName = (name: string) =>
    setState((prev) => ({ ...prev, name, dirty: true }));

  const addField = (kind: DraftFieldKind) =>
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

  const updateField = (index: number, patch: Partial<DraftField>) =>
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
    // A new press clears any standing alert before the action runs.
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
      let result: Awaited<ReturnType<typeof saveDraft>>;
      try {
        result = await saveDraft(workspaceId, formData);
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
      let result: Awaited<ReturnType<typeof publishForm>>;
      try {
        result = await publishForm(workspaceId, formData);
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
    // draft — the archived form renders it read-only) but never while
    // a mutation is in flight.
    if (pending) {
      return;
    }
    setAlert("");
    const formData = new FormData();
    formData.set("formId", formId);
    startLifecycleTransition(async () => {
      let result: Awaited<ReturnType<typeof archiveForm>>;
      try {
        result = await archiveForm(workspaceId, formData);
      } catch {
        setAlert(GENERIC_MESSAGE);
        return;
      }
      if (!result.ok) {
        setAlert(result.message);
        return;
      }
      // Outside the action catch — a navigation failure cannot misreport
      // the committed archive as a failed mutation.
      router.push(
        `/workspace/${encodeURIComponent(workspaceId)}/onboarding/forms`,
      );
    });
  };

  return (
    <>
      <div className="auth-form">
        <label className="auth-field" htmlFor="onboarding-form-name">
          Form name
          <input
            className="auth-input"
            data-testid="form-name"
            disabled={pending}
            id="onboarding-form-name"
            onChange={(e) => updateName(e.target.value)}
            type="text"
            value={state.name}
          />
        </label>
      </div>
      <fieldset data-testid="draft-editor" disabled={pending}>
        <div className="auth-form">
          {state.fields.map((field, index) => (
            <div className="auth-field" key={index}>
              <label htmlFor={`field-label-${index}`}>
                {`Field ${index + 1} (${field.kind})`}
                <input
                  className="auth-input"
                  data-testid={`field-label-${index}`}
                  id={`field-label-${index}`}
                  onChange={(e) =>
                    updateField(index, { label: e.target.value })
                  }
                  type="text"
                  value={field.label}
                />
              </label>
              <label htmlFor={`field-required-${index}`}>
                Required
                <input
                  data-testid={`field-required-${index}`}
                  id={`field-required-${index}`}
                  onChange={(e) =>
                    updateField(index, { required: e.target.checked })
                  }
                  checked={field.required}
                  type="checkbox"
                />
              </label>
              <label htmlFor={`field-help-${index}`}>
                Help text
                <input
                  className="auth-input"
                  data-testid={`field-help-${index}`}
                  id={`field-help-${index}`}
                  onChange={(e) =>
                    updateField(index, { helpText: e.target.value })
                  }
                  type="text"
                  value={field.helpText ?? ""}
                />
              </label>
              {isChoice(field.kind) ? (
                <div data-testid={`field-options-${index}`}>
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
                        onClick={() => removeOption(index, oi)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    data-testid={`add-option-${index}`}
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
                  disabled={index === 0}
                  onClick={() => moveFieldUp(index)}
                  type="button"
                >
                  Up
                </button>
                <button
                  aria-label={`Remove field ${index + 1}`}
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
                data-testid={`add-field-${kind}`}
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
      <div role="alert">{alert}</div>
      <button
        className="auth-button"
        data-testid="save-draft"
        disabled={pending || !state.dirty}
        onClick={save}
        type="button"
      >
        Save draft
      </button>
      <button
        className="auth-button"
        data-testid="publish-form"
        disabled={pending || state.dirty}
        onClick={publish}
        type="button"
      >
        Publish
      </button>
      <button
        className="auth-button"
        data-testid="archive-form"
        disabled={pending}
        onClick={archive}
        type="button"
      >
        Archive
      </button>
      <Link
        data-testid="preview-draft-link"
        href={`/workspace/${encodeURIComponent(workspaceId)}/onboarding/forms/${formId}/preview`}
      >
        Preview draft
      </Link>
    </>
  );
}
