"use client";

import { Check, FileText, X } from "lucide-react";
import { type CSSProperties, useState } from "react";
import {
  dateLabel,
  getCurrentRoadmapWeek,
  getRoadmapWeeks,
  type HabitRecord,
  type SourceRecords,
  safeResourceUrl,
} from "./model";
import { type AdaptiveWidgetProps, widgetDetailKey } from "./widget-geometry";
import "./coaching-content.css";

const DAY = 86_400_000;

function shiftDate(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY,
  );
}

function periodDays(period: string) {
  const match = period.match(/^(\d+)(d|w)$/);
  if (!match) return period === "today" ? 1 : 7;
  return Number(match[1]) * (match[2] === "w" ? 7 : 1);
}

function dateSpan(start: string, end: string) {
  const year = start.slice(0, 4) !== end.slice(0, 4) ? "numeric" : undefined;
  return `${dateLabel(start, { month: "short", day: "numeric", year })}–${dateLabel(end, { month: "short", day: "numeric", year })}`;
}

function completion(habit: HabitRecord, date: string) {
  return habit.completions.find((entry) => entry.date === date)?.status;
}

function updateHabit(
  records: SourceRecords,
  id: string,
  date: string,
  status: "done" | "skipped" | null,
): SourceRecords {
  return {
    ...records,
    habits: records.habits.map((habit) =>
      habit.id !== id
        ? habit
        : {
            ...habit,
            completions: [
              ...habit.completions.filter((entry) => entry.date !== date),
              ...(status ? [{ date, status }] : []),
            ],
          },
    ),
  };
}

function sourceAction(label: string, onClick: () => void, className = "") {
  return (
    <button
      className={`cb-cc-source ${className}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function selectedHabits(props: AdaptiveWidgetProps) {
  const ids = props.widget.settings.fields;
  return ids.length
    ? props.records.habits.filter((habit) => ids.includes(habit.id))
    : props.records.habits;
}

function TodayHabits(props: AdaptiveWidgetProps) {
  const {
    records,
    bodyWidth,
    bodyHeight,
    clientPreview,
    onRecordsChange,
    widget,
  } = props;
  const today = records.client.asOf;
  const selected = selectedHabits(props);
  const scheduled = selected.filter((habit) =>
    habit.scheduledDates.includes(today),
  );
  const states = scheduled.map((habit) => completion(habit, today));
  const done = states.filter((status) => status === "done").length;
  const skipped = states.filter((status) => status === "skipped").length;
  const unlogged = scheduled.length - done - skipped;
  const compact = bodyHeight < 126;
  const roomy = bodyHeight >= 280;
  const headerBudget = compact || bodyHeight < 190 ? 50 : 60;
  const rowMaximum = bodyHeight >= 290 ? 5 : bodyHeight >= 190 ? 4 : 2;
  const gapBudget =
    bodyHeight < 190 ? 12 : 8 + (scheduled.length > rowMaximum ? 16 : 0);
  const longestLabel = Math.max(
    0,
    ...scheduled
      .slice(0, rowMaximum)
      .map(
        (habit) =>
          (widget.settings.labels?.[habit.id]?.trim() || habit.name).length,
      ),
  );
  const labelCharsPerLine = Math.max(12, Math.floor((bodyWidth - 136) / 6.7));
  const rowHeight = Math.max(
    44,
    Math.ceil(longestLabel / labelCharsPerLine) * 16 + 8,
  );
  const rowCapacity = Math.max(
    0,
    Math.floor((bodyHeight - headerBudget - gapBudget) / rowHeight),
  );
  const visible = scheduled.slice(0, Math.min(rowCapacity, rowMaximum));
  return (
    <section
      className={`cb-cc-widget cb-cc-today${compact ? " is-compact" : ""}${roomy ? " is-roomy" : ""}`}
    >
      <div className="cb-cc-today-summary">
        <div className="cb-cc-heading-line">
          <strong>Scheduled today</strong>
          <time dateTime={today}>
            {dateLabel(today, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </time>
        </div>
        <div className="cb-cc-today-total">
          <strong>
            {done}
            <i>/</i>
            {scheduled.length}
          </strong>
          <span>done</span>
        </div>
        {compact && (
          <p className="cb-cc-today-counts">
            {done} done <i>·</i> {skipped} skipped <i>·</i> {unlogged} unlogged
          </p>
        )}
      </div>
      {!compact && visible.length > 0 && (
        <div className="cb-cc-habit-list">
          {visible.map((habit) => {
            const status = completion(habit, today);
            return (
              <div className="cb-cc-habit-row" key={habit.id}>
                {clientPreview ? (
                  <button
                    type="button"
                    className={`cb-cc-habit-toggle${status === "done" ? " is-done" : ""}${status === "skipped" ? " is-skipped" : ""}`}
                    aria-pressed={status === "done"}
                    aria-label={`${status === "done" ? "Undo" : "Mark done"} ${habit.name}`}
                    onClick={() =>
                      onRecordsChange(
                        updateHabit(
                          records,
                          habit.id,
                          today,
                          status === "done" ? null : "done",
                        ),
                      )
                    }
                  >
                    {status === "done" ? (
                      <Check aria-hidden="true" />
                    ) : status === "skipped" ? (
                      <X aria-hidden="true" />
                    ) : null}
                  </button>
                ) : (
                  <span
                    className={`cb-cc-task-read-state${status === "done" ? " is-done" : ""}${status === "skipped" ? " is-skipped" : ""}`}
                    role="img"
                    aria-label={status ?? "Not logged"}
                  >
                    {status === "done" ? (
                      <Check aria-hidden="true" />
                    ) : status === "skipped" ? (
                      <X aria-hidden="true" />
                    ) : null}
                  </span>
                )}
                <span className="cb-cc-habit-copy">
                  <strong>
                    {widget.settings.labels?.[habit.id]?.trim() || habit.name}
                  </strong>
                  <small>{habit.target}</small>
                </span>
                <span
                  className={`cb-cc-habit-status is-${status ?? "unlogged"}`}
                >
                  {status === "done"
                    ? "Done"
                    : status === "skipped"
                      ? "Skipped"
                      : "Not logged"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {!compact && bodyHeight >= 190 && scheduled.length > visible.length && (
        <span className="cb-cc-remaining">
          +{scheduled.length - visible.length} more scheduled
        </span>
      )}
      {scheduled.length === 0 && (
        <span className="cb-cc-empty">No selected habits scheduled today.</span>
      )}
    </section>
  );
}

type HabitPeriodSummary = {
  habit: HabitRecord;
  scheduled: number;
  done: number;
  skipped: number;
  missing: number;
};

function HabitConsistency(props: AdaptiveWidgetProps) {
  const { records, bodyWidth, bodyHeight, widget } = props;
  const to = records.client.asOf;
  // Compact three-column cards retain their centered summary. Wider cards
  // switch to the independently ranged, weekday-aligned contribution graph.
  const stripGraph =
    props.columnSpan == null ? bodyWidth >= 300 : props.columnSpan >= 4;
  const compact = bodyHeight < 126 && !stripGraph;
  const summaryOnly = bodyHeight < 220;
  const configuredDays = periodDays(widget.settings.period || "7d");
  const days =
    widget.kind === "TL21"
      ? Math.max(28, configuredDays)
      : !compact && bodyHeight >= 220
        ? Math.min(42, Math.max(28, configuredDays))
        : configuredDays;
  const from = shiftDate(to, -(days - 1));
  const habits = selectedHabits(props);
  const summaries: HabitPeriodSummary[] = habits.map((habit) => {
    const dates = habit.scheduledDates.filter(
      (date) => date >= from && date <= to,
    );
    const done = dates.filter(
      (date) => completion(habit, date) === "done",
    ).length;
    const skipped = dates.filter(
      (date) => completion(habit, date) === "skipped",
    ).length;
    return {
      habit,
      scheduled: dates.length,
      done,
      skipped,
      missing: dates.length - done - skipped,
    };
  });
  const totals = summaries.reduce(
    (sum, row) => ({
      scheduled: sum.scheduled + row.scheduled,
      done: sum.done + row.done,
      skipped: sum.skipped + row.skipped,
      missing: sum.missing + row.missing,
    }),
    { scheduled: 0, done: 0, skipped: 0, missing: 0 },
  );
  const wide = !compact && bodyWidth >= 460 && bodyHeight < 250;
  const [inspectedDate, setInspectedDate] = useState(to);
  const heightForSummary = 60;
  const routeHeight = 0;
  const maximum = wide ? 3 : bodyHeight >= 290 ? 5 : bodyHeight >= 190 ? 3 : 2;
  const gaps = 5 + (!wide && summaries.length > maximum ? 16 : 0);
  const rowHeight = bodyWidth < 235 ? 44 : 42;
  const rowLimit = wide
    ? Math.min(3, summaries.length)
    : Math.max(
        0,
        Math.floor(
          (bodyHeight - heightForSummary - routeHeight - gaps) / rowHeight,
        ),
      );
  const visible = summaries.slice(0, Math.min(rowLimit, maximum));
  const calendarStart = shiftDate(
    from,
    -((new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7),
  );
  const calendarCells = Array.from(
    {
      length:
        Math.ceil(
          (days + ((new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7)) / 7,
        ) * 7,
    },
    (_, index) => {
      const date = shiftDate(calendarStart, index);
      const scheduledForDate = habits.filter((habit) =>
        habit.scheduledDates.includes(date),
      );
      const dateDone = scheduledForDate.filter(
        (habit) => completion(habit, date) === "done",
      ).length;
      const dateSkipped = scheduledForDate.filter(
        (habit) => completion(habit, date) === "skipped",
      ).length;
      const dateMissing = scheduledForDate.length - dateDone - dateSkipped;
      const inPeriod = date >= from && date <= to;
      const state = !inPeriod
        ? "outside"
        : !scheduledForDate.length
          ? "none"
          : dateMissing
            ? "missing"
            : dateSkipped
              ? "skipped"
              : "done";
      return {
        date,
        scheduled: scheduledForDate.length,
        done: dateDone,
        skipped: dateSkipped,
        missing: dateMissing,
        state,
      };
    },
  );
  const calendarRows = calendarCells.length / 7;
  const calendarTextReserve = bodyWidth < 235 ? 32 : bodyWidth < 360 ? 16 : 0;
  const calendarCellSize = Math.floor(
    Math.min(
      (bodyWidth - 24) / 7,
      (bodyHeight - 156 - calendarTextReserve - (calendarRows - 1) * 4) /
        calendarRows,
    ),
  );
  const calendarEnabled =
    !stripGraph &&
    !compact &&
    bodyHeight >= 220 &&
    days >= 28 &&
    days <= 42 &&
    calendarCellSize >= 12;
  const compactDays = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(to, index - 6);
    const opportunities = habits.filter((habit) =>
      habit.scheduledDates.includes(date),
    );
    const completed = opportunities.filter(
      (habit) => completion(habit, date) === "done",
    ).length;
    const skippedOnDate = opportunities.filter(
      (habit) => completion(habit, date) === "skipped",
    ).length;
    return {
      date,
      scheduled: opportunities.length,
      done: completed,
      skipped: skippedOnDate,
      missing: opportunities.length - completed - skippedOnDate,
    };
  });
  const [inspectedStripDate, setInspectedStripDate] = useState(to);
  const stripHabitRows =
    stripGraph && bodyHeight >= 220 ? summaries.slice(0, 3) : [];
  const stripHabitRowsBudget = stripHabitRows.length
    ? stripHabitRows.length * 26 + 24
    : 0;
  const stripLabelBudget = bodyHeight >= 126 ? 22 : 0;
  const historyPeriod = widget.settings.historyPeriod ?? "auto";
  const autoCellSize = Math.max(
    1,
    Math.min(
      12,
      Math.floor(
        (bodyHeight - stripLabelBudget - stripHabitRowsBudget - 18) / 7,
      ),
    ),
  );
  const requestedWeeks =
    historyPeriod === "3m"
      ? 13
      : historyPeriod === "6m"
        ? 26
        : historyPeriod === "1y"
          ? 52
          : undefined;
  const weeksAtReadableSize = Math.max(1, Math.floor((bodyWidth + 3) / 8));
  const historyWeeks = requestedWeeks
    ? Math.min(requestedWeeks, weeksAtReadableSize)
    : Math.max(
        13,
        Math.min(52, Math.floor((bodyWidth + 3) / (autoCellSize + 3))),
      );
  const historyUnavailable =
    requestedWeeks != null && requestedWeeks > historyWeeks;
  const historyNotice = historyUnavailable
    ? `The requested ${historyPeriod === "1y" ? "year" : historyPeriod === "6m" ? "six month" : "three month"} history needs a wider card; showing ${historyWeeks} weeks.`
    : "";
  const graphStart = shiftDate(
    to,
    -(
      ((new Date(`${to}T12:00:00Z`).getUTCDay() + 6) % 7) +
      (historyWeeks - 1) * 7
    ),
  );
  const stripCells = Array.from({ length: historyWeeks * 7 }, (_, index) => {
    const date = shiftDate(graphStart, index);
    const scheduledForDate = habits.filter((habit) =>
      habit.scheduledDates.includes(date),
    );
    const dateDone = scheduledForDate.filter(
      (habit) => completion(habit, date) === "done",
    ).length;
    const dateSkipped = scheduledForDate.filter(
      (habit) => completion(habit, date) === "skipped",
    ).length;
    const dateMissing = scheduledForDate.length - dateDone - dateSkipped;
    const state =
      date > to
        ? "future"
        : !scheduledForDate.length
          ? "none"
          : dateMissing
            ? "missing"
            : dateSkipped
              ? "skipped"
              : "done";
    return {
      date,
      scheduled: scheduledForDate.length,
      done: dateDone,
      skipped: dateSkipped,
      missing: dateMissing,
      state,
    };
  });
  const stripLabel = dateSpan(graphStart, to);
  const stripCellSize = Math.max(
    1,
    Math.floor(
      Math.min(
        (bodyWidth - (historyWeeks - 1) * 3) / historyWeeks,
        (bodyHeight - stripLabelBudget - stripHabitRowsBudget - 6 * 3) / 7,
      ),
    ),
  );
  return (
    <section
      className={`cb-cc-widget cb-cc-consistency${compact ? " is-compact" : ""}${summaryOnly ? " is-summary" : ""}${calendarEnabled ? " has-calendar" : ""}${wide ? " has-wide" : ""}${stripGraph ? ` has-strip${bodyHeight >= 126 ? " has-strip-labels" : ""}` : ""}`}
    >
      {!stripGraph && (
        <div className="cb-cc-consistency-summary">
          <div className="cb-cc-heading-line">
            <strong>
              {compact ? (
                widget.settings.summary === "completion-count" ? (
                  <>
                    {totals.done}
                    <span> completed</span>
                  </>
                ) : (
                  <>
                    {totals.done}
                    <i>/</i>
                    {totals.scheduled}
                    <span> done</span>
                  </>
                )
              ) : widget.settings.summary === "completion-count" ? (
                `${totals.done} completed`
              ) : (
                `${totals.done} / ${totals.scheduled} done`
              )}
            </strong>
            {!compact && (
              <span>
                {summaries.length} selected{" "}
                {summaries.length === 1 ? "habit" : "habits"}
              </span>
            )}
          </div>
          {(totals.skipped > 0 || totals.missing > 0) && (
            <p>
              {totals.skipped > 0 && `${totals.skipped} skipped`}
              {totals.skipped > 0 && totals.missing > 0 && <i> · </i>}
              {totals.missing > 0 && `${totals.missing} not logged`}
            </p>
          )}
          <small>
            {compact
              ? `${summaries.length} selected ${summaries.length === 1 ? "habit" : "habits"} · ${dateSpan(from, to)}`
              : `${dateSpan(from, to)} · ${days} days`}
          </small>
        </div>
      )}
      {summaryOnly && !stripGraph && (
        <div
          className="cb-cc-consistency-mini-graph"
          role="img"
          aria-label={`Daily habit completions for the last seven days: ${compactDays.map((day) => `${dateLabel(day.date, { month: "short", day: "numeric" })}, ${day.done} of ${day.scheduled} done`).join("; ")}`}
        >
          {compactDays.map((day) => {
            const ratio = day.scheduled ? day.done / day.scheduled : 0;
            return (
              <span
                key={day.date}
                title={`${dateLabel(day.date)} · ${day.done}/${day.scheduled} done · ${day.skipped} skipped · ${day.missing} not logged`}
                style={
                  {
                    "--cb-cc-day-fill": `${Math.round(ratio * 100)}%`,
                    "--cb-cc-day-opacity": day.scheduled ? 1 : 0.34,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
      )}
      {stripGraph && (
        <div className="cb-cc-contribution-wrap">
          {bodyHeight >= 126 && (
            <span
              className="cb-cc-contribution-label"
              title={historyNotice || undefined}
            >
              {historyUnavailable
                ? `Past ${historyWeeks} weeks`
                : historyPeriod === "1y"
                  ? "Past year"
                  : historyPeriod === "6m"
                    ? "Past 6 months"
                    : historyPeriod === "3m"
                      ? "Past 3 months"
                      : `Past ${historyWeeks} weeks`}{" "}
              · {stripLabel}
            </span>
          )}
          <fieldset
            className="cb-cc-contribution-group"
            title={historyNotice || undefined}
          >
            <legend className="cb-cc-calendar-visually-hidden">
              Daily habit contributions, {stripLabel}
              {historyUnavailable && ` ${historyNotice}`}
            </legend>
            <div
              className="cb-cc-contribution"
              style={
                {
                  "--cb-cc-contribution-columns": historyWeeks,
                  "--cb-cc-contribution-size": `${stripCellSize}px`,
                  "--cb-cc-contribution-gap": "3px",
                } as CSSProperties
              }
            >
              {stripCells.map((cell) => {
                const selected = cell.date === inspectedStripDate;
                const ratio = cell.scheduled ? cell.done / cell.scheduled : 0;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    disabled={cell.state === "future"}
                    tabIndex={selected ? 0 : -1}
                    className={`cb-cc-contribution-cell is-${cell.state}${selected ? " is-inspected" : ""}`}
                    style={
                      {
                        "--cb-cc-contribution-fill": `${Math.round(ratio * 100)}%`,
                      } as CSSProperties
                    }
                    aria-pressed={selected}
                    aria-label={`${dateLabel(cell.date, { weekday: "long", month: "long", day: "numeric" })}: ${cell.state === "future" ? "date not reached" : cell.state === "none" ? "no habits scheduled" : `${cell.done} done, ${cell.skipped} skipped, ${cell.missing} not logged`}`}
                    title={`${dateLabel(cell.date)} · ${cell.state === "future" ? "Date not reached" : cell.state === "none" ? "No habits scheduled" : `${cell.done} done, ${cell.skipped} skipped, ${cell.missing} not logged`}`}
                    onClick={() => setInspectedStripDate(cell.date)}
                    onFocus={() => setInspectedStripDate(cell.date)}
                    onKeyDown={(event) => {
                      const direction =
                        event.key === "ArrowLeft"
                          ? -7
                          : event.key === "ArrowRight"
                            ? 7
                            : event.key === "ArrowUp"
                              ? -1
                              : event.key === "ArrowDown"
                                ? 1
                                : 0;
                      if (!direction) return;
                      const index = stripCells.findIndex(
                        (item) => item.date === cell.date,
                      );
                      const next = stripCells[index + direction];
                      if (!next || next.date > to) return;
                      event.preventDefault();
                      setInspectedStripDate(next.date);
                      event.currentTarget.parentElement
                        ?.querySelector<HTMLButtonElement>(
                          `[data-date="${next.date}"]`,
                        )
                        ?.focus();
                    }}
                    data-date={cell.date}
                  />
                );
              })}
            </div>
          </fieldset>
          {stripHabitRows.length > 0 && (
            <fieldset className="cb-cc-consistency-rows cb-cc-strip-habit-totals">
              <legend className="cb-cc-calendar-visually-hidden">
                Selected habit totals for summary period {dateSpan(from, to)}
              </legend>
              <span className="cb-cc-strip-summary-label">
                Selected habits · {dateSpan(from, to)}
              </span>
              {stripHabitRows.map(({ habit, scheduled, done }) => (
                <div className="cb-cc-consistency-row" key={habit.id}>
                  <strong>{habit.name}</strong>
                  <span>
                    {done}/{scheduled} done
                  </span>
                </div>
              ))}
            </fieldset>
          )}
        </div>
      )}
      {!stripGraph &&
        !summaryOnly &&
        !calendarEnabled &&
        visible.length > 0 && (
          <div className="cb-cc-consistency-rows">
            {visible.map(
              ({
                habit,
                scheduled,
                done: habitDone,
                skipped: habitSkipped,
                missing,
              }) => (
                <div className="cb-cc-consistency-row" key={habit.id}>
                  <strong>{habit.name}</strong>
                  <span>
                    {habitDone}/{scheduled} done · {habitSkipped} skipped ·{" "}
                    {missing} not logged
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      {!stripGraph &&
        !summaryOnly &&
        !calendarEnabled &&
        summaries.length > visible.length && (
          <span className="cb-cc-remaining">
            +{summaries.length - visible.length} more selected
          </span>
        )}
      {calendarEnabled && (
        <fieldset
          className="cb-cc-calendar"
          style={
            {
              "--cb-cc-calendar-square": `${calendarCellSize}px`,
            } as CSSProperties
          }
        >
          <legend className="cb-cc-calendar-visually-hidden">
            Scheduled habit contribution calendar, {dateSpan(from, to)}
          </legend>
          <div className="cb-cc-calendar-weekdays" aria-hidden="true">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span key={day}>{day[0]}</span>
            ))}
          </div>
          <div className="cb-cc-calendar-days">
            {calendarCells.map((cell) => (
              <button
                key={cell.date}
                type="button"
                disabled={cell.state === "outside"}
                tabIndex={cell.date === inspectedDate ? 0 : -1}
                className={`cb-cc-calendar-cell is-${cell.state}${cell.date === inspectedDate ? " is-inspected" : ""}`}
                style={
                  cell.state !== "outside" && cell.scheduled > 0
                    ? {
                        background: `color-mix(in srgb, var(--accent) ${Math.round((cell.done / cell.scheduled) * 100)}%, color-mix(in srgb, var(--text) 8%, transparent))`,
                      }
                    : undefined
                }
                aria-pressed={cell.date === inspectedDate}
                aria-label={`${dateLabel(cell.date, { weekday: "long", month: "long", day: "numeric" })}: ${cell.state === "outside" ? "outside selected period" : cell.state === "none" ? "no habits scheduled" : `${cell.done} done, ${cell.skipped} skipped, ${cell.missing} not logged`}`}
                title={`${dateLabel(cell.date)} · ${cell.state === "future" ? "Date not reached" : cell.state === "none" ? "No habits scheduled" : `${cell.done} done, ${cell.skipped} skipped, ${cell.missing} not logged`}`}
                onClick={() => setInspectedDate(cell.date)}
                onFocus={() => setInspectedDate(cell.date)}
                onKeyDown={(event) => {
                  const shift =
                    event.key === "ArrowLeft"
                      ? -1
                      : event.key === "ArrowRight"
                        ? 1
                        : event.key === "ArrowUp"
                          ? -7
                          : event.key === "ArrowDown"
                            ? 7
                            : 0;
                  if (!shift) return;
                  const nextDate = shiftDate(cell.date, shift);
                  if (nextDate >= from && nextDate <= to) {
                    event.preventDefault();
                    setInspectedDate(nextDate);
                    event.currentTarget.parentElement
                      ?.querySelector<HTMLButtonElement>(
                        `[data-date="${nextDate}"]`,
                      )
                      ?.focus();
                  }
                }}
                data-date={cell.date}
              />
            ))}
          </div>
          {(() => {
            const inspected = calendarCells.find(
              (cell) => cell.date === inspectedDate,
            );
            if (!inspected || inspected.state === "outside") return null;
            return (
              <p className="cb-cc-calendar-inspector">
                <time dateTime={inspected.date}>
                  {dateLabel(inspected.date, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                <span>
                  {inspected.scheduled
                    ? `${inspected.done} done · ${inspected.skipped} skipped · ${inspected.missing} not logged`
                    : "No habits scheduled"}
                </span>
              </p>
            );
          })()}
          <div className="cb-cc-calendar-legend">
            <span>Shade shows share done</span>
            <span>Counts show skipped and not logged</span>
          </div>
        </fieldset>
      )}
    </section>
  );
}

function WeeklyFocus(props: AdaptiveWidgetProps) {
  const { records, bodyHeight, widget, onDetail } = props;
  const currentWeek = records.coachingPlan?.currentWeek;
  const focus =
    records.publishedWeeklyFocus?.week === currentWeek
      ? records.publishedWeeklyFocus
      : undefined;
  const phase = records.coachingPlan?.currentPhase;
  const week = getCurrentRoadmapWeek(records);
  const phaseOnly =
    widget.settings.summary !== "focus" &&
    widget.settings.fields.includes("phase") &&
    !widget.settings.fields.includes("focus");
  const compact = bodyHeight < 126;
  const roomy = bodyHeight >= 190;
  const showPhase =
    widget.settings.summary !== "focus" &&
    widget.settings.fields.includes("phase") &&
    Boolean(phase);
  const detailKey = widgetDetailKey(widget);

  if (phaseOnly)
    return (
      <section className="cb-cc-widget cb-cc-focus cb-cc-phase-only">
        <span className="cb-cc-kicker">Current phase</span>
        <strong className="cb-cc-phase-name">
          {phase?.name ?? "No phase published"}
        </strong>
        {phase ? (
          <span className="cb-cc-muted">
            {dateSpan(phase.startDate, phase.endDate)}
          </span>
        ) : (
          <span className="cb-cc-muted">Phase dates unavailable</span>
        )}
        {bodyHeight >= 150 &&
          detailKey &&
          sourceAction("View phase details", () => onDetail(detailKey))}
      </section>
    );

  return (
    <section
      className={`cb-cc-widget cb-cc-focus${compact ? " is-compact" : ""}${roomy ? " is-roomy" : ""}`}
    >
      {showPhase && phase && (
        <div className="cb-cc-phase-strip">
          <strong>{phase.name}</strong>
          {!compact && <span>{dateSpan(phase.startDate, phase.endDate)}</span>}
        </div>
      )}
      <div className="cb-cc-focus-context">
        <strong>
          {currentWeek == null ? "Weekly focus" : `Week ${currentWeek} focus`}
        </strong>
        <time>
          {week
            ? dateSpan(week.startDate, week.endDate)
            : "Week dates unavailable"}
        </time>
      </div>
      {focus ? (
        <p
          className={`cb-cc-focus-copy${bodyHeight < 190 ? " is-bounded" : ""}`}
        >
          {focus.emphasis}
        </p>
      ) : (
        <p className="cb-cc-empty">No published focus for this week.</p>
      )}
      {!compact &&
        widget.settings.fields.includes("successCue") &&
        focus?.successCue && (
          <div className="cb-cc-success-cue">
            <span>Success cue</span>
            <strong>{focus.successCue}</strong>
          </div>
        )}
      {!compact && focus && bodyHeight >= 190 && (
        <small className="cb-cc-muted">
          Published {dateLabel(focus.updatedAt.slice(0, 10))}
        </small>
      )}
    </section>
  );
}

function metricTarget(metric: {
  target?: { kind: string; low: number; high?: number; unit: string };
}) {
  if (!metric.target) return "";
  const target = metric.target;
  if (target.kind === "range")
    return `Range ${target.low}–${target.high ?? target.low} ${target.unit}`;
  if (target.kind === "minimum") return `At least ${target.low} ${target.unit}`;
  return `Target ${target.low} ${target.unit}`;
}

function WeekAtGlance(props: AdaptiveWidgetProps) {
  const { records, bodyWidth, bodyHeight, widget } = props;
  const week = getCurrentRoadmapWeek(records);
  const ids = widget.settings.fields;
  const metrics = (week?.metrics ?? []).filter(
    (metric) => !ids.length || ids.includes(metric.key),
  );
  const compact = bodyHeight < 126;
  const wide = bodyWidth >= 460 && bodyHeight < 250;
  const dense = bodyHeight < 190;
  const roomy = bodyHeight >= 190;
  const previousWeek = getRoadmapWeeks(records).find(
    (candidate) => candidate.week === (week?.week ?? 0) - 1,
  );
  const focus =
    records.publishedWeeklyFocus?.week === week?.week
      ? records.publishedWeeklyFocus
      : undefined;
  const range = week
    ? dateSpan(week.startDate, week.endDate)
    : "Week dates unavailable";
  const visible = metrics;
  const formatValue = (metric: (typeof metrics)[number]) =>
    metric.value == null
      ? "No data"
      : `${new Intl.NumberFormat("en", { maximumFractionDigits: metric.unit === "kg" ? 1 : 0 }).format(metric.value)} ${metric.unit}`;
  const comparison = (metric: (typeof metrics)[number]) => {
    const prior = previousWeek?.metrics.find((item) => item.key === metric.key);
    if (metric.value == null || prior?.value == null) return null;
    const change = Number((metric.value - prior.value).toFixed(1));
    const amount = new Intl.NumberFormat("en", {
      maximumFractionDigits: metric.unit === "kg" ? 1 : 0,
      signDisplay: "always",
    }).format(change);
    return `${amount} ${metric.unit} vs last week`;
  };
  const metricContext = (metric: (typeof metrics)[number]) => {
    const target = metric.target ? metricTarget(metric) : "";
    const delta = comparison(metric);
    return [target, delta].filter(Boolean).join(" · ");
  };

  return (
    <section
      className={`cb-cc-widget cb-cc-week${compact ? " is-compact" : ""}${roomy ? " is-roomy" : ""}`}
    >
      <div className={`cb-cc-week-heading${compact ? " is-compact" : ""}`}>
        <strong>
          {week?.label ??
            (records.coachingPlan
              ? `Week ${records.coachingPlan.currentWeek}`
              : "Current week")}
        </strong>
        <time>{range}</time>
      </div>
      {compact && !wide && metrics[0] ? (
        <div className="cb-cc-compact-metric">
          <span>{metrics[0].label}</span>
          <strong>{formatValue(metrics[0])}</strong>
          {metrics.length > 1 && (
            <small>+{metrics.length - 1} more selected</small>
          )}
        </div>
      ) : null}
      {(!compact || wide) && (
        <div
          className={`cb-cc-metric-list${wide ? " is-wide" : ""}${dense ? " is-dense" : ""}`}
        >
          {visible.map((metric) => (
            <div className="cb-cc-metric-row" key={metric.key}>
              <span className="cb-cc-metric-label">{metric.label}</span>
              <strong>{formatValue(metric)}</strong>
              <small>{metricContext(metric)}</small>
            </div>
          ))}
        </div>
      )}
      {!compact && bodyHeight >= 190 && focus && (
        <div className="cb-cc-week-context">
          <span>Weekly focus</span>
          <strong>{focus.emphasis}</strong>
          {bodyHeight >= 280 && focus.successCue && (
            <small>{focus.successCue}</small>
          )}
        </div>
      )}
      {metrics.length === 0 && (
        <span className="cb-cc-empty">No selected measures for this week.</span>
      )}
    </section>
  );
}

function CheckInStatus(props: AdaptiveWidgetProps) {
  const { records, bodyWidth, bodyHeight, onDetail, widget } = props;
  const today = records.client.asOf;
  const days = periodDays(widget.settings.period || "30d");
  const from = shiftDate(today, -(days - 1));
  const schedule = records.checkInSchedule.filter(
    (entry) =>
      widget.settings.option !== "recurring" || entry.kind === "recurring",
  );
  const next = [...schedule]
    .filter((entry) => entry.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const latest = [...records.checkIns]
    .filter(
      (entry) =>
        entry.status !== "draft" && entry.date >= from && entry.date <= today,
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const nextDraft = next
    ? records.checkIns.find(
        (entry) => entry.status === "draft" && entry.date === next.date,
      )
    : undefined;
  const compact = bodyHeight < 126;
  const roomy = bodyHeight >= 190;
  const nextDays = next ? daysBetween(today, next.date) : null;
  const latestStatus =
    latest?.status === "feedback received"
      ? "Feedback received"
      : latest?.status === "submitted"
        ? "Submitted"
        : latest?.status === "draft"
          ? "Draft"
          : "No submission yet";
  return (
    <section
      className={`cb-cc-widget cb-cc-checkin${compact ? " is-compact" : ""}${roomy ? " is-roomy" : ""}${bodyWidth > 460 && bodyHeight < 250 ? " is-wide" : ""}${widget.settings.summary === "submission" ? " is-submission-priority" : ""}`}
    >
      <div className="cb-cc-next-checkin">
        <div className="cb-cc-calendar-emblem" aria-hidden="true">
          <span>
            {next
              ? dateLabel(next.date, { weekday: "short" }).toUpperCase()
              : "—"}
          </span>
          <strong>
            {next ? dateLabel(next.date, { day: "2-digit" }) : "—"}
          </strong>
        </div>
        <div className="cb-cc-next-copy">
          <span>Next check-in</span>
          <strong>
            {next
              ? dateLabel(next.date, { month: "short", day: "numeric" })
              : "No upcoming date"}
          </strong>
          <small>
            {nextDays == null
              ? "Schedule unavailable"
              : nextDays === 0
                ? "Today"
                : nextDays === 1
                  ? "In 1 day"
                  : `In ${nextDays} days`}
            {nextDraft ? " · Draft saved" : ""}
          </small>
        </div>
      </div>
      <div className="cb-cc-latest-submission">
        <FileText aria-hidden="true" />
        <div>
          <span>Latest submission</span>
          <strong>
            {latest
              ? `${dateLabel(latest.date, { month: "short", day: "numeric" })} · ${latestStatus}`
              : "No submission yet"}
          </strong>
        </div>
      </div>
      {!compact &&
        bodyHeight >= 290 &&
        sourceAction("Open check-in history", () => onDetail("checkins"))}
    </section>
  );
}

function PhaseMilestone(props: AdaptiveWidgetProps) {
  const { records, bodyHeight } = props;
  const phase = records.coachingPlan?.currentPhase;
  const compact = bodyHeight < 126;
  const phaseDays = phase
    ? Math.max(1, daysBetween(phase.startDate, phase.endDate))
    : 0;
  const elapsedDays = phase
    ? Math.max(
        0,
        Math.min(phaseDays, daysBetween(phase.startDate, records.client.asOf)),
      )
    : 0;
  const elapsedWeeks = phase ? Math.floor(elapsedDays / 7) + 1 : null;
  const totalWeeks = phase ? Math.max(1, Math.ceil(phaseDays / 7)) : null;
  const elapsedPercent = phaseDays ? (elapsedDays / phaseDays) * 100 : 0;
  const currentWeek = records.coachingPlan?.currentWeek;
  const focus =
    records.publishedWeeklyFocus?.week === currentWeek
      ? records.publishedWeeklyFocus
      : undefined;
  const milestones = (records.publishedMilestones ?? [])
    .filter(
      (item) => item.published && (!item.phaseId || item.phaseId === phase?.id),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const showDates = bodyHeight >= 220;
  const showFocus = bodyHeight >= 150;
  const showMilestones = bodyHeight >= 230;
  return (
    <section
      className={`cb-cc-widget cb-cc-milestone cb-cc-phase-progress${compact ? " is-compact" : ""}${bodyHeight >= 300 ? " is-roomy" : ""}`}
    >
      <div className="cb-cc-milestone-lead">
        <strong>{phase?.name ?? "No current phase"}</strong>
      </div>
      {phase ? (
        <div className="cb-cc-phase-timeline">
          <div
            className="cb-cc-elapsed-track"
            role="progressbar"
            aria-label={`Progress through ${phase.name}`}
            aria-valuemin={0}
            aria-valuemax={phaseDays}
            aria-valuenow={elapsedDays}
          >
            <i style={{ width: `${elapsedPercent}%` }} />
          </div>
          <span className="cb-cc-phase-week">
            Week {elapsedWeeks} of {totalWeeks}
          </span>
        </div>
      ) : (
        <span className="cb-cc-empty">Phase dates are unavailable.</span>
      )}
      {showDates && phase && (
        <div className="cb-cc-phase-date-range">
          <time dateTime={phase.startDate}>
            {dateLabel(phase.startDate, { month: "short", day: "numeric" })}
          </time>
          <span>to</span>
          <time dateTime={phase.endDate}>
            {dateLabel(phase.endDate, { month: "short", day: "numeric" })}
          </time>
        </div>
      )}
      {showFocus && (
        <div className="cb-cc-phase-focus">
          <span>Current focus</span>
          <strong>
            {focus?.emphasis ?? "No focus published for this week."}
          </strong>
        </div>
      )}
      {showMilestones && (
        <div className="cb-cc-phase-milestones">
          <span>Published milestones</span>
          {milestones.length ? (
            milestones.slice(0, 3).map((item) => (
              <div key={item.id}>
                <strong>{item.label}</strong>
                <time dateTime={item.date}>
                  {dateLabel(item.date, { month: "short", day: "numeric" })}
                </time>
              </div>
            ))
          ) : (
            <small>No published milestones for this phase.</small>
          )}
        </div>
      )}
    </section>
  );
}

export function CoachingWidgetContent(props: AdaptiveWidgetProps) {
  switch (props.widget.kind) {
    case "TL21":
      return props.widget.settings.option === "contributions" ? (
        <HabitConsistency {...props} />
      ) : (
        <TodayHabits {...props} />
      );
    case "TL22":
      return <HabitConsistency {...props} />;
    case "CU01":
      return <WeeklyFocus {...props} />;
    case "CU02":
      return <WeekAtGlance {...props} />;
    case "CU04":
      return <CheckInStatus {...props} />;
    case "CU10":
      return <PhaseMilestone {...props} />;
    case "CU17":
      return <DashboardSectionHeading {...props} />;
    case "CU18":
      return <CoachAnnouncement {...props} />;
    default:
      return null;
  }
}

function DashboardSectionHeading({ widget }: AdaptiveWidgetProps) {
  const content = widget.settings.content;
  return (
    <section className="cb-cc-section-heading">
      <div>
        <h2>{widget.settings.title}</h2>
        {content?.body && <p>{content.body}</p>}
      </div>
      <span aria-hidden="true" />
    </section>
  );
}

function CoachAnnouncement({ widget }: AdaptiveWidgetProps) {
  const content = widget.settings.content;
  const href = safeResourceUrl(content?.actionUrl ?? "");
  return (
    <section
      className="cb-cc-announcement"
      data-tone={content?.tone ?? "accent"}
    >
      <p>{content?.body}</p>
      {href && content?.actionLabel.trim() && (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {content.actionLabel}
        </a>
      )}
    </section>
  );
}
