"use client";

import type { ReactNode } from "react";
import {
  dateLabel,
  getRoadmapWeeks,
  type NumericRecord,
  type SourceRecords,
} from "./model";
import "./additional-widgets.css";

type AdditionalDetailProps = {
  detail: string;
  records: SourceRecords;
  clientPreview: boolean;
  onRecordsChange: (records: SourceRecords) => void;
};
type Point = {
  date: string;
  value: number | null;
  unit: string;
  coverage?: number;
};
type HabitState = "done" | "skipped" | "open" | "unscheduled";

function day(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function addDays(date: string, count: number) {
  const parsed = day(date);
  if (!parsed) return date;
  parsed.setDate(parsed.getDate() + count);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function dayDiff(from: string, to: string) {
  const a = day(from);
  const b = day(to);
  return a && b ? Math.round((b.valueOf() - a.valueOf()) / 86_400_000) : 0;
}

function mondayOf(date: string) {
  const parsed = day(date);
  if (!parsed) return date;
  const offset = (parsed.getDay() + 6) % 7;
  parsed.setDate(parsed.getDate() - offset);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function average(values: (number | null)[]) {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null;
}

function weeklyPoints(
  rows: NumericRecord[],
  asOf: string,
  count = 12,
  unit?: string,
): Point[] {
  const weekMap = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.date > asOf || row.value == null || !Number.isFinite(row.value))
      continue;
    const week = mondayOf(row.date);
    const datedValues = weekMap.get(week) ?? new Map<string, number>();
    const normalized =
      unit === "lb" && row.unit === "kg"
        ? row.value * 2.2046226218
        : unit === "kg" && row.unit === "lb"
          ? row.value / 2.2046226218
          : row.value;
    datedValues.set(row.date, normalized);
    weekMap.set(week, datedValues);
  }
  const currentMonday = mondayOf(asOf);
  return Array.from({ length: count }, (_, index) => {
    const week = addDays(currentMonday, -(count - index) * 7);
    const observedDates = new Set(
      rows
        .filter(
          (row) =>
            row.date >= week &&
            row.date <= addDays(week, 6) &&
            row.date <= asOf &&
            row.value != null,
        )
        .map((row) => row.date),
    );
    const values = [...(weekMap.get(week)?.values() ?? [])];
    const nativeUnit =
      rows.find((row) => row.date >= week && row.date <= addDays(week, 6))
        ?.unit ??
      rows[0]?.unit ??
      "";
    return {
      date: week,
      value: values.length ? average(values) : null,
      unit: unit ?? nativeUnit,
      coverage: observedDates.size,
    };
  });
}

function startForPeriod(period: string, asOf: string) {
  const lengths: Record<string, number> = {
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
  return addDays(asOf, -(Math.max(1, lengths[period] ?? 30) - 1));
}

function number(value: number | null | undefined, precision = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: precision,
  }).format(value);
}

function rangeLabel(start: string, end: string) {
  return `${dateLabel(start, { month: "short", day: "numeric" })}–${dateLabel(end, { month: "short", day: "numeric" })}`;
}

type Nutrient = "protein" | "carbs" | "fat" | "calories";
function targetAt(
  records: SourceRecords,
  nutrient: Nutrient,
  option: string,
  date: string,
) {
  const options =
    option === "nutrition:NTD"
      ? "NTD"
      : option === "nutrition:TD"
        ? "TD"
        : records.activeNutritionOption;
  if (nutrient === "calories") {
    return records.calorieTargets?.find(
      (target) =>
        target.option === options &&
        target.effectiveFrom <= date &&
        (!target.effectiveTo || target.effectiveTo >= date),
    );
  }
  return records.macroTargets.find(
    (target) =>
      target.macro === nutrient &&
      target.option === options &&
      target.effectiveFrom <= date &&
      (!target.effectiveTo || target.effectiveTo >= date),
  );
}

function nutrientActual(
  records: SourceRecords,
  nutrient: Nutrient,
  option: string,
  date: string,
) {
  const actualOption =
    option === "nutrition:NTD"
      ? "NTD"
      : option === "nutrition:TD"
        ? "TD"
        : records.activeNutritionOption;
  if (nutrient === "calories")
    return records.calorieIntake?.find(
      (row) => row.date === date && row.option === actualOption,
    )?.value;
  const entry = records.macroIntake.find(
    (row) => row.date === date && row.option === actualOption,
  );
  return entry?.[nutrient];
}

function targetText(
  target:
    | { kind: string; low: number; high?: number; unit: string }
    | undefined,
) {
  if (!target) return "No target";
  if (target.kind === "range" && target.high != null)
    return `${number(target.low)}–${number(target.high)} ${target.unit}`;
  if (target.kind === "minimum")
    return `At least ${number(target.low)} ${target.unit}`;
  return `${number(target.low)} ${target.unit}`;
}

function habitState(
  habit: SourceRecords["habits"][number],
  date: string,
): HabitState {
  if (!habit.scheduledDates.includes(date)) return "unscheduled";
  return (
    habit.completions.find((entry) => entry.date === date)?.status ?? "open"
  );
}

function DetailTable({
  rows,
}: {
  rows: { date: string; label: string; value: string }[];
}) {
  return (
    <div className="da-detail-table">
      <div className="da-detail-header">
        <span>Date</span>
        <span>Source record</span>
        <strong>Value</strong>
      </div>
      {rows.length ? (
        rows.map((row) => (
          <div className="da-detail-row" key={`${row.date}-${row.label}`}>
            <time dateTime={row.date}>
              {dateLabel(row.date, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </time>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))
      ) : (
        <p className="da-chart-empty">No dated source records available</p>
      )}
    </div>
  );
}

export function AdditionalDetailContent({
  detail,
  records,
}: AdditionalDetailProps): ReactNode | null {
  if (!detail.startsWith("additional:")) return null;
  const [kind, ...params] = detail.slice("additional:".length).split(":");
  if (kind === "BN08") {
    const unit = params[0] || "kg";
    const period = params[2] || "8w";
    const count =
      period === "4w" ? 4 : period === "12w" ? 12 : period === "30d" ? 5 : 8;
    const rows = weeklyPoints(
      records.bodyweight,
      records.client.asOf,
      count,
      unit,
    )
      .reverse()
      .map((point, index, all) => {
        const next = all[index + 1];
        const change =
          point.value != null && next?.value != null
            ? point.value - next.value
            : null;
        const shown =
          params[1] === "percentage" && change != null && next.value
            ? `${number((change / next.value) * 100)}%`
            : change == null
              ? "No prior week"
              : `${number(change)} ${unit}`;
        return {
          date: point.date,
          label: `Weekly average · ${rangeLabel(point.date, addDays(point.date, 6))} · ${point.coverage ?? 0}/7 logged days`,
          value: `${point.value == null ? "No data" : `${number(point.value)} ${point.unit}`} · ${shown} change`,
        };
      });
    return (
      <section className="da-detail">
        <p>
          Weekly averages use unique dated bodyweight readings in each
          Monday–Sunday period. Missing weeks stay empty.
        </p>
        <DetailTable rows={rows} />
      </section>
    );
  }
  if (kind === "BN19") {
    const nutrient = (params[0] || "protein") as Nutrient;
    const rawSource = decodeURIComponent(params[1] || "nutrition%3Aactive");
    const legacyRoute = rawSource === "nutrition";
    const sourceOption = legacyRoute
      ? `nutrition:${params[2] || "active"}`
      : rawSource.startsWith("nutrition:")
        ? rawSource
        : `nutrition:${rawSource}`;
    const start = startForPeriod(
      params[legacyRoute ? 3 : 2] || "today",
      records.client.asOf,
    );
    const actualDates =
      nutrient === "calories"
        ? (records.calorieIntake ?? []).map((row) => row.date)
        : records.macroIntake.map((row) => row.date);
    const rows = [
      ...new Set(
        actualDates.filter(
          (date) => date >= start && date <= records.client.asOf,
        ),
      ),
    ]
      .sort()
      .reverse()
      .map((date) => {
        const actual = nutrientActual(records, nutrient, sourceOption, date);
        const target = targetAt(records, nutrient, sourceOption, date);
        const selectedOption =
          sourceOption === "nutrition:active"
            ? records.activeNutritionOption
            : sourceOption.slice("nutrition:".length);
        return {
          date,
          label: `${nutrient} · ${selectedOption} · ${target?.kind ?? "no target"}`,
          value: `${actual == null ? "Not logged" : `${number(actual)} ${target?.unit ?? (nutrient === "calories" ? "kcal" : "g")}`} / ${targetText(target)}`,
        };
      });
    return (
      <section className="da-detail">
        <p>
          Targets are selected by the option and effective dates. A missing
          intake is “Not logged”; no target is shown when none applies.
        </p>
        <DetailTable rows={rows} />
      </section>
    );
  }
  if (kind === "TL11") {
    const unit = params[0] || "h";
    const start = startForPeriod(params[1] || "7d", records.client.asOf);
    const rows = [...(records.sleep ?? [])]
      .filter((row) => row.date >= start && row.date <= records.client.asOf)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((row) => {
        const minutes = ["min", "minutes", "minute"].includes(
          row.unit.toLowerCase(),
        );
        const value =
          row.value == null
            ? null
            : unit === "min" && !minutes
              ? row.value * 60
              : unit !== "min" && minutes
                ? row.value / 60
                : row.value;
        return {
          date: row.date,
          label: "Sleep duration",
          value: value == null ? "Not logged" : `${number(value)} ${unit}`,
        };
      });
    return (
      <section className="da-detail">
        <p>
          Sleep history contains only recorded duration values. No sleep-quality
          threshold is inferred.
        </p>
        <DetailTable rows={rows} />
      </section>
    );
  }
  if (kind === "TL22") {
    const start = startForPeriod(params[0] || "7d", records.client.asOf);
    const fields = params[1]?.split(",").filter(Boolean) ?? [];
    const rows = records.habits
      .filter((habit) => !fields.length || fields.includes(habit.id))
      .flatMap((habit) =>
        habit.scheduledDates
          .filter((date) => date >= start && date <= records.client.asOf)
          .map((date) => ({
            date,
            label: `${habit.name} · ${habitState(habit, date)}`,
            value:
              habitState(habit, date) === "done"
                ? "Completed"
                : habitState(habit, date) === "skipped"
                  ? "Skipped"
                  : "Not logged",
          })),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    return (
      <section className="da-detail">
        <p>
          Only scheduled opportunities enter the counts. Skipped and
          not-yet-logged dates remain distinct.
        </p>
        <DetailTable rows={rows} />
      </section>
    );
  }
  if (kind === "CU01") {
    const phase = records.coachingPlan?.currentPhase;
    const focus = records.publishedWeeklyFocus;
    const fields = params[0]?.split(",") ?? ["phase", "focus"];
    return (
      <section className="da-detail">
        <dl className="da-detail-context">
          {fields.includes("phase") && (
            <>
              <div>
                <dt>Phase</dt>
                <dd>{phase?.name ?? "No phase published"}</dd>
              </div>
              <div>
                <dt>Coaching week</dt>
                <dd>{records.coachingPlan?.currentWeek ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Phase dates</dt>
                <dd>
                  {phase
                    ? `${dateLabel(phase.startDate)}–${dateLabel(phase.endDate)}`
                    : "Not set"}
                </dd>
              </div>
            </>
          )}
          {fields.includes("focus") && (
            <div>
              <dt>Published focus</dt>
              <dd>{focus?.emphasis ?? "No focus published"}</dd>
            </div>
          )}
          {fields.includes("successCue") && (
            <div>
              <dt>Success cue</dt>
              <dd>{focus?.successCue || "Not set"}</dd>
            </div>
          )}
        </dl>
      </section>
    );
  }
  if (kind === "CU02" || kind === "CU09") {
    const period = kind === "CU09" ? params[0] || "12w" : "12w";
    const start = startForPeriod(period, records.client.asOf);
    const fields =
      (kind === "CU02" ? params[0] : params[1])?.split(",").filter(Boolean) ??
      [];
    const rows = getRoadmapWeeks(records)
      .filter(
        (week) =>
          week.endDate >= start && week.startDate <= records.client.asOf,
      )
      .flatMap((week) =>
        week.metrics
          .filter((metric) => !fields.length || fields.includes(metric.key))
          .map((metric) => ({
            date: week.startDate,
            label: `Week ${week.week} · ${metric.label}${metric.coverage ? ` · ${metric.coverage.loggedDays}/${metric.coverage.totalDays} days` : ""}${metric.target ? ` · ${metric.target.kind} ${targetText(metric.target)}` : ""}`,
            value:
              metric.value == null
                ? "No data"
                : `${number(metric.value)} ${metric.unit}`,
          })),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    return (
      <section className="da-detail">
        <p>
          Each metric retains its source unit and weekly date range. Separate
          measures use separate scales.
        </p>
        <DetailTable rows={rows} />
      </section>
    );
  }
  if (kind === "CU10") {
    const phase = records.coachingPlan?.currentPhase;
    const selectedId = params[0];
    const items = (records.publishedMilestones ?? []).filter(
      (milestone) =>
        milestone.published &&
        milestone.id === selectedId &&
        (!milestone.phaseId || milestone.phaseId === phase?.id),
    );
    const rows = items.map((milestone) => ({
      date: milestone.date,
      label: `${milestone.label}${milestone.kind === "phase-end" ? " · phase end" : " · milestone"}`,
      value: `${dayDiff(records.client.asOf, milestone.date) < 0 ? "Date passed" : `${dayDiff(records.client.asOf, milestone.date)} days remaining`}`,
    }));
    return (
      <section className="da-detail">
        <p>
          Only published milestones are shown. Time progress uses the explicit
          phase start and end dates.
        </p>
        <DetailTable rows={rows} />
      </section>
    );
  }
  return null;
}
