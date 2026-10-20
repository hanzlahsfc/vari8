"use client";

import { type CSSProperties, type KeyboardEvent, useId, useState } from "react";
import { ChartPeriodControl } from "./chart-period-control";
import { dateLabel, type SourceRecords } from "./model";
import { SmoothTrend } from "./smooth-trend";
import "./nutrition-content.css";

type Macro = "protein" | "carbs" | "fat";
type Nutrient = Macro | "calories";
type Option = "TD" | "NTD";
type Target =
  | SourceRecords["macroTargets"][number]
  | NonNullable<SourceRecords["calorieTargets"]>[number];
type Period = "week" | "month" | "6month" | "year";
type HistoryRow = {
  date: string;
  actual: number | null;
  target: Target | undefined;
  periodEnd?: string;
};

const spanDays: Record<Period, number> = {
  week: 7,
  month: 30,
  "6month": 183,
  year: 365,
};

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() + days);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
}

function targetFor(
  records: SourceRecords,
  nutrient: Nutrient,
  option: Option,
  date: string,
): Target | undefined {
  const applies = (target: { effectiveFrom: string; effectiveTo?: string }) =>
    target.effectiveFrom <= date &&
    (!target.effectiveTo || target.effectiveTo >= date);
  return nutrient === "calories"
    ? records.calorieTargets?.find(
        (target) => target.option === option && applies(target),
      )
    : records.macroTargets.find(
        (target) =>
          target.macro === nutrient &&
          target.option === option &&
          applies(target),
      );
}

function actualFor(
  records: SourceRecords,
  nutrient: Nutrient,
  option: Option,
  date: string,
): number | null {
  if (nutrient === "calories") {
    const row = records.calorieIntake?.find(
      (entry) => entry.date === date && entry.option === option,
    );
    return row && Number.isFinite(row.value) ? row.value : null;
  }
  const row = records.macroIntake.find(
    (entry) => entry.date === date && entry.option === option,
  );
  const value = row?.[nutrient];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function targetBand(target: Target | undefined): [number, number] | null {
  if (!target) return null;
  return [
    target.low,
    target.kind === "range" ? (target.high ?? target.low) : target.low,
  ];
}

function fmt(value: number, digits = 0) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(
    value,
  );
}

function nameFor(nutrient: Nutrient) {
  if (nutrient === "calories") return "Calories";
  return nutrient === "carbs"
    ? "Carbs"
    : nutrient[0].toUpperCase() + nutrient.slice(1);
}

function unitFor(nutrient: Nutrient) {
  return nutrient === "calories" ? "kcal" : "g";
}

function targetText(target: Target | undefined, nutrient: Nutrient) {
  if (!target) return "No target";
  const unit = target.unit || unitFor(nutrient);
  if (target.kind === "range")
    return `Range ${fmt(target.low)}–${fmt(target.high ?? target.low)} ${unit}`;
  if (target.kind === "minimum") return `Minimum ≥${fmt(target.low)} ${unit}`;
  return `Fixed ${fmt(target.low)} ${unit}`;
}

function nutrientHistory(
  records: SourceRecords,
  nutrient: Nutrient,
  option: Option,
  dates: string[],
) {
  return dates.map((date) => {
    const actual = actualFor(records, nutrient, option, date);
    return {
      date,
      actual,
      target: targetFor(records, nutrient, option, date),
    };
  });
}

function mondayOf(date: string) {
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() - ((shifted.getDay() + 6) % 7));
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
}

function aggregateHistory(
  rows: HistoryRow[],
  bucket: "week" | "month",
  unit: string,
) {
  const groups = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const key =
      bucket === "month" ? `${row.date.slice(0, 7)}-01` : mondayOf(row.date);
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return [...groups].map(([date, values]) => {
    const logged = values.flatMap(({ actual }) =>
      actual == null ? [] : [actual],
    );
    const targets = values.flatMap(({ target }) => (target ? [target] : []));
    const average = (numbers: number[]) =>
      numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    const firstTarget = targets[0];
    const target = firstTarget
      ? ({
          ...firstTarget,
          low: average(targets.map((item) => item.low)),
          ...(firstTarget.kind === "range"
            ? { high: average(targets.map((item) => item.high ?? item.low)) }
            : {}),
          unit,
        } as Target)
      : undefined;
    return {
      date: values[0]?.date ?? date,
      actual: logged.length ? average(logged) : null,
      target,
      periodEnd: values.at(-1)?.date,
    };
  });
}

function axisDate(value: string, start: string, end: string) {
  return dateLabel(value, {
    month: "short",
    day: "numeric",
    ...(start.slice(0, 4) !== end.slice(0, 4) ? { year: "numeric" } : {}),
  });
}

function latestSummary(rows: HistoryRow[], nutrient: Nutrient) {
  const latest = rows.at(-1);
  if (!latest) return "No date in this period";
  const actual =
    latest.actual == null
      ? "Not logged"
      : `${fmt(latest.actual)} ${unitFor(nutrient)}`;
  return `${dateLabel(latest.date)}: ${actual} · target ${targetText(latest.target, nutrient)}`;
}

function LinePanel({
  nutrient,
  rows,
  plotWidth: availableWidth,
  plotHeight,
  rangeStart,
  rangeEnd,
}: {
  nutrient: Nutrient;
  rows: HistoryRow[];
  plotWidth: number;
  plotHeight: number;
  rangeStart: string;
  rangeEnd: string;
}) {
  if (!rows.some(({ actual, target }) => actual != null || target))
    return (
      <p className="nc-chart-empty">
        No targets or logged intake in this period.
      </p>
    );
  const unit = unitFor(nutrient);
  const targetRows = rows.map(({ date, target }) => ({
    date,
    value: target && target.kind !== "range" ? target.low : null,
  }));
  const targetBandRows = rows.map(({ date, target }) => ({
    date,
    low: target?.kind === "range" ? target.low : null,
    high: target?.kind === "range" ? (target.high ?? target.low) : null,
  }));
  const hasRanges = rows.some(({ target }) => target?.kind === "range");
  const hasTarget = rows.some(({ target }) => target);
  return (
    <div className="nc-chart-panel">
      <div className="nc-chart-title">
        <strong>{nameFor(nutrient)}</strong>
        <span>{unit}</span>
      </div>
      <div className="nc-chart-scroll">
        <SmoothTrend
          rows={rows.map(({ date, actual }) => ({ date, value: actual }))}
          unit={unit}
          width={availableWidth}
          height={plotHeight}
          label={`${nameFor(nutrient)} intake`}
          compact={availableWidth < 300 || plotHeight < 48}
          targetRows={targetRows}
          targetBandRows={targetBandRows}
          targetLabel={hasRanges ? "Target / range" : "Target"}
          targetStyle="subtle"
        />
      </div>
      {(availableWidth < 300 || plotHeight < 48) && (
        <div className="nc-chart-axis">
          <span>{axisDate(rangeStart, rangeStart, rangeEnd)}</span>
          <span>{axisDate(rangeEnd, rangeStart, rangeEnd)}</span>
        </div>
      )}
      <div className="nc-chart-legend">
        <span>
          <i className="is-actual" />
          Logged
        </span>
        {hasTarget && (
          <span>
            <i className="is-target" />
            {hasRanges ? "Target / range" : "Target"}
          </span>
        )}
      </div>
      <p className="nc-chart-current">{latestSummary(rows, nutrient)}</p>
    </div>
  );
}

function ColumnPanel({
  nutrient,
  rows,
  plotWidth: availableWidth,
  plotHeight,
  rangeStart,
  rangeEnd,
  aggregationLabel,
}: {
  nutrient: Nutrient;
  rows: HistoryRow[];
  plotWidth: number;
  plotHeight: number;
  rangeStart: string;
  rangeEnd: string;
  aggregationLabel?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(rows.length - 1);
  const tooltipId = useId();
  const max =
    Math.max(
      1,
      ...rows
        .flatMap(({ actual, target }) => [
          actual,
          ...(target ? [target.low, target.high ?? target.low] : []),
        ])
        .filter((value): value is number => value != null),
    ) * 1.12;
  const width = availableWidth;
  const height = plotHeight;
  const unit = unitFor(nutrient);
  const x = (index: number) =>
    8 + (index / Math.max(1, rows.length - 1)) * (width - 16);
  const y = (value: number) => 7 + (1 - value / max) * (height - 27);
  const stepWidth = (width - 16) / Math.max(1, rows.length - 1);
  const barWidth = Math.max(2, Math.min(7, stepWidth * 0.56));
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, rows.length - 1));
  const activeRow = rows[safeActiveIndex];
  const tooltipWidth = Math.min(208, Math.max(120, width - 12));
  const tooltipLeft = Math.max(
    6,
    Math.min(x(safeActiveIndex) - tooltipWidth / 2, width - tooltipWidth - 6),
  );
  const rowDate = (row: HistoryRow) =>
    row.periodEnd && row.periodEnd !== row.date
      ? `${dateLabel(row.date)}–${dateLabel(row.periodEnd)}`
      : dateLabel(row.date, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
  const rowActual = (row: HistoryRow) =>
    row.actual == null
      ? "Not logged"
      : `${aggregationLabel ? "Average " : ""}${fmt(row.actual)} ${unit}`;
  const focusColumn = (index: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    setActiveIndex(next);
  };
  const onColumnKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusColumn(safeActiveIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusColumn(safeActiveIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusColumn(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusColumn(rows.length - 1);
    }
  };
  return (
    <div className="nc-chart-panel">
      <div className="nc-chart-title">
        <strong>{nameFor(nutrient)}</strong>
        <span>{unit}</span>
      </div>
      <div className="nc-chart-scroll">
        <div
          className="nc-column-chart-frame"
          style={{ "--nc-native-plot-width": `${width}px` } as CSSProperties}
          role="listbox"
          aria-label={`${nameFor(nutrient)} intake by date. Use arrow keys to inspect each date.`}
          aria-activedescendant={`nc-column-${safeActiveIndex}`}
          tabIndex={0}
          onKeyDown={onColumnKeyDown}
        >
          <svg
            className="nc-nutrition-chart"
            aria-hidden="true"
            viewBox={`0 0 ${width} ${height}`}
          >
            {[0.25, 0.55, 0.85].map((fraction) => (
              <path
                className="nc-chart-grid"
                d={`M8 ${Math.round(fraction * (height - 12))}H${width - 8}`}
                key={fraction}
              />
            ))}
            {rows.map((row, index) => {
              const center = x(index);
              const band = targetBand(row.target);
              const baseline = height - 17;
              const actual = row.actual;
              const lowerTarget = band?.[0];
              const remainingTop =
                actual == null || lowerTarget == null
                  ? lowerTarget
                  : Math.min(actual, lowerTarget);
              const upperTarget =
                row.target?.kind === "range"
                  ? (row.target.high ?? row.target.low)
                  : row.target?.kind === "fixed"
                    ? row.target.low
                    : null;
              return (
                <g
                  key={row.date}
                  className="nc-chart-column-item"
                  onPointerEnter={() => setActiveIndex(index)}
                >
                  <rect
                    className="nc-chart-column-hit"
                    x={center - Math.max(8, stepWidth / 2)}
                    y={0}
                    width={Math.max(16, stepWidth)}
                    height={height - 17}
                  />
                  {band && (
                    <rect
                      className={`nc-chart-column-track${actual == null ? " is-unlogged" : ""}`}
                      x={center - barWidth / 2}
                      y={y(band[0])}
                      width={barWidth}
                      height={
                        actual == null
                          ? 0
                          : Math.max(1, y(remainingTop ?? band[0]) - y(band[0]))
                      }
                    />
                  )}
                  {actual != null && (
                    <rect
                      className="nc-chart-column"
                      x={center - barWidth / 2}
                      y={y(
                        lowerTarget == null
                          ? actual
                          : Math.min(actual, lowerTarget),
                      )}
                      width={barWidth}
                      height={Math.max(
                        1,
                        baseline -
                          y(
                            lowerTarget == null
                              ? actual
                              : Math.min(actual, lowerTarget),
                          ),
                      )}
                    />
                  )}
                  {actual != null &&
                    upperTarget != null &&
                    actual > upperTarget && (
                      <rect
                        className="nc-chart-column is-over-target"
                        x={center - barWidth / 2}
                        y={y(actual)}
                        width={barWidth}
                        height={Math.max(1, y(upperTarget) - y(actual))}
                      />
                    )}
                  {band && (
                    <path
                      className={
                        row.target?.kind === "range"
                          ? "nc-chart-column-range"
                          : "nc-chart-column-target"
                      }
                      d={
                        row.target?.kind === "range"
                          ? `M${center} ${y(band[0])}v${y(band[1]) - y(band[0])}`
                          : `M${center - 4} ${y(band[0])}h8`
                      }
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <div className="nc-chart-accessible-options">
            {rows.map((row, index) => (
              <div
                id={`nc-column-${index}`}
                key={row.date}
                role="option"
                aria-label={`${rowDate(row)}: ${rowActual(row)}; target ${targetText(row.target, nutrient)}`}
                aria-describedby={
                  safeActiveIndex === index ? tooltipId : undefined
                }
                aria-selected={safeActiveIndex === index}
                tabIndex={-1}
              />
            ))}
          </div>
          {activeRow && (
            <div
              id={tooltipId}
              className="nc-column-tooltip"
              role="tooltip"
              style={{ left: `${tooltipLeft}px`, width: `${tooltipWidth}px` }}
            >
              <strong>{rowDate(activeRow)}</strong>
              <span>{rowActual(activeRow)}</span>
              <span>Target · {targetText(activeRow.target, nutrient)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="nc-chart-axis">
        <span>{axisDate(rangeStart, rangeStart, rangeEnd)}</span>
        <span>{axisDate(rangeEnd, rangeStart, rangeEnd)}</span>
      </div>
      <div className="nc-chart-legend">
        <span>
          <i className="is-actual" />
          Consumed
        </span>
        <span>
          <i className="is-remaining" />
          Remaining to target
          {rows.some((row) => row.target?.kind === "range") ? " / range" : ""}
        </span>
        {rows.some(
          ({ actual, target }) =>
            actual != null &&
            target &&
            (target.kind === "fixed"
              ? actual > target.low
              : target.kind === "range" &&
                actual > (target.high ?? target.low)),
        ) && (
          <span>
            <i className="is-over" />
            Over target
          </span>
        )}
      </div>
      <p className="nc-chart-current">{latestSummary(rows, nutrient)}</p>
      {aggregationLabel && (
        <p className="nc-chart-current">{aggregationLabel}</p>
      )}
    </div>
  );
}

export function NutritionHistory({
  records,
  option,
  period,
  mode,
  nutrient,
  onPeriodChange,
  bodyWidth,
  bodyHeight,
}: {
  records: SourceRecords;
  option: Option;
  period: Period;
  mode: "line" | "stacked";
  nutrient: Nutrient;
  onPeriodChange?: (period: string) => void;
  bodyWidth: number;
  bodyHeight: number;
}) {
  const asOf = records.client.asOf;
  const from = shiftDate(asOf, -(spanDays[period] - 1));
  const dates = Array.from({ length: spanDays[period] }, (_, index) =>
    shiftDate(from, index),
  );
  const wide = bodyWidth >= 640 && bodyHeight >= 340;
  const dailyRows = nutrientHistory(records, nutrient, option, dates);
  const aggregateBy =
    mode === "stacked" && period === "year"
      ? "month"
      : mode === "stacked" && period === "6month"
        ? "week"
        : undefined;
  const rows = aggregateBy
    ? aggregateHistory(dailyRows, aggregateBy, unitFor(nutrient))
    : dailyRows;
  const compact = bodyWidth < 300 || bodyHeight < 132;
  const shallow = !compact && bodyHeight < 240;
  const summaryOnly = bodyHeight < 110;
  const current = dailyRows.at(-1);
  const detailRows =
    bodyWidth < 300 && bodyHeight >= 240
      ? dailyRows.slice(-Math.min(4, Math.floor((bodyHeight - 180) / 30)))
      : [];
  const plotWidth = Math.max(1, Math.min(744, bodyWidth - 8));
  const plotHeight = compact
    ? Math.max(28, Math.min(48, bodyHeight - 70))
    : shallow
      ? Math.max(28, bodyHeight - (bodyWidth < 420 ? 112 : 90))
      : Math.max(76, Math.min(220, bodyHeight - (bodyWidth < 420 ? 170 : 146)));
  return (
    <section
      className="nc-widget nc-nutrition-history"
      data-mode={mode}
      data-density={compact ? "small" : wide ? "wide" : "regular"}
      data-narrow={bodyWidth < 420}
      data-shallow={shallow}
      style={
        { "--nc-chart-width": `${Math.max(1, bodyWidth)}px` } as CSSProperties
      }
    >
      <header className="nc-history-toolbar">
        <div>
          <strong>{nameFor(nutrient)} history</strong>
          <span>
            Logged vs active target ·{" "}
            {option === "TD" ? "Training day" : "Rest day"}
          </span>
        </div>
        <div className="nc-period-control">
          <span>Range</span>
          <ChartPeriodControl
            period={period}
            onChange={onPeriodChange}
            label="Nutrition chart range"
          />
        </div>
      </header>
      {summaryOnly ? (
        <div className="nc-history-summary">
          <strong>
            {current?.actual == null
              ? "Not logged"
              : `${fmt(current.actual)} ${unitFor(nutrient)}`}
          </strong>
          <span>
            {dateLabel(asOf)} · Target {targetText(current?.target, nutrient)}
          </span>
        </div>
      ) : (
        <div className="nc-nutrition-panels" data-count="1">
          {mode === "line" ? (
            <LinePanel
              nutrient={nutrient}
              rows={rows}
              plotWidth={plotWidth}
              plotHeight={plotHeight}
              rangeStart={from}
              rangeEnd={asOf}
            />
          ) : (
            <ColumnPanel
              nutrient={nutrient}
              rows={rows}
              plotWidth={plotWidth}
              plotHeight={plotHeight}
              rangeStart={from}
              rangeEnd={asOf}
              aggregationLabel={
                aggregateBy === "month"
                  ? "Monthly averages"
                  : aggregateBy === "week"
                    ? "Weekly averages"
                    : undefined
              }
            />
          )}
        </div>
      )}
      {detailRows.length > 0 && (
        <div className="nc-narrow-history">
          {detailRows.map((row) => (
            <div key={row.date}>
              <time dateTime={row.date}>{dateLabel(row.date)}</time>
              <strong>
                {row.actual == null
                  ? "Not logged"
                  : `${fmt(row.actual)} ${unitFor(nutrient)}`}
              </strong>
            </div>
          ))}
        </div>
      )}
      <p className="nc-missing-note">
        {mode === "line"
          ? "Lines connect logged days; inspect dates for missing entries."
          : "A gap means intake was not logged. Zero remains a recorded value."}
      </p>
    </section>
  );
}
