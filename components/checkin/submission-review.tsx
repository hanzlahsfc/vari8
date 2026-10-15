"use client";

import { useActionState, useState } from "react";

import type { StaffCheckInSubmissionItem } from "@/lib/checkin/instances";
import { CheckInFeedbackThread } from "@/components/checkin/feedback-thread";
import {
  markCheckInSubmissionReviewed,
  showCheckInReviewTrackerContext,
  viewCheckInSubmissionDetail,
  type StaffCheckInDetailState,
  type StaffCheckInMarkState,
  type StaffCheckInTrackerContextState,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions";

/**
 * P-025-C — staff Check-In submission review (decisions #86–#91 carried
 * by #96). Rows are server-rendered headers only (form, version, due,
 * submitted, late, reviewed marker) — zero answer content. "View
 * details" is an explicit Server Action POST per row: one committed call
 * → one structural READ audit; a failed/denied call returns no values.
 * "Mark reviewed" appears only for the assigned-coach write cell AND only
 * after a successful detail view of that submission; the server
 * independently re-authorizes the mark regardless of UI state. Reviewer
 * provenance is bounded staff-only metadata (#91) — never client-facing.
 */
export function CheckInSubmissionReview({
  workspaceId,
  clientProfileId,
  items,
  userId,
}: {
  workspaceId: string;
  clientProfileId: string;
  items: StaffCheckInSubmissionItem[];
  /** Authenticated user's ID — scopes the composer nonce marker so a
   * stale draft can never bind to a different account. */
  userId: string;
}) {
  const [detailState, detailAction, detailPending] = useActionState<
    StaffCheckInDetailState,
    FormData
  >(viewCheckInSubmissionDetail, { status: "idle" });
  const [markState, markAction, markPending] = useActionState<
    StaffCheckInMarkState,
    FormData
  >(markCheckInSubmissionReviewed, { status: "idle" });
  const [contextState, contextAction, contextPending] = useActionState<
    StaffCheckInTrackerContextState,
    FormData
  >(showCheckInReviewTrackerContext, { status: "idle" });
  // P-025-D6 (#103, C1): the deliberate reveal exposes a manual date
  // form — never DailyEntry data. Passive render queries nothing.
  const [contextOpen, setContextOpen] = useState(false);

  return (
    <section
      className="tracker-section"
      aria-label="Submitted Check-Ins"
      data-testid="checkin-submissions-review"
    >
      <h2 className="tracker-section__title">Submitted Check-Ins</h2>
      {items.length === 0 ? (
        <p className="app-lede" data-testid="checkin-submissions-empty">
          No submitted Check-Ins yet.
        </p>
      ) : (
        <ul className="tracker-list" data-testid="checkin-submissions-list">
          {items.map((item) => (
            <li
              key={item.submissionId}
              className="tracker-list__row"
              data-testid={
                item.reviewedAt
                  ? "checkin-submission-reviewed"
                  : "checkin-submission-pending"
              }
            >
              <span className="tracker-list__title">
                {item.formName} — v{item.versionSeq}
              </span>
              <span className="tracker-list__sub">
                Submitted{" "}
                {new Date(item.submittedAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {item.late ? " · Late" : ""}
                {item.reviewedAt
                  ? ` · Reviewed${
                      item.reviewedByName ? ` by ${item.reviewedByName}` : ""
                    }`
                  : ""}
              </span>
              <form action={detailAction}>
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input
                  type="hidden"
                  name="clientProfileId"
                  value={clientProfileId}
                />
                <input
                  type="hidden"
                  name="submissionId"
                  value={item.submissionId}
                />
                <button
                  type="submit"
                  className="catalog-search__submit"
                  disabled={detailPending || markPending}
                  data-testid="checkin-view-detail"
                >
                  {detailPending ? "Loading…" : "View details"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {detailState.status === "error" ? (
        <p
          className="daily-errors"
          role="alert"
          data-testid="checkin-detail-error"
        >
          {detailState.message}
        </p>
      ) : null}
      {markState.status === "error" ? (
        <p
          className="daily-errors"
          role="alert"
          data-testid="checkin-mark-error"
        >
          {markState.message}
        </p>
      ) : null}

      {/* Always-mounted polite live region — the selected detail and its
          replacement/clear are announced, not only the first mount. */}
      <section
        className="daily-entry__history"
        aria-live="polite"
        aria-busy={detailPending}
        aria-label="Selected submission details"
        data-testid="checkin-detail-region"
      >
        {detailState.status === "ok" ? (
          <div data-testid="checkin-detail">
            <h3 className="assignment-manager__subtitle">
              {detailState.formName} — v{detailState.versionSeq}
            </h3>
            <p className="tracker-list__sub">
              Submitted{" "}
              {new Date(detailState.submittedAt).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {detailState.late ? " · Late" : ""}
              {detailState.reviewed
                ? ` · Reviewed by ${detailState.reviewed.byName}`
                : ""}
            </p>
            <ul data-testid="checkin-detail-fields">
              {detailState.fields.map((f) => (
                <li key={f.fieldId}>
                  <strong>{f.label}</strong>: {f.display}
                </li>
              ))}
            </ul>
            {detailState.canMark &&
            detailState.reviewed === null &&
            markState.status !== "ok" ? (
              <form action={markAction}>
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input
                  type="hidden"
                  name="clientProfileId"
                  value={clientProfileId}
                />
                <input
                  type="hidden"
                  name="submissionId"
                  value={detailState.submissionId}
                />
                <button
                  type="submit"
                  className="catalog-search__submit"
                  disabled={markPending || detailPending}
                  data-testid="checkin-mark-reviewed"
                >
                  {markPending ? "Marking…" : "Mark reviewed"}
                </button>
              </form>
            ) : null}
            {markState.status === "ok" ? (
              <p
                className="tracker-list__sub"
                data-testid="checkin-mark-confirm"
              >
                Reviewed.
              </p>
            ) : null}

            {/* CHECK-IN-FEEDBACK-I1 — bounded staff feedback thread +
                composer. Keyed by submission so a new selection remounts
                (fresh nonce + marker reconciliation). */}
            <CheckInFeedbackThread
              key={detailState.submissionId}
              workspaceId={workspaceId}
              clientProfileId={clientProfileId}
              submissionId={detailState.submissionId}
              userId={userId}
              canSend={detailState.canSend}
              initialItems={detailState.feedback}
              initialNextCursor={detailState.feedbackNextCursor}
            />

            {/* P-025-D6 — explicit DailyEntry tracker context (#103).
                The control reveals a manual declared-date form only;
                submitting it is a separate explicit server action. */}
            <section
              aria-label="Daily tracker context"
              data-testid="checkin-tracker-context"
            >
              {!contextOpen ? (
                <button
                  type="button"
                  className="catalog-search__submit"
                  onClick={() => setContextOpen(true)}
                  data-testid="checkin-show-tracker-context"
                >
                  Show tracker context
                </button>
              ) : (
                <form action={contextAction}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input
                    type="hidden"
                    name="clientProfileId"
                    value={clientProfileId}
                  />
                  <input
                    type="hidden"
                    name="submissionId"
                    value={detailState.submissionId}
                  />
                  <label
                    className="assignment-manager__subtitle"
                    htmlFor="checkin-context-date"
                  >
                    Tracker date (YYYY-MM-DD)
                  </label>
                  <input
                    id="checkin-context-date"
                    type="date"
                    name="entryDate"
                    required
                    autoFocus
                    disabled={contextPending}
                    data-testid="checkin-context-date"
                    className="daily-entry__date"
                  />
                  <button
                    type="submit"
                    className="catalog-search__submit"
                    disabled={contextPending}
                    data-testid="checkin-context-submit"
                  >
                    {contextPending ? "Loading…" : "Show entry"}
                  </button>
                </form>
              )}
              {contextState.status === "error" ? (
                <p
                  className="daily-errors"
                  role="alert"
                  data-testid="checkin-context-error"
                >
                  {contextState.message}
                </p>
              ) : null}
              <div aria-live="polite" aria-busy={contextPending}>
                {contextState.status === "empty" ? (
                  <p className="app-lede" data-testid="checkin-context-empty">
                    No tracker entry for that date.
                  </p>
                ) : null}
                {contextState.status === "ok" ? (
                  <div data-testid="checkin-context-entry">
                    <p className="tracker-list__sub">
                      Entry for {contextState.entryDate} — revision{" "}
                      {contextState.revisionSeq}
                    </p>
                    <ul data-testid="checkin-context-values">
                      {contextState.values.map((v) => (
                        <li key={v.parameterKey}>
                          <strong>{v.label}</strong>: {v.display}
                          {v.unit ? ` ${v.unit}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </section>
  );
}
