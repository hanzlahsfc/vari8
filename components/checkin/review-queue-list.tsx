"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { StaffCheckInReviewQueueItem } from "@/lib/checkin/instances-boundary";
import { loadCheckInReviewQueueAction } from "@/app/workspace/[workspaceId]/checkins/review-queue/actions";

/**
 * CHECK-IN-OVERVIEW-I1 — staff "awaiting review" overview list.
 * Header-only rows (form, version, client, due/submitted, late marker);
 * NO answers, NO feedback text — the detail destination re-authorizes,
 * consent-gates, and audits on explicit navigation. `prefetch={false}`
 * keeps even the destination document from being fetched before the
 * click (defense in depth — prefetch is a GET and could never fire the
 * consent-gated detail action anyway).
 *
 * `canReview` is a server-derived snapshot hint (write cell + ACTIVE
 * assignment), rendered as an honest affordance label — never "your
 * task": owners and assistants see the same rows read-only. The row
 * link is the only action; no marking happens on this surface.
 */
export function CheckInReviewQueueList({
  workspaceId,
  initialItems,
  initialNextCursor,
}: {
  workspaceId: string;
  initialItems: StaffCheckInReviewQueueItem[];
  initialNextCursor: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadMore = () => {
    if (nextCursor === null || pending) return;
    startTransition(async () => {
      const result = await loadCheckInReviewQueueAction(
        { workspaceId },
        { cursor: nextCursor },
      );
      if (result.status === "ok") {
        setItems((prev) => [...prev, ...result.items]);
        setNextCursor(result.nextCursor);
        setError(null);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <section
      className="tracker-section"
      aria-label="Check-Ins awaiting review"
      data-testid="checkin-review-queue"
    >
      {items.length === 0 ? (
        <p className="app-lede" data-testid="review-queue-empty">
          No Check-Ins are awaiting review.
        </p>
      ) : (
        <ul className="tracker-list" data-testid="review-queue-list">
          {items.map((item) => (
            <li
              key={item.submissionId}
              className="tracker-list__row"
              data-testid="review-queue-row"
            >
              <Link
                prefetch={false}
                href={`/workspace/${workspaceId}/clients/${item.clientProfileId}/checkins?submission=${encodeURIComponent(item.submissionId)}`}
              >
                <span className="tracker-list__title">
                  {item.formName} — v{item.versionSeq}
                </span>
                <span className="tracker-list__sub">
                  {item.clientName} · Submitted{" "}
                  {new Date(item.submittedAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · Due{" "}
                  {new Date(item.dueAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {item.late ? " · Late" : ""}
                  {" · Awaiting review"}
                  {item.canReview ? " — you can review this" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error !== null ? (
        <p
          className="daily-errors"
          role="alert"
          data-testid="review-queue-error"
        >
          {error}
        </p>
      ) : null}

      {nextCursor !== null ? (
        <button
          type="button"
          className="catalog-search__submit"
          onClick={loadMore}
          disabled={pending}
          data-testid="review-queue-load-more"
        >
          {pending ? "Loading…" : "Load earlier"}
        </button>
      ) : null}
    </section>
  );
}
