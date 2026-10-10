"use client";

import { useActionState } from "react";

import type { StaffCheckInSubmissionItem } from "@/lib/checkin/instances";
import {
  markCheckInSubmissionReviewed,
  viewCheckInSubmissionDetail,
  type StaffCheckInDetailState,
  type StaffCheckInMarkState,
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
}: {
  workspaceId: string;
  clientProfileId: string;
  items: StaffCheckInSubmissionItem[];
}) {
  const [detailState, detailAction, detailPending] = useActionState<
    StaffCheckInDetailState,
    FormData
  >(viewCheckInSubmissionDetail, { status: "idle" });
  const [markState, markAction, markPending] = useActionState<
    StaffCheckInMarkState,
    FormData
  >(markCheckInSubmissionReviewed, { status: "idle" });

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
          </div>
        ) : null}
      </section>
    </section>
  );
}
