"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import type {
  OwnFormField,
  OwnOnboardingDetail,
  OwnSubmittedAnswer,
} from "@/lib/onboarding/submissions-boundary";

import { submitOnboardingAction, type SubmitOnboardingState } from "./actions";

/**
 * P-023 — client onboarding fill/submitted panel (decisions #82–#85).
 *
 * Single-session, no-draft fill; review-your-answers confirmation with an
 * irreversibility disclosure; submit exactly once; read-only submitted
 * view. `beforeunload` is registered only once the form becomes dirty,
 * removed immediately after a committed submission, and removed on
 * unmount — it never traps a submitted or untouched form.
 *
 * Browser-side values travel as the bounded `answersJson` array only.
 * Field/option IDs are the published definition's own opaque identifiers.
 */

type FillState = Record<string, string | string[]>;

function emptyAnswers(fields: readonly OwnFormField[]): FillState {
  const out: FillState = {};
  for (const f of fields) out[f.fieldId] = f.kind === "multiChoice" ? [] : "";
  return out;
}

function isEmpty(field: OwnFormField, v: string | string[]): boolean {
  if (field.kind === "multiChoice") return Array.isArray(v) && v.length === 0;
  return typeof v === "string" && v.trim().length === 0;
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
  error,
}: {
  field: OwnFormField;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  disabled: boolean;
  error: string | null;
}) {
  const id = `ob-f-${field.fieldId}`;
  const errId = `${id}-err`;
  const label = (
    <span>
      {field.label}
      {field.required ? " *" : ""}
    </span>
  );
  const describedBy =
    [field.helpText ? `${id}-help` : null, error ? errId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const help = field.helpText ? (
    <span className="daily-todo" id={`${id}-help`}>
      {field.helpText}
    </span>
  ) : null;
  const err = error ? (
    <span className="daily-errors" id={errId} role="alert">
      {error}
    </span>
  ) : null;

  switch (field.kind) {
    case "shortText":
      return (
        <div className="daily-field">
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            className="catalog-search__input"
            type="text"
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
          {err}
        </div>
      );
    case "longText":
      return (
        <div className="daily-field">
          <label htmlFor={id}>{label}</label>
          <textarea
            id={id}
            className="catalog-search__input"
            rows={4}
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
          {err}
        </div>
      );
    case "number":
      return (
        <div className="daily-field">
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            className="catalog-search__input"
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
          {err}
        </div>
      );
    case "date":
      return (
        <div className="daily-field">
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            className="catalog-search__input"
            type="date"
            min="1900-01-01"
            max="2100-12-31"
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
          {err}
        </div>
      );
    case "singleChoice":
      return (
        <div className="daily-field">
          <label htmlFor={id}>{label}</label>
          <select
            id={id}
            className="catalog-search__input"
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {field.options.map((o) => (
              <option key={o.optionId} value={o.optionId}>
                {o.label}
              </option>
            ))}
          </select>
          {help}
          {err}
        </div>
      );
    case "multiChoice": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset className="daily-field" aria-describedby={describedBy}>
          <legend>{label}</legend>
          {field.options.map((o) => {
            const optId = `${id}-${o.optionId}`;
            return (
              <label
                key={o.optionId}
                htmlFor={optId}
                className="daily-field"
                style={{ minHeight: "44px", display: "flex", gap: "0.5rem" }}
              >
                <input
                  id={optId}
                  type="checkbox"
                  disabled={disabled}
                  checked={selected.includes(o.optionId)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, o.optionId]
                      : selected.filter((x) => x !== o.optionId);
                    onChange(next);
                  }}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
          {help}
          {err}
        </fieldset>
      );
    }
    default:
      return null;
  }
}

export function OnboardingPanel({
  workspaceId,
  detail,
}: {
  workspaceId: string;
  detail: Extract<OwnOnboardingDetail, { state: "ready" | "submitted" }>;
}) {
  if (detail.state === "submitted") {
    return (
      <SubmittedView
        title={detail.title}
        submittedAt={detail.submittedAt}
        answers={detail.answers}
      />
    );
  }
  return <FillForm workspaceId={workspaceId} detail={detail} />;
}

function SubmittedView({
  title,
  submittedAt,
  answers,
}: {
  title: string;
  submittedAt: string;
  answers: OwnSubmittedAnswer[];
}) {
  return (
    <section
      className="daily-entry"
      aria-label="Submitted form"
      data-testid="onboarding-submitted"
    >
      <h1 className="app-title">{title}</h1>
      <p className="app-lede" role="status" aria-live="polite">
        Submitted on {submittedAt.slice(0, 10)} — this form was already
        submitted. Your original answers were kept and cannot be changed.
      </p>
      <ul data-testid="onboarding-submitted-answers">
        {answers.map((a) => (
          <li key={a.fieldId}>
            <strong>{a.label}</strong>: {a.display}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FillForm({
  workspaceId,
  detail,
}: {
  workspaceId: string;
  detail: Extract<OwnOnboardingDetail, { state: "ready" }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FillState>(() =>
    emptyAnswers(detail.fields),
  );
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<
    null | "submitted" | "already_submitted"
  >(null);
  const [state, formAction, pending] = useActionState<
    SubmitOnboardingState,
    FormData
  >(submitOnboardingAction, { ok: "idle" });

  // Dirty-only beforeunload: registered once answers are modified,
  // removed after a committed submission and on unmount.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (!dirty || submittedRef.current) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (state.ok === true && !submittedRef.current) {
      submittedRef.current = true;
      setDirty(false);
      setSubmitted(state.status);
      router.refresh();
    }
  }, [state, router]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    for (const f of detail.fields) {
      const v = values[f.fieldId];
      if (isEmpty(f, v)) {
        if (f.required) errors[f.fieldId] = "This answer is required.";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildAnswersJson = (): string =>
    JSON.stringify(
      detail.fields
        .filter((f) => !isEmpty(f, values[f.fieldId]))
        .map((f) => ({ fieldId: f.fieldId, value: values[f.fieldId] })),
    );

  const onChange = (fieldId: string, v: string | string[]) => {
    setDirty(true);
    setFieldErrors((e) => {
      if (!(fieldId in e)) return e;
      const next = { ...e };
      delete next[fieldId];
      return next;
    });
    setValues((s) => ({ ...s, [fieldId]: v }));
  };

  if (submitted !== null) {
    return (
      <section
        className="daily-entry"
        aria-label="Submitted form"
        data-testid="onboarding-submit-done"
      >
        <h1 className="app-title">{detail.title}</h1>
        <p className="app-lede" role="status" aria-live="polite">
          {submitted === "already_submitted"
            ? "This form was already submitted. Your original answers were kept."
            : "Thank you — your answers were submitted and can no longer be changed."}
        </p>
      </section>
    );
  }

  const firstErrorField = detail.fields.find((f) => fieldErrors[f.fieldId]);

  if (confirming) {
    return (
      <section
        className="daily-entry"
        aria-label="Review and submit"
        data-testid="onboarding-confirm"
      >
        <h1 className="app-title">Review — {detail.title}</h1>
        <p className="app-lede">
          Review your answers. Submitting is <strong>irreversible</strong>: you
          cannot change, resubmit, or delete them afterwards.
        </p>
        <ul>
          {detail.fields
            .filter((f) => !isEmpty(f, values[f.fieldId]))
            .map((f) => {
              const v = values[f.fieldId];
              const display =
                f.kind === "singleChoice"
                  ? (f.options.find((o) => o.optionId === v)?.label ?? "")
                  : f.kind === "multiChoice"
                    ? (Array.isArray(v) ? v : [])
                        .map(
                          (id) =>
                            f.options.find((o) => o.optionId === id)?.label ??
                            "",
                        )
                        .join(", ")
                    : String(v);
              return (
                <li key={f.fieldId}>
                  <strong>{f.label}</strong>: {display}
                </li>
              );
            })}
        </ul>
        <form
          action={(fd: FormData) => {
            fd.set("answersJson", buildAnswersJson());
            formAction(fd);
          }}
        >
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input
            type="hidden"
            name="assignmentId"
            value={detail.assignmentId}
          />
          <input type="hidden" name="answersJson" value="[]" />
          {state.ok === false ? (
            <p className="daily-errors" role="alert">
              {state.message}
            </p>
          ) : null}
          <div className="daily-actions">
            <button
              type="submit"
              className="catalog-search__submit"
              disabled={pending}
              data-testid="onboarding-confirm-submit"
            >
              {pending ? "Submitting…" : "Submit answers"}
            </button>
            <button
              type="button"
              className="roster-pagination__link"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Go back and edit
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section
      className="daily-entry"
      aria-label="Onboarding form"
      data-testid="onboarding-fill"
    >
      <h1 className="app-title">{detail.title}</h1>
      <p className="app-lede">
        Answer every required field (*). This form must be completed in one
        sitting — nothing is saved until you submit, and submitting is
        irreversible.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (validate()) setConfirming(true);
          else if (firstErrorField)
            document.getElementById(`ob-f-${firstErrorField.fieldId}`)?.focus();
        }}
      >
        {Object.keys(fieldErrors).length > 0 ? (
          <p
            className="daily-errors"
            role="alert"
            data-testid="onboarding-error-summary"
          >
            Some answers need attention — check the highlighted fields.
          </p>
        ) : null}
        {detail.fields.map((f) => (
          <FieldControl
            key={f.fieldId}
            field={f}
            value={values[f.fieldId]}
            onChange={(v) => onChange(f.fieldId, v)}
            disabled={pending}
            error={fieldErrors[f.fieldId] ?? null}
          />
        ))}
        <div className="daily-actions">
          <button
            type="submit"
            className="catalog-search__submit"
            disabled={pending}
            data-testid="onboarding-review"
          >
            Review answers
          </button>
        </div>
      </form>
    </section>
  );
}
