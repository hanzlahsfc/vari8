"use client";

import { type CSSProperties, useId, useState } from "react";
import { dateLabel } from "./model";
import "./smooth-trend.css";

export type TrendRow = { date: string; value: number | null };

type Props = {
  rows: TrendRow[];
  unit: string;
  width: number;
  height: number;
  label: string;
  compact?: boolean;
  target?: number;
  targetRows?: TrendRow[];
  targetBandRows?: { date: string; low: number | null; high: number | null }[];
  targetLabel?: string;
  targetStyle?: "subtle";
};

type Point = {
  x: number;
  y: number;
  row: { date: string; value: number };
  index: number;
};

function monotonePath(points: Point[]) {
  if (!points.length) return "";
  if (points.length === 1)
    return `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  const slopes = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const deltaX = next.x - point.x;
    return deltaX === 0 ? 0 : (next.y - point.y) / deltaX;
  });
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes.at(-1) ?? 0;
    const before = slopes[index - 1];
    const after = slopes[index];
    if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after))
      return 0;
    return (2 * before * after) / (before + after);
  });
  return points.reduce((path, point, index) => {
    if (index === 0) return `M${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const previous = points[index - 1];
    const distance = point.x - previous.x;
    const outgoing = tangents[index - 1] * distance;
    const incoming = tangents[index] * distance;
    return `${path} C${(previous.x + distance / 3).toFixed(1)} ${(previous.y + outgoing / 3).toFixed(1)} ${(point.x - distance / 3).toFixed(1)} ${(point.y - incoming / 3).toFixed(1)} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, "");
}

function formatValue(value: number, unit: string) {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

export function SmoothTrend({
  rows: suppliedRows,
  unit,
  width,
  height,
  label,
  compact = false,
  target,
  targetRows,
  targetBandRows,
  targetLabel,
  targetStyle,
}: Props) {
  const gradientId = useId().replaceAll(":", "");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const targetDates = [
    ...(targetRows?.map((row) => row.date) ?? []),
    ...(targetBandRows?.map((row) => row.date) ?? []),
  ];
  const rows = suppliedRows.length
    ? suppliedRows
    : [...new Set(targetDates)].sort().map((date) => ({ date, value: null }));
  if (!rows.length)
    return <div className="cb-pc-plot-empty">No readings in this period</div>;
  const finiteRows = rows.filter(
    (row) => row.value != null && Number.isFinite(row.value),
  );

  const w = Math.max(1, width);
  const h = Math.max(28, height);
  const reduced = compact || w < 250;
  const axisHeight = reduced ? 0 : Math.min(18, Math.max(12, h * 0.16));
  const showYAxis = !reduced && h >= 70;
  const chartHeight = h - axisHeight;
  const left = reduced
    ? Math.min(8, w * 0.08)
    : Math.min(58, Math.max(38, w * 0.2));
  const right = Math.min(10, w * 0.08);
  const top = reduced ? 4 : 8;
  const bottom = reduced ? 4 : 7;
  const plotBottom = Math.max(top + 1, chartHeight - bottom);
  const values = finiteRows.map((row) => row.value as number);
  const targetValues =
    targetRows
      ?.map((row) => row.value)
      .filter(
        (value): value is number => value != null && Number.isFinite(value),
      ) ?? [];
  const bandValues =
    targetBandRows
      ?.flatMap((row) => [row.low, row.high])
      .filter(
        (value): value is number => value != null && Number.isFinite(value),
      ) ?? [];
  if (
    !finiteRows.length &&
    !targetValues.length &&
    !bandValues.length &&
    target == null
  ) {
    return <div className="cb-pc-plot-empty">No readings in this period</div>;
  }
  const low = Math.min(
    ...values,
    ...targetValues,
    ...bandValues,
    target ?? Infinity,
  );
  const high = Math.max(
    ...values,
    ...targetValues,
    ...bandValues,
    target ?? -Infinity,
  );
  const pad = Math.max((high - low) * 0.16, Math.abs(high) * 0.004, 0.12);
  const min = low - pad;
  const max = high + pad;
  const dates = rows.map((row, index) => {
    const parsed = new Date(`${row.date}T12:00:00`).valueOf();
    return Number.isFinite(parsed) ? parsed : index;
  });
  const start = Math.min(...dates);
  const end = Math.max(...dates);
  const duration = end - start;
  const innerWidth = Math.max(1, w - left - right);
  const xPositions = rows.map((_row, index) =>
    rows.length <= 1 || duration === 0
      ? left + innerWidth / 2
      : left + ((dates[index] - start) / duration) * innerWidth,
  );
  const points: (Point | null)[] = rows.map((row, index) => {
    if (row.value == null || !Number.isFinite(row.value)) return null;
    const x = xPositions[index];
    const y = top + ((max - row.value) / (max - min)) * (plotBottom - top);
    return { x, y, row: { date: row.date, value: row.value }, index };
  });
  // Missing days retain their x positions and interaction entries; the visual path bridges them.
  const observed = points.filter((point): point is Point => point !== null);
  const line = monotonePath(observed);
  const area =
    observed.length > 1
      ? `${line} L${observed.at(-1)?.x.toFixed(1)} ${plotBottom.toFixed(1)} L${observed[0].x.toFixed(1)} ${plotBottom.toFixed(1)} Z`
      : "";
  const targetPoints =
    targetRows
      ?.map((row, index) => {
        if (row.value == null || !Number.isFinite(row.value)) return null;
        const stamp = new Date(`${row.date}T12:00:00`).valueOf();
        const x =
          duration === 0
            ? left + innerWidth / 2
            : left + ((stamp - start) / duration) * innerWidth;
        return {
          x,
          y: top + ((max - row.value) / (max - min)) * (plotBottom - top),
          row,
          index,
        };
      })
      .filter((point): point is Point => point !== null) ?? [];
  const targetSeriesPath = monotonePath(targetPoints);
  const targetBandPoints = (edge: "low" | "high") =>
    targetBandRows
      ?.map((row, index) => {
        const value = row[edge];
        if (value == null || !Number.isFinite(value)) return null;
        const stamp = new Date(`${row.date}T12:00:00`).valueOf();
        const x =
          duration === 0
            ? left + innerWidth / 2
            : left + ((stamp - start) / duration) * innerWidth;
        return {
          x,
          y: top + ((max - value) / (max - min)) * (plotBottom - top),
          row: { date: row.date, value },
          index,
        };
      })
      .filter((point): point is Point => point !== null) ?? [];
  const bandHigh = targetBandPoints("high");
  const bandLow = targetBandPoints("low");
  const reverseLowPath = monotonePath([...bandLow].reverse());
  const targetBandPath =
    bandHigh.length && bandLow.length
      ? `${monotonePath(bandHigh)} ${reverseLowPath.replace(/^M/, "L")} Z`
      : "";
  const selectedIndex =
    activeIndex == null ? null : Math.min(activeIndex, rows.length - 1);
  const selected = selectedIndex == null ? null : rows[selectedIndex];
  const selectedPoint = selectedIndex == null ? null : points[selectedIndex];
  const selectedX = selectedIndex == null ? null : xPositions[selectedIndex];
  const selectedTarget = targetRows?.find(
    (row) => row.date === selected?.date,
  )?.value;
  const selectedBand = targetBandRows?.find(
    (row) => row.date === selected?.date,
  );
  const fallbackRow = rows.at(-1) ?? finiteRows[0];
  const targetY =
    target == null
      ? null
      : top + ((max - target) / (max - min)) * (plotBottom - top);
  const valueText = (row: TrendRow) =>
    row.value == null || !Number.isFinite(row.value)
      ? "Not logged"
      : formatValue(row.value, unit);
  const inspectAt = (clientX: number, bounds: DOMRect) => {
    if (!rows.length || !bounds.width) return;
    const x = ((clientX - bounds.left) / bounds.width) * w;
    const index = xPositions.reduce(
      (best, pointX, current) =>
        Math.abs(pointX - x) < Math.abs(xPositions[best] - x) ? current : best,
      0,
    );
    setActiveIndex(index);
  };
  const tickCandidates =
    w < 340
      ? [rows[0], rows.at(-1)]
      : [rows[0], rows[Math.floor((rows.length - 1) / 2)], rows.at(-1)];
  const ticks =
    rows.length > 1
      ? tickCandidates.filter(
          (row, index, all): row is TrendRow =>
            row !== undefined &&
            row !== null &&
            all.findIndex((item) => item?.date === row.date) === index,
        )
      : rows;
  const targetDescription =
    selectedBand?.low != null && selectedBand.high != null
      ? `${targetLabel ?? "Target range"} ${formatValue(selectedBand.low, unit)} to ${formatValue(selectedBand.high, unit)}`
      : selectedTarget != null
        ? `${targetLabel ?? "Target"} ${formatValue(selectedTarget, unit)}`
        : "";
  const tooltipStyle: CSSProperties | undefined = selectedPoint
    ? {
        left: Math.max(2, Math.min(selectedPoint.x - 76, w - 158)),
        top: Math.max(0, Math.min(selectedPoint.y - 44, chartHeight - 42)),
      }
    : selected
      ? {
          left: Math.max(2, Math.min((selectedX ?? w / 2) - 76, w - 158)),
          top: 4,
        }
      : undefined;

  return (
    <figure
      className={`cb-pc-plot cb-pc-smooth-trend${reduced ? " is-compact" : ""}`}
    >
      <div
        className="cb-pc-smooth-trend-surface"
        role="slider"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label={`${label}: inspect dated entries with Left and Right arrows`}
        aria-roledescription="interactive chart"
        aria-valuemin={1}
        aria-valuemax={rows.length}
        aria-valuenow={(selectedIndex ?? rows.length - 1) + 1}
        aria-valuetext={`${selected ? dateLabel(selected.date, { month: "short", day: "numeric" }) : "Latest"}, ${selected ? valueText(selected) : valueText(fallbackRow)}${targetDescription ? `, ${targetDescription}` : ""}`}
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
          viewBox={`0 0 ${w} ${chartHeight}`}
          width="100%"
          height={chartHeight}
          role="img"
          aria-label={`${label} dated observations in ${unit}`}
        >
          <title>{`${label}: ${rows.map((row) => `${dateLabel(row.date)} ${valueText(row)}`).join("; ")}`}</title>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--chart-fill)"
                stopOpacity="0.2"
              />
              <stop
                offset="100%"
                stopColor="var(--chart-fill)"
                stopOpacity="0.015"
              />
            </linearGradient>
          </defs>
          {!reduced &&
            (showYAxis ? [0, 0.5, 1] : [0, 1]).map((fraction) => {
              const y = top + fraction * (plotBottom - top);
              return (
                <g key={fraction}>
                  <path
                    className="cb-pc-smooth-grid"
                    d={`M${left} ${y}H${w - right}`}
                  />
                  {showYAxis && (
                    <text
                      className="cb-pc-smooth-y-label"
                      x={left - 6}
                      y={y + 3}
                      textAnchor="end"
                    >
                      {new Intl.NumberFormat("en", {
                        maximumFractionDigits: 1,
                      }).format(max - fraction * (max - min))}
                    </text>
                  )}
                </g>
              );
            })}
          {area && (
            <path
              className="cb-pc-smooth-area"
              d={area}
              fill={`url(#${gradientId})`}
            />
          )}
          {targetBandPath && (
            <path className="cb-pc-smooth-target-band" d={targetBandPath} />
          )}
          {targetSeriesPath && (
            <path className="cb-pc-smooth-target-series" d={targetSeriesPath} />
          )}
          {targetY != null && (
            <path
              className={`cb-pc-target${targetStyle ? ` is-${targetStyle}` : ""}`}
              d={`M${left} ${targetY}H${w - right}`}
            />
          )}
          {selectedX != null && (
            <line
              className="cb-pc-smooth-inspection"
              x1={selectedX}
              x2={selectedX}
              y1={top}
              y2={plotBottom}
            />
          )}
          <path className="cb-pc-line cb-pc-smooth-line" d={line} />
          {selectedPoint && (
            <circle
              className="cb-pc-smooth-active-point"
              cx={selectedPoint.x}
              cy={selectedPoint.y}
              r="4"
            />
          )}
        </svg>
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
            <strong>
              {selected.value == null ? (
                "Not logged"
              ) : (
                <>
                  {new Intl.NumberFormat("en", {
                    maximumFractionDigits: 1,
                  }).format(selected.value)}{" "}
                  <small>{unit}</small>
                </>
              )}
            </strong>
            {targetDescription && (
              <small className="cb-pc-smooth-tooltip-target">
                {targetDescription}
              </small>
            )}
          </div>
        )}
      </div>
      {!reduced && (
        <figcaption className="cb-pc-smooth-dates">
          {ticks.map((row) => (
            <span key={row.date}>
              {dateLabel(row.date, { month: "short", day: "numeric" })}
            </span>
          ))}
        </figcaption>
      )}
      {targetLabel && target != null && !reduced && (
        <figcaption className="cb-pc-smooth-target-label">
          {targetLabel}
        </figcaption>
      )}
    </figure>
  );
}
