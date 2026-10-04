"use client";

import { useEffect, useState } from "react";

import {
  addDraftField,
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

const noop = () => {};

/**
 * P-008-R ES-2A + ES-2B — metadata editing, structure ops, dirty arming,
 * props reseed.
 *
 * Editing EXISTING metadata (form name, field label/required/help, option
 * label) updates local state and arms the save control; all of it is
 * client-local — no action invocation, no network/storage/DB delta.
 * Incoming server props flow through `reseedDraftState`: dirty local
 * edits are never clobbered, clean state adopts only a same-or-newer
 * revision (monotonic). ES-2B adds client-local structure operations —
 * add/remove/move-up field and add/remove option — all immutable updates
 * with contiguous 0..n-1 `order`, surviving ids preserved, new rows
 * id-less, retired ids never reassigned. The save action itself remains
 * INERT for ES-3.
 */
export function DraftEditor({
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
  const [state, setState] = useState<DraftState>(() =>
    initialDraftState(initialName, initialRevision, initialDraft),
  );

  // Route incoming server props through the monotonic seam.
  useEffect(() => {
    setState((prev) =>
      reseedDraftState(
        prev,
        initialDraftState(initialName, initialRevision, initialDraft),
      ),
    );
  }, [initialName, initialRevision, initialDraft]);

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

  return (
    <>
      <div className="auth-form">
        <label className="auth-field" htmlFor="onboarding-form-name">
          Form name
          <input
            className="auth-input"
            data-testid="form-name"
            id="onboarding-form-name"
            onChange={(e) => updateName(e.target.value)}
            type="text"
            value={state.name}
          />
        </label>
      </div>
      <fieldset data-testid="draft-editor">
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
      <div role="alert" />
      <button
        className="auth-button"
        data-testid="save-draft"
        disabled={!state.dirty}
        onClick={noop}
        type="button"
      >
        Save draft
      </button>
    </>
  );
}
