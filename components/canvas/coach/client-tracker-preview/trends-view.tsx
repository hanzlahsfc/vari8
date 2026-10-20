"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "@/lib/canvas/reduced-motion";
import {
  configuredDecimals,
  configuredUnit,
  displayedValue,
  type TrackerParameter,
} from "./preview-model";
import {
  addDays,
  dateLabel,
  summaryParameters,
  type TrackerViewProps,
  textSummary,
  textValueFor,
} from "./view-model";
import "./trends-view.css";

type TrendSpan = 7 | 30 | 56 | 90 | 180;
type DailyPoint = { date: string; value: number | null };

const SPANS: TrendSpan[] = [7, 30, 56, 90, 180];
const BAR_UNITS = new Set(["steps", "count", "sessions", "minutes", "reps"]);

function isCompletion(parameter: TrackerParameter, props: TrackerViewProps) {
  if (parameter.inputType === "period-start") return true;
  return (
    parameter.inputType === "choice" &&
    (props.config.fieldOptions?.[parameter.id] ?? parameter.options ?? [])
      .length > 0 &&
    (
      props.config.fieldOptions?.[parameter.id] ??
      parameter.options ??
      []
    ).every((option) => ["yes", "no"].includes(option.trim().toLowerCase()))
  );
}

function numberLabel(value: number, decimals: number) {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function isBarMetric(parameter: TrackerParameter, props: TrackerViewProps) {
  return (
    parameter.kind !== "rating" &&
    BAR_UNITS.has(configuredUnit(parameter, props.config).toLowerCase())
  );
}

function valueAt(
  parameter: TrackerParameter,
  date: string,
  props: TrackerViewProps,
) {
  const raw = props.entries.find((entry) => entry.date === date)?.values[
    parameter.id
  ];
  return typeof raw === "number" && Number.isFinite(raw)
    ? displayedValue(parameter, raw, props.config)
    : null;
}

function NumericChart({
  parameter,
  rows,
  activeIndex,
  setActiveIndex,
  props,
}: {
  parameter: TrackerParameter;
  rows: DailyPoint[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  props: TrackerViewProps;
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const touchStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    mountedRef.current = true;
    const element = plotRef.current;
    if (!element)
      return () => {
        mountedRef.current = false;
      };
    const measure = () => {
      if (mountedRef.current)
        setWidth(Math.max(0, element.getBoundingClientRect().width));
    };
    measure();
    const observer = new ResizeObserver(([entry]) => {
      if (entry && mountedRef.current)
        setWidth(Math.max(0, entry.contentRect.width));
    });
    observer.observe(element);
    return () => {
      mountedRef.current = false;
      observer.disconnect();
    };
  }, []);
  const bar = isBarMetric(parameter, props);
  const height = 208;
  const left = 48;
  const right = 12;
  const top = 14;
  const bottom = 28;
  const plotWidth = Math.max(0, width - left - right);
  const plotHeight = height - top - bottom;
  const values = rows
    .map((row) => row.value)
    .filter((value): value is number => value !== null);
  const hasReadings = values.length > 0;
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const observations = rows.filter(
    (row): row is DailyPoint & { value: number } => row.value !== null,
  );
  const firstObserved = observations[0];
  const latestObserved = observations.at(-1);
  const average = observations.length
    ? observations.reduce((total, row) => total + row.value, 0) /
      observations.length
    : null;
  const change =
    observations.length >= 2 && firstObserved && latestObserved
      ? latestObserved.value - firstObserved.value
      : null;
  const scalePadding =
    rawMin === rawMax
      ? Math.max(Math.abs(rawMin) * 0.08, 1)
      : (rawMax - rawMin) * 0.12;
  const scaleMin = bar ? Math.min(0, rawMin) : rawMin - scalePadding;
  const scaleMax = bar
    ? Math.max(rawMax, rawMax === 0 ? scalePadding : 0)
    : rawMax + scalePadding;
  const roughStep = Math.max((scaleMax - scaleMin) / 4, 0.000001);
  const stepMagnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / stepMagnitude;
  let tickStep =
    (normalizedStep <= 1.5
      ? 1
      : normalizedStep <= 3
        ? 2
        : normalizedStep <= 7
          ? 5
          : 10) * stepMagnitude;
  let min = Math.floor(scaleMin / tickStep) * tickStep;
  let max = Math.ceil(scaleMax / tickStep) * tickStep;
  while ((max - min) / tickStep > 4) {
    const magnitude = 10 ** Math.floor(Math.log10(tickStep));
    const normalized = tickStep / magnitude;
    tickStep *=
      normalized < 1.5 ? 2 : normalized < 3 ? 2.5 : normalized < 7 ? 2 : 2;
    min = Math.floor(scaleMin / tickStep) * tickStep;
    max = Math.ceil(scaleMax / tickStep) * tickStep;
  }
  const ticks = Array.from(
    { length: Math.round((max - min) / tickStep) + 1 },
    (_, index) => max - index * tickStep,
  );
  const span = Math.max(0.000001, max - min);
  const x = (index: number) =>
    left +
    (rows.length <= 1
      ? plotWidth / 2
      : (index / (rows.length - 1)) * plotWidth);
  const y = (value: number) => top + ((max - value) / span) * plotHeight;
  const paths: string[] = [];
  const areaPaths: string[] = [];
  let segment = "";
  let segmentStart = 0;
  let segmentEnd = 0;
  rows.forEach((row, index) => {
    if (row.value === null) {
      if (segment) {
        paths.push(segment);
        areaPaths.push(
          `${segment} L${x(segmentEnd).toFixed(1)} ${height - bottom} L${x(segmentStart).toFixed(1)} ${height - bottom} Z`,
        );
      }
      segment = "";
      return;
    }
    if (!segment) segmentStart = index;
    segmentEnd = index;
    segment += `${segment ? " L" : "M"}${x(index).toFixed(1)} ${y(row.value).toFixed(1)}`;
  });
  if (segment) {
    paths.push(segment);
    areaPaths.push(
      `${segment} L${x(segmentEnd).toFixed(1)} ${height - bottom} L${x(segmentStart).toFixed(1)} ${height - bottom} Z`,
    );
  }
  const decimals = configuredDecimals(parameter, props.config);
  const axisDecimals = Math.max(
    decimals,
    (tickStep.toFixed(8).replace(/0+$/, "").split(".")[1] ?? "").length,
  );
  const unit = configuredUnit(parameter, props.config);
  const selected = rows[activeIndex];
  const labelValue =
    selected?.value === null || selected?.value === undefined
      ? "No reading"
      : `${numberLabel(selected.value, decimals)}${unit ? ` ${unit}` : ""}`;
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (rows[activeIndex])
        props.onSelectDate(rows[activeIndex].date, parameter.id);
      return;
    }
    let next = activeIndex;
    if (event.key === "ArrowLeft") next = Math.max(0, activeIndex - 1);
    else if (event.key === "ArrowRight")
      next = Math.min(rows.length - 1, activeIndex + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = rows.length - 1;
    else return;
    event.preventDefault();
    setActiveIndex(next);
  };
  const chartX = x(activeIndex);
  return (
    <div className="ct-trends-chart">
      <div
        ref={plotRef}
        className="ct-trends-plot-wrap"
        role="slider"
        aria-label={`${parameter.label} trend`}
        aria-description="Use Left and Right arrows to inspect dates. Press Enter to open the selected day."
        aria-valuemin={0}
        aria-valuemax={rows.length - 1}
        aria-valuenow={activeIndex}
        aria-valuetext={`${dateLabel(selected?.date ?? props.selectedDate, { day: "numeric", month: "long", year: "numeric" })}, ${labelValue}`}
        tabIndex={0}
        onKeyDown={keyDown}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          if (plotWidth <= 0) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const localX = event.clientX - bounds.left - left;
          setActiveIndex(
            Math.max(
              0,
              Math.min(
                rows.length - 1,
                Math.round((localX / plotWidth) * (rows.length - 1)),
              ),
            ),
          );
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "touch")
            touchStartRef.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            };
        }}
        onPointerUp={(event) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (
            event.pointerType !== "touch" ||
            !start ||
            start.pointerId !== event.pointerId ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8 ||
            plotWidth <= 0
          )
            return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const localX = event.clientX - bounds.left - left;
          setActiveIndex(
            Math.max(
              0,
              Math.min(
                rows.length - 1,
                Math.round((localX / plotWidth) * (rows.length - 1)),
              ),
            ),
          );
        }}
      >
        {mountedRef.current && width > left + right && (
          <svg
            className="ct-trends-plot"
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
          >
            {hasReadings ? (
              ticks.map((value) => {
                const gy = y(value);
                return (
                  <g key={value}>
                    <line
                      x1={left}
                      x2={width - right}
                      y1={gy}
                      y2={gy}
                      className="ct-trends-grid"
                    />
                    <text
                      x={left - 8}
                      y={gy + 4}
                      textAnchor="end"
                      className="ct-trends-axis"
                    >
                      {numberLabel(value, axisDecimals)}
                    </text>
                  </g>
                );
              })
            ) : (
              <g>
                <line
                  x1={left}
                  x2={width - right}
                  y1={top + plotHeight / 2}
                  y2={top + plotHeight / 2}
                  className="ct-trends-grid"
                />
                <text
                  x={left + plotWidth / 2}
                  y={top + plotHeight / 2 - 4}
                  textAnchor="middle"
                  className="ct-trends-empty-label"
                >
                  No readings in this range
                </text>
                <text
                  x={left + plotWidth / 2}
                  y={top + plotHeight / 2 + 15}
                  textAnchor="middle"
                  className="ct-trends-empty-hint"
                >
                  Try a different time span
                </text>
              </g>
            )}
            {!bar &&
              areaPaths.map((areaPath) => (
                <path key={areaPath} d={areaPath} className="ct-trends-area" />
              ))}
            {!bar &&
              rows.map((row, index) =>
                row.value === null ? null : (
                  <circle
                    key={row.date}
                    className="ct-trends-observed-point"
                    cx={x(index)}
                    cy={y(row.value)}
                    r="2"
                  />
                ),
              )}
            {bar
              ? rows.map((row, index) => {
                  if (row.value === null) return null;
                  const slot = plotWidth / Math.max(1, rows.length);
                  const barWidth = Math.max(1.5, Math.min(10, slot * 0.62));
                  return (
                    <rect
                      key={row.date}
                      className={`ct-trends-bar${index === activeIndex ? " is-active" : ""}`}
                      x={x(index) - barWidth / 2}
                      y={Math.min(y(row.value), y(0))}
                      width={barWidth}
                      height={Math.max(1, Math.abs(y(0) - y(row.value)))}
                      rx="1"
                    />
                  );
                })
              : paths.map((segmentPath) => (
                  <path
                    key={segmentPath}
                    d={segmentPath}
                    className="ct-trends-line"
                  />
                ))}
            {!bar &&
              selected?.value !== null &&
              selected?.value !== undefined && (
                <circle
                  cx={chartX}
                  cy={y(selected.value)}
                  r="4"
                  className="ct-trends-point"
                />
              )}
            <line
              x1={chartX}
              x2={chartX}
              y1={top}
              y2={height - bottom}
              className="ct-trends-cursor"
            />
            <text x={left} y={height - 7} className="ct-trends-axis">
              {dateLabel(rows[0]?.date ?? props.selectedDate, {
                day: "numeric",
                month: "short",
              })}
            </text>
            {rows.length > 7 && (
              <text
                x={left + plotWidth / 2}
                y={height - 7}
                textAnchor="middle"
                className="ct-trends-axis"
              >
                {dateLabel(
                  rows[Math.floor((rows.length - 1) / 2)]?.date ??
                    props.selectedDate,
                  {
                    day: "numeric",
                    month: "short",
                  },
                )}
              </text>
            )}
            <text
              x={width - right}
              y={height - 7}
              textAnchor="end"
              className="ct-trends-axis"
            >
              {dateLabel(rows.at(-1)?.date ?? props.selectedDate, {
                day: "numeric",
                month: "short",
              })}
            </text>
          </svg>
        )}
      </div>
      <div className="ct-trends-tooltip" aria-live="polite">
        <span>
          {selected
            ? dateLabel(selected.date, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })
            : "—"}
        </span>
        <strong>{labelValue}</strong>
      </div>
      <div className="ct-trends-chart-footer">
        <span>
          {latestObserved
            ? `Latest ${numberLabel(latestObserved.value, decimals)}${unit ? ` ${unit}` : ""} · ${dateLabel(latestObserved.date, { day: "numeric", month: "short" })}`
            : "No readings"}
        </span>
        <span>
          {average === null
            ? "Average —"
            : `Average ${numberLabel(average, decimals)}${unit ? ` ${unit}` : ""}`}
        </span>
        <span>
          {change === null
            ? "Change —"
            : `Change ${change > 0 ? "+" : ""}${numberLabel(change, decimals)}${unit ? ` ${unit}` : ""}`}
        </span>
        <button
          type="button"
          className="ct-trends-open-day"
          disabled={!selected}
          onClick={() =>
            selected && props.onSelectDate(selected.date, parameter.id)
          }
        >
          Open selected day
        </button>
      </div>
    </div>
  );
}

function CompletionChart({
  parameter,
  dates,
  activeIndex,
  setActiveIndex,
  props,
}: {
  parameter: TrackerParameter;
  dates: string[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  props: TrackerViewProps;
}) {
  const activeDate = dates[activeIndex];
  const raw = textValueFor(parameter, activeDate, props.textValues);
  const status =
    raw?.trim().toLowerCase() === "yes"
      ? "yes"
      : raw?.trim().toLowerCase() === "no"
        ? "no"
        : "unknown";
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = activeIndex;
    if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
    else if (event.key === "ArrowRight")
      next = Math.min(dates.length - 1, index + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = dates.length - 1;
    else return;
    event.preventDefault();
    setActiveIndex(next);
    (
      event.currentTarget.parentElement?.children[next] as
        | HTMLButtonElement
        | undefined
    )?.focus();
  };
  return (
    <div className="ct-trends-completion">
      <div
        className="ct-trends-completion-strip"
        style={{ "--ct-trends-days": dates.length } as CSSProperties}
      >
        {dates.map((date, index) => {
          const value = textValueFor(parameter, date, props.textValues)
            ?.trim()
            .toLowerCase();
          const state =
            value === "yes" ? "yes" : value === "no" ? "no" : "unknown";
          return (
            <button
              key={date}
              type="button"
              tabIndex={index === activeIndex ? 0 : -1}
              className={`ct-trends-day is-${state}${index === activeIndex ? " is-active" : ""}`}
              aria-label={`${dateLabel(date, { weekday: "long", day: "numeric", month: "long" })}: ${state === "unknown" ? "not recorded" : state}`}
              onKeyDown={(event) => keyDown(event, index)}
              onFocus={() => setActiveIndex(index)}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                setActiveIndex(index);
                props.onSelectDate(date, parameter.id);
              }}
            />
          );
        })}
      </div>
      <div className="ct-trends-legend">
        <span>
          <i className="is-yes" />
          Yes
        </span>
        <span>
          <i className="is-no" />
          No
        </span>
        <span>
          <i className="is-unknown" />
          Not recorded
        </span>
        <strong>
          {activeDate
            ? dateLabel(activeDate, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })
            : "—"}{" "}
          ·{" "}
          {status === "unknown"
            ? "Not recorded"
            : status === "yes"
              ? "Yes"
              : "No"}
        </strong>
      </div>
    </div>
  );
}

function TextEntries({
  parameter,
  dates,
  props,
}: {
  parameter: TrackerParameter;
  dates: string[];
  props: TrackerViewProps;
}) {
  const recorded = dates
    .flatMap((date) => {
      const value = textValueFor(parameter, date, props.textValues);
      return value
        ? [{ date, value: textSummary(parameter, value, props.config) }]
        : [];
    })
    .reverse();
  if (!recorded.length)
    return <div className="ct-trends-empty">No entries in this period.</div>;
  return (
    <ol className="ct-trends-text-list">
      {recorded.map(({ date, value }) => (
        <li key={date}>
          <time dateTime={date}>
            {dateLabel(date, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </time>
          <span>{value}</span>
          <button
            type="button"
            aria-label={`Open ${parameter.label} entry for ${dateLabel(date, { day: "numeric", month: "long" })}`}
            onClick={() => props.onSelectDate(date, parameter.id)}
          >
            Open day
          </button>
        </li>
      ))}
    </ol>
  );
}

export function TrendsView(props: TrackerViewProps) {
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [span, setSpan] = useState<TrendSpan>(30);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const initial =
      summaryParameters(props.groups, props.config)[0] ??
      props.groups[0]?.parameters[0];
    return initial ? [initial.id] : [];
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const safeEnd =
    props.selectedDate > props.asOf ? props.asOf : props.selectedDate;
  const dates = useMemo(
    () =>
      Array.from({ length: span }, (_, index) =>
        addDays(safeEnd, index - span + 1),
      ),
    [safeEnd, span],
  );
  const allParameters = props.groups.flatMap((group) => group.parameters);
  const configuredIds = new Set(allParameters.map((parameter) => parameter.id));
  const configuredSignature = allParameters
    .map((parameter) => parameter.id)
    .join("\u0000");
  useEffect(() => {
    const available = new Set(configuredSignature.split("\u0000"));
    setSelectedIds((current) => {
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [configuredSignature]);
  const selected = selectedIds
    .filter((id) => configuredIds.has(id))
    .slice(0, 3);
  const activeIndexState = useState(dates.length - 1);
  const activeIndex = Math.min(activeIndexState[0], dates.length - 1);
  const setActiveIndex = activeIndexState[1];
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (pickerOpen) searchInputRef.current?.focus();
  }, [pickerOpen]);
  const closePickerOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setPickerOpen(false);
    pickerButtonRef.current?.focus();
  };
  const query = search.trim().toLocaleLowerCase();
  const filteredGroups = props.groups
    .map((group) => ({
      ...group,
      parameters: group.parameters.filter(
        (parameter) =>
          !query ||
          `${parameter.label} ${parameter.categoryId ?? ""} ${group.label}`
            .toLocaleLowerCase()
            .includes(query),
      ),
    }))
    .filter((group) => group.parameters.length > 0);
  const byId = new Map(
    allParameters.map((parameter) => [parameter.id, parameter]),
  );
  const rangeStart = dates[0] ?? safeEnd;
  const rangeEnd = dates.at(-1) ?? safeEnd;
  const toggleMetric = (id: string) =>
    setSelectedIds((current) => {
      const pruned = current.filter((item) => configuredIds.has(item));
      return pruned.includes(id)
        ? pruned.filter((item) => item !== id)
        : pruned.length < 3
          ? [...pruned, id]
          : pruned;
    });
  const rangeLabels: Record<TrendSpan, string> = {
    7: "7 days",
    30: "30 days",
    56: "8 weeks",
    90: "3 months",
    180: "6 months",
  };

  return (
    <section className="ct-trends" aria-label="Trends">
      <div className="ct-trends-controls">
        <div className="ct-trends-picker">
          <button
            ref={pickerButtonRef}
            className="ct-trends-picker-toggle"
            type="button"
            aria-expanded={pickerOpen}
            aria-controls="ct-trends-options"
            onClick={() => setPickerOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && pickerOpen) {
                event.preventDefault();
                event.stopPropagation();
                setPickerOpen(false);
                pickerButtonRef.current?.focus();
              }
            }}
          >
            <span>Metrics</span>
            <span className="ct-trends-picker-count">{selected.length}/3</span>
            <span className="ct-trends-picker-chevron" aria-hidden="true">
              <ChevronDown
                size={16}
                strokeWidth={1.35}
                className={pickerOpen ? "is-open" : undefined}
              />
            </span>
          </button>
          <AnimatePresence initial={false}>
            {pickerOpen && (
              <motion.div
                className="ct-trends-options"
                id="ct-trends-options"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: -4, scale: 0.985 }
                }
                animate={
                  reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
                }
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: -4, scale: 0.985 }
                }
                transition={
                  reduceMotion
                    ? { duration: 0.12 }
                    : { type: "spring", duration: 0.24, bounce: 0 }
                }
              >
                <label
                  className="ct-trends-search-label"
                  htmlFor="ct-trends-search"
                >
                  <Search
                    className="ct-trends-search-icon"
                    size={16}
                    strokeWidth={1.35}
                    aria-hidden="true"
                  />
                  <input
                    ref={searchInputRef}
                    id="ct-trends-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={closePickerOnEscape}
                    placeholder="Find a metric"
                    aria-label="Search metrics"
                  />
                </label>
                <div className="ct-trends-options-groups">
                  {filteredGroups.map((group) => (
                    <fieldset key={group.label}>
                      <legend>{group.label}</legend>
                      {group.parameters.map((parameter) => {
                        const checked = selected.includes(parameter.id);
                        return (
                          <label
                            key={parameter.id}
                            className={checked ? "is-selected" : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && selected.length >= 3}
                              onChange={() => toggleMetric(parameter.id)}
                              onKeyDown={closePickerOnEscape}
                            />
                            <span>{parameter.label}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  ))}
                  {!filteredGroups.length && (
                    <p className="ct-trends-no-matches">No metrics found.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <fieldset className="ct-trends-range">
          <legend>Range</legend>
          {SPANS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={span === days}
              className={span === days ? "is-selected" : undefined}
              onClick={() => {
                setSpan(days);
                setActiveIndex(days - 1);
              }}
            >
              {rangeLabels[days]}
            </button>
          ))}
        </fieldset>
      </div>
      <ul className="ct-trends-selected" aria-label="Selected metrics">
        {selected.map((id) => {
          const parameter = byId.get(id);
          return parameter ? (
            <li className="ct-trends-tag" key={id}>
              <span>{parameter.label}</span>
              <button
                type="button"
                aria-label={`Remove ${parameter.label}`}
                onClick={() => toggleMetric(id)}
              >
                <X
                  className="ct-trends-remove-icon"
                  size={15}
                  strokeWidth={1.35}
                  aria-hidden="true"
                />
              </button>
            </li>
          ) : null;
        })}
      </ul>
      <div className="ct-trends-headline">
        <span>
          {dateLabel(rangeStart, { day: "numeric", month: "short" })} –{" "}
          {dateLabel(rangeEnd, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>
      {!selected.length ? (
        <div className="ct-trends-empty-state">
          <strong>Select a metric to begin</strong>
          <span>
            Your configured metrics will appear here with their recorded sample
            coverage.
          </span>
        </div>
      ) : (
        <div className="ct-trends-tray">
          <div className="ct-trends-series-core">
            <div className="ct-trends-series">
              {selected.map((id) => {
                const parameter = byId.get(id);
                if (!parameter) return null;
                const sampleCount = parameter.inputType
                  ? dates.filter((date) =>
                      Boolean(textValueFor(parameter, date, props.textValues)),
                    ).length
                  : dates.filter(
                      (date) => valueAt(parameter, date, props) !== null,
                    ).length;
                const coverage = `${sampleCount} of ${span} days recorded`;
                return (
                  <article className="ct-trends-series-item" key={id}>
                    <header>
                      <div>
                        <h3>{parameter.label}</h3>
                        <span>
                          {parameter.inputType
                            ? "Recorded entries"
                            : configuredUnit(parameter, props.config) ||
                              "Value"}
                        </span>
                      </div>
                      <p>{coverage}</p>
                    </header>
                    {parameter.inputType && isCompletion(parameter, props) ? (
                      <CompletionChart
                        parameter={parameter}
                        dates={dates}
                        activeIndex={activeIndex}
                        setActiveIndex={setActiveIndex}
                        props={props}
                      />
                    ) : parameter.inputType ? (
                      <TextEntries
                        parameter={parameter}
                        dates={dates}
                        props={props}
                      />
                    ) : (
                      <NumericChart
                        parameter={parameter}
                        rows={dates.map((date) => ({
                          date,
                          value: valueAt(parameter, date, props),
                        }))}
                        activeIndex={activeIndex}
                        setActiveIndex={setActiveIndex}
                        props={props}
                      />
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
