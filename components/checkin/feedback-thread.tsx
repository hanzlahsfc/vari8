"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { CheckInFeedbackItem } from "@/lib/checkin/instances";
import {
  listStaffCheckInFeedbackAction,
  resolveCheckInFeedbackSendAction,
  sendCheckInFeedbackAction,
  type StaffCheckInFeedbackSendState,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/checkins/actions";

/**
 * CHECK-IN-FEEDBACK-I1 — bounded staff feedback thread + composer
 * (reviewed P3 contract). Plain text only, append-only; corrections are
 * dated follow-ups.
 *
 * Retry identity: the client nonce (`clientRequestId`) is minted once
 * per compose session, mirrored — NONCE ONLY, never body text — to
 * sessionStorage under a user+workspace+submission-scoped key, and
 * carried unchanged through every submit/retry. It rotates ONLY on
 * confirmed success / an explicit new compose. An uncertain response
 * never rotates it; editing the body after an ambiguous attempt reuses
 * it so the server comparison stays loud (`idempotency_conflict`).
 *
 * Remount/reload: the sessionStorage marker survives; on mount the
 * composer reconciles through the authorized `resolveCheckInFeedbackSend`
 * read — `sent` clears the marker; `not_sent` restores the nonce (the
 * typed text is never stored — the composer is empty and the response
 * must be entered again); unavailable shows a truthful note (the
 * server row is always the source of truth).
 *
 * Disclosed edge: full document exit + cleared session storage loses the
 * marker → a fresh nonce is minted; if the uncertain send had actually
 * landed, resubmission appends a second VISIBLE row (a duplicate
 * message, not corruption). Exactly-once is per nonce, not across total
 * client-state loss.
 */

type Marker = { nonce: string; attempted: boolean };

function markerKey(
  userId: string,
  workspaceId: string,
  submissionId: string,
): string {
  return `checkinFeedbackDraft:${userId}:${workspaceId}:${submissionId}`;
}

function readMarker(key: string): Marker | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Marker).nonce !== "string" ||
      (parsed as Marker).nonce.length === 0 ||
      (parsed as Marker).nonce.length > 64 ||
      (parsed as Marker).attempted !== true
    )
      return null;
    return { nonce: (parsed as Marker).nonce, attempted: true };
  } catch {
    return null;
  }
}

function writeMarker(key: string, nonce: string): void {
  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ nonce, attempted: true } satisfies Marker),
    );
  } catch {
    // Storage unavailable (private mode / quota) — retry identity then
    // lives in React state only; the disclosed edge applies.
  }
}

function clearMarker(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

function formatSent(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CheckInFeedbackThread({
  workspaceId,
  clientProfileId,
  submissionId,
  userId,
  canSend,
  initialItems,
  initialNextCursor,
}: {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
  userId: string;
  canSend: boolean;
  /** null = the caller's checkinFeedback read grant is absent — the
   * thread is withheld, NOT an authorized empty thread. */
  initialItems: CheckInFeedbackItem[] | null;
  initialNextCursor: string | null;
}) {
  const [items, setItems] = useState<CheckInFeedbackItem[] | null>(
    initialItems,
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialNextCursor,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [body, setBody] = useState("");

  // Retry identity — one nonce per compose session (P3 §5).
  const [nonce, setNonce] = useState<string>(() => crypto.randomUUID());
  const [reconcile, setReconcile] = useState<
    "idle" | "checking" | "recovered" | "unavailable"
  >("idle");
  const key = markerKey(userId, workspaceId, submissionId);
  const reconciledRef = useRef(false);

  const [sendState, sendAction, sendPending] = useActionState<
    StaffCheckInFeedbackSendState,
    FormData
  >(sendCheckInFeedbackAction, { status: "idle" });

  // Mount reconciliation — a stored marker means a prior dispatch's
  // outcome is unknown; ask the server before offering a compose.
  useEffect(() => {
    if (reconciledRef.current) return;
    reconciledRef.current = true;
    const marker = readMarker(key);
    if (!marker) return;
    void (async () => {
      setNonce(marker.nonce);
      setReconcile("checking");
      try {
        const res = await resolveCheckInFeedbackSendAction({
          workspaceId,
          clientProfileId,
          submissionId,
          clientRequestId: marker.nonce,
        });
        if (res.status === "sent") {
          clearMarker(key);
          setReconcile("idle");
          setNonce(crypto.randomUUID());
          setItems((prev) =>
            prev === null || prev.some((i) => i.id === res.feedbackId)
              ? prev
              : [
                  ...prev,
                  {
                    id: res.feedbackId,
                    sentAt: res.sentAt,
                    byName: res.byName,
                    body: res.body,
                  },
                ],
          );
        } else if (res.status === "not_sent") {
          // Retry identity survives — keep the marker + nonce; the
          // composer lets the coach resubmit the same attempt.
          setReconcile("recovered");
        } else {
          setReconcile("unavailable");
        }
      } catch {
        setReconcile("unavailable");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confirmed success → clear marker, append the row, fresh nonce.
  const lastHandledRef = useRef<StaffCheckInFeedbackSendState | null>(null);
  useEffect(() => {
    if (sendState.status !== "ok" || lastHandledRef.current === sendState)
      return;
    lastHandledRef.current = sendState;
    void (async () => {
      clearMarker(key);
      setReconcile("idle");
      setNonce(crypto.randomUUID());
      setItems((prev) =>
        prev === null || prev.some((i) => i.id === sendState.feedbackId)
          ? prev
          : [
              ...prev,
              {
                id: sendState.feedbackId,
                sentAt: sendState.sentAt,
                byName: sendState.byName,
                body: sendState.body,
              },
            ],
      );
      setBody("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendState]);

  return (
    <section
      aria-label="Check-In feedback"
      data-testid="checkin-feedback-thread"
    >
      <h3 className="assignment-manager__subtitle">Responses</h3>
      {items === null ? (
        <p className="app-lede" data-testid="checkin-feedback-withheld">
          Responses aren’t included for your access.
        </p>
      ) : items.length === 0 ? (
        <p className="app-lede" data-testid="checkin-feedback-empty">
          No responses sent yet.
        </p>
      ) : (
        <ul className="tracker-list" data-testid="checkin-feedback-list">
          {items.map((item) => (
            <li
              key={item.id}
              className="tracker-list__row"
              data-testid="checkin-feedback-item"
            >
              <span className="tracker-list__sub">
                {item.byName} · {formatSent(item.sentAt)}
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
      )}
      {nextCursor ? (
        <button
          type="button"
          className="catalog-search__submit"
          disabled={loadingMore}
          data-testid="checkin-feedback-more"
          onClick={() => {
            setLoadingMore(true);
            setMoreError(null);
            void listStaffCheckInFeedbackAction(
              { workspaceId, clientProfileId, submissionId },
              { cursor: nextCursor },
            )
              .then((res) => {
                if (res.status === "ok") {
                  setItems((prev) => {
                    if (prev === null) return prev;
                    const seen = new Set(prev.map((i) => i.id));
                    return [
                      ...prev,
                      ...res.items.filter((i) => !seen.has(i.id)),
                    ];
                  });
                  setNextCursor(res.nextCursor);
                } else {
                  setMoreError(res.message);
                }
              })
              .catch(() => setMoreError("The responses didn’t load."))
              .finally(() => setLoadingMore(false));
          }}
        >
          {loadingMore ? "Loading…" : "Load earlier responses"}
        </button>
      ) : null}
      {moreError ? (
        <p className="daily-errors" role="alert">
          {moreError}
        </p>
      ) : null}

      {canSend ? (
        <form
          action={(formData: FormData) => {
            // Marker BEFORE dispatch — a crash mid-request still leaves
            // the retry identity for the next mount to reconcile.
            writeMarker(key, nonce);
            return sendAction(formData);
          }}
          data-testid="checkin-feedback-form"
        >
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="clientProfileId" value={clientProfileId} />
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="clientRequestId" value={nonce} />
          {reconcile === "checking" ? (
            <p className="app-lede" data-testid="checkin-feedback-checking">
              Checking whether your previous response was sent…
            </p>
          ) : null}
          {reconcile === "recovered" ? (
            <p className="app-lede" data-testid="checkin-feedback-recovered">
              No sent response was found when we checked. Your text wasn’t saved
              on this device — enter it again and resend. If the earlier request
              is still completing, the resend keeps the same attempt identity
              and can’t create a duplicate.
            </p>
          ) : null}
          {reconcile === "unavailable" ? (
            <p className="app-lede" data-testid="checkin-feedback-unavailable">
              We couldn’t confirm whether your previous response was sent —
              check the responses above before resending.
            </p>
          ) : null}
          <div className="daily-field">
            <label htmlFor="checkin-feedback-body">Send a response</label>
            <textarea
              id="checkin-feedback-body"
              name="body"
              className="catalog-search__input"
              rows={4}
              maxLength={2000}
              required
              disabled={sendPending || reconcile === "checking"}
              value={body}
              data-testid="checkin-feedback-input"
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {sendState.status === "error" ? (
            <p
              className="daily-errors"
              role="alert"
              data-testid="checkin-feedback-error"
            >
              {sendState.message}
            </p>
          ) : null}
          {sendState.status === "ok" ? (
            <p
              className="tracker-list__sub"
              data-testid="checkin-feedback-confirm"
            >
              Response sent.
            </p>
          ) : null}
          <button
            type="submit"
            className="catalog-search__submit"
            disabled={
              sendPending ||
              reconcile === "checking" ||
              body.trim().length === 0
            }
            data-testid="checkin-feedback-send"
          >
            {sendPending ? "Sending…" : "Send response"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
