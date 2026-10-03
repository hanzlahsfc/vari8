"use client";

import { useState } from "react";

import {
  initialDraftState,
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
 * P-008-R ES-2 callable scaffold — REAL selector surface, INERT handlers.
 *
 * Renders the pinned contract surface (`form-name`, `field-label-*`,
 * `field-required-*`, `field-help-*`, `field-options-*`, `add-option-*`,
 * `add-field-*`, `save-draft`, an empty `role="alert"` region) from the
 * actual mounted props via `initialDraftState`. Every handler is a no-op:
 * no edits, no dirty arming, no props reseed, no save action invocation —
 * those behaviors land in the committed-increment cycles gated by the
 * DOM harness and the browser suite. This component is testable-only,
 * never a shipped state: no fake alerts, no fake answers, no fabricated
 * state.
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
  const [state] = useState<DraftState>(() =>
    initialDraftState(initialName, initialRevision, initialDraft),
  );

  return (
    <>
      <div className="auth-form">
        <label className="auth-field" htmlFor="onboarding-form-name">
          Form name
          <input
            className="auth-input"
            data-testid="form-name"
            id="onboarding-form-name"
            onChange={noop}
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
                  onChange={noop}
                  type="text"
                  value={field.label}
                />
              </label>
              <label htmlFor={`field-required-${index}`}>
                Required
                <input
                  data-testid={`field-required-${index}`}
                  id={`field-required-${index}`}
                  onChange={noop}
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
                  onChange={noop}
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
                        onChange={noop}
                        placeholder="Option label"
                        type="text"
                        value={option.label}
                      />
                      <button
                        aria-label={`Remove option ${oi + 1}`}
                        onClick={noop}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    data-testid={`add-option-${index}`}
                    onClick={noop}
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
                  onClick={noop}
                  type="button"
                >
                  Up
                </button>
                <button
                  aria-label={`Remove field ${index + 1}`}
                  onClick={noop}
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
                onClick={noop}
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
