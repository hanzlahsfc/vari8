"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { StaffOnboardingSubmissionItem } from "@/lib/onboarding/review-boundary";

import {
  markOnboardingSubmissionReviewed,
  viewOnboardingSubmissionDetail,
  type StaffOnboardingDetailState,
  type StaffOnboardingMarkState,
} from "./actions";

/**
 * P-024 — staff onboarding-submission review panel (decisions #86–#91).
 *
 * Rows are server-rendered headers (form name, pinned version seq,
 * submittedAt, review provenance). "View details" is an explicit Server
 * Action POST per row — one committed action → one structural READ
 * audit; a failed/denied selection replaces any previous result and
 * returns no answers. "Mark as reviewed" is a separate explicit action
 * enabled only after a successful detail reveal that reported `canMark`
 * (#90 — a UX affordance; the server independently re-authorizes).
 * While an action is pending every control is disabled.
 */
export function OnboardingReviewPanel({
  workspaceId,
  clientProfileId,
  clientName,
  items,
  nextHref,
}: {
  workspaceId: string;
  clientProfileId: string;
  clientName: string;
  items: StaffOnboardingSubmissionItem[];
  nextHref: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    StaffOnboardingDetailState,
    FormData
  >(viewOnboardingSubmissionDetail, { status: "idle" });
  const [mark, markAction, markPending] = useActionState<
    StaffOnboardingMarkState,
    FormData
  >(markOnboardingSubmissionReviewed, { status: "idle" });

  return (
    <section
      className="daily-entry"
      aria-label={`Onboarding submissions for ${clientName}`}
      data-testid="staff-onboarding-review"
    >
      <table className="catalog-table" data-testid="staff-onboarding-table">
        <thead>
          <tr>
            <th scope="col">Form</th>
            <th scope="col">Version</th>
            <th scope="col">Submitted</th>
            <th scope="col">Review status</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.submissionId} data-testid="staff-onboarding-row">
              <td>{item.formName}</td>
              <td>v{item.versionSeq}</td>
              <td>{item.submittedAt.slice(0, 10)}</td>
              <td>
                {item.reviewed === null
                  ? "Not reviewed"
                  : `Reviewed by ${item.reviewed.byName}`}
              </td>
              <td>
                <form action={formAction}>
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
                    disabled={pending || markPending}
                    data-testid="staff-onboarding-view-details"
                  >
                    {pending ? "Loading…" : "View details"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {nextHref !== null ? (
        <nav className="roster-pagination" aria-label="Submission pages">
          <Link className="roster-pagination__link" href={nextHref}>
            Next page
          </Link>
        </nav>
      ) : null}

      {state.status === "error" ? (
        <p
          className="daily-errors"
          role="alert"
          data-testid="staff-onboarding-error"
        >
          {state.message}
        </p>
      ) : null}
      {mark.status === "error" ? (
        <p
          className="daily-errors"
          role="alert"
          data-testid="staff-onboarding-mark-error"
        >
          {mark.message}
        </p>
      ) : null}

      {/* Always-mounted polite live region so the selected detail — and its
          replacement/clear — is announced rather than only the first mount. */}
      <section
        className="daily-entry__history"
        aria-live="polite"
        aria-busy={pending || markPending}
        aria-label="Selected submission details"
        data-testid="staff-onboarding-detail-region"
      >
        {state.status === "ok" ? (
          <div data-testid="staff-onboarding-detail">
            <h3 className="assignment-manager__subtitle">
              {state.formName} — v{state.versionSeq} — submitted{" "}
              {state.submittedAt.slice(0, 10)}
            </h3>
            <ul>
              {state.answers.map((a, i) => (
                <li key={`${a.fieldId}-${i}`}>
                  <strong>{a.label}</strong>: {a.display}
                </li>
              ))}
            </ul>
            {state.reviewed !== null ? (
              <p data-testid="staff-onboarding-reviewed">
                Reviewed by {state.reviewed.byName} at{" "}
                {state.reviewed.at.slice(0, 19).replace("T", " ")} UTC
              </p>
            ) : null}
            {state.canMark && state.reviewed === null ? (
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
                  value={state.submissionId}
                />
                <button
                  type="submit"
                  className="catalog-search__submit"
                  disabled={pending || markPending}
                  data-testid="staff-onboarding-mark-reviewed"
                >
                  {markPending ? "Marking…" : "Mark as reviewed"}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
