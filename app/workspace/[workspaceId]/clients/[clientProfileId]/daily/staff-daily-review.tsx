"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { StaffDailyEntryListItem } from "@/lib/daily-entry/service";

import {
  viewStaffDailyEntryDetail,
  type StaffDailyDetailState,
} from "./actions";

/**
 * P-022 — read-only staff DailyEntry browser (decisions #79–#81).
 *
 * Rows are server-rendered headers (date, revision count, latest-revision
 * marker). "View details" is an explicit Server Action POST per row via a
 * shared `useActionState`: one committed action → one structural READ
 * audit; a failed/denied selection replaces any previous result and
 * returns no values. While an action is pending every detail control is
 * disabled. No detail-bearing GET exists.
 */
export function StaffDailyReview({
  workspaceId,
  clientProfileId,
  clientName,
  items,
  nextHref,
}: {
  workspaceId: string;
  clientProfileId: string;
  clientName: string;
  items: StaffDailyEntryListItem[];
  nextHref: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    StaffDailyDetailState,
    FormData
  >(viewStaffDailyEntryDetail, { status: "idle" });

  return (
    <section
      className="daily-entry"
      aria-label={`Daily entries for ${clientName}`}
      data-testid="staff-daily-review"
    >
      <table className="catalog-table" data-testid="staff-daily-table">
        <thead>
          <tr>
            <th scope="col">Entry date</th>
            <th scope="col">Revisions</th>
            <th scope="col">Latest</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.entryDate} data-testid="staff-daily-entry-row">
              <td>{item.entryDate}</td>
              <td>{item.revisionCount}</td>
              <td>
                {item.currentRevisionSeq === null
                  ? "—"
                  : `Rev ${item.currentRevisionSeq}`}
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
                    name="entryDate"
                    value={item.entryDate}
                  />
                  <button
                    type="submit"
                    className="catalog-search__submit"
                    disabled={pending}
                    data-testid="staff-daily-view-details"
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
        <nav className="roster-pagination" aria-label="Daily entry pages">
          <Link className="roster-pagination__link" href={nextHref}>
            Next page
          </Link>
        </nav>
      ) : null}

      {state.status === "error" ? (
        <p className="daily-errors" role="alert">
          {state.message}
        </p>
      ) : null}

      {/* Always-mounted polite live region so the selected detail — and its
          replacement/clear — is announced rather than only the first mount. */}
      <section
        className="daily-entry__history"
        aria-live="polite"
        aria-busy={pending}
        aria-label="Selected entry details"
        data-testid="staff-daily-detail-region"
      >
        {state.status === "ok" ? (
          <div data-testid="staff-daily-detail">
            <h3 className="assignment-manager__subtitle">
              {state.entryDate} — revision {state.revisionSeq} of{" "}
              {state.revisionCount}
            </h3>
            <ul>
              {state.values.map((v, i) => (
                <li key={`${v.parameterKey}-${i}`}>
                  <strong>{v.label}</strong>
                  {v.unit ? ` (${v.unit})` : ""}: {v.display}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </section>
  );
}
