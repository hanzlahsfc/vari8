"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { CHECKIN_RATING_WORD_LABELS } from "@/lib/checkin/forms";
import type {
  CheckInFeedbackItem,
  CheckInField,
  OwnCheckInInstanceDetail,
} from "@/lib/checkin/instances";

import {
  listOwnCheckInFeedbackAction,
  submitCheckInInstanceAction,
  type SubmitCheckInState,
} from "./actions";

/**
 * P-025-B — client Check-In fill/submitted/cancelled panel (decisions
 * #92–#97). One immutable submission per instance; late submission is
 * allowed and marked (#93); cancelled renders a terminal unavailable
 * state (#97).
 *
 * `beforeunload` is registered only once the form is dirty, removed
 * immediately after a committed submission, and removed on unmount — it
 * never traps a submitted or untouched form.
 *
 * Browser-side values travel as the bounded `answersJson` array only.
 * Field/option IDs are the published definition's own opaque identifiers.
 */

type FillState = Record<string, string | string[]>;

function emptyAnswers(fields: readonly CheckInField[]): FillState {
  const out: FillState = {};
  for (const f of fields) out[f.fieldId] = f.kind === "multiChoice" ? [] : "";
  return out;
}

function isEmpty(field: CheckInField, v: string | string[]): boolean {
  if (field.kind === "multiChoice") return Array.isArray(v) && v.length === 0;
  return typeof v === "string" && v.trim().length === 0;
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CheckInField;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  disabled: boolean;
}) {
  const id = `ci-f-${field.fieldId}`;
  const label = (
    <span>
      {field.label}
      {field.required ? " *" : ""}
    </span>
  );

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
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
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
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
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
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
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
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          />
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
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {(field.options ?? []).map((o) => (
              <option key={o.optionId} value={o.optionId}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case "rating": {
      // The canvas scale select (templates.tsx) — stored integer per
      // scheme: 1–10 / 1–5, or the 1-based CHECKIN_RATING_WORD_LABELS
      // position. The definition validator requires a scheme on rating
      // fields; an absent scheme renders no control and the required
      // field guard below keeps the form unsubmittable rather than
      // silently dropping the answer.
      const options =
        field.ratingScheme === "WORD_LABELS"
          ? CHECKIN_RATING_WORD_LABELS.map((label, i) => ({
              value: String(i + 1),
              label,
            }))
          : field.ratingScheme === "SCALE_1_10" ||
              field.ratingScheme === "SCALE_1_5"
            ? Array.from(
                { length: field.ratingScheme === "SCALE_1_5" ? 5 : 10 },
                (_, i) => ({ value: String(i + 1), label: String(i + 1) }),
              )
            : [];
      return (
        <div className="daily-field">
          <label htmlFor={id}>{label}</label>
          <select
            id={id}
            className="catalog-search__input"
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            aria-required={field.required || undefined}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    }
    case "multiChoice": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset className="daily-field">
          <legend>{label}</legend>
          {(field.options ?? []).map((o) => {
            const optId = `${id}-${o.optionId}`;
            return (
              <label
                key={o.optionId}
                htmlFor={optId}
                className="daily-field"
                style={{
                  minHeight: "44px",
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
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
        </fieldset>
      );
    }
    default:
      return null;
  }
}

export function CheckInSubmissionPanel({
  workspaceId,
  detail,
}: {
  workspaceId: string;
  detail: OwnCheckInInstanceDetail;
}) {
  if (detail.state === "CANCELLED")
    return (
      <div className="tracker-page" data-testid="checkin-cancelled-state">
        <p className="app-lede">This Check-In is no longer available.</p>
      </div>
    );
  if (detail.state === "SUBMITTED" && detail.submittedAnswers !== null)
    return (
      <SubmittedView
        workspaceId={workspaceId}
        detail={detail}
        answers={detail.submittedAnswers}
      />
    );
  if (detail.state === "SUBMITTED")
    return (
      <div
        className="tracker-page"
        data-testid="checkin-submitted-consent-closed"
      >
        <p className="app-lede">
          This Check-In was submitted. The answers aren’t available right now.
        </p>
      </div>
    );
  return <FillForm workspaceId={workspaceId} detail={detail} />;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SubmittedView({
  workspaceId,
  detail,
  answers,
}: {
  workspaceId: string;
  detail: OwnCheckInInstanceDetail;
  answers: NonNullable<OwnCheckInInstanceDetail["submittedAnswers"]>;
}) {
  const fieldById = new Map(
    detail.definition.fields.map((f) => [f.fieldId, f]),
  );
  const optionLabel = (field: CheckInField, id: string) =>
    field.options?.find((o) => o.optionId === id)?.label ?? id;
  // CHECK-IN-FEEDBACK-I1: "Response sent" derives ONLY from persisted
  // feedback rows for THIS instance's submission — never a read/seen
  // state, never the review acknowledgement.
  const [feedback, setFeedback] = useState<CheckInFeedbackItem[]>(
    detail.feedback ?? [],
  );
  const [feedbackCursor, setFeedbackCursor] = useState<string | null>(
    detail.feedbackNextCursor,
  );
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  return (
    <div className="tracker-page" data-testid="checkin-submitted-state">
      <p className="app-lede">
        Submitted
        {detail.submittedAt ? ` ${formatDateTime(detail.submittedAt)}` : ""}
        {detail.late ? " (late)" : ""}
      </p>
      {feedback.length > 0 ? (
        <section
          className="tracker-section"
          aria-label="Coach responses"
          data-testid="checkin-client-feedback"
        >
          <p className="app-lede" data-testid="checkin-response-sent">
            Response sent
          </p>
          <ul
            className="tracker-list"
            data-testid="checkin-client-feedback-list"
          >
            {feedback.map((item) => (
              <li
                key={item.id}
                className="tracker-list__row"
                data-testid="checkin-client-feedback-item"
              >
                <span className="tracker-list__sub">
                  {item.byName} · {formatDateTime(item.sentAt)}
                </span>
                <span
                  className="tracker-list__title"
                  style={{ whiteSpace: "pre-wrap" }}
                >
                  {item.body}
                </span>
              </li>
            ))}
          </ul>
          {feedbackCursor ? (
            <button
              type="button"
              className="catalog-search__submit"
              disabled={feedbackLoading}
              data-testid="checkin-client-feedback-more"
              onClick={() => {
                setFeedbackLoading(true);
                void listOwnCheckInFeedbackAction(
                  { workspaceId, instanceId: detail.instanceId },
                  { cursor: feedbackCursor },
                )
                  .then((res) => {
                    if (res.status === "ok") {
                      setFeedback((prev) => {
                        const seen = new Set(prev.map((i) => i.id));
                        return [
                          ...prev,
                          ...res.items.filter((i) => !seen.has(i.id)),
                        ];
                      });
                      setFeedbackCursor(res.nextCursor);
                    }
                  })
                  .finally(() => setFeedbackLoading(false));
              }}
            >
              {feedbackLoading ? "Loading…" : "Load more responses"}
            </button>
          ) : null}
        </section>
      ) : null}
      <ul className="tracker-list" data-testid="checkin-submitted-answers">
        {answers.map((a) => {
          const field = fieldById.get(a.fieldId);
          // Same render rules as the staff detail's displayCheckInAnswer:
          // word labels resolve the stored 1-based position, numeric
          // schemes show "v / max", visuals show the attachment count.
          const value =
            a.valueText ??
            (a.valueNumeric !== null ? a.valueNumeric : null) ??
            a.valueDate ??
            (a.valueRating !== null
              ? field?.ratingScheme === "WORD_LABELS"
                ? (CHECKIN_RATING_WORD_LABELS[a.valueRating - 1] ??
                  String(a.valueRating))
                : `${a.valueRating} / ${field?.ratingScheme === "SCALE_1_5" ? 5 : 10}`
              : null) ??
            (a.valueOptionIds !== null && field
              ? a.valueOptionIds.map((id) => optionLabel(field, id)).join(", ")
              : null) ??
            (a.mediaIds.length > 0
              ? `${a.mediaIds.length} visual${a.mediaIds.length === 1 ? "" : "s"}`
              : null) ??
            "—";
          return (
            <li key={a.fieldId} className="tracker-list__row">
              <span className="tracker-list__title">{field?.label}</span>
              <span className="tracker-list__sub">{value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FillForm({
  workspaceId,
  detail,
}: {
  workspaceId: string;
  detail: OwnCheckInInstanceDetail;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FillState>(() =>
    emptyAnswers(detail.definition.fields),
  );
  const [dirty, setDirty] = useState(false);
  const submittedRef = useRef(false);
  const [state, action, pending] = useActionState<SubmitCheckInState, FormData>(
    async (prev, formData) => {
      const result = await submitCheckInInstanceAction(prev, formData);
      if (result.ok === true) {
        submittedRef.current = true;
        setDirty(false);
      }
      return result;
    },
    { ok: "idle" },
  );

  // Dirty-only beforeunload — removed after a committed submission and on
  // unmount.
  useEffect(() => {
    if (!dirty || submittedRef.current) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (state.ok === true) router.refresh();
  }, [state, router]);

  const error = state.ok === false ? state.message : null;

  const missing = detail.definition.fields.filter(
    (f) => f.required && isEmpty(f, values[f.fieldId] ?? ""),
  );

  return (
    <form
      action={action}
      data-testid="checkin-fill-form"
      className="tracker-page"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="instanceId" value={detail.instanceId} />
      <input
        type="hidden"
        name="answersJson"
        value={JSON.stringify(
          detail.definition.fields
            .filter((f) => !isEmpty(f, values[f.fieldId] ?? ""))
            .map((f) => ({ fieldId: f.fieldId, value: values[f.fieldId] })),
        )}
      />
      {detail.late ? (
        <p className="daily-errors" data-testid="checkin-overdue-note">
          This Check-In is past its due date — you can still submit.
        </p>
      ) : null}
      {missing.length > 0 && dirty ? (
        <div
          className="daily-errors"
          role="alert"
          data-testid="checkin-validation-summary"
        >
          <p>Please answer the required fields:</p>
          <ul>
            {missing.map((f) => (
              <li key={f.fieldId}>{f.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div aria-live="polite" data-testid="checkin-alert-region">
        {error ? (
          <p className="daily-errors" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {detail.definition.fields.map((f) => (
        <FieldControl
          key={f.fieldId}
          field={f}
          value={values[f.fieldId]}
          disabled={pending}
          onChange={(v) => {
            setDirty(true);
            setValues((prev) => ({ ...prev, [f.fieldId]: v }));
          }}
        />
      ))}
      <button
        type="submit"
        className="auth-button"
        style={{ minHeight: "44px" }}
        disabled={pending || missing.length > 0}
        data-testid="checkin-submit"
      >
        {pending ? "Submitting…" : "Submit Check-In"}
      </button>
    </form>
  );
}
