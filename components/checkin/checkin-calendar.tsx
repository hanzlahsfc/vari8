"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  checkInCalendarDayKey,
  checkInCalendarMonthCells,
} from "@/lib/checkin/calendar";

/**
 * P-025-D2 — Check-In calendar (decision #104): read-only month grid +
 * accessible agenda list over the existing answer-free header lists.
 * Day placement is viewer-local (browser timezone) — DISPLAY ONLY; it
 * sets no timezone authority, DST, or recurrence policy. Cancelled
 * instances remain visible with explicit "Cancelled" text.
 */

export type CheckInCalendarItem = {
  instanceId: string;
  formName: string;
  versionSeq: number;
  dueAt: string;
  state: "CANCELLED" | "REVIEWED" | "SUBMITTED" | "SCHEDULED";
  late: boolean;
  submittedAt: string | null;
};

export type CheckInCalendarLoadResult =
  | { status: "ok"; items: CheckInCalendarItem[] }
  | { status: "empty" }
  | { status: "error"; message: string };

export type CheckInCalendarProps = {
  /** Server action loading one bounded instant range. */
  load: (input: {
    from: string;
    to: string;
  }) => Promise<CheckInCalendarLoadResult>;
  /** Optional detail-link base; items link to `${base}/{instanceId}`. */
  detailHrefBase?: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATE_LABEL: Record<CheckInCalendarItem["state"], string> = {
  SCHEDULED: "Scheduled",
  SUBMITTED: "Submitted",
  REVIEWED: "Reviewed",
  CANCELLED: "Cancelled",
};

function localDayInstant(year: number, month: number, day: number): Date {
  // month is 1-based here (day keys carry it).
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function CheckInCalendar({
  load,
  detailHrefBase,
}: CheckInCalendarProps) {
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const todayKey = checkInCalendarDayKey(new Date().toISOString(), tz);
  const [ym, setYm] = useState(() => {
    const [y, m] = todayKey.split("-").map(Number);
    return { y, m };
  });
  const [view, setView] = useState<"grid" | "agenda">("grid");
  const [result, setResult] = useState<CheckInCalendarLoadResult | null>(null);

  const cells = useMemo(() => checkInCalendarMonthCells(ym.y, ym.m - 1), [ym]);

  useEffect(() => {
    let live = true;
    const [fy, fm, fd] = cells[0].key.split("-").map(Number);
    const [ly, lm, ld] = cells[41].key.split("-").map(Number);
    const from = localDayInstant(fy, fm, fd);
    // End-exclusive: start of the day AFTER the last visible cell.
    const to = new Date(localDayInstant(ly, lm, ld).getTime() + 86400_000);
    setResult(null);
    void load({ from: from.toISOString(), to: to.toISOString() }).then((r) => {
      if (live) setResult(r);
    });
    return () => {
      live = false;
    };
  }, [cells, load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CheckInCalendarItem[]>();
    if (result?.status !== "ok") return map;
    for (const item of result.items) {
      const key = checkInCalendarDayKey(item.dueAt, tz);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [result, tz]);

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(ym.y, ym.m - 1, 1)));

  const step = (delta: number) =>
    setYm(({ y, m }) => {
      const d = new Date(Date.UTC(y, m - 1 + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    });
  const goToday = () => {
    const [y, m] = todayKey.split("-").map(Number);
    setYm({ y, m });
  };

  const renderChip = (item: CheckInCalendarItem, testid: string) => {
    const label = `${item.formName} — v${item.versionSeq} · ${STATE_LABEL[item.state]}${item.late ? " · Late" : ""}`;
    const inner = (
      <>
        <span className="checkin-calendar__chip-name">{item.formName}</span>
        <span className="checkin-calendar__chip-state">
          {STATE_LABEL[item.state]}
          {item.late ? " · Late" : ""}
        </span>
      </>
    );
    const cls = `checkin-calendar__chip checkin-calendar__chip--${item.state.toLowerCase()}`;
    if (detailHrefBase) {
      return (
        <li key={item.instanceId}>
          <Link
            href={`${detailHrefBase}/${item.instanceId}`}
            className={cls}
            data-testid={testid}
            aria-label={label}
          >
            {inner}
          </Link>
        </li>
      );
    }
    return (
      <li key={item.instanceId}>
        <span className={cls} data-testid={testid} title={label}>
          {inner}
        </span>
      </li>
    );
  };

  return (
    <section
      className="tracker-section checkin-calendar"
      data-testid="checkin-calendar"
    >
      <div className="checkin-calendar__toolbar">
        <h2 className="tracker-section__title checkin-calendar__month">
          {monthLabel}
        </h2>
        <div className="checkin-calendar__nav">
          <button
            type="button"
            className="checkin-calendar__nav-btn"
            onClick={() => step(-1)}
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            className="checkin-calendar__nav-btn"
            onClick={goToday}
          >
            Today
          </button>
          <button
            type="button"
            className="checkin-calendar__nav-btn"
            onClick={() => step(1)}
            aria-label="Next month"
          >
            ›
          </button>
          <button
            type="button"
            className="checkin-calendar__nav-btn"
            onClick={() => setView((v) => (v === "grid" ? "agenda" : "grid"))}
            data-testid="checkin-calendar-toggle"
          >
            {view === "grid" ? "List" : "Grid"}
          </button>
        </div>
      </div>
      <p className="tracker-section__note">
        Days shown in your local timezone — viewers elsewhere may see a
        different day.
      </p>
      <p aria-live="polite" className="checkin-calendar__status">
        {result === null
          ? "Loading…"
          : result.status === "error"
            ? null
            : result.status === "ok" && result.items.length === 0
              ? "No Check-Ins this month."
              : null}
      </p>
      {result?.status === "error" ? (
        <p
          className="daily-errors"
          role="alert"
          data-testid="checkin-calendar-error"
        >
          {result.message}
        </p>
      ) : null}
      {result?.status === "empty" ? (
        <p className="app-lede" data-testid="checkin-calendar-empty">
          No Check-Ins available.
        </p>
      ) : null}
      {result?.status === "ok" && view === "grid" ? (
        <table
          className="checkin-calendar__grid"
          role="grid"
          aria-label={`Check-Ins for ${monthLabel}`}
          data-testid="checkin-calendar-grid"
        >
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, w) => (
              <tr key={w}>
                {cells.slice(w * 7, w * 7 + 7).map((cell) => {
                  const items = byDay.get(cell.key) ?? [];
                  return (
                    <td
                      key={cell.key}
                      className={`checkin-calendar__cell${cell.inMonth ? "" : " checkin-calendar__cell--outside"}${cell.key === todayKey ? " checkin-calendar__cell--today" : ""}`}
                      data-testid={`calendar-cell-${cell.key}`}
                    >
                      <span className="checkin-calendar__day">
                        {Number(cell.key.slice(8, 10))}
                      </span>
                      <ul className="checkin-calendar__chips">
                        {items.map((item) =>
                          renderChip(
                            item,
                            `cal-chip-${item.state.toLowerCase()}`,
                          ),
                        )}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {result?.status === "ok" && view === "agenda" ? (
        <ol className="tracker-list" data-testid="checkin-calendar-agenda">
          {result.items.map((item) => (
            <li key={item.instanceId} className="tracker-list__row">
              <span className="tracker-list__title">
                {item.formName} — v{item.versionSeq}
              </span>
              <span className="tracker-list__sub">
                Due{" "}
                {new Date(item.dueAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {STATE_LABEL[item.state]}
                {item.late ? " · Late" : ""}
              </span>
              {detailHrefBase ? (
                <Link
                  href={`${detailHrefBase}/${item.instanceId}`}
                  className="tracker-list__link"
                  data-testid="agenda-detail-link"
                >
                  View
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
