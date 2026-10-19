"use client";

import { useEffect, useState, useTransition } from "react";

import type { StaffBookingsPage } from "@/lib/trainingprogram/service";
import {
  bookTrainingSessionAction,
  cancelTrainingBookingAction,
  listTrainingBookingsAction,
  moveTrainingBookingAction,
} from "@/app/workspace/[workspaceId]/clients/[clientProfileId]/training-program/actions";

/**
 * TRAINING-I1B-2 (PROMPT 266) — staff booking management. Each booking
 * pins (version, session, booked week) immutably at create; "Move"
 * changes the appointment DATE only — the pinned week label and
 * prescription content never change. Upcoming bookings render the
 * pinned session's unprojected fields; history keeps cancelled rows
 * truthfully labelled. `canWrite` is advisory — every action
 * re-authorizes inside its own serialized transaction.
 */

type Booking = StaffBookingsPage["upcoming"][number];

function BookingRow({
  booking,
  canWrite,
  onMove,
  onCancel,
  pending,
  testidPrefix,
}: {
  booking: Booking;
  canWrite: boolean;
  onMove: (bookingId: string, date: string) => void;
  onCancel: (bookingId: string) => void;
  pending: boolean;
  testidPrefix: string;
}) {
  const [moveDate, setMoveDate] = useState("");
  return (
    <li
      className="tracker-list__row"
      data-testid={`${testidPrefix}-booking`}
      data-booking-id={booking.bookingId}
    >
      <span className="tracker-list__title">
        Booked for {booking.scheduledDate} — {booking.session.name}
      </span>
      <span className="tracker-list__sub">
        Week {booking.bookedWeek} prescription · pinned to version{" "}
        {booking.pinnedVersionSeq}
        {booking.programUpdatedSinceBooked ? " (program updated since)" : ""}
        {booking.cancelledAt !== null ? " — cancelled" : ""}
      </span>
      {canWrite && booking.cancelledAt === null ? (
        <span className="tracker-list__actions">
          <input
            type="date"
            aria-label="New booking date"
            value={moveDate}
            onChange={(e) => setMoveDate(e.target.value)}
            data-testid={`${testidPrefix}-move-date`}
          />
          <button
            type="button"
            className="tracker-button"
            disabled={pending || moveDate === ""}
            onClick={() => onMove(booking.bookingId, moveDate)}
            data-testid={`${testidPrefix}-move`}
          >
            Move
          </button>
          <button
            type="button"
            className="tracker-button"
            disabled={pending}
            onClick={() => onCancel(booking.bookingId)}
            data-testid={`${testidPrefix}-cancel`}
          >
            Cancel
          </button>
        </span>
      ) : null}
    </li>
  );
}

export function TrainingBookings({
  workspaceId,
  clientProfileId,
  programId,
  initial,
  bookableSessions,
  canWrite,
}: {
  workspaceId: string;
  clientProfileId: string;
  programId: string;
  initial: StaffBookingsPage;
  bookableSessions: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [sessionId, setSessionId] = useState("");
  const [date, setDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [history, setHistory] = useState(initial.history);
  const [historyCursor, setHistoryCursor] = useState(initial.nextCursor);
  const [historyError, setHistoryError] = useState("");

  // Re-sync from the server page whenever it re-renders (revalidation or
  // a different program/client target — also keyed upstream), so appended
  // pages never go stale or leak across targets.
  useEffect(() => {
    setHistory(initial.history);
    setHistoryCursor(initial.nextCursor);
    setHistoryError("");
  }, [initial]);

  const run = (fn: () => Promise<{ status: string; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setMessage(
        r.status === "ok" ? (r.message ?? null) : (r.message ?? "Error"),
      );
    });

  const loadMoreHistory = () =>
    startTransition(async () => {
      if (historyCursor === null) return;
      const r = await listTrainingBookingsAction({
        workspaceId,
        clientProfileId,
        programId,
        cursor: historyCursor,
      });
      if (r.status !== "ok") {
        setHistoryError(r.status === "error" ? r.message : "Load failed.");
        return;
      }
      setHistoryError("");
      setHistory((hs) => {
        const seen = new Set(hs.map((b) => b.bookingId));
        return [...hs, ...r.history.filter((b) => !seen.has(b.bookingId))];
      });
      setHistoryCursor(r.nextCursor);
    });

  return (
    <section className="tracker-section" data-testid="training-bookings">
      <h2 className="tracker-section__title">Booked sessions</h2>

      {canWrite ? (
        <div data-testid="booking-create">
          <select
            aria-label="Session"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            data-testid="booking-session"
          >
            <option value="">Choose a session…</option>
            {bookableSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Booking date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="booking-date"
          />
          <button
            type="button"
            className="tracker-button"
            disabled={pending || sessionId === "" || date === ""}
            onClick={() =>
              run(() =>
                bookTrainingSessionAction({
                  workspaceId,
                  clientProfileId,
                  programId,
                  sessionId,
                  scheduledDate: date,
                }),
              )
            }
            data-testid="booking-submit"
          >
            Book session
          </button>
        </div>
      ) : null}

      {message !== null ? (
        <p className="app-lede" data-testid="booking-message" role="status">
          {message}
        </p>
      ) : null}

      {initial.upcoming.length === 0 ? (
        <p className="app-lede" data-testid="bookings-empty">
          No upcoming bookings.
        </p>
      ) : (
        <ol className="tracker-list" data-testid="bookings-upcoming">
          {initial.upcoming.map((b) => (
            <BookingRow
              key={b.bookingId}
              booking={b}
              canWrite={canWrite}
              pending={pending}
              testidPrefix={`booking-${b.bookingId}`}
              onMove={(id, d) =>
                run(() =>
                  moveTrainingBookingAction({
                    workspaceId,
                    clientProfileId,
                    programId,
                    bookingId: id,
                    scheduledDate: d,
                  }),
                )
              }
              onCancel={(id) =>
                run(() =>
                  cancelTrainingBookingAction({
                    workspaceId,
                    clientProfileId,
                    programId,
                    bookingId: id,
                  }),
                )
              }
            />
          ))}
        </ol>
      )}

      {history.length > 0 ? (
        <>
          <h3 className="tracker-section__title">Booking history</h3>
          <ol className="tracker-list" data-testid="bookings-history">
            {history.map((b) => (
              <BookingRow
                key={b.bookingId}
                booking={b}
                canWrite={canWrite}
                pending={pending}
                testidPrefix={`history-${b.bookingId}`}
                onMove={(id, d) =>
                  run(() =>
                    moveTrainingBookingAction({
                      workspaceId,
                      clientProfileId,
                      programId,
                      bookingId: id,
                      scheduledDate: d,
                    }),
                  )
                }
                onCancel={(id) =>
                  run(() =>
                    cancelTrainingBookingAction({
                      workspaceId,
                      clientProfileId,
                      programId,
                      bookingId: id,
                    }),
                  )
                }
              />
            ))}
          </ol>
          {historyError !== "" ? (
            <p
              className="daily-errors"
              role="alert"
              data-testid="bookings-history-error"
            >
              {historyError}
            </p>
          ) : null}
          {historyCursor !== null ? (
            <button
              type="button"
              className="tracker-button"
              disabled={pending}
              onClick={loadMoreHistory}
              data-testid="bookings-history-more"
            >
              Load more
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
