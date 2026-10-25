// FULL-PACKAGE SLICE of #171
"use client";

import {
  viennaDate,
  type CheckInReviewPanelWire,
} from "../data/checkins";
import {
  type CoachClient,
  formatDate,
  type Submission,
} from "./model";
import { Avatar, Status, Surface } from "./ui";

/**
 * Card 06 / R2-N2 — the coach review panel for one check-in submission:
 * answers, review state, feedback thread, linked media and what changed
 * since the previous submission of the same form, all fed by the single
 * `GET .../submissions/:id/review` read.
 *
 * The three review states stay distinct: `open` (nothing acknowledged),
 * `draft` (unsent feedback in the local autosave — drafts never reach the
 * server), `answered` (the review is acknowledged, feedback may be sent).
 * `panel === null` means the read is still out or failed; the panel then
 * falls back to whatever the submission already carries, exactly like the
 * answers-only read before it.
 */
export function CheckInReviewPanel({
  panel,
  submission: sub,
  client: c,
  draftActive,
  onOpenVisual,
}: {
  panel: CheckInReviewPanelWire | null;
  submission: Submission;
  client: CoachClient;
  draftActive: boolean;
  onOpenVisual: (mediaId: string) => void;
}) {
  const state =
    panel?.reviewState === "answered"
      ? "answered"
      : draftActive
        ? "draft"
        : "open";
  const chip =
    state === "answered" ? "Answered" : state === "draft" ? "Draft" : "Open";
  const answerFields =
    panel?.fields.filter((field) => field.kind !== "visual") ?? null;
  const visuals = panel
    ? panel.fields.flatMap((field) => field.mediaIds)
    : sub.visuals;
  const summary = panel?.changeSummary ?? null;
  const changeCount = summary
    ? summary.added.length + summary.removed.length + summary.changed.length
    : 0;
  return (
    <Surface>
      <div className="cd-review-athlete">
        <Avatar client={c} />
        <div>
          <h2>In {c.name.split(" ")[0]}’s words</h2>
          <small>{sub.type} questionnaire</small>
        </div>
      </div>
      <div className="cd-actions" data-review-state={state}>
        <Status text={chip} />
        {panel?.reviewed && (
          <span className="cd-caption">
            Reviewed by {panel.reviewed.byName} ·{" "}
            {formatDate(viennaDate(panel.reviewed.at))}
          </span>
        )}
        {state === "draft" && (
          <span className="cd-caption">Unsent feedback draft</span>
        )}
      </div>
      {panel !== null && (
        <>
          <h3>Changed since the previous check-in</h3>
          {summary === null ? (
            <p className="cd-muted">
              First submission of this form; nothing to compare against.
            </p>
          ) : changeCount === 0 ? (
            <p className="cd-muted">
              No answer changes since the previous submission (
              {formatDate(viennaDate(summary.previousSubmittedAt))}).
            </p>
          ) : (
            <>
              <p className="cd-caption">
                Compared with {summary.previousFormName} ·{" "}
                {formatDate(viennaDate(summary.previousSubmittedAt))}
              </p>
              {summary.added.map((ch) => (
                <p
                  className="cd-change-summary"
                  data-change="added"
                  key={`added-${ch.fieldId}`}
                >
                  <strong>Added</strong> · {ch.label}: {ch.current}
                </p>
              ))}
              {summary.removed.map((ch) => (
                <p
                  className="cd-change-summary"
                  data-change="removed"
                  key={`removed-${ch.fieldId}`}
                >
                  <strong>Removed</strong> · {ch.label}: {ch.previous}
                </p>
              ))}
              {summary.changed.map((ch) => (
                <p
                  className="cd-change-summary"
                  data-change="changed"
                  key={`changed-${ch.fieldId}`}
                >
                  <strong>Changed</strong> · {ch.label}: {ch.previous} →{" "}
                  {ch.current}
                </p>
              ))}
            </>
          )}
        </>
      )}
      {answerFields === null
        ? sub.answers.map((a) => (
            <div className="cd-answer" key={a.question}>
              <h3>{a.question}</h3>
              <p>{a.answer}</p>
            </div>
          ))
        : answerFields.map((field) => (
            <div className="cd-answer" key={field.fieldId}>
              <h3>{field.label}</h3>
              <p>{field.display}</p>
            </div>
          ))}
      {sub.note && (
        <div className="cd-answer">
          <h3>Athlete note</h3>
          <p>{sub.note}</p>
        </div>
      )}
      {visuals.length > 0 && (
        <>
          <h3>Submitted visuals</h3>
          <div className="cd-progress-visuals">
            {visuals.map((v) => (
              <button type="button" key={v} onClick={() => onOpenVisual(v)}>
                <ProgressVisual />
                <span>{v}</span>
                <small>Illustrative demo visual</small>
              </button>
            ))}
          </div>
        </>
      )}
      {panel !== null && (
        <>
          <h3>Coach feedback</h3>
          {panel.feedback === null ? (
            <p className="cd-muted">
              The feedback thread is not available for your role.
            </p>
          ) : panel.feedback.length === 0 ? (
            <p className="cd-muted">No feedback sent yet.</p>
          ) : (
            panel.feedback.map((item) => (
              <div className="cd-flag-note" key={item.id}>
                <strong>{item.byName}</strong>
                <small>
                  {formatDate(viennaDate(item.sentAt))} · Feedback
                </small>
                <p>{item.body}</p>
              </div>
            ))
          )}
        </>
      )}
    </Surface>
  );
}

export function ProgressVisual() {
  return (
    <svg
      className="cd-progress-figure"
      viewBox="0 0 160 190"
      role="img"
      aria-label="Illustrative athlete progress silhouette"
    >
      <rect
        width="160"
        height="190"
        rx="12"
        fill="currentColor"
        opacity=".04"
      />
      <path
        d="M80 24a14 14 0 1 0 0 28a14 14 0 0 0 0-28M63 61Q80 54 97 61L111 113Q108 121 103 115L92 85L94 122L99 168Q95 175 89 169L80 131L71 169Q65 175 61 168L66 122L68 85L57 115Q52 121 49 113Z"
        fill="currentColor"
        opacity=".35"
      />
      <path
        d="M27 168H133M27 24H133"
        stroke="currentColor"
        opacity=".15"
        strokeDasharray="3 4"
      />
    </svg>
  );
}
