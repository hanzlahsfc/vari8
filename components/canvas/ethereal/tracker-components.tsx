"use client";

import { Plus, Utensils, Weight } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Select } from "@/components/canvas/vari8/components";
import {
  type Client,
  clients,
  dashboard,
  mealVariants,
  type VariantId,
} from "@/lib/canvas/coaching-data";

type Period = 7 | 14 | 30;
type WeightVariant = "large" | "medium-graph" | "medium-stats";

const fallbackClient = clients[0];

type WeightRecord = { date: string; kg: number };

function makeWeightSeries(client: Client): WeightRecord[] {
  const knownRecords = [...client.weightTrend].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const latestRecord = knownRecords.at(-1) ?? {
    date: client.bodyweightDate,
    kg: client.bodyweightKg,
  };
  const knownByDate = new Map(
    knownRecords.map((record) => [record.date, record]),
  );
  const latestDate = new Date(`${latestRecord.date}T00:00:00Z`);
  const earliestRecord = knownRecords[0] ?? latestRecord;
  const nextRecord = knownRecords[1];
  const observedSlope = nextRecord
    ? (nextRecord.kg - earliestRecord.kg) /
      Math.max(1, daysBetween(earliestRecord.date, nextRecord.date))
    : 0.035;
  const extensionSlope = Math.max(
    -0.04,
    Math.min(0.04, observedSlope || 0.035),
  );

  return Array.from({ length: 31 }, (_, index) => {
    const daysBeforeLatest = 30 - index;
    const date = new Date(latestDate);
    date.setUTCDate(date.getUTCDate() - daysBeforeLatest);
    const dateKey = date.toISOString().slice(0, 10);
    const seeded = knownByDate.get(dateKey);
    const nextKnown = knownRecords.find((record) => record.date > dateKey);
    const previousKnown = [...knownRecords]
      .reverse()
      .find((record) => record.date < dateKey);
    let illustrativeWeight = earliestRecord.kg;

    if (previousKnown && nextKnown) {
      const elapsed = daysBetween(previousKnown.date, dateKey);
      const interval = daysBetween(previousKnown.date, nextKnown.date);
      const progress = elapsed / interval;
      illustrativeWeight =
        previousKnown.kg + (nextKnown.kg - previousKnown.kg) * progress;
    } else if (previousKnown) {
      illustrativeWeight = previousKnown.kg;
    } else {
      const daysFromFirst = daysBetween(earliestRecord.date, dateKey);
      illustrativeWeight = earliestRecord.kg + daysFromFirst * extensionSlope;
    }

    return {
      date: dateKey,
      kg: seeded?.kg ?? Number(illustrativeWeight.toFixed(1)),
    };
  });
}

function daysBetween(start: string, end: string) {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endTime - startTime) / 86_400_000);
}

function shortDate(value: string, withMonth = false) {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    ...(withMonth ? { month: "short" as const } : {}),
    timeZone: "UTC",
  }).format(date);
}

export function BodyweightTrend({
  client = fallbackClient,
  variant,
  compact = false,
}: {
  client?: Client;
  variant?: WeightVariant;
  compact?: boolean;
}) {
  const displayVariant = variant ?? (compact ? "medium-graph" : "large");
  const chartHeight = displayVariant === "large" ? 216 : 144;
  const [period, setPeriod] = useState<Period>(7);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId();
  const [plotSize, setPlotSize] = useState({ width: 700, height: chartHeight });
  const plotRef = useRef<HTMLDivElement>(null);
  const series = useMemo(() => makeWeightSeries(client), [client]);
  const chartSeries = series.slice(-period);
  const latest = series.at(-1) ?? {
    date: client.bodyweightDate,
    kg: client.bodyweightKg,
  };
  const average =
    series.slice(-7).reduce((total, point) => total + point.kg, 0) / 7;
  const sevenDaysEarlier = series.at(-8) ?? latest;
  const thirtyDaysEarlier = series[0] ?? latest;
  const sevenDayChange = latest.kg - sevenDaysEarlier.kg;
  const thirtyDayChange = latest.kg - thirtyDaysEarlier.kg;
  const horizontalPadding = displayVariant === "large" ? 54 : 50;
  const verticalPadding = 12;
  const chartValues = chartSeries.map((point) => point.kg);
  const valueRange = Math.max(...chartValues) - Math.min(...chartValues);
  const domainPadding = Math.max(0.16, valueRange * 0.12);
  const min = Math.min(...chartValues) - domainPadding;
  const max = Math.max(...chartValues) + domainPadding;
  const innerWidth = Math.max(1, plotSize.width - horizontalPadding - 16);
  const axisY = plotSize.height - 28;
  const innerHeight = Math.max(1, axisY - verticalPadding);
  const points = chartSeries.map((point, index) => ({
    x:
      horizontalPadding +
      (index / Math.max(1, chartSeries.length - 1)) * innerWidth,
    y:
      verticalPadding +
      ((max - point.kg) / Math.max(0.01, max - min)) * innerHeight,
  }));
  const line = makeMonotonePath(points);
  const area = `${line} L${points.at(-1)?.x},${axisY} L${points[0].x},${axisY} Z`;
  const tickCount = plotSize.width < 280 ? 2 : plotSize.width < 460 ? 3 : 4;
  const tickIndices = Array.from({ length: tickCount }, (_, index) =>
    Math.round((index / (tickCount - 1)) * (chartSeries.length - 1)),
  );
  const inspectedIndex =
    activeIndex === null ? null : Math.min(activeIndex, chartSeries.length - 1);
  const inspected =
    inspectedIndex === null ? null : chartSeries[inspectedIndex];
  const inspectedPoint =
    inspectedIndex === null ? null : points[inspectedIndex];
  const inspectAt = (clientX: number) => {
    const bounds = plotRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    const x = ((clientX - bounds.left) / bounds.width) * plotSize.width;
    const index = Math.round(
      ((x - horizontalPadding) / innerWidth) * (points.length - 1),
    );
    setActiveIndex(Math.max(0, Math.min(points.length - 1, index)));
  };
  const metrics = [
    {
      label: "Latest logged",
      value: `${latest.kg.toFixed(1)} kg`,
      detail: shortDate(latest.date, true),
    },
    { label: "7-day average", value: `${average.toFixed(1)} kg` },
    {
      label: "7-day trend",
      value: `${formatSigned(sevenDayChange)} kg`,
      detail: `${formatSigned((sevenDayChange / sevenDaysEarlier.kg) * 100)}%`,
    },
    {
      label: "30-day trend",
      value: `${formatSigned(thirtyDayChange)} kg`,
      detail: `${formatSigned((thirtyDayChange / thirtyDaysEarlier.kg) * 100)}%`,
    },
  ];

  useEffect(() => {
    if (displayVariant === "medium-stats") return;
    const node = plotRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0]?.contentRect ?? {};
      if (width && height) {
        setPlotSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [displayVariant]);

  const periodControl = (
    <div className="bw-chart-select">
      <Select
        label="Bodyweight trend period"
        size="sm"
        value={String(period)}
        onValueChange={(value) => {
          setPeriod(value === "7" ? 7 : value === "14" ? 14 : 30);
          setActiveIndex(null);
        }}
        options={[
          { value: "7", label: "7 days" },
          { value: "14", label: "14 days" },
          { value: "30", label: "30 days" },
        ]}
      />
    </div>
  );

  return (
    <section
      className={`bw-weight bw-weight-${displayVariant}`}
      aria-label="Bodyweight trend"
    >
      {displayVariant !== "medium-stats" && (
        <div className="bw-weight-head">
          <div className="bw-weight-title">
            <Weight size={15} aria-hidden="true" />
            <div>
              <h2>Bodyweight</h2>
              {displayVariant === "large" && <p>Logged measurements</p>}
            </div>
          </div>
          <div className="bw-weight-chart-tools">{periodControl}</div>
        </div>
      )}
      {displayVariant !== "medium-stats" && (
        <div
          className="bw-chart"
          ref={plotRef}
          style={{ height: chartHeight }}
          role="slider"
          tabIndex={0}
          aria-label="Inspect bodyweight entries with Left and Right arrows"
          aria-roledescription="interactive chart"
          aria-valuemin={1}
          aria-valuemax={chartSeries.length}
          aria-valuenow={(inspectedIndex ?? chartSeries.length - 1) + 1}
          aria-valuetext={`${shortDate((inspected ?? latest).date, true)}, ${(inspected ?? latest).kg.toFixed(1)} kg`}
          onPointerMove={(event) => inspectAt(event.clientX)}
          onPointerDown={(event) => inspectAt(event.clientX)}
          onPointerLeave={(event) => {
            if (event.currentTarget !== document.activeElement)
              setActiveIndex(null);
          }}
          onFocus={() => setActiveIndex(chartSeries.length - 1)}
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
            setActiveIndex((current) => {
              if (event.key === "Home") return 0;
              if (event.key === "End") return chartSeries.length - 1;
              return Math.max(
                0,
                Math.min(
                  chartSeries.length - 1,
                  (current ?? chartSeries.length - 1) +
                    (event.key === "ArrowRight" ? 1 : -1),
                ),
              );
            });
          }}
        >
          <svg
            viewBox={`0 0 ${plotSize.width} ${plotSize.height}`}
            width="100%"
            height="100%"
            role="img"
            aria-label={`${period} daily bodyweight measurements from ${shortDate(chartSeries[0].date, true)} through ${shortDate(latest.date, true)}`}
          >
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
            <path d={area} fill={`url(#${gradientId})`} />
            {[0.2, 0.5, 0.8].map((fraction) => {
              const y = verticalPadding + fraction * innerHeight;
              return (
                <line
                  key={fraction}
                  x1={horizontalPadding}
                  x2={plotSize.width - horizontalPadding}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="1 6"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            <text
              x={horizontalPadding - 6}
              y={verticalPadding + 3}
              fill="var(--muted)"
              fontFamily="inherit"
              fontSize="10"
              textAnchor="end"
            >
              {max.toFixed(1)} kg
            </text>
            <text
              x={horizontalPadding - 6}
              y={axisY - 2}
              fill="var(--muted)"
              fontFamily="inherit"
              fontSize="10"
              textAnchor="end"
            >
              {min.toFixed(1)} kg
            </text>
            <line
              x1={horizontalPadding}
              x2={plotSize.width - 16}
              y1={axisY}
              y2={axisY}
              stroke="var(--input)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {tickIndices.map((index, tick) => (
              <g key={chartSeries[index].date}>
                <line
                  x1={points[index].x}
                  x2={points[index].x}
                  y1={axisY}
                  y2={axisY + 4}
                  stroke="var(--input)"
                />
                <text
                  x={points[index].x}
                  y={axisY + 18}
                  fill="var(--muted)"
                  fontFamily="inherit"
                  fontSize="10"
                  textAnchor={
                    tick === 0
                      ? "start"
                      : tick === tickIndices.length - 1
                        ? "end"
                        : "middle"
                  }
                >
                  {shortDate(chartSeries[index].date, true)}
                </text>
              </g>
            ))}
            {inspectedPoint && (
              <line
                className="bw-inspection-line"
                x1={inspectedPoint.x}
                x2={inspectedPoint.x}
                y1={verticalPadding}
                y2={axisY}
                stroke="var(--chrome)"
                strokeOpacity="0.6"
                strokeDasharray="3 4"
              />
            )}
            <path
              d={line}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {inspected && inspectedPoint && (
            <div
              className="bw-entry-tooltip"
              role="status"
              style={{
                left: Math.max(
                  4,
                  Math.min(inspectedPoint.x - 80, plotSize.width - 164),
                ),
              }}
            >
              <span>
                {new Intl.DateTimeFormat("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                }).format(new Date(`${inspected.date}T00:00:00Z`))}
              </span>
              <strong>
                {inspected.kg.toFixed(1)} <small>kg</small>
              </strong>
            </div>
          )}
        </div>
      )}
      {displayVariant !== "medium-graph" && (
        <dl className="bw-metrics">
          {metrics.map((metric) => (
            <div
              className="bw-metric"
              data-metric={metric.label}
              key={metric.label}
            >
              <dt>{metric.label}</dt>
              <dd>
                <span className="eg-measurement-value">
                  {metric.value.replace(" kg", "")}
                  <span className="eg-measurement-unit"> kg</span>
                </span>
                {"detail" in metric && (
                  <span className="bw-metric-detail">{metric.detail}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="bw-fixture-note">
        {displayVariant === "medium-graph"
          ? "Illustrative daily measurements"
          : "Illustrative history · change from 7 / 30 days earlier"}
      </p>
    </section>
  );
}

function formatSigned(value: number) {
  if (value === 0) return "0.0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;
}

function makeMonotonePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  const slopes = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return (next.y - point.y) / (next.x - point.x);
  });
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes.at(-1) ?? 0;
    const before = slopes[index - 1];
    const after = slopes[index];
    if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) {
      return 0;
    }
    return (2 * before * after) / (before + after);
  });

  return points.reduce((path, point, index) => {
    if (index === 0) return `M${point.x},${point.y}`;
    const previous = points[index - 1];
    const distance = point.x - previous.x;
    const outgoing = tangents[index - 1] * distance;
    const incoming = tangents[index] * distance;
    return `${path} C${previous.x + distance / 3},${previous.y + outgoing / 3} ${point.x - distance / 3},${point.y - incoming / 3} ${point.x},${point.y}`;
  }, "");
}

export function NutritionTargets({
  client = fallbackClient,
  compact = false,
  variant: controlledVariant,
  onVariantChange,
}: {
  client?: Client;
  compact?: boolean;
  variant?: VariantId;
  onVariantChange?: (variant: VariantId) => void;
}) {
  const [localVariant, setLocalVariant] = useState<VariantId>(
    dashboard.nutrition.dayType.toLowerCase() as VariantId,
  );
  const variant = controlledVariant ?? localVariant;
  const [logged, setLogged] = useState({
    kcal: dashboard.nutrition.progress.kcal,
    proteinG: dashboard.nutrition.progress.proteinG,
    carbsG: dashboard.nutrition.progress.carbsG,
    fatG: dashboard.nutrition.progress.fatG,
  });
  const mealVariant =
    mealVariants.find((item) => item.id === variant) ?? mealVariants[0];
  const goal = mealVariant.total;
  const rows = [
    { key: "proteinG" as const, label: "Protein", unit: "g" },
    { key: "carbsG" as const, label: "Carbohydrate", unit: "g" },
    { key: "fatG" as const, label: "Fat", unit: "g" },
  ];
  const changeVariant = (next: VariantId) => {
    if (controlledVariant === undefined) setLocalVariant(next);
    onVariantChange?.(next);
  };
  const addSnack = () =>
    setLogged((current) => ({
      kcal: current.kcal + 126,
      proteinG: current.proteinG + 12,
      carbsG: current.carbsG + 14,
      fatG: current.fatG + 3,
    }));
  const resetLog = () =>
    setLogged({
      kcal: dashboard.nutrition.progress.kcal,
      proteinG: dashboard.nutrition.progress.proteinG,
      carbsG: dashboard.nutrition.progress.carbsG,
      fatG: dashboard.nutrition.progress.fatG,
    });

  return (
    <section
      className={`tl-nutrition ${compact ? "tl-nutrition-compact" : ""}`}
      aria-label="Nutrition targets specimen"
    >
      <div className="tl-nutrition-head">
        <div className="tl-weight-title">
          <span className="tl-icon-well">
            <Utensils size={16} />
          </span>
          <div>
            <h2>Nutrition</h2>
            <p>Consumed against daily target</p>
          </div>
        </div>
        <div className="tl-chart-select">
          <Select
            label="Nutrition day type"
            size="sm"
            value={variant}
            onValueChange={(value) =>
              changeVariant(value === "td" ? "td" : "ntd")
            }
            options={[
              { value: "td", label: "TD · Training day" },
              { value: "ntd", label: "NTD · Rest day" },
            ]}
          />
        </div>
      </div>
      <div className="tl-calories">
        <strong>{logged.kcal.toLocaleString()}</strong>
        <span>/ {goal.kcal.toLocaleString()} kcal</span>
      </div>
      <div
        className="tl-target-bar"
        role="progressbar"
        aria-label="Calories consumed"
        aria-valuenow={Math.min(logged.kcal, goal.kcal)}
        aria-valuemin={0}
        aria-valuemax={goal.kcal}
      >
        <span
          style={{
            width: `${Math.min(100, (logged.kcal / goal.kcal) * 100)}%`,
          }}
        />
      </div>
      <div className="tl-macros">
        {rows.map((row) => (
          <div className="tl-macro" key={row.key}>
            <span>{row.label}</span>
            <div
              className="tl-macro-track"
              role="progressbar"
              aria-label={`${row.label} consumed`}
              aria-valuenow={Math.min(logged[row.key], goal[row.key])}
              aria-valuemin={0}
              aria-valuemax={goal[row.key]}
            >
              <span
                style={{
                  width: `${Math.min(100, (logged[row.key] / goal[row.key]) * 100)}%`,
                }}
              />
            </div>
            <strong>
              {logged[row.key]} / {goal[row.key]} {row.unit}
            </strong>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="tl-nutrition-footer">
          <span>{client.name} · fictional log for today</span>
          <div>
            <button type="button" onClick={addSnack}>
              <Plus size={13} /> Add sample snack
            </button>
            <button type="button" onClick={resetLog}>
              Reset log
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
