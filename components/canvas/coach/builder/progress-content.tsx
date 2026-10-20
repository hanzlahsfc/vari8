"use client";

import { ArrowUpRight, Check, Dumbbell, Footprints, Moon } from "lucide-react";
import { type CSSProperties, type ReactNode, useId, useState } from "react";
import { ChartPeriodControl } from "./chart-period-control";
import {
  type ClientTask,
  dateLabel,
  getRoadmapWeeks,
  type RoadmapMetric,
  sourceOptions,
} from "./model";
import { SmoothTrend } from "./smooth-trend";
import type { AdaptiveWidgetProps } from "./widget-geometry";
import "./progress-content.css";

type Props = AdaptiveWidgetProps;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function dateInPeriod(date: string, period: string, asOf: string) {
  const dayCount: Record<string, number> = {
    today: 1,
    week: 7,
    month: 30,
    "6month": 183,
    year: 365,
    "7d": 7,
    "14d": 14,
    "30d": 30,
    "90d": 90,
    "4w": 28,
    "8w": 56,
    "12w": 84,
  };
  const start = new Date(`${asOf}T12:00:00`);
  start.setDate(start.getDate() - (dayCount[period] ?? 30) + 1);
  const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return date >= from && date <= asOf;
}

function mean(values: (number | null | undefined)[]) {
  const valid = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null;
}

function fmt(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(
        value,
      );
}

function unitConvert(value: number | null, from: string, to: string) {
  if (value == null || from === to) return value;
  if (from === "kg" && to === "lb") return value * 2.2046226218;
  if (from === "lb" && to === "kg") return value / 2.2046226218;
  if (from === "cm" && to === "in") return value / 2.54;
  if (from === "in" && to === "cm") return value * 2.54;
  return value;
}

function action(label: string, run: () => void, cls = "") {
  return (
    <button className={`cb-pc-action ${cls}`} onClick={run} type="button">
      {label}
    </button>
  );
}

function Empty({
  children,
  actionLabel,
  onAction,
}: {
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="cb-pc-empty">
      <span>{children}</span>
      {actionLabel && onAction ? action(actionLabel, onAction) : null}
    </div>
  );
}

function DatedPlot({
  rows,
  unit,
  width,
  height,
  label,
  form = "line",
  target,
  targetRows,
  targetBandRows,
  targetLabel,
  targetStyle,
  compact = false,
}: {
  rows: { date: string; value: number | null }[];
  unit: string;
  width: number;
  height: number;
  label: string;
  form?: "line" | "bars" | "dots";
  target?: number;
  targetRows?: { date: string; value: number | null }[];
  targetBandRows?: { date: string; low: number | null; high: number | null }[];
  targetLabel?: string;
  targetStyle?: "subtle";
  compact?: boolean;
}) {
  const summaryId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const valid = rows
    .map((row) => row.value)
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (!valid.length)
    return <div className="cb-pc-plot-empty">No readings in this period</div>;
  if (form !== "bars") {
    return (
      <SmoothTrend
        rows={rows}
        unit={unit}
        width={width}
        height={height}
        label={label}
        compact={compact}
        target={target}
        targetRows={targetRows}
        targetBandRows={targetBandRows}
        targetLabel={targetLabel}
        targetStyle={targetStyle}
      />
    );
  }
  const lo = Math.min(
    ...(form === "bars" ? [0, ...valid] : valid),
    target ?? Infinity,
  );
  const hi = Math.max(...valid, target ?? -Infinity);
  const span = hi - lo || Math.max(Math.abs(hi) * 0.08, 1);
  const w = Math.max(1, width);
  const h = Math.max(28, height);
  const insetX = compact ? 8 : 42;
  const insetY = 8;
  const plotBottom = h - 3;
  const stamps = rows.map((row) => new Date(`${row.date}T12:00:00`).valueOf());
  const start = Math.min(...stamps);
  const end = Math.max(...stamps);
  const duration = Math.max(1, end - start);
  const xPositions = rows.map((_, i) =>
    rows.length <= 1
      ? w / 2
      : insetX + 12 + ((stamps[i] - start) / duration) * (w - insetX - 24),
  );
  const coordinates = rows.map((row, i) =>
    row.value == null
      ? null
      : {
          x: xPositions[i],
          y: insetY + ((hi - row.value) / span) * (plotBottom - insetY),
        },
  );
  const targetY =
    target == null
      ? null
      : insetY + ((hi - target) / span) * (plotBottom - insetY);
  const selectedIndex =
    activeIndex == null ? null : Math.min(activeIndex, rows.length - 1);
  const selected = selectedIndex == null ? null : rows[selectedIndex];
  const latestRow = rows.at(-1);
  const selectedPoint =
    selectedIndex == null ? null : coordinates[selectedIndex];
  const inspectAt = (clientX: number, bounds: DOMRect) => {
    if (!rows.length || !bounds.width) return;
    const x = ((clientX - bounds.left) / bounds.width) * w;
    setActiveIndex(
      xPositions.reduce(
        (best, pointX, index) =>
          Math.abs(pointX - x) < Math.abs(xPositions[best] - x) ? index : best,
        0,
      ),
    );
  };
  const selectedValue =
    selected?.value == null ? "Not logged" : `${fmt(selected.value)} ${unit}`;
  const tooltipStyle: CSSProperties | undefined = selectedPoint
    ? {
        left: Math.max(2, Math.min(selectedPoint.x - 76, w - 158)),
        top: Math.max(0, Math.min(selectedPoint.y - 44, h - 42)),
      }
    : selected
      ? {
          left: Math.max(
            2,
            Math.min(
              (coordinates[selectedIndex ?? 0]?.x ?? w / 2) - 76,
              w - 158,
            ),
          ),
          top: 4,
        }
      : undefined;
  return (
    <figure className={`cb-pc-plot is-${form}`}>
      <div
        className="cb-pc-smooth-trend-surface cb-pc-bars-surface"
        role="slider"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label={`${label}: inspect dated entries with Left and Right arrows`}
        aria-roledescription="interactive chart"
        aria-valuemin={1}
        aria-valuemax={rows.length}
        aria-valuenow={(selectedIndex ?? rows.length - 1) + 1}
        aria-valuetext={`${selected ? dateLabel(selected.date, { month: "short", day: "numeric", year: "numeric" }) : latestRow ? dateLabel(latestRow.date, { month: "short", day: "numeric", year: "numeric" }) : "Latest"}, ${selected ? selectedValue : latestRow?.value == null ? "Not logged" : `${fmt(latestRow?.value)} ${unit}`}`}
        aria-describedby={summaryId}
        onPointerMove={(event) =>
          inspectAt(event.clientX, event.currentTarget.getBoundingClientRect())
        }
        onPointerDown={(event) =>
          inspectAt(event.clientX, event.currentTarget.getBoundingClientRect())
        }
        onPointerLeave={(event) => {
          if (event.currentTarget !== document.activeElement)
            setActiveIndex(null);
        }}
        onFocus={() => setActiveIndex(rows.length - 1)}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={(event) => {
          if (
            !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          if (event.key === "Escape") {
            setActiveIndex(null);
            return;
          }
          setActiveIndex((current) =>
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? rows.length - 1
                : Math.max(
                    0,
                    Math.min(
                      rows.length - 1,
                      (current ?? rows.length - 1) +
                        (event.key === "ArrowRight" ? 1 : -1),
                    ),
                  ),
          );
        }}
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height={h}
          aria-hidden="true"
          focusable="false"
        >
          <title>{`${label}: ${rows
            .map(
              (row) =>
                `${dateLabel(row.date, { month: "short", day: "numeric", year: "numeric" })} ${row.value == null ? "not logged" : `${fmt(row.value)} ${unit}`}`,
            )
            .join("; ")}`}</title>
          {(compact ? [0, 1] : [0, 0.5, 1]).map((fraction) => {
            const y = insetY + fraction * (plotBottom - insetY);
            return (
              <g key={fraction}>
                <path className="cb-pc-gridline" d={`M${insetX} ${y}H${w}`} />
                {!compact && h >= 70 && (
                  <text
                    className="cb-pc-y-label"
                    x={insetX - 6}
                    y={y + 4}
                    textAnchor="end"
                  >
                    {fmt(hi - fraction * (hi - lo))}
                  </text>
                )}
              </g>
            );
          })}
          {rows.map((row, i) => {
            const point = coordinates[i];
            if (!point) return null;
            const barWidth = Math.min(
              22,
              Math.max(5, (w / rows.length) * 0.48),
            );
            return (
              <rect
                key={row.date}
                className="cb-pc-bar"
                x={point.x - barWidth / 2}
                y={point.y}
                width={barWidth}
                height={plotBottom - point.y}
                rx="2"
              >
                <title>{`${dateLabel(row.date, { month: "short", day: "numeric", year: "numeric" })} · ${fmt(row.value)} ${unit}`}</title>
              </rect>
            );
          })}
          {selectedPoint && (
            <>
              <line
                className="cb-pc-smooth-inspection"
                x1={selectedPoint.x}
                x2={selectedPoint.x}
                y1={insetY}
                y2={plotBottom}
              />
              <circle
                className="cb-pc-smooth-active-point"
                cx={selectedPoint.x}
                cy={selectedPoint.y}
                r="3.5"
              />
            </>
          )}
          {targetY != null && (
            <path
              className={`cb-pc-target${targetStyle ? ` is-${targetStyle}` : ""}`}
              d={`M${insetX} ${targetY}H${w}`}
            >
              <title>{targetLabel ?? "Target"}</title>
            </path>
          )}
        </svg>
        <span id={summaryId} className="cb-pc-visually-hidden">
          {`${label}: ${rows
            .map(
              (row) =>
                `${dateLabel(row.date, { month: "short", day: "numeric", year: "numeric" })} · ${row.value == null ? "Not logged" : `${fmt(row.value)} ${unit}`}`,
            )
            .join("; ")}`}
        </span>
        {selected && (
          <div
            className="cb-pc-smooth-tooltip"
            style={tooltipStyle}
            role="status"
          >
            <span>
              {dateLabel(selected.date, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <strong>{selectedValue}</strong>
          </div>
        )}
      </div>
      {!compact && targetY != null && targetLabel && (
        <figcaption className="cb-pc-target-caption">
          <span>{targetLabel}</span>
        </figcaption>
      )}
      {!compact && (
        <figcaption>
          <span>
            {rows[0]
              ? dateLabel(rows[0].date, { month: "short", day: "numeric" })
              : ""}
          </span>
          <span>
            {rows.at(-1)
              ? dateLabel(rows.at(-1)?.date ?? "", {
                  month: "short",
                  day: "numeric",
                })
              : ""}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

function BodyweightPlot({
  rows,
  width,
  height,
  unit,
}: {
  rows: { date: string; value: number | null }[];
  width: number;
  height: number;
  unit: string;
}) {
  return (
    <SmoothTrend
      rows={rows}
      unit={unit}
      width={width}
      height={height}
      label="Bodyweight history"
      compact={height < 60}
    />
  );
}

function TaskToggle({
  task,
  interactive,
  onToggle,
  onDetails,
}: {
  task: ClientTask;
  interactive: boolean;
  onToggle: () => void;
  onDetails: () => void;
}) {
  return (
    <div className="cb-pc-task">
      {interactive ? (
        <button
          type="button"
          className={`cb-pc-check${task.completed ? " is-done" : ""}`}
          onClick={onToggle}
          aria-label={`${task.completed ? "Undo" : "Complete"} ${task.title}`}
          aria-pressed={task.completed}
        >
          <span
            className={`cb-pc-check-box${task.completed ? " is-done" : ""}`}
            aria-hidden="true"
          >
            {task.completed ? <Check size={12} /> : null}
          </span>
          <span className="cb-pc-visually-hidden">
            {task.completed ? "Undo" : "Mark done"}
          </span>
        </button>
      ) : (
        <span
          className={`cb-pc-task-state${task.completed ? " is-done" : ""}`}
          aria-hidden="true"
          title={task.completed ? "Completed" : "Not completed"}
        >
          <span
            className={`cb-pc-check-box${task.completed ? " is-done" : ""}`}
          >
            {task.completed ? <Check size={12} /> : null}
          </span>
        </span>
      )}
      <span className="cb-pc-task-copy">
        <button className="cb-pc-task-title" onClick={onDetails} type="button">
          {task.title}
        </button>
        <small>
          {dateLabel(task.dueDate)} · {task.completed ? "Completed" : "Due"}
        </small>
      </span>
    </div>
  );
}

function metricTarget(metric: RoadmapMetric) {
  if (!metric.target) return "No target set";
  const t = metric.target;
  if (t.kind === "range") return `${fmt(t.low)}–${fmt(t.high)} ${t.unit}`;
  if (t.kind === "minimum") return `At least ${fmt(t.low)} ${t.unit}`;
  return `${fmt(t.low)} ${t.unit}`;
}

function ProgressBody({ props }: { props: Props }) {
  const {
    widget,
    records,
    width,
    height,
    bodyWidth,
    bodyHeight,
    onDetail,
    onRecordsChange,
    onPeriodChange,
  } = props;
  const settings = widget.settings;
  const kind = widget.kind;
  const hasRoom = (height: number, reserved = 0) =>
    bodyHeight >= height + reserved;
  const compact = bodyHeight < 112;
  const tallFootprint = width < 320 && height >= 224;
  const wideFootprint = width >= 480 && height >= 224;
  const expandedFootprint = width >= 480 && height >= 384;
  const tallOrExpandedFootprint = tallFootprint || expandedFootprint;
  const chartHeight = (reserved: number, preferred: number) =>
    clamp(bodyHeight - reserved, 42, preferred);
  if (
    [
      "BN21",
      "BN01",
      "BN08",
      "TL26",
      "TL28",
      "TL06",
      "TL11",
      "TL14",
      "CU03",
      "CU06",
      "CU09",
      "CU16",
    ].includes(kind) &&
    !sourceOptions(kind).some(
      (option) => option.value === settings.source && !option.disabled,
    )
  ) {
    return (
      <Empty>Source unavailable. Choose an enabled source in settings.</Empty>
    );
  }

  if (kind === "BN21" || kind === "BN01") {
    const source = kind === "BN01" ? "bodyweight" : settings.source;
    const series =
      source === "bodyweight"
        ? records.bodyweight
        : source === "waist"
          ? records.waist
          : records.steps;
    if (
      !sourceOptions(kind).some(
        (item) => item.value === source && !item.disabled,
      )
    )
      return (
        <Empty>
          Source unavailable. Choose an enabled measure in settings.
        </Empty>
      );
    const nativeUnit = series.find((row) => row.unit)?.unit ?? settings.unit;
    const canConvert =
      source === "bodyweight"
        ? ["kg", "lb"].includes(nativeUnit) &&
          ["kg", "lb"].includes(settings.unit)
        : source === "waist"
          ? ["cm", "in"].includes(nativeUnit) &&
            ["cm", "in"].includes(settings.unit)
          : false;
    const unit =
      source === "steps"
        ? nativeUnit || "steps"
        : canConvert
          ? settings.unit
          : nativeUnit || settings.unit;
    const filtered = series
      .filter((r) => dateInPeriod(r.date, settings.period, records.client.asOf))
      .map((r) => ({ ...r, value: unitConvert(r.value, r.unit, unit) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const observed = filtered.filter((r) => r.value != null);
    const latest = observed.at(-1);
    const average = mean(filtered.map((r) => r.value));
    const trailingAverage =
      kind === "BN01"
        ? mean(
            series
              .filter((row) =>
                dateInPeriod(row.date, "7d", records.client.asOf),
              )
              .map((row) => unitConvert(row.value, row.unit, unit)),
          )
        : null;
    const previousWeekEnd = new Date(`${records.client.asOf}T12:00:00`);
    previousWeekEnd.setDate(previousWeekEnd.getDate() - 7);
    const previousWeekEndDate = `${previousWeekEnd.getFullYear()}-${String(previousWeekEnd.getMonth() + 1).padStart(2, "0")}-${String(previousWeekEnd.getDate()).padStart(2, "0")}`;
    const previousWeekAverage =
      kind === "BN01"
        ? mean(
            series
              .filter((row) =>
                dateInPeriod(row.date, "7d", previousWeekEndDate),
              )
              .map((row) => unitConvert(row.value, row.unit, unit)),
          )
        : null;
    const weekChange =
      trailingAverage != null && previousWeekAverage != null
        ? trailingAverage - previousWeekAverage
        : null;
    const bodyweightChangeLabel =
      weekChange == null
        ? "Comparison unavailable"
        : `${weekChange > 0 ? "↑" : weekChange < 0 ? "↓" : "→"} ${weekChange > 0 ? "+" : weekChange < 0 ? "−" : ""}${fmt(Math.abs(weekChange))} ${unit} vs prior 7d`;
    const total = filtered.reduce((sum, r) => sum + (r.value ?? 0), 0);
    const summary =
      settings.summary === "total" && source === "steps"
        ? "total"
        : settings.summary === "average"
          ? "average"
          : "latest";
    const value =
      summary === "average"
        ? average
        : summary === "total"
          ? total
          : (latest?.value ?? null);
    const chartRows =
      settings.summary === "weekly-average" && kind === "BN01"
        ? (() => {
            const groups = new Map<string, (number | null)[]>();
            filtered.forEach((row) => {
              const d = new Date(`${row.date}T12:00:00`);
              d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              groups.set(key, [...(groups.get(key) ?? []), row.value]);
            });
            const days =
              (
                {
                  today: 1,
                  "7d": 7,
                  "14d": 14,
                  "30d": 30,
                  "90d": 90,
                } as Record<string, number>
              )[settings.period] ?? 30;
            const first = new Date(`${records.client.asOf}T12:00:00`);
            first.setDate(first.getDate() - days + 1);
            first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
            const last = new Date(`${records.client.asOf}T12:00:00`);
            last.setDate(last.getDate() - ((last.getDay() + 6) % 7));
            const weekCount =
              Math.floor(
                (last.valueOf() - first.valueOf()) / (7 * 86_400_000),
              ) + 1;
            return Array.from({ length: weekCount }, (_, index) => {
              const date = new Date(first);
              date.setDate(date.getDate() + index * 7);
              const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
              return { date: key, value: mean(groups.get(key) ?? []) };
            });
          })()
        : filtered;
    if (!observed.length && (kind !== "BN01" || trailingAverage == null))
      return (
        <Empty
          actionLabel="Open source"
          onAction={kind === "BN01" ? () => onDetail("bodyweight") : undefined}
        >{`No ${source === "bodyweight" ? "bodyweight" : source === "waist" ? "waist" : "step"} entries in this period.`}</Empty>
      );
    const periodLabel =
      settings.period === "today" ? "Today" : `Past ${settings.period}`;
    const sourceLabel =
      source === "bodyweight"
        ? "Bodyweight"
        : source === "waist"
          ? "Waist"
          : "Steps";
    if (
      kind === "BN21" &&
      (tallFootprint || wideFootprint || (width >= 320 && height >= 224))
    ) {
      const isWide = wideFootprint;
      const isTall = tallFootprint;
      const isExpanded = expandedFootprint;
      const showPlot = !isTall && bodyHeight >= 112;
      const plotHeight = showPlot
        ? clamp(
            bodyHeight -
              (isExpanded ? 164 : isWide ? 88 : 96) -
              (source === "steps" ? 0 : 26),
            42,
            isExpanded ? 160 : isWide ? 120 : 58,
          )
        : 0;
      const rowBudget = isTall
        ? bodyHeight - 90
        : isExpanded
          ? bodyHeight - 122 - plotHeight - (source === "steps" ? 0 : 26)
          : 0;
      const rowHeight = bodyWidth < 270 ? 30 : 26;
      const historyLimit = clamp(Math.floor(rowBudget / rowHeight), 0, 8);
      const historyRows = historyLimit
        ? filtered.slice(-historyLimit).reverse()
        : [];
      const selectedLabel =
        summary === "average"
          ? "Period average"
          : summary === "total"
            ? "Period total"
            : `Latest · ${latest ? dateLabel(latest.date) : "No dated value"}`;
      return (
        <div
          className={`cb-pc-stack cb-pc-bn21${(isTall && bodyHeight >= 230) || isExpanded ? " is-roomy" : ""}`}
        >
          <div className="cb-pc-reading">
            <strong>
              {fmt(value, source === "steps" ? 0 : 1)} <small>{unit}</small>
            </strong>
            <span>{selectedLabel}</span>
          </div>
          <div className="cb-pc-period">
            <span>
              {sourceLabel} · {periodLabel}
            </span>
          </div>
          {showPlot && (
            <>
              {source !== "steps" && (
                <div className="cb-pc-chart-controls">
                  <span>{sourceLabel} trend</span>
                  <ChartPeriodControl
                    period={settings.period}
                    onChange={onPeriodChange ?? (() => {})}
                    label={`${sourceLabel} date range`}
                  />
                </div>
              )}
              <DatedPlot
                rows={filtered.map((row) => ({
                  date: row.date,
                  value: row.value,
                }))}
                unit={unit}
                width={bodyWidth}
                height={plotHeight}
                label={`${sourceLabel} history`}
                form={source === "steps" ? "bars" : "line"}
                target={source === "steps" ? records.stepsTarget : undefined}
                targetLabel={
                  source === "steps" && records.stepsTarget != null
                    ? `Daily target · ${fmt(records.stepsTarget, 0)} steps`
                    : undefined
                }
                targetStyle={source === "steps" ? "subtle" : undefined}
              />
            </>
          )}
          {historyLimit > 0 && (
            <div className="cb-pc-bn21-history">
              {historyRows.map((row) => (
                <div className="cb-pc-row" key={row.date}>
                  <span>
                    {dateLabel(row.date, { month: "short", day: "numeric" })}
                  </span>
                  <b>
                    {row.value == null
                      ? "Not logged"
                      : `${fmt(row.value, source === "steps" ? 0 : 1)} ${unit}`}
                  </b>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (kind === "BN01") {
      return (
        <div
          className={`cb-pc-bodyweight${bodyHeight < 100 || (bodyWidth < 260 && bodyHeight < 160) ? " is-compact" : ""}`}
        >
          <div className="cb-pc-bodyweight-metrics">
            <div className="cb-pc-bodyweight-metric">
              <strong>
                {latest ? fmt(latest.value) : "—"}
                <small>{unit}</small>
              </strong>
              <span className="cb-pc-muted">
                Latest ·{" "}
                {latest
                  ? dateLabel(latest.date, { month: "short", day: "numeric" })
                  : "No dated value"}
              </span>
            </div>
            <div className="cb-pc-bodyweight-metric">
              <strong>
                {trailingAverage == null ? "—" : fmt(trailingAverage)}
                <small>{unit}</small>
              </strong>
              <span>
                {bodyHeight < 112
                  ? "Trailing 7d average"
                  : "Past 7 days average"}
              </span>
              <small className="cb-pc-bodyweight-compare">
                {bodyweightChangeLabel}
              </small>
            </div>
          </div>
          {bodyHeight >= 112 && (
            <div className="cb-pc-chart-controls">
              {bodyWidth >= 260 || bodyHeight >= 220 ? (
                <span>Weight trend</span>
              ) : null}
              <ChartPeriodControl
                period={settings.period}
                onChange={onPeriodChange ?? (() => {})}
                label="Bodyweight date range"
              />
            </div>
          )}
          <BodyweightPlot
            rows={chartRows}
            unit={unit}
            width={bodyWidth}
            height={Math.max(
              30,
              Math.min(
                bodyWidth < 260 && bodyHeight < 220
                  ? bodyHeight - 130
                  : bodyHeight - (bodyHeight < 100 ? 50 : 64) - 26,
                bodyWidth < 260 && bodyHeight < 220
                  ? 42
                  : bodyWidth < 320 && bodyHeight >= 240
                    ? 72
                    : 240,
              ),
            )}
          />
          {bodyWidth < 320 && bodyHeight >= 240 && (
            <div className="cb-pc-history-rows">
              {filtered
                .slice(-Math.max(1, Math.floor((bodyHeight - 190) / 26)))
                .reverse()
                .map((row) => (
                  <div className="cb-pc-row" key={row.date}>
                    <span>{dateLabel(row.date)}</span>
                    <b>
                      {row.value == null
                        ? "Not logged"
                        : `${fmt(row.value)} ${unit}`}
                    </b>
                  </div>
                ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="cb-pc-stack">
        <div className="cb-pc-reading">
          <strong>
            {fmt(value, source === "steps" ? 0 : 1)} <small>{unit}</small>
          </strong>
          <span>
            {summary === "average"
              ? "Period average"
              : summary === "total"
                ? "Period total"
                : `Latest · ${latest ? dateLabel(latest.date) : "No dated value"}`}
          </span>
        </div>
        <div className="cb-pc-period">
          <span>
            {sourceLabel} · {periodLabel}
          </span>
        </div>
      </div>
    );
  }

  if (kind === "BN08") {
    const unit = ["kg", "lb"].includes(settings.unit) ? settings.unit : "kg";
    const rows = records.bodyweight.filter(
      (r) => r.date <= records.client.asOf,
    );
    const periodWeeks =
      (
        {
          week: 1,
          month: 4,
          "6month": 26,
          year: 52,
          "4w": 4,
          "8w": 8,
          "12w": 12,
        } as Record<string, number>
      )[settings.period] ?? 8;
    const asOf = new Date(`${records.client.asOf}T12:00:00`);
    asOf.setDate(asOf.getDate() - ((asOf.getDay() + 6) % 7));
    const currentMonday = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}-${String(asOf.getDate()).padStart(2, "0")}`;
    const addDays = (date: string, count: number) => {
      const d = new Date(`${date}T12:00:00`);
      d.setDate(d.getDate() + count);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const points = Array.from({ length: periodWeeks }, (_, index) => {
      const date = addDays(currentMonday, -(periodWeeks - index) * 7);
      const eligible = rows.filter(
        (row) =>
          row.date >= date && row.date <= addDays(date, 6) && row.value != null,
      );
      return {
        date,
        value: mean(
          eligible.map((row) => unitConvert(row.value, row.unit, unit)),
        ),
      };
    });
    const prev = points.at(-2);
    const last = points.at(-1);
    const delta =
      prev?.value != null && last?.value != null
        ? last.value - prev.value
        : null;
    const change =
      delta == null || settings.summary === "weekly-history"
        ? null
        : settings.option === "percentage"
          ? prev?.value
            ? `${delta > 0 ? "+" : ""}${fmt((delta / prev.value) * 100)}%`
            : "Percent change unavailable"
          : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${fmt(Math.abs(delta))} ${unit}`;
    if (!last || !points.some((point) => point.value != null))
      return (
        <Empty
          actionLabel="Open weigh-ins"
          onAction={() =>
            onDetail(
              `additional:BN08:${unit}:${settings.option || "absolute"}:${settings.period || "8w"}`,
            )
          }
        >
          No bodyweight averages available.
        </Empty>
      );
    const weeklyPlotHeight = chartHeight(
      (bodyWidth < 280 ? 86 : 74) + 38,
      bodyWidth < 280 ? 56 : 136,
    );
    const historyLimit = Math.max(
      0,
      Math.min(
        8,
        Math.floor(
          (bodyHeight - weeklyPlotHeight - (bodyWidth < 280 ? 122 : 104) - 26) /
            30,
        ),
      ),
    );
    const historyRows = historyLimit
      ? points.slice(-historyLimit).reverse()
      : [];
    if (bodyHeight < 112) {
      return (
        <div className="cb-pc-stack is-compact-summary">
          <div className="cb-pc-reading">
            <strong>
              {last.value == null ? "No data" : `${fmt(last.value)} ${unit}`}
            </strong>
            <span>Week of {dateLabel(last.date)}</span>
          </div>
          <div className="cb-pc-period">
            <span>
              Week of {dateLabel(last.date)} · {settings.period}
            </span>
            <span>
              {change == null
                ? "Change unavailable"
                : `${change} vs prior week`}
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="cb-pc-stack">
        <div className="cb-pc-reading">
          <strong>
            {last.value == null ? "No data" : `${fmt(last.value)} ${unit}`}
          </strong>
          <span>
            {bodyWidth < 280
              ? `Week of ${dateLabel(last.date)}`
              : `Latest week · ${dateLabel(last.date)}`}
          </span>
        </div>
        <div className="cb-pc-period">
          <span>{settings.period}</span>
          {change != null && (
            <span>
              {bodyWidth < 280 ? `Δ ${change}` : `Week over week · ${change}`}
            </span>
          )}
        </div>
        {hasRoom(bodyWidth < 260 ? 100 : 94) && (
          <>
            <div className="cb-pc-chart-controls">
              <span>Weekly average</span>
              <ChartPeriodControl
                period={settings.period}
                onChange={onPeriodChange ?? (() => {})}
                label="Bodyweight date range"
              />
            </div>
            <DatedPlot
              rows={points}
              unit={unit}
              width={bodyWidth}
              height={weeklyPlotHeight}
              label="Weekly bodyweight averages"
              form="line"
            />
          </>
        )}
        {settings.summary === "weekly-history" &&
          historyRows.map((point) => (
            <div className="cb-pc-row" key={point.date}>
              <span>Week of {dateLabel(point.date)}</span>
              <b>
                {point.value == null
                  ? "No data"
                  : `${fmt(point.value)} ${unit}`}
              </b>
            </div>
          ))}
        {bodyHeight >= 230 &&
          settings.summary !== "weekly-history" &&
          historyRows.map((point) => (
            <div className="cb-pc-row" key={point.date}>
              <span>Week of {dateLabel(point.date)}</span>
              <b>
                {point.value == null
                  ? "No data"
                  : `${fmt(point.value)} ${unit}`}
              </b>
            </div>
          ))}
      </div>
    );
  }

  if (kind === "TL26") {
    const ordered = [...records.workoutSchedule].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const scheduledCurrent = [...ordered]
      .filter((workout) => workout.date <= records.client.asOf)
      .at(-1);
    const next = ordered.find((workout) => workout.date > records.client.asOf);
    const effectivePlan = [...records.prescriptions]
      .filter(
        (plan) =>
          plan.effectiveFrom <= records.client.asOf &&
          (plan.label === "Evergreen" ||
            plan.week === records.coachingPlan?.currentWeek),
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    const current =
      scheduledCurrent ??
      (effectivePlan
        ? {
            date: records.client.asOf,
            week: effectivePlan.week,
            name: effectivePlan.name,
            exercises: effectivePlan.exercises.map(
              ({ id, name, sets, reps }) => ({ id, name, sets, reps }),
            ),
          }
        : undefined);
    const option = settings.summary || "current";
    const sections =
      option === "next"
        ? [next]
        : [
            current,
            ...(option === "both" ||
            bodyHeight >= (bodyWidth >= 300 ? 220 : 300)
              ? [next]
              : []),
          ];
    if (!sections.some(Boolean))
      return (
        <Empty
          actionLabel="Open training"
          onAction={() => onDetail("workouts")}
        >
          No workout scheduled.
        </Empty>
      );
    const currentPlan = current
      ? [...records.prescriptions]
          .filter((plan) => plan.effectiveFrom <= current.date)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
      : [...records.prescriptions]
          .filter(
            (plan) =>
              plan.effectiveFrom <= records.client.asOf &&
              (plan.label === "Evergreen" ||
                plan.week === records.coachingPlan?.currentWeek),
          )
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    const nextPlan = next
      ? [...records.prescriptions]
          .filter((plan) => plan.effectiveFrom <= next.date)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
      : undefined;
    const selectedSessions = sections.filter(Boolean).length;
    const exerciseHeightBudget =
      44 +
      (settings.fields.includes("coach instructions") ? 14 : 0) +
      (bodyWidth < 300 ? 12 : 0) +
      (bodyHeight >= 280 ? 8 : 0);
    const budgetedExerciseCap = Math.max(
      1,
      Math.min(
        5,
        Math.floor(
          (bodyHeight - 110) / (selectedSessions * exerciseHeightBudget),
        ),
      ),
    );
    const exerciseCap =
      selectedSessions === 1 &&
      bodyHeight >= 150 &&
      !settings.fields.includes("coach instructions")
        ? Math.max(2, budgetedExerciseCap)
        : bodyHeight >= 300
          ? Math.min(4, Math.max(2, budgetedExerciseCap))
          : budgetedExerciseCap;
    if (compact) {
      const session = option === "next" ? next : current;
      const plan = option === "next" ? nextPlan : currentPlan;
      if (!session && !plan)
        return (
          <Empty
            actionLabel="Open training"
            onAction={() => onDetail("workouts")}
          >
            No applicable current or next prescription.
          </Empty>
        );
      const chosen = session?.exercises[0] ?? plan?.exercises[0];
      const instruction = chosen
        ? plan?.exercises.find((exercise) => exercise.id === chosen.id)?.note
        : undefined;
      return (
        <div className="cb-pc-workouts">
          <section className="cb-pc-workout">
            <div className="cb-pc-workout-heading">
              <Dumbbell size={17} aria-hidden="true" />
              <div>
                <strong className="cb-pc-workout-name">
                  {session?.name ?? plan?.name}
                </strong>
                <span className="cb-pc-muted">
                  {plan?.label === "Evergreen"
                    ? "Evergreen"
                    : plan
                      ? `Week ${plan.week}`
                      : "Scheduled"}
                  {session ? ` · ${dateLabel(session.date)}` : ""}
                </span>
              </div>
            </div>
            {chosen && (
              <div className="cb-pc-exercise">
                <span>{chosen.name}</span>
                <b>
                  {settings.fields.includes("sets")
                    ? `${chosen.sets} sets`
                    : ""}
                  {settings.fields.includes("sets") &&
                  settings.fields.includes("reps")
                    ? " · "
                    : ""}
                  {settings.fields.includes("reps")
                    ? `${chosen.reps} reps`
                    : ""}
                </b>
              </div>
            )}
            {bodyHeight >= 112 &&
              settings.fields.includes("coach instructions") &&
              instruction && <small>{instruction}</small>}
          </section>
        </div>
      );
    }
    return (
      <div className="cb-pc-workouts">
        {sections
          .filter((workout) => workout !== undefined)
          .map((workout, i) => {
            const selectedPlan = workout === current ? currentPlan : nextPlan;
            const prescribed = workout.exercises.map((exercise) => ({
              ...exercise,
              note: selectedPlan?.exercises.find(
                (item) => item.id === exercise.id,
              )?.note,
            }));
            const visibleExerciseIds = new Set(
              prescribed.slice(0, exerciseCap).map((exercise) => exercise.id),
            );
            const latestLogged = [...records.exerciseSessions]
              .filter(
                (session) =>
                  session.date <= records.client.asOf &&
                  visibleExerciseIds.has(session.exerciseId),
              )
              .sort((a, b) => b.date.localeCompare(a.date))[0];
            return (
              <section
                className="cb-pc-workout"
                key={`${workout.date}-${workout.name}`}
              >
                <div className="cb-pc-row">
                  <b>{i ? "Next session" : "Current session"}</b>
                  <span>
                    {dateLabel(workout.date, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ·{" "}
                    {selectedPlan?.label === "Evergreen"
                      ? "Evergreen"
                      : `Week ${workout.week}`}
                  </span>
                </div>
                <strong className="cb-pc-workout-name">{workout.name}</strong>
                {prescribed.slice(0, exerciseCap).map((exercise) => (
                  <div className="cb-pc-exercise" key={exercise.id}>
                    <span>
                      {settings.fields.includes("exercise")
                        ? exercise.name
                        : "Exercise"}
                    </span>
                    <b>
                      {[
                        settings.fields.includes("sets")
                          ? `${exercise.sets} sets`
                          : "",
                        settings.fields.includes("reps")
                          ? `${exercise.reps} reps`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </b>
                    {settings.fields.includes("coach instructions") &&
                      exercise.note && <small>{exercise.note}</small>}
                  </div>
                ))}
                {prescribed.length > exerciseCap && (
                  <small className="cb-pc-muted">
                    +{prescribed.length - exerciseCap} more exercises
                  </small>
                )}
                {bodyHeight >= 280 && latestLogged && (
                  <small className="cb-pc-muted">
                    Latest logged · {latestLogged.exercise} ·{" "}
                    {dateLabel(latestLogged.date)} · {latestLogged.load}{" "}
                    {latestLogged.unit} · {latestLogged.sets} ×{" "}
                    {latestLogged.reps}
                  </small>
                )}
              </section>
            );
          })}
      </div>
    );
  }

  if (kind === "TL28") {
    const id = settings.source.split(":")[1] ?? "deadlift";
    const all = records.exerciseSessions
      .filter(
        (s) =>
          s.exerciseId === id &&
          dateInPeriod(s.date, settings.period, records.client.asOf),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    const summary = settings.summary || "load";
    const current = all.at(-1);
    const displayUnit = ["kg", "lb"].includes(settings.unit)
      ? settings.unit
      : current?.unit;
    const pick = (s: (typeof all)[number]) =>
      summary === "reps"
        ? s.reps
        : summary === "sets"
          ? s.sets
          : unitConvert(s.load, s.unit, displayUnit || s.unit);
    if (!current)
      return (
        <Empty
          actionLabel="Open logbook"
          onAction={() => onDetail(`exercise:${id}`)}
        >
          No sessions in this period.
        </Empty>
      );
    const unit = summary === "load" ? (displayUnit ?? current.unit) : summary;
    const plotted = all.slice(
      -Math.max(3, Math.min(12, Math.floor(bodyWidth / 46))),
    );
    if (bodyHeight < 112) {
      return (
        <div className="cb-pc-stack is-compact-summary is-trend-summary">
          <div className="cb-pc-reading">
            <strong>
              {fmt(pick(current))} <small>{unit}</small>
            </strong>
            <span>
              {current.exercise} · {dateLabel(current.date)}
            </span>
          </div>
          <div className="cb-pc-chart-controls">
            <span>Session trend</span>
            <ChartPeriodControl
              period={settings.period}
              onChange={onPeriodChange}
              label={`${current.exercise} date range`}
            />
          </div>
          <DatedPlot
            rows={plotted.map((s) => ({ date: s.date, value: pick(s) }))}
            unit={unit}
            width={bodyWidth}
            height={Math.max(
              28,
              Math.min(bodyWidth >= 320 ? 42 : 28, bodyHeight - 66),
            )}
            label={`${current.exercise} ${summary}`}
            form="dots"
            compact
          />
        </div>
      );
    }
    return (
      <div className="cb-pc-stack">
        <div className="cb-pc-reading">
          <strong>
            {fmt(pick(current))} <small>{unit}</small>
          </strong>
          <span>
            {current.exercise} · {dateLabel(current.date)} · recorded {summary}
          </span>
        </div>
        <div className="cb-pc-period">
          <span>Session entries · {settings.period}</span>
          <span>
            {current.sets} sets · {current.reps} reps
          </span>
        </div>
        <div className="cb-pc-chart-controls">
          <span>Session trend</span>
          <ChartPeriodControl
            period={settings.period}
            onChange={onPeriodChange}
            label={`${current.exercise} date range`}
          />
        </div>
        {hasRoom(76) && (
          <DatedPlot
            rows={plotted.map((s) => ({ date: s.date, value: pick(s) }))}
            unit={unit}
            width={bodyWidth}
            height={chartHeight(120, bodyWidth < 320 ? 80 : 164)}
            label={`${current.exercise} ${summary}`}
            form="dots"
          />
        )}
        {bodyHeight >= 300 && (
          <div className="cb-pc-history-rows">
            {plotted
              .slice(
                -Math.max(
                  1,
                  Math.floor(
                    (bodyHeight -
                      146 -
                      chartHeight(120, bodyWidth < 320 ? 80 : 164)) /
                      28,
                  ),
                ),
              )
              .reverse()
              .map((session) => (
                <div className="cb-pc-row" key={session.date}>
                  <span>{dateLabel(session.date)}</span>
                  <b>
                    {fmt(pick(session))} {unit}
                  </b>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  if (kind === "TL06") {
    const entries = records.steps.filter((r) =>
      dateInPeriod(r.date, settings.period, records.client.asOf),
    );
    const observed = entries.filter((r) => r.value != null);
    const latest = observed.at(-1);
    const average = mean(entries.map((r) => r.value));
    const total = entries.reduce((sum, r) => sum + (r.value ?? 0), 0);
    const chosen =
      settings.summary === "total"
        ? total
        : settings.summary === "latest"
          ? (latest?.value ?? null)
          : average;
    if (!observed.length)
      return (
        <Empty actionLabel="Open steps" onAction={() => onDetail("steps")}>
          No step entries in this period.
        </Empty>
      );
    const stepsPlotHeight = hasRoom(72) ? chartHeight(120, 120) : 0;
    const stepsHistoryCount = Math.max(
      0,
      Math.min(
        8,
        Math.floor(
          (bodyHeight - 108 - (stepsPlotHeight ? stepsPlotHeight + 28 : 0)) /
            28,
        ),
      ),
    );
    const stepHistory = stepsHistoryCount
      ? entries.slice(-stepsHistoryCount).reverse()
      : [];
    if (bodyHeight < 112) {
      return (
        <div className="cb-pc-stack is-compact-summary">
          <div className="cb-pc-reading">
            <strong>
              <Footprints size={16} aria-hidden="true" />
              {fmt(chosen, 0)} <small>steps</small>
            </strong>
            <span>
              {settings.summary === "total"
                ? "Period total"
                : settings.summary === "latest"
                  ? `Latest · ${latest ? dateLabel(latest.date) : ""}`
                  : "Daily average"}
            </span>
          </div>
          {bodyHeight >= 70 && (
            <DatedPlot
              rows={entries
                .slice(-Math.max(4, Math.min(14, Math.floor(bodyWidth / 30))))
                .map((r) => ({ date: r.date, value: r.value }))}
              unit="steps"
              width={bodyWidth}
              height={Math.max(28, bodyHeight - 44)}
              label="Daily steps"
              form="bars"
              target={records.stepsTarget}
              targetStyle="subtle"
              compact
            />
          )}
        </div>
      );
    }
    return (
      <div className="cb-pc-stack">
        <div className="cb-pc-reading">
          <strong>
            {fmt(chosen, 0)} <small>steps</small>
          </strong>
          <span>
            {settings.summary === "total"
              ? "Period total"
              : settings.summary === "latest"
                ? `Latest · ${latest ? dateLabel(latest.date) : ""}`
                : "Average per logged day"}
          </span>
        </div>
        <div className="cb-pc-period">
          <span>
            {settings.period === "today" ? "Today" : `Past ${settings.period}`}
          </span>
        </div>
        {hasRoom(72) && (
          <DatedPlot
            rows={entries
              .slice(-Math.max(4, Math.min(14, Math.floor(bodyWidth / 30))))
              .map((r) => ({ date: r.date, value: r.value }))}
            unit="steps"
            width={bodyWidth}
            height={chartHeight(120, 120)}
            label="Daily steps"
            form="bars"
            target={records.stepsTarget}
            targetLabel={
              records.stepsTarget == null
                ? undefined
                : `Daily target · ${fmt(records.stepsTarget, 0)} steps`
            }
            targetStyle="subtle"
            compact={bodyHeight < 160}
          />
        )}
        {tallOrExpandedFootprint &&
          bodyHeight >= 230 &&
          stepHistory.map((row) => (
            <div className="cb-pc-row" key={row.date}>
              <span>
                {dateLabel(row.date, { month: "short", day: "numeric" })}
              </span>
              <b>
                {row.value == null
                  ? "Not logged"
                  : `${fmt(row.value, 0)} steps`}
              </b>
            </div>
          ))}
      </div>
    );
  }

  if (kind === "TL11") {
    const unit = settings.unit === "min" ? "min" : "h";
    const entries = (records.sleep ?? [])
      .filter((r) => dateInPeriod(r.date, settings.period, records.client.asOf))
      .map((r) => {
        const isMinutes = ["min", "minute", "minutes"].includes(
          r.unit.toLowerCase(),
        );
        return {
          ...r,
          value:
            r.value == null || (unit === "min") === isMinutes
              ? r.value
              : unit === "min"
                ? r.value * 60
                : r.value / 60,
        };
      });
    const valid = entries.filter((r) => r.value != null);
    const latest = valid.at(-1);
    const average = mean(entries.map((r) => r.value));
    const selected =
      settings.summary === "latest" ? (latest?.value ?? null) : average;
    if (!latest)
      return (
        <Empty
          actionLabel="Open sleep tracker"
          onAction={() => onDetail("sleep")}
        >
          No sleep entries in this period.
        </Empty>
      );
    const sleepHistoryCount = Math.max(
      0,
      Math.min(8, Math.floor((bodyHeight - 155) / 28)),
    );
    const sleepHistory = sleepHistoryCount
      ? entries.slice(-sleepHistoryCount).reverse()
      : [];
    const sleepTrendHistoryCount = Math.max(
      0,
      Math.min(
        8,
        Math.floor((bodyHeight - 108 - chartHeight(94, 140) - 28) / 28),
      ),
    );
    const sleepTrendHistory = sleepTrendHistoryCount
      ? entries.slice(-sleepTrendHistoryCount).reverse()
      : [];
    if (bodyHeight < 112 && settings.summary !== "history") {
      return (
        <div className="cb-pc-stack is-compact-summary is-trend-summary">
          <div className="cb-pc-reading">
            <strong>
              <Moon size={15} aria-hidden="true" />
              {fmt(selected)} <small>{unit}</small>
            </strong>
            <span>
              {settings.summary === "latest"
                ? `Latest · ${dateLabel(latest.date)}`
                : "Average per logged night"}
            </span>
          </div>
          <DatedPlot
            rows={entries
              .slice(-Math.max(4, Math.min(14, Math.floor(bodyWidth / 34))))
              .map((r) => ({ date: r.date, value: r.value }))}
            unit={unit}
            width={bodyWidth}
            height={Math.max(28, bodyHeight - 44)}
            label="Sleep duration"
            form="bars"
            compact
          />
        </div>
      );
    }
    return (
      <div className="cb-pc-stack">
        <div className="cb-pc-reading">
          <strong>
            {fmt(selected)} <small>{unit}</small>
          </strong>
          <span>
            {settings.summary === "latest" || settings.summary === "history"
              ? `Latest · ${dateLabel(latest.date)}`
              : "Average per logged night"}
          </span>
        </div>
        <div className="cb-pc-period">
          <span>
            {settings.period === "today" ? "Today" : `Past ${settings.period}`}
          </span>
        </div>
        {hasRoom(72) && settings.summary !== "history" && (
          <DatedPlot
            rows={entries
              .slice(-Math.max(4, Math.min(14, Math.floor(bodyWidth / 34))))
              .map((r) => ({ date: r.date, value: r.value }))}
            unit={unit}
            width={bodyWidth}
            height={chartHeight(94, 140)}
            label="Sleep duration"
            form="bars"
          />
        )}
        {tallOrExpandedFootprint &&
          bodyHeight >= 230 &&
          settings.summary !== "history" &&
          sleepTrendHistory.map((row) => (
            <div className="cb-pc-row" key={row.date}>
              <span>
                {dateLabel(row.date, { month: "short", day: "numeric" })}
              </span>
              <b>
                {row.value == null ? "Not logged" : `${fmt(row.value)} ${unit}`}
              </b>
            </div>
          ))}
        {settings.summary === "history" &&
          sleepHistory.map((row) => (
            <div className="cb-pc-row" key={row.date}>
              <span>{dateLabel(row.date)}</span>
              <b>
                {row.value == null ? "Not logged" : `${fmt(row.value)} ${unit}`}
              </b>
            </div>
          ))}
      </div>
    );
  }

  if (kind === "TL14") {
    const selected = settings.fields.length
      ? settings.fields.flatMap((key) =>
          records.recovery.filter((field) => field.field === key),
        )
      : records.recovery;
    if (!selected.length)
      return (
        <Empty
          actionLabel="Open recovery"
          onAction={() => onDetail("recovery")}
        >
          No recovery fields selected.
        </Empty>
      );
    const columns = Math.max(1, Math.floor(bodyWidth / 190));
    const concise = bodyHeight < 300;
    const rowHeightBudget = concise
      ? bodyWidth >= 280
        ? 44
        : 58
      : settings.summary === "history"
        ? 200
        : 104;
    const visibleCount = Math.max(
      1,
      columns * Math.floor((bodyHeight - 8) / rowHeightBudget),
    );
    const fields = selected.slice(0, visibleCount);
    const visibleRows = Math.ceil(fields.length / columns);
    const itemHeightBudget =
      (bodyHeight - Math.max(0, visibleRows - 1) * 8) / visibleRows;
    const historyCap = Math.max(0, Math.floor((itemHeightBudget - 58) / 24));
    return (
      <div className="cb-pc-recovery">
        {fields.map((field) => {
          const entries = field.entries.filter((entry) =>
            dateInPeriod(entry.date, settings.period, records.client.asOf),
          );
          const last = entries.at(-1);
          const counts = field.scale.map(
            (label) => entries.filter((entry) => entry.value === label).length,
          );
          const history =
            settings.summary === "history" && historyCap > 0
              ? entries.slice(-historyCap).reverse()
              : [];
          if (concise) {
            return (
              <section
                className="cb-pc-rating is-compact"
                key={field.field}
                aria-label={`${field.label} response scale: ${field.scale.join(" / ")}. Latest answer: ${last?.value ?? "none"}`}
              >
                <strong className="cb-pc-rating-name">{field.label}</strong>
                <span className="cb-pc-rating-latest">
                  {last
                    ? `${last.value} · ${dateLabel(last.date)}`
                    : "No response in period"}
                </span>
                <span className="cb-pc-rating-scale">
                  {field.scale.join(" / ")}
                </span>
                {bodyHeight < 126 && (
                  <span className="cb-pc-rating-context">
                    {settings.period === "today" ? "Today" : settings.period} ·{" "}
                    {entries.length} responses
                    {fields.length < selected.length
                      ? ` · +${selected.length - fields.length} fields`
                      : ""}
                  </span>
                )}
              </section>
            );
          }
          return (
            <section className="cb-pc-rating" key={field.field}>
              <div className="cb-pc-row">
                <b>{field.label}</b>
                <span>
                  {last
                    ? `${last.value} · ${dateLabel(last.date)}`
                    : "No response"}
                </span>
              </div>
              <figure
                className={`cb-pc-scale ${bodyHeight < 112 ? "cb-dw-rating-labels" : "cb-dw-rating-scale"}`}
                aria-label={`${field.label} response scale: ${field.scale.join(" / ")}. Latest answer: ${last?.value ?? "none"}`}
              >
                <span>
                  {settings.summary === "distribution"
                    ? `Period responses: ${field.scale.map((label, index) => `${label} ${counts[index]}`).join(" · ")}`
                    : `Original scale: ${field.scale.join(" / ")}`}
                </span>
                <b className="is-selected">
                  {last ? `Selected · ${last.value}` : "No answer"}
                </b>
              </figure>
              <small className="cb-pc-muted">
                {settings.period === "today"
                  ? "Today"
                  : `Past ${settings.period}`}{" "}
                · {entries.length} responses
              </small>
              {history.map((entry) => (
                <div className="cb-pc-row" key={entry.date}>
                  <span>{dateLabel(entry.date)}</span>
                  <b>{entry.value}</b>
                </div>
              ))}
              {fields.length < selected.length && (
                <small className="cb-pc-muted">
                  +{selected.length - fields.length} selected · open for all
                </small>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  if (kind === "CU03") {
    const span =
      settings.period === "today"
        ? 0
        : ((
            { "7d": 7, "14d": 14, "30d": 30, "90d": 90 } as Record<
              string,
              number
            >
          )[settings.period] ?? 30);
    const end = new Date(`${records.client.asOf}T12:00:00`);
    end.setDate(end.getDate() + span);
    const dueTo = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    const window = records.tasks.filter(
      (t) => t.dueDate >= records.client.asOf && t.dueDate <= dueTo,
    );
    const open = window.filter((t) => !t.completed);
    const completed = window.filter((t) => t.completed);
    const tasks = (
      settings.summary === "completed"
        ? completed
        : settings.summary === "both"
          ? window
          : open
    ).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (!window.length)
      return (
        <Empty actionLabel="Open tasks" onAction={() => onDetail("tasks")}>
          No client tasks due in this window.
        </Empty>
      );
    if (bodyHeight < 112) {
      const nextOpen = [...open].sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate),
      )[0];
      return (
        <div className="cb-pc-stack is-compact-summary">
          <div className="cb-pc-section-head">
            <b>{open.length} open</b>
            <span>{completed.length} completed</span>
          </div>
          <div className="cb-pc-row">
            <b>Next due</b>
            <span>
              {nextOpen ? dateLabel(nextOpen.dueDate) : "No open task"}
            </span>
          </div>
          <div className="cb-pc-period">
            <span>
              {settings.period === "today"
                ? "Today"
                : `Next ${settings.period}`}
            </span>
            <span>{window.length} due tasks</span>
          </div>
        </div>
      );
    }
    const includeCompletedGroup =
      bodyHeight >= 220 && settings.summary === "open" && completed.length > 0;
    if (!tasks.length && !includeCompletedGroup)
      return (
        <Empty actionLabel="Open tasks" onAction={() => onDetail("tasks")}>
          No {settings.summary} tasks in this window.
        </Empty>
      );
    const dueCountLabel =
      settings.period === "today" ? "Due today" : `Due in ${settings.period}`;
    const rowBudget = (task: ClientTask) => {
      const available = Math.max(90, bodyWidth - 68);
      const charactersPerLine = Math.max(14, Math.floor(available / 7));
      const titleLines = Math.ceil(task.title.length / charactersPerLine);
      return Math.max(44, titleLines * 17 + 19);
    };
    const taskRows: ClientTask[] = [];
    let rowsUsed = 0;
    const rowsAvailable = Math.max(0, bodyHeight - 26);
    const taskLimit = bodyHeight >= 300 ? 4 : tasks.length;
    for (const task of tasks) {
      if (taskRows.length >= taskLimit) break;
      const nextHeight = rowBudget(task) + (taskRows.length ? 7 : 0);
      if (rowsUsed + nextHeight > rowsAvailable) break;
      taskRows.push(task);
      rowsUsed += nextHeight;
    }
    if (
      !taskRows.length &&
      tasks.length &&
      bodyHeight >= rowBudget(tasks[0]) + 42
    )
      taskRows.push(tasks[0]);
    const completedHeadingHeight = includeCompletedGroup ? 24 : 0;
    const completedRows: ClientTask[] = [];
    if (includeCompletedGroup) {
      for (const task of completed) {
        if (completedRows.length >= 4) break;
        const nextHeight = rowBudget(task) + (completedRows.length ? 7 : 0);
        if (rowsUsed + completedHeadingHeight + nextHeight > rowsAvailable)
          break;
        completedRows.push(task);
        rowsUsed += nextHeight;
      }
    }
    return (
      <div className="cb-pc-stack">
        <div className="cb-pc-section-head">
          <b>{open.length} open</b>
          <span>
            {dueCountLabel} · {completed.length} completed in this window
          </span>
        </div>
        {taskRows.map((task) => (
          <TaskToggle
            key={task.id}
            task={task}
            interactive={props.clientPreview}
            onDetails={() => onDetail("tasks")}
            onToggle={() =>
              onRecordsChange({
                ...records,
                tasks: records.tasks.map((item) =>
                  item.id === task.id
                    ? { ...item, completed: !item.completed }
                    : item,
                ),
              })
            }
          />
        ))}
        {completedRows.length > 0 && (
          <>
            <div className="cb-pc-section-head cb-pc-completed-heading">
              <b>Completed</b>
              <span>{completed.length} in this window</span>
            </div>
            {completedRows.map((task) => (
              <TaskToggle
                key={task.id}
                task={task}
                interactive={props.clientPreview}
                onDetails={() => onDetail("tasks")}
                onToggle={() =>
                  onRecordsChange({
                    ...records,
                    tasks: records.tasks.map((item) =>
                      item.id === task.id
                        ? { ...item, completed: !item.completed }
                        : item,
                    ),
                  })
                }
              />
            ))}
          </>
        )}
        {tasks.length > taskRows.length && rowsAvailable - rowsUsed >= 18 && (
          <small className="cb-pc-muted">
            +{tasks.length - taskRows.length} more due tasks
          </small>
        )}
      </div>
    );
  }

  if (kind === "CU06") {
    const eligible = records.feedback.filter(
      (item) =>
        item.sentAt <= records.client.asOf &&
        dateInPeriod(item.sentAt, settings.period, records.client.asOf),
    );
    const feedbackEntries = eligible
      .filter((item) => settings.summary !== "unread" || !item.read)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    const feedback = feedbackEntries.at(-1);
    if (!feedback)
      return (
        <Empty>
          {settings.summary === "unread"
            ? "No unread published feedback in this period."
            : "No published feedback in this period."}
        </Empty>
      );
    const visibleFeedback =
      bodyHeight >= 300 ? feedbackEntries.slice(-3).reverse() : [feedback];
    return (
      <div className="cb-pc-stack">
        {visibleFeedback.map((item, index) => {
          const lines = compact
            ? 1
            : bodyHeight >= 300
              ? index === 0
                ? 4
                : 2
              : Math.max(2, Math.min(7, Math.floor((bodyHeight - 70) / 20)));
          const charBudget = Math.max(
            46,
            Math.floor((bodyWidth / 7.3) * lines),
          );
          const cutoff = item.excerpt.lastIndexOf(" ", charBudget);
          const excerpt =
            item.excerpt.length > charBudget
              ? `${item.excerpt.slice(0, cutoff > 0 ? cutoff : charBudget).trimEnd()}…`
              : item.excerpt;
          return (
            <article className="cb-pc-feedback-entry" key={item.id}>
              <div className="cb-pc-section-head">
                <span>
                  Sent {dateLabel(item.sentAt)} ·{" "}
                  {settings.period === "today"
                    ? "Today"
                    : `Past ${settings.period}`}
                </span>
                <b>
                  {item.read ? "Read" : "Unread"}
                  {item.video ? " · Video" : ""}
                </b>
              </div>
              <p className="cb-pc-excerpt">{excerpt}</p>
              {index === 0 && bodyHeight >= 142 && item.links.length > 0 && (
                <div className="cb-pc-feedback-links">
                  {item.links
                    .slice(0, Math.max(1, Math.floor(bodyWidth / 190)))
                    .map((link) => (
                      <button
                        type="button"
                        onClick={() => onDetail(link.destination)}
                        key={link.destination}
                      >
                        <span>{link.label}</span>
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </button>
                    ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    );
  }

  if (kind === "CU09") {
    const weekCount =
      (
        {
          week: 1,
          month: 4,
          "6month": 26,
          year: 52,
          "4w": 4,
          "8w": 8,
          "12w": 12,
        } as Record<string, number>
      )[settings.period] ?? 8;
    const periodStart = new Date(`${records.client.asOf}T12:00:00`);
    periodStart.setDate(periodStart.getDate() - weekCount * 7);
    const periodStartKey = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}-${String(periodStart.getDate()).padStart(2, "0")}`;
    const weeks = getRoadmapWeeks(records)
      .filter(
        (week) =>
          ((week.startDate <= records.client.asOf &&
            week.endDate >= records.client.asOf) ||
            week.endDate <= records.client.asOf) &&
          week.startDate >= periodStartKey,
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const selected = settings.fields.length
      ? settings.fields
      : ["bodyweight", "steps", "protein"];
    const points = selected.flatMap((key) => {
      const history = weeks.map((week) => ({
        week,
        metric: week.metrics.find(
          (m) => m.key === key || m.label.toLowerCase() === key.toLowerCase(),
        ),
      }));
      const metric = [...history].reverse().find((item) => item.metric)?.metric;
      const currentWeek = [...history]
        .reverse()
        .find((item) => item.metric)?.week;
      if (!metric) return [];
      const prior = history.length > 1 ? history.at(-2)?.metric : undefined;
      return [
        {
          key,
          label: metric.label,
          current: metric,
          prior,
          history,
          currentWeek,
        },
      ];
    });
    if (!points.length)
      return (
        <Empty actionLabel="Open roadmap" onAction={() => onDetail("roadmap")}>
          No selected roadmap metrics are available.
        </Empty>
      );
    if (bodyHeight < 112) {
      const visibleCount = Math.max(1, Math.floor((bodyHeight - 8) / 26));
      const visible = points.slice(0, visibleCount);
      return (
        <div className="cb-pc-roadmap is-shallow is-quick-values">
          {visible.map(({ key, label, current }) => (
            <div className="cb-pc-roadmap-quick-row" key={key}>
              <span>{label}</span>
              <b>
                {current.value == null
                  ? "No data"
                  : `${fmt(current.value)} ${current.unit}`}
              </b>
            </div>
          ))}
          {points.length > visible.length && (
            <span className="cb-pc-muted">
              +{points.length - visible.length} selected metrics · open for all
            </span>
          )}
        </div>
      );
    }
    const showPlots = settings.summary === "weekly-trends" && hasRoom(142);
    const expandedTrendLayout = showPlots && bodyHeight >= 220;
    const columns = expandedTrendLayout
      ? 1
      : Math.max(1, Math.floor(bodyWidth / 240));
    const overflowReserve = points.length > columns ? 32 : 8;
    const rowBudget = expandedTrendLayout
      ? Math.max(1, Math.floor((bodyHeight - 28) / 88))
      : Math.max(
          1,
          Math.floor((bodyHeight - overflowReserve) / (showPlots ? 166 : 64)),
        );
    const visible = points.slice(0, columns * rowBudget);
    return (
      <>
        {expandedTrendLayout && (
          <div className="cb-pc-chart-controls">
            <span>Weekly trends</span>
            <ChartPeriodControl
              period={settings.period}
              onChange={onPeriodChange ?? (() => {})}
              label="Roadmap date range"
            />
          </div>
        )}
        <div
          className={`cb-pc-roadmap${bodyHeight < 112 ? " is-shallow" : ""}`}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {visible.map(
            ({ key, label, current, prior, history, currentWeek }) => (
              <section className="cb-pc-roadmap-metric" key={key}>
                <div className="cb-pc-row">
                  <b>{label}</b>
                  <span>
                    {current.value == null
                      ? "No data"
                      : `${fmt(current.value)} ${current.unit}`}
                  </span>
                </div>
                <div className="cb-pc-roadmap-detail">
                  <span>
                    {currentWeek
                      ? expandedTrendLayout
                        ? `Week ${currentWeek.week} · ${dateLabel(currentWeek.endDate)}`
                        : `Week ${currentWeek.week} · ${dateLabel(currentWeek.startDate)}–${dateLabel(currentWeek.endDate)} · ${settings.period}`
                      : `Date unavailable · ${settings.period}`}
                  </span>
                </div>
                {settings.target && current.target && (
                  <small className="cb-pc-muted">
                    Target · {metricTarget(current)}
                  </small>
                )}
                {showPlots && (
                  <>
                    {!expandedTrendLayout && (
                      <div className="cb-pc-chart-controls">
                        <span>{label} trend</span>
                        <ChartPeriodControl
                          period={settings.period}
                          onChange={onPeriodChange ?? (() => {})}
                          label={`${label} date range`}
                        />
                      </div>
                    )}
                    <DatedPlot
                      rows={history
                        .slice(
                          -Math.max(
                            2,
                            Math.min(10, Math.floor(bodyWidth / 60)),
                          ),
                        )
                        .map((item) => ({
                          date: item.week.startDate,
                          value: item.metric?.value ?? null,
                        }))}
                      unit={current.unit}
                      width={bodyWidth / columns - 16}
                      height={
                        expandedTrendLayout
                          ? 32
                          : bodyWidth < 280
                            ? 34
                            : chartHeight(126, 46)
                      }
                      label={`${label} weekly trend`}
                      compact={expandedTrendLayout || bodyWidth < 280}
                    />
                  </>
                )}
                {bodyHeight >= 112 &&
                  prior?.value != null &&
                  current.value != null &&
                  !showPlots && (
                    <small className="cb-pc-muted">
                      Previous week {fmt(prior.value)} {prior.unit}
                    </small>
                  )}
              </section>
            ),
          )}
          {points.length > visible.length && (
            <span className="cb-pc-muted">
              +{points.length - visible.length} selected metrics · open for all
            </span>
          )}
        </div>
      </>
    );
  }

  if (kind === "CU16") {
    const destinations = settings.fields.filter(Boolean);
    if (!destinations.length)
      return <Empty>No client destinations are enabled.</Empty>;
    const captionFor = (name: string) => {
      if (name === "Tracker") {
        const last = [...records.bodyweight]
          .filter((r) => r.value != null)
          .sort((a, b) => a.date.localeCompare(b.date))
          .at(-1);
        return last
          ? `Latest reading · ${dateLabel(last.date)}`
          : "No readings yet";
      }
      if (name === "Mealplan")
        return `Active plan · ${records.activeNutritionOption}`;
      if (name === "Training") {
        const next = records.workoutSchedule
          .filter((w) => w.date >= records.client.asOf)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        return next
          ? `Next workout · ${dateLabel(next.date)}`
          : "No session scheduled";
      }
      if (name === "Check-in") {
        const next = records.checkInSchedule
          .filter((r) => r.date >= records.client.asOf)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        return next
          ? `Next check-in · ${dateLabel(next.date)}`
          : "No date scheduled";
      }
      if (name === "Habit Tracker") {
        const n = records.habits.filter((h) =>
          h.scheduledDates.includes(records.client.asOf),
        ).length;
        return `${n} scheduled today`;
      }
      const message = [...records.messages]
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1);
      return message
        ? `Latest message · ${dateLabel(message.date)}`
        : "No messages yet";
    };
    const linkColumns = Math.max(1, Math.min(2, Math.floor(bodyWidth / 104)));
    const visibleCount = Math.max(
      1,
      linkColumns * Math.floor((bodyHeight - 4) / 42),
    );
    return (
      <div
        className="cb-pc-links"
        style={{
          gridTemplateColumns: `repeat(${linkColumns}, minmax(0, 1fr))`,
        }}
      >
        {destinations.slice(0, visibleCount).map((name) => (
          <button
            className="cb-dw-quick-link cb-pc-link"
            aria-label={`${settings.labels?.[name]?.trim() || name}: ${captionFor(name)}`}
            type="button"
            key={name}
            onClick={() => onDetail(`destination:${name}`)}
          >
            <span className="cb-pc-link-copy">
              <span>{settings.labels?.[name]?.trim() || name}</span>
              {bodyHeight >= 150 && <small>{captionFor(name)}</small>}
            </span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        ))}
        {destinations.length > visibleCount && (
          <small className="cb-pc-muted">
            +{destinations.length - visibleCount} enabled links
          </small>
        )}
      </div>
    );
  }

  return <Empty>Progress content is unavailable for this card.</Empty>;
}

export function ProgressWidgetContent(props: Props) {
  return (
    <div
      className={`cb-pc-content${props.clientPreview ? " is-client-preview" : ""}`}
      data-kind={props.widget.kind}
      data-outer-width={props.width}
      data-outer-height={props.height}
      style={
        {
          "--cb-pc-width": `${props.bodyWidth}px`,
          "--cb-pc-value-font": `${clamp(props.bodyWidth * 0.073, 21, 31)}px`,
        } as CSSProperties
      }
    >
      <ProgressBody props={props} />
    </div>
  );
}
