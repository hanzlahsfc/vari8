"use client";

/**
 * Athlete profile → Timeline tab: dense, flat week rows across every column
 * group, grouped under collapsible phases and laid out like the tracker sheet.
 * Group ids, order, labels and membership come from the client's normalised
 * timeline configuration (snapshot only), falling back to
 * TIMELINE_GROUP_DEFAULTS. Nutrition shows one weekly planned average per macro
 * plus the logged water average, with a hover breakdown of the per-variant
 * daily targets on the macro cells. Data comes from the persisted tracking log,
 * plan lifecycles, temporary nutrition and timeline events.
 */

import { Popover } from "@base-ui/react/popover";
import {
  ChevronRight,
  Crosshair,
  Minus,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Shrink,
  Trash2,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  displayWeek,
  scheduledSessions,
  sessionStatus,
} from "../../client-app/training-log/model";
import type { Nutrients } from "../../ethereal/mealplan/model";
import { Checkbox, Input, SegmentedControl } from "../../vari8/components";
import { DatePicker, TextArea } from "../../vari8/inputs";
import {
  defaultDecimals,
  defaultTimelineAggregation,
} from "../client-tracker-preview/preview-model";
import {
  addDays,
  allParameters,
  type CoachClient,
  type CoachState,
  eventsBetween,
  formatDate,
  type TimelineColumnSetting,
  type TimelineGroupSetting,
  uid,
} from "../model";
import { trainingPlanAt } from "../plans/domain";
import {
  type ClientPhase,
  type ClientPhaseRange,
  canSavePhases,
  isValidPhaseStartDate,
  normalizePhases,
  phaseRanges,
} from "../plans/phase-planning";
import {
  adjustmentSummary,
  planForDisplayWeek,
  removeTrainingAdjustment,
  saveTrainingAdjustment,
} from "../plans/training/adjustments";
import {
  adjustmentForWeek,
  countWorkingSets,
  resolveTrainingWeek,
  snapRangeToPlanWeeks,
  type TrainingAdjustment,
  type TrainingPlan,
  validateAdjustment,
} from "../plans/types";
import { useCoach } from "../store";
import {
  addLocalDays,
  localToday,
  mondayOf,
  resolveActivityTarget,
} from "../targets/model";
import { assignedVariant } from "../template-setup";
import { clientTracking } from "../tracking/data";
import { Button, Dialog, IconButton } from "../ui";
import {
  COLLAPSE_EXPAND_MS,
  Collapsible,
  useFadePresence,
} from "./collapsible";
import { fillColumns } from "./fill-columns";
import {
  nutritionDayTargets,
  type WeekNutritionBreakdown,
  weekNutritionBreakdown,
} from "./nutrition-week";
import { validateTimelineEvent } from "./timeline";
import { TIMELINE_GROUP_BY_COLUMN } from "./timeline-columns";
import { normalizeTimelineSetup } from "./timeline-config";
import { normalizeTimelineGroupIdsFor } from "./timeline-groups";
import "./timeline-tab.css";

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Canvas-measured header label width (+ breathing room). */
function textWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 7;
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width + 4;
}

const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const number1 = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const signed = (value: number, decimals = 1) => {
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0)
    return `±${new Intl.NumberFormat("en", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(0)}`;
  return `${rounded > 0 ? "+" : "−"}${new Intl.NumberFormat("en", {
    maximumFractionDigits: decimals,
  }).format(Math.abs(rounded))}`;
};
const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS,
  );
const inRange = (date: string, start: string, end: string) =>
  date >= start && date <= end;
const mean = (list: (number | undefined)[]) => {
  const vals = list.filter((v): v is number => v != null);
  return vals.length
    ? vals.reduce((a, b) => a + b, 0) / vals.length
    : undefined;
};
const dayShort = (date: string) =>
  formatDate(date, { day: "numeric", month: "short" });

// ─── Per-day/week data helpers ──────────────────────────────────────

type DayEntry = ReturnType<typeof clientTracking>[number];
const metricOn = (entry: DayEntry | undefined, key: string) =>
  entry?.values[key] as number | undefined;

// ─── Week model ─────────────────────────────────────────────────────

type Week = {
  monday: string;
  sunday: string;
  /** 1-based index across the whole listed range */
  index: number;
  days: string[];
};

export function enumerateWeeks(
  client: CoachClient,
  ranges: ClientPhaseRange[],
  today: string,
): Week[] {
  const coachingStart = client.coachingSince
    ? mondayOf(client.coachingSince)
    : "";
  // First coaching week: the earlier of the first phase start and the
  // client's coaching start; fall back to 8 weeks before today.
  const first = mondayOf(
    [ranges[0]?.startDate, coachingStart]
      .filter((v): v is string => !!v)
      .sort()[0] ?? addLocalDays(today, -56),
  );
  const planEnd = ranges.at(-1)?.endDate;
  const futureBound = addLocalDays(today, 28);
  const last = mondayOf(
    planEnd && planEnd > futureBound ? planEnd : futureBound,
  );
  const weeks: Week[] = [];
  for (
    let monday = first, index = 1;
    monday <= last;
    monday = addDays(monday, 7), index += 1
  ) {
    weeks.push({
      monday,
      sunday: addDays(monday, 6),
      index,
      days: Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    });
  }
  return weeks;
}

/** Plan changes that landed inside a week, as chip labels. */
function weekChanges(client: CoachClient, week: Week): string[] {
  const out = new Set<string>();
  const inside = (iso: string | undefined) =>
    !!iso && inRange(iso.slice(0, 10), week.monday, week.sunday);
  const plans = client.plans;
  if (plans) {
    const lifecycles: [
      string,
      { active?: { activatedAt: string }; history: { activatedAt: string }[] },
    ][] = [
      ["Nutrition", plans.nutrition.mealPlan],
      ["Nutrition", plans.nutrition.iifym],
      ["Training", plans.training],
    ];
    for (const [label, life] of lifecycles)
      for (const version of [
        ...(life.history ?? []),
        ...(life.active ? [life.active] : []),
      ])
        if (inside(version.activatedAt)) out.add(`+ ${label}`);
    for (const version of plans.activityTargets ?? [])
      if (inside(version.effectiveFrom)) out.add("+ Activity");
    for (const temp of plans.nutrition.temporary ?? [])
      if (temp.startDate <= week.sunday && temp.endDate >= week.monday)
        out.add(
          `${temp.label} ${String(daysBetween(temp.startDate, temp.endDate) + 1)} d`,
        );
  }
  const plan = plans ? trainingPlanAt(plans.training, week.monday) : undefined;
  for (const adjustment of plan?.adjustments ?? [])
    if (
      adjustment.startDate <= week.sunday &&
      adjustment.endDate >= week.monday
    )
      out.add(adjustment.kind === "intro" ? "Intro" : "Deload");
  for (const event of client.timelineEvents ?? [])
    if (event.startDate <= week.sunday && event.endDate >= week.monday)
      out.add(EVENT_KIND_LABEL[event.kind] ?? "Event");
  return [...out];
}
const EVENT_KIND_LABEL: Record<string, string> = {
  deload: "Deload",
  intro: "Intro",
  "diet-break": "Diet break",
  refeed: "Refeed",
};

// ─── Week-of-plan resolution ───────────────────────────────────────

/**
 * The plan version in effect for a week: majority of its days, ties broken
 * toward the later version.
 */
function majorityWeek<T>(
  week: Week,
  resolve: (day: string) => T | undefined,
  key: (v: T) => string,
  later: (a: T, b: T) => number,
): T | undefined {
  const counts = new Map<string, { n: number; v: T }>();
  for (const day of week.days) {
    const v = resolve(day);
    if (v === undefined) continue;
    const k = key(v);
    const entry = counts.get(k) ?? { n: 0, v };
    entry.n += 1;
    counts.set(k, entry);
  }
  let best: { n: number; v: T } | undefined;
  for (const entry of counts.values())
    if (
      !best ||
      entry.n > best.n ||
      (entry.n === best.n && later(entry.v, best.v) > 0)
    )
      best = entry;
  return best?.v;
}

// ─── Column registry ────────────────────────────────────────────────

type Cell = {
  value: string;
  sub?: string;
  tone?: "on" | "off";
  /** Muted value shown in future weeks (targets); default "—". */
  future?: string;
  /** Render normally in future weeks (note, changes, check-in). */
  plain?: boolean;
};

type ColDef = {
  id: string;
  /** Column header label. */
  label: string;
  /** Grid track width. */
  width: string;
  cell: (ctx: Ctx) => Cell;
};

/** Short labels for the vertical collapsed-group strip (~140px cap). */
const COLLAPSED_LABELS: Record<string, string> = {
  "Activity plan": "Activity",
};
const collapsedLabel = (group: RenderGroup) =>
  COLLAPSED_LABELS[group.id] ?? group.label;

type Ctx = {
  state: CoachState;
  client: CoachClient;
  week: Week;
  entries: Map<string, DayEntry>;
  today: string;
  compare: boolean;
  _nutrition?: WeekNutritionBreakdown;
  _days?: ReturnType<typeof nutritionDayTargets>;
  _compare?: Map<
    keyof Nutrients,
    { actual: number; target: number } | undefined
  >;
};

const entryOn = (ctx: Ctx, date: string) => ctx.entries.get(date);
const avgOf = (ctx: Ctx, key: string) =>
  mean(ctx.week.days.map((d) => metricOn(entryOn(ctx, d), key)));

/** Overview accuracy rules: ±5 % positive, ±10 % neutral, else warning. */
const accuracyTone = (
  actual: number | undefined,
  target: number | undefined,
) => {
  if (actual === undefined || target === undefined || target <= 0)
    return undefined;
  const dev = Math.abs(actual / target - 1);
  return dev <= 0.05 ? "on" : dev > 0.1 ? "off" : undefined;
};
const pct = (actual: number, target: number) =>
  ` · ${integer.format(Math.round((actual / target) * 100))}%`;

const nutritionOf = (ctx: Ctx) =>
  (ctx._nutrition ??= weekNutritionBreakdown(ctx.client, ctx.week));
const dayTargetsOf = (ctx: Ctx) =>
  (ctx._days ??= nutritionDayTargets(ctx.client, ctx.week));

/**
 * Day-matched logged comparison: the logged mean over logged days is measured
 * against the planned target averaged over those same days, not the whole week.
 */
function nutritionCompare(ctx: Ctx, key: keyof Nutrients) {
  if (!ctx.compare) return undefined;
  ctx._compare ??= new Map();
  if (ctx._compare.has(key)) return ctx._compare.get(key);
  const actuals: number[] = [];
  const targets: number[] = [];
  for (const day of dayTargetsOf(ctx)) {
    const actual = metricOn(ctx.entries.get(day.date), key);
    const target = day.nutrients[key];
    if (actual == null || target <= 0) continue;
    actuals.push(actual);
    targets.push(target);
  }
  const actual = mean(actuals);
  const target = mean(targets);
  const result =
    actual !== undefined && target !== undefined
      ? { actual, target }
      : undefined;
  ctx._compare.set(key, result);
  return result;
}

/** Plan-column cell: planned weekly average plus optional logged compare sub. */
const planCell =
  (key: keyof Nutrients) =>
  (ctx: Ctx): Cell => {
    const target = nutritionOf(ctx).average?.[key];
    const value =
      target === undefined ? "—" : integer.format(Math.round(target));
    let sub = "";
    let tone: Cell["tone"];
    const compare = nutritionCompare(ctx, key);
    if (compare) {
      sub = `${integer.format(Math.round(compare.actual))}${pct(compare.actual, compare.target)}`;
      tone = accuracyTone(compare.actual, compare.target);
    }
    return { value, sub, tone, future: value };
  };

/** Steps target for the week: compact label + numeric value for compare. */
const weekActivityTarget = (ctx: Ctx, metric: "steps" | "cardio") =>
  majorityWeek(
    ctx.week,
    (day) =>
      resolveActivityTarget({
        versions: ctx.client.plans?.activityTargets ?? [],
        metric,
        date: day,
      }),
    (v) => v.id,
    (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom),
  )?.target;

function stepsTarget(ctx: Ctx): { label: string; value: number | undefined } {
  const t = weekActivityTarget(ctx, "steps");
  if (!t || typeof t !== "object") return { label: "—", value: undefined };
  if ("min" in t && "max" in t) {
    const label =
      t.min % 1000 === 0 && t.max % 1000 === 0
        ? `${String(t.min / 1000)}–${String(t.max / 1000)}k`
        : `${integer.format(t.min)}–${integer.format(t.max)}`;
    return { label, value: (t.min + t.max) / 2 };
  }
  if ("value" in t && typeof t.value === "number") {
    const prefix =
      t.kind === "minimum" ? "≥ " : t.kind === "maximum" ? "≤ " : "";
    return { label: `${prefix}${integer.format(t.value)}`, value: t.value };
  }
  return { label: "—", value: undefined };
}

function cardioTarget(ctx: Ctx): { label: string; value: number | undefined } {
  const t = weekActivityTarget(ctx, "cardio");
  if (!t || typeof t !== "object" || !("sessionsPerWeek" in t))
    return { label: "—", value: undefined };
  return {
    label: `${String(t.sessionsPerWeek)} × ${String(t.minutesPerSession)}`,
    value: t.sessionsPerWeek * t.minutesPerSession,
  };
}

const weekCardioMinutes = (ctx: Ctx) =>
  ctx.week.days
    .map((d) => metricOn(entryOn(ctx, d), "cardio-duration"))
    .filter((v): v is number => v != null)
    .reduce((a, b) => a + b, 0);

const weekWeightAvg = (ctx: Ctx) => avgOf(ctx, "weight");
const prevWeekWeightAvg = (ctx: Ctx) =>
  mean(
    Array.from({ length: 7 }, (_, i) =>
      metricOn(ctx.entries.get(addDays(ctx.week.monday, i - 7)), "weight"),
    ),
  );

function weekSessions(ctx: Ctx) {
  const plan = ctx.client.plans
    ? trainingPlanAt(ctx.client.plans.training, ctx.week.monday)
    : undefined;
  if (!plan)
    return {
      planned: 0,
      done: 0,
      name: undefined as string | undefined,
      noTraining: false,
    };
  const week = displayWeek(plan, ctx.week.monday);
  const weekPlan = planForDisplayWeek(plan, week);
  const adjustment = adjustmentForWeek(weekPlan, week);
  const items =
    adjustment?.mode === "none" ? [] : scheduledSessions(weekPlan, week);
  const logs = (ctx.state.trainingLogs ?? []).filter(
    (log) => log.clientId === ctx.client.id,
  );
  return {
    planned: items.length,
    done: items.filter(
      (item) => sessionStatus(item, logs, ctx.today) === "done",
    ).length,
    name: plan.name,
    noTraining: adjustment?.mode === "none",
  };
}

const COLS: ColDef[] = [
  // ── Bodyweight (logged by nature) ──
  {
    id: "weight-avg",
    label: "Ø kg",
    width: "52px",
    cell: (ctx) => {
      const avg = weekWeightAvg(ctx);
      return {
        value: avg === undefined ? "—" : number1.format(avg),
        future: "—",
      };
    },
  },
  {
    id: "weight-change",
    label: "Δ kg",
    width: "52px",
    cell: (ctx) => {
      const avg = weekWeightAvg(ctx);
      const prev = prevWeekWeightAvg(ctx);
      const diff =
        avg !== undefined && prev !== undefined ? avg - prev : undefined;
      return {
        value: diff === undefined ? "—" : signed(diff, 1),
        future: "—",
      };
    },
  },
  {
    id: "weight-rate",
    label: "Δ %",
    width: "52px",
    cell: (ctx) => {
      const avg = weekWeightAvg(ctx);
      const prev = prevWeekWeightAvg(ctx);
      const rate =
        avg !== undefined && prev !== undefined && prev > 0
          ? ((avg - prev) / prev) * 100
          : undefined;
      return {
        value: rate === undefined ? "—" : `${signed(rate, 1)}%`,
        future: "—",
      };
    },
  },
  // ── Nutrition (weekly planned average; water is a logged average) ──
  {
    id: "kcal-plan",
    label: "kcal",
    width: "60px",
    cell: planCell("calories"),
  },
  {
    id: "protein",
    label: "P",
    width: "50px",
    cell: planCell("protein"),
  },
  {
    id: "carbs",
    label: "C",
    width: "50px",
    cell: planCell("carbs"),
  },
  {
    id: "fat",
    label: "F",
    width: "50px",
    cell: planCell("fat"),
  },
  {
    id: "water",
    label: "Water L",
    width: "52px",
    cell: (ctx) => {
      const v = avgOf(ctx, "water");
      return {
        value: v === undefined ? "—" : `${number1.format(v)} L`,
        future: "—",
      };
    },
  },
  // ── Activity plan ──
  {
    id: "steps-plan",
    label: "Steps",
    width: "50px",
    cell: (ctx) => {
      const target = stepsTarget(ctx);
      const actual = ctx.compare ? avgOf(ctx, "steps") : undefined;
      let sub = "";
      let tone: Cell["tone"];
      if (
        actual !== undefined &&
        target.value !== undefined &&
        target.value > 0
      ) {
        sub = `${integer.format(Math.round(actual))}${pct(actual, target.value)}`;
        tone = accuracyTone(actual, target.value);
      }
      return { value: target.label, sub, tone, future: target.label };
    },
  },
  {
    id: "cardio-plan",
    label: "Cardio",
    width: "50px",
    cell: (ctx) => {
      const target = cardioTarget(ctx);
      const mins = weekCardioMinutes(ctx);
      const actual = ctx.compare && mins > 0 ? mins : undefined;
      let sub = "";
      let tone: Cell["tone"];
      if (
        actual !== undefined &&
        target.value !== undefined &&
        target.value > 0
      ) {
        sub = `${integer.format(Math.round(actual))} min${pct(actual, target.value)}`;
        tone = accuracyTone(actual, target.value);
      }
      return { value: target.label, sub, tone, future: target.label };
    },
  },
  // ── Recovery (logged recovery metrics only) ──
  {
    id: "sleep",
    label: "Sleep",
    width: "52px",
    cell: (ctx) => {
      const v = avgOf(ctx, "sleep");
      return {
        value: v === undefined ? "—" : `${number1.format(v)} h`,
        future: "—",
      };
    },
  },
  // ── Training ──
  {
    id: "sessions",
    label: "Sess.",
    width: "48px",
    cell: (ctx) => {
      const s = weekSessions(ctx);
      if (s.noTraining) return { value: "0", sub: "No training", future: "0" };
      return {
        value: s.planned ? `${String(s.done)}/${String(s.planned)}` : "—",
        future: s.planned ? `–/${String(s.planned)}` : "—",
      };
    },
  },
  {
    id: "plan-name",
    label: "Plan",
    width: "88px",
    cell: (ctx) => {
      const s = weekSessions(ctx);
      return { value: s.name ?? "—", future: s.name ?? "—" };
    },
  },
  // ── Check-in (the week's submission status) ──
  {
    id: "checkin",
    label: "Check-in",
    width: "60px",
    cell: (ctx) => {
      const event = eventsBetween(
        ctx.state,
        ctx.week.monday,
        ctx.week.sunday,
      ).find((e) => e.clientId === ctx.client.id);
      return {
        value: event?.status ?? "—",
        sub: event ? formatDate(event.date, { weekday: "short" }) : undefined,
        plain: true,
      };
    },
  },
  // ── Notes ──
  {
    id: "changes",
    label: "Changes",
    width: "166px",
    cell: () => ({ value: "", plain: true }),
  },
  {
    id: "note",
    label: "Note",
    width: "minmax(160px, 1fr)",
    cell: (ctx) => ({
      value: ctx.client.weekNotes?.[ctx.week.monday] ?? "—",
      plain: true,
    }),
  },
];
const COL_MAP = new Map(COLS.map((col) => [col.id, col]));

type RenderCol = { key: string; col: ColDef };

/** Split a header label into its name and unit so the unit can stay quiet. */
const HEADER_UNIT = /^(.*\S)\s+(kg|%|L|min|h)$/;
function headerParts(label: string) {
  const match = HEADER_UNIT.exec(label);
  return match ? { name: match[1], unit: match[2] } : { name: label, unit: "" };
}

type RenderGroup = {
  id: string;
  label: string;
  cols: RenderCol[];
};

/** Expand the configured groups into render columns, in configured order. */
function renderGroups(
  groups: readonly TimelineGroupSetting[],
  client: CoachClient,
): RenderGroup[] {
  const out: RenderGroup[] = [];
  const fields = assignedVariant(client)?.fields ?? [];
  for (const group of groups) {
    const cols: RenderCol[] = [];
    for (const entry of group.columns) {
      const id = typeof entry === "string" ? entry : entry.id;
      const meta: TimelineColumnSetting | undefined =
        typeof entry === "string" ? undefined : entry;
      const builtIn = COL_MAP.get(id);
      if (builtIn) {
        cols.push({
          key: id,
          col: meta?.label ? { ...builtIn, label: meta.label } : builtIn,
        });
        continue;
      }
      if (!id.startsWith("param:")) continue;
      const parameterId = id.slice("param:".length);
      const parameter = allParameters().find((item) => item.id === parameterId);
      if (!parameter) continue;
      const field = fields.find((item) => item.id === parameterId);
      const agg =
        meta?.agg ?? defaultTimelineAggregation(parameter, field?.summary);
      const decimals =
        meta?.decimals ?? field?.decimals ?? defaultDecimals(parameter);
      const unit = field?.unit ?? parameter.units[0] ?? "";
      const label =
        meta?.label ?? (unit ? `${parameter.name} (${unit})` : parameter.name);
      cols.push({
        key: id,
        col: {
          id,
          label,
          width: "52px",
          cell: (ctx) => {
            const values = ctx.week.days
              .map((date) => ({
                date,
                value: metricOn(entryOn(ctx, date), parameterId),
              }))
              .filter(
                (item): item is { date: string; value: number } =>
                  item.value != null && Number.isFinite(item.value),
              );
            if (!values.length) return { value: "—", future: "—" };
            const numbers = values.map((item) => item.value);
            switch (agg) {
              case "sum":
                return {
                  value: new Intl.NumberFormat("en", {
                    maximumFractionDigits: decimals,
                  }).format(numbers.reduce((a, b) => a + b, 0)),
                  future: "—",
                };
              case "min":
                return {
                  value: new Intl.NumberFormat("en", {
                    maximumFractionDigits: decimals,
                  }).format(Math.min(...numbers)),
                  future: "—",
                };
              case "max":
                return {
                  value: new Intl.NumberFormat("en", {
                    maximumFractionDigits: decimals,
                  }).format(Math.max(...numbers)),
                  future: "—",
                };
              case "last":
                return {
                  value: new Intl.NumberFormat("en", {
                    maximumFractionDigits: decimals,
                  }).format(values.at(-1)?.value ?? 0),
                  future: "—",
                };
              case "count":
                return { value: String(values.length), future: "—" };
              default:
                return {
                  value: new Intl.NumberFormat("en", {
                    maximumFractionDigits: decimals,
                  }).format(
                    numbers.reduce((a, b) => a + b, 0) / numbers.length,
                  ),
                  future: "—",
                };
            }
          },
        },
      });
    }
    if (cols.length) out.push({ id: group.id, label: group.label, cols });
  }
  return out;
}

/** Numeric track width for measurement; flex tracks use their min. */
function pxOf(width: string): number {
  const min = width.match(/minmax\((\d+(?:\.\d+)?)px/)?.[1];
  return Number(min ?? width.match(/^(\d+(?:\.\d+)?)px/)?.[1] ?? "0");
}

const isTextCol = (col: ColDef) =>
  col.id === "changes" || col.id === "note" || col.id === "plan-name";

// ─── Phase group summary (collapsed headers) ────────────────────────

type Group = {
  key: string;
  name: string;
  range?: ClientPhaseRange;
  current: boolean;
  weeks: Week[];
  shown: Week[];
};

function groupSummary(entries: Map<string, DayEntry>, gweeks: Week[]) {
  // Summaries are always chronological, independent of the display order.
  const chronological = [...gweeks].sort((a, b) =>
    a.monday < b.monday ? -1 : a.monday > b.monday ? 1 : 0,
  );
  const wAvg = (w: Week) =>
    mean(w.days.map((d) => metricOn(entries.get(d), "weight")));
  const firstW = wAvg(chronological[0]);
  let lastW: number | undefined;
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    const v = wAvg(chronological[i]);
    if (v !== undefined) {
      lastW = v;
      break;
    }
  }
  const rates: number[] = [];
  for (let i = 1; i < chronological.length; i += 1) {
    const a = wAvg(chronological[i]);
    const b = wAvg(chronological[i - 1]);
    if (a !== undefined && b !== undefined && b > 0)
      rates.push(((a - b) / b) * 100);
  }
  const kcal = mean(
    chronological
      .flatMap((w) => w.days)
      .map((d) => metricOn(entries.get(d), "calories")),
  );
  const rateMean = mean(rates);
  return {
    weight:
      firstW !== undefined
        ? `${number1.format(firstW)} → ${lastW !== undefined ? number1.format(lastW) : "?"} kg`
        : undefined,
    rate: rateMean !== undefined ? `${signed(rateMean, 1)}%/wk` : undefined,
    kcal:
      kcal !== undefined
        ? `ø ${integer.format(Math.round(kcal))} kcal`
        : undefined,
  };
}

// ─── Components ─────────────────────────────────────────────────────

const GROUP_GAP = 6;

export function AthleteTimelineTab({
  client,
  viewer = "coach",
  onOpen,
}: {
  client: CoachClient;
  viewer?: "coach" | "client";
  onOpen?: (tab: string, plan?: string) => void;
}) {
  const { state, setState, navigate, toast } = useCoach();
  const today = localToday();
  const ranges = useMemo(() => phaseRanges(client.phases), [client.phases]);
  const weeks = useMemo(
    () => enumerateWeeks(client, ranges, today),
    [client, ranges, today],
  );
  /** Assigned clients read their snapshot; unassigned ones use defaults. */
  const timeline = useMemo(
    () => assignedVariant(client)?.timeline ?? normalizeTimelineSetup(),
    [client],
  );
  const showPhases = timeline.showPhases !== false;
  const order = state.timelineOrder ?? timeline.order ?? "oldest";
  const compare = state.timelineCompare ?? timeline.compare ?? false;
  const configuredCollapsed = useMemo(
    () =>
      new Set(
        timeline.groups.filter((group) => group.collapsed).map((g) => g.id),
      ),
    [timeline],
  );
  const configuredPinned = useMemo(
    () => timeline.groups.filter((group) => group.pinned).map((g) => g.id),
    [timeline],
  );
  const [expanded, setExpanded] = useState<string>(
    () =>
      weeks.find((week) => inRange(today, week.monday, week.sunday))?.monday ??
      "",
  );
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [phaseToggled, setPhaseToggled] = useState<Set<string>>(new Set());
  const [editPhases, setEditPhases] = useState(false);
  const [previewPhases, setPreviewPhases] = useState<
    ClientPhase[] | undefined
  >();
  const shownRanges = previewPhases ? phaseRanges(previewPhases) : ranges;
  /** Configured defaults seed the layout until the coach toggles it. */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () =>
      new Set(
        timeline.groups.filter((group) => group.collapsed).map((g) => g.id),
      ),
  );
  const [pinned, setPinned] = useState<string[]>(() =>
    timeline.groups.filter((group) => group.pinned).map((g) => g.id),
  );
  // Re-seed when the configured layout actually changes (a snapshot edit or a
  // live template edit), without discarding the coach's manual layout on
  // unrelated renders.
  const configuredLayoutKey = useMemo(
    () =>
      JSON.stringify(
        timeline.groups.map((group) => [
          group.id,
          group.collapsed === true,
          group.pinned === true,
        ]),
      ),
    [timeline],
  );
  const seededLayoutKey = useRef(configuredLayoutKey);
  useEffect(() => {
    if (seededLayoutKey.current === configuredLayoutKey) return;
    seededLayoutKey.current = configuredLayoutKey;
    setCollapsedGroups(new Set(configuredCollapsed));
    setPinned([...configuredPinned]);
  }, [configuredLayoutKey, configuredCollapsed, configuredPinned]);
  const [popoverEpoch, setPopoverEpoch] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const [height, setHeight] = useState<number>();
  /** Width of the scroll frame; the table fills it without ever measuring the canvas. */
  const [frameWidth, setFrameWidth] = useState(0);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const widthAnimTimerRef = useRef<number | undefined>(undefined);

  const entries = useMemo(
    () => new Map(clientTracking(client).map((entry) => [entry.date, entry])),
    [client],
  );

  const isFutureWeek = (week: Week) => week.monday > today;
  const shown = (week: Week) => !isFutureWeek(week) || showUpcoming;
  const currentWeek = weeks.find((week) =>
    inRange(today, week.monday, week.sunday),
  );
  const sizingWeeks = useMemo(
    () => weeks.filter((week) => week.monday <= today || showUpcoming),
    [weeks, today, showUpcoming],
  );
  const upcomingCount = weeks.filter(isFutureWeek).length;
  const displayWeeks = useMemo(
    () => (order === "newest" ? [...weeks].reverse() : weeks),
    [weeks, order],
  );

  // Group all weeks by phase, in display order; collapsed phases keep a
  // summary header.
  const groups: Group[] = [];
  for (const week of displayWeeks) {
    const phase = shownRanges.find(
      (r) => week.monday >= r.startDate && week.monday <= r.endDate,
    );
    const name = phase?.name ?? "No phase";
    const key = `${name}|${week.index}`;
    const last = groups.at(-1);
    if (!last || last.name !== name)
      groups.push({
        key,
        name,
        range: phase,
        current: !!phase && phase.startDate <= today && today <= phase.endDate,
        weeks: [],
        shown: [],
      });
    const group = groups[groups.length - 1];
    group.weeks.push(week);
    if (shown(week)) group.shown.push(week);
  }

  const defaultCollapsed = (group: Group) =>
    !group.current &&
    !(
      currentWeek &&
      group.weeks.some((week) => week.monday === currentWeek.monday)
    );
  const isPhaseCollapsed = (group: Group) =>
    phaseToggled.has(group.key)
      ? !defaultCollapsed(group)
      : defaultCollapsed(group);
  const dismissPopovers = () => setPopoverEpoch((value) => value + 1);
  const togglePhase = (key: string) => {
    dismissPopovers();
    setPhaseToggled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const expandAllPhases = () => {
    dismissPopovers();
    setPhaseToggled(
      new Set(groups.filter((g) => defaultCollapsed(g)).map((g) => g.key)),
    );
  };
  const collapseAllPhases = () => {
    dismissPopovers();
    setPhaseToggled(
      new Set(groups.filter((g) => !defaultCollapsed(g)).map((g) => g.key)),
    );
  };

  // Configured groups/columns in display order; nutrition still shows one
  // weekly average per macro instead of one column set per variant slot.
  const columnGroups = useMemo(
    () => renderGroups(timeline.groups, client),
    [timeline, client],
  );

  const makeCtx = (week: Week): Ctx => ({
    state,
    client,
    week,
    entries,
    today,
    compare,
  });

  // Content-sized column widths: header label, the widest value/sub-line
  // across the visible weeks, then enough room for the group label.
  const layout = useMemo(() => {
    const family =
      typeof document === "undefined"
        ? "sans-serif"
        : getComputedStyle(document.body).fontFamily;
    const sizingCtx = sizingWeeks.map((week) => ({
      week,
      ctx: {
        state,
        client,
        week,
        entries,
        today,
        compare,
      } as Ctx,
    }));
    const groupWidths = new Map<string, number>();
    const grids = new Map<string, string>();
    const colWidthsByGroup = new Map<string, number[]>();
    for (const group of columnGroups) {
      const colWidths = group.cols.map((rc) => {
        const min = pxOf(rc.col.width);
        if (rc.col.id === "changes") return Math.max(min, 150);
        if (rc.col.id === "note") return Math.max(min, 180);
        let need = min;
        need = Math.max(
          need,
          textWidth(rc.col.label, `500 12px ${family}`) + 10,
        );
        for (const { ctx } of sizingCtx) {
          const cell = rc.col.cell(ctx);
          // Long free-text columns stay at their minimum so a note can't widen
          // the table; short plain cells (check-in status) still size to fit.
          if (cell.plain && isTextCol(rc.col)) continue;
          const text = cell.sub ? `${cell.value} ${cell.sub}` : cell.value;
          need = Math.max(need, textWidth(text, `500 12px ${family}`) + 16);
          if (cell.future)
            need = Math.max(
              need,
              textWidth(cell.future, `600 12px ${family}`) + 16,
            );
        }
        return Math.ceil(need);
      });
      const total = colWidths.reduce((a, b) => a + b, 0);
      const groupNeed = Math.ceil(
        textWidth(group.label.toUpperCase(), `600 11px ${family}`) + 60,
      );
      if (groupNeed > total)
        colWidths[colWidths.length - 1] += groupNeed - total;
      colWidthsByGroup.set(group.id, colWidths);
      groupWidths.set(
        group.id,
        colWidths.reduce((a, b) => a + b, 0),
      );
      grids.set(
        group.id,
        colWidths.map((width) => `${String(width)}px`).join(" "),
      );
    }
    return { groupWidths, grids, colWidthsByGroup };
  }, [columnGroups, sizingWeeks, state, client, entries, today, compare]);

  // Layout state may have been restored with a retired or renamed group id
  // ("Nutrition plan" → "Nutrition", the old "Logged" group); map aliases and
  // ignore ids that this client's configuration does not render.
  const columnGroupIds = useMemo(
    () => columnGroups.map((group) => group.id),
    [columnGroups],
  );
  const activeCollapsedGroups = useMemo(
    () =>
      new Set(normalizeTimelineGroupIdsFor(collapsedGroups, columnGroupIds)),
    [collapsedGroups, columnGroupIds],
  );
  const activePinned = useMemo(
    () => normalizeTimelineGroupIdsFor(pinned, columnGroupIds),
    [pinned, columnGroupIds],
  );

  // Dense week column: number bubble + stacked dates, like the old flat row.
  const weekWidth = Math.ceil(
    Math.max(136, 34 + textWidth("28 Sept – 4 Oct", "500 12px") + 32),
  );

  /**
   * Share spare frame width across the data columns of expanded groups.
   * Fixed parts: the week column and its gap, the phase card's border and
   * padding (11px each side), one gap per group, and collapsed strips.
   * Collapsed groups keep their slim 30px strip and take no share.
   */
  const sized = useMemo(() => {
    const groupWidths = new Map<string, number>();
    const expandedWidths = new Map<string, number>();
    const grids = new Map<string, string>();
    const columnsByGroup = new Map<string, number[]>();
    const stretchable: { group: string; column: number; natural: number }[] =
      [];
    // Week rows end with the disclosure chevron: one gap (6px), its 2px
    // inline margin and the 15px icon. The phase card contributes 11px of
    // padding and 1px border on each side.
    let fixed = weekWidth + GROUP_GAP * columnGroups.length + 22 + 23;
    for (const group of columnGroups) {
      if (activeCollapsedGroups.has(group.id)) {
        groupWidths.set(group.id, 30);
        expandedWidths.set(group.id, layout.groupWidths.get(group.id) ?? 60);
        fixed += 30;
        continue;
      }
      const columns = [
        ...(layout.colWidthsByGroup.get(group.id) ?? group.cols.map(() => 60)),
      ];
      columnsByGroup.set(group.id, columns);
      for (let index = 0; index < columns.length; index += 1)
        stretchable.push({
          group: group.id,
          column: index,
          natural: columns[index],
        });
    }
    const filled = fillColumns(
      stretchable.map((entry) => entry.natural),
      frameWidth - fixed,
    );
    for (let index = 0; index < stretchable.length; index += 1) {
      const entry = stretchable[index];
      const columns = columnsByGroup.get(entry.group) ?? [];
      columns[entry.column] = filled[index];
    }
    for (const group of columnGroups) {
      const columns = columnsByGroup.get(group.id);
      if (columns) {
        const total = columns.reduce((sum, width) => sum + width, 0);
        groupWidths.set(group.id, total);
        expandedWidths.set(group.id, total);
        grids.set(
          group.id,
          columns.map((width) => `${String(width)}px`).join(" "),
        );
      } else {
        grids.set(group.id, layout.grids.get(group.id) ?? "");
      }
    }
    return { groupWidths, expandedWidths, grids };
  }, [activeCollapsedGroups, columnGroups, frameWidth, layout, weekWidth]);

  const groupFullWidth = (group: RenderGroup) =>
    sized.expandedWidths.get(group.id) ?? 60;
  const groupWidth = (group: RenderGroup) =>
    sized.groupWidths.get(group.id) ??
    (activeCollapsedGroups.has(group.id) ? 30 : groupFullWidth(group));
  const gridOf = (group: RenderGroup) => sized.grids.get(group.id) ?? "";

  const ordered = [
    ...activePinned
      .map((id) => columnGroups.find((g) => g.id === id))
      .filter((g): g is RenderGroup => !!g),
    ...columnGroups.filter((g) => !activePinned.includes(g.id)),
  ];
  const pinOffset = (id: string) => {
    let left = weekWidth + GROUP_GAP;
    for (const p of activePinned) {
      if (p === id) return left;
      const g = columnGroups.find((x) => x.id === p);
      if (g) left += groupWidth(g) + GROUP_GAP;
    }
    return left;
  };
  const lastPinned = activePinned
    .filter((p) => columnGroups.some((g) => g.id === p))
    .at(-1);

  const sameSet = (a: Set<string>, b: Set<string>) =>
    a.size === b.size && [...a].every((id) => b.has(id));
  const sameList = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id, index) => id === b[index]);
  const layoutChanged =
    !sameSet(activeCollapsedGroups, configuredCollapsed) ||
    !sameList(activePinned, configuredPinned);
  const markWidthAnimating = () => {
    // Opt the group widths into the existing transition for this toggle.
    const section = sectionRef.current;
    if (!section) return;
    section.dataset.widthAnim = "1";
    window.clearTimeout(widthAnimTimerRef.current);
    widthAnimTimerRef.current = window.setTimeout(() => {
      if (sectionRef.current === section) delete section.dataset.widthAnim;
    }, COLLAPSE_EXPAND_MS + 80);
  };
  const toggleGroup = (id: string) => {
    dismissPopovers();
    markWidthAnimating();
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const togglePin = (id: string) =>
    setPinned((list) =>
      list.includes(id) ? list.filter((p) => p !== id) : [...list, id],
    );
  const resetLayout = () => {
    dismissPopovers();
    if (!sameSet(activeCollapsedGroups, configuredCollapsed))
      markWidthAnimating();
    setPinned([...configuredPinned]);
    setCollapsedGroups(new Set(configuredCollapsed));
  };

  const setCompare = (on: boolean) => {
    dismissPopovers();
    setState((s) => ({ ...s, timelineCompare: on }));
  };

  const setOrder = (value: string) => {
    setState((s) => ({
      ...s,
      timelineOrder: value === "newest" ? "newest" : "oldest",
    }));
  };

  const centreToday = (flash: boolean) => {
    const el = scrollerRef.current;
    const canvas = canvasRef.current;
    const row = canvas?.querySelector<HTMLElement>(
      ".apt-week[data-current] .apt-row",
    );
    if (!el || !row) return;
    const offset =
      row.getBoundingClientRect().top - el.getBoundingClientRect().top;
    el.scrollTop += offset - el.clientHeight / 2 + row.offsetHeight / 2;
    // Keep the current phase label readable: when centring leaves the phase
    // header just under the taller two-line column header, reveal it instead
    // of leaving only a sliver of its progress bar visible.
    const header = el.querySelector<HTMLElement>(".apt-head");
    const phaseHead = canvas?.querySelector<HTMLElement>(
      ".apt-phase[data-current] .apt-phase-head",
    );
    if (header && phaseHead) {
      const overlap =
        header.getBoundingClientRect().bottom -
        phaseHead.getBoundingClientRect().top;
      if (overlap > 0 && overlap < phaseHead.offsetHeight + 40)
        el.scrollTop = Math.max(0, el.scrollTop - overlap);
    }
    if (flash)
      for (const r of canvas?.querySelectorAll<HTMLElement>(
        ".apt-week[data-current] .apt-row",
      ) ?? []) {
        r.classList.remove("apt-flash");
        void r.offsetWidth;
        r.classList.add("apt-flash");
      }
  };

  // Measure the scroll frame, never the canvas: the canvas is sized from this
  // width, so observing it would feed its own output back into the measurement.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reattach when the bounded scroller mounts.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const section = sectionRef.current;
    const update = () => {
      setFrameWidth(el.clientWidth);
      // The expanded-week detail pins itself to the scrollport's visible
      // width so it never stretches with an overflowing table.
      if (section) section.style.setProperty("--apt-vw", `${el.clientWidth}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [narrow]);

  useEffect(
    () => () => {
      window.clearTimeout(widthAnimTimerRef.current);
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroller remounts when the narrow layout toggles.
  useLayoutEffect(() => {
    const update = () => {
      setNarrow(window.innerWidth < 900);
      const el = scrollerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(420, window.innerHeight - top - 24));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [narrow]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: centre once after the first measured render.
  useEffect(() => {
    if (height) centreToday(false);
  }, [height]);

  // Scroll state (fade flags) + drag to pan in both axes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroller only mounts in the wide layout.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      el.dataset.scrolled = el.scrollLeft > 2 ? "1" : "0";
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      el.dataset.fade =
        el.scrollWidth > el.clientWidth + 1 && !atEnd ? "1" : "0";
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    let panning = false;
    let moved = false;
    let suppress = false;
    let pointerId = -1;
    let sx = 0;
    let sy = 0;
    let sl = 0;
    let st = 0;
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (
        (event.target as HTMLElement | null)?.closest(
          "input, textarea, select, a",
        )
      )
        return;
      pointerId = event.pointerId;
      sx = event.clientX;
      sy = event.clientY;
      sl = el.scrollLeft;
      st = el.scrollTop;
      panning = true;
      moved = false;
    };
    const onMove = (event: PointerEvent) => {
      if (!panning || event.pointerId !== pointerId) return;
      const dx = event.clientX - sx;
      const dy = event.clientY - sy;
      if (!moved) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        moved = true;
        el.dataset.panning = "1";
      }
      el.scrollLeft = sl - dx;
      el.scrollTop = st - dy;
    };
    const onUp = (event: PointerEvent) => {
      if (!panning || event.pointerId !== pointerId) return;
      panning = false;
      if (moved) {
        suppress = true;
        setTimeout(() => {
          suppress = false;
        }, 0);
      }
      delete el.dataset.panning;
    };
    const onClick = (event: MouseEvent) => {
      if (!suppress) return;
      event.preventDefault();
      event.stopPropagation();
      suppress = false;
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [narrow]);

  const jumpToToday = () => {
    const target = currentWeek
      ? groups.find((group) =>
          group.weeks.some((week) => week.monday === currentWeek.monday),
        )
      : undefined;
    if (target)
      setPhaseToggled((current) => {
        const next = new Set(current);
        if (defaultCollapsed(target)) next.add(target.key);
        else next.delete(target.key);
        return next;
      });
    requestAnimationFrame(() => requestAnimationFrame(() => centreToday(true)));
  };

  const renderWeek = (week: Week) => (
    <WeekRow
      key={week.monday}
      viewer={viewer}
      ctx={makeCtx(week)}
      ordered={ordered}
      groupWidth={groupWidth}
      gridOf={gridOf}
      collapsedGroups={activeCollapsedGroups}
      pinned={activePinned}
      pinOffset={pinOffset}
      lastPinned={lastPinned}
      weekWidth={weekWidth}
      expanded={expanded === week.monday}
      portalContainer={sectionRef}
      dismissSignal={popoverEpoch}
      onToggle={() => setExpanded(expanded === week.monday ? "" : week.monday)}
      onReview={(submissionId) =>
        onOpen
          ? onOpen("Check-ins")
          : navigate({
              section: "check-ins",
              review: submissionId,
              client: client.id,
            })
      }
      onOpenCheckins={() =>
        navigate({ section: "check-ins", client: client.id })
      }
    />
  );

  if (!columnGroups.length || !weeks.length)
    return (
      <section className="apt apt-empty">
        <p>No weeks to show for this athlete yet.</p>
      </section>
    );

  const rangeLabel = sizingWeeks.length
    ? `${dayShort(sizingWeeks[0].days[0])} – ${dayShort(
        sizingWeeks.at(-1)?.sunday ?? today,
      )} · ${String(sizingWeeks.length)} weeks`
    : "";

  const upcomingButton = upcomingCount > 0 && !showUpcoming && (
    <div className="apt-earlier">
      <button
        type="button"
        className="apt-more"
        onClick={() => setShowUpcoming(true)}
      >
        {order === "newest"
          ? `Show upcoming weeks (${String(upcomingCount)})`
          : `Show ${String(upcomingCount)} later weeks`}
      </button>
    </div>
  );

  // Phone shows two key values: bodyweight ø + the first nutrition column.
  const allCols = columnGroups.flatMap((group) => group.cols);
  const mobileKeep = new Set<string>(
    [
      allCols.find((rc) => rc.col.id === "weight-avg"),
      allCols.find(
        (rc) => TIMELINE_GROUP_BY_COLUMN.get(rc.col.id) === "Nutrition",
      ),
    ]
      .filter((rc): rc is RenderCol => !!rc)
      .map((rc) => rc.key),
  );
  if (!mobileKeep.size)
    allCols.slice(0, 2).forEach((rc) => {
      mobileKeep.add(rc.key);
    });

  const toolbar = (
    <div className="apt-toolbar">
      <span className="apt-range">{rangeLabel}</span>
      <span className="apt-sp" />
      {layoutChanged && (
        <Button variant="ghost" size="sm" onClick={resetLayout}>
          Reset layout
        </Button>
      )}
      {showPhases && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={expandAllPhases}
            title="Expand all phases"
          >
            Expand all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={collapseAllPhases}
            title="Collapse all phases"
          >
            Collapse all
          </Button>
        </>
      )}
      <SegmentedControl
        className="apt-order"
        label="Timeline order"
        value={order}
        onValueChange={setOrder}
        options={[
          { value: "newest", label: "Newest" },
          { value: "oldest", label: "Oldest" },
        ]}
      />
      <span className="apt-compare">
        <Checkbox
          label="Compare with logged"
          checked={compare}
          onCheckedChange={setCompare}
        />
      </span>
      <Button variant="secondary" size="sm" onClick={jumpToToday}>
        <Crosshair size={14} /> Jump to today
      </Button>
      {viewer === "coach" && showPhases && (
        <Button variant="ghost" size="sm" onClick={() => setEditPhases(true)}>
          <Pencil size={14} aria-hidden="true" /> Edit phases
        </Button>
      )}
    </div>
  );

  if (narrow)
    return (
      <section className="apt">
        {toolbar}
        {order === "newest" && upcomingButton}
        <div className="apt-narrow">
          <p className="apt-narrow-note">
            The timeline is designed for desktop.
          </p>
          {displayWeeks.filter(shown).map((week) => (
            <div className="apt-narrow-day" key={week.monday}>
              <b>
                Week {week.index} ·{" "}
                {formatDate(week.monday, { day: "numeric", month: "short" })} –{" "}
                {formatDate(week.sunday, { day: "numeric", month: "short" })}
              </b>
              <span className="apt-narrow-vals">
                {allCols
                  .filter((rc) => mobileKeep.has(rc.key))
                  .map((rc) => {
                    const cell = rc.col.cell(makeCtx(week));
                    const value =
                      isFutureWeek(week) && !cell.plain
                        ? (cell.future ?? "—")
                        : cell.value;
                    return `${rc.col.label}: ${value || "—"}`;
                  })
                  .join(" · ")}
              </span>
            </div>
          ))}
        </div>
        {order === "oldest" && upcomingButton}
        {editPhases && showPhases && (
          <PhasePlanDialog
            client={client}
            onPreview={setPreviewPhases}
            onClose={() => {
              setEditPhases(false);
              setPreviewPhases(undefined);
            }}
            toast={toast}
          />
        )}
      </section>
    );

  return (
    <section className="apt" ref={sectionRef}>
      {toolbar}
      {order === "newest" && upcomingButton}
      <div
        className="apt-scroll"
        ref={scrollerRef}
        style={{ height } as CSSProperties}
      >
        <div className="apt-canvas" ref={canvasRef}>
          <div className="apt-head">
            <div
              className="apt-corner"
              style={{ width: weekWidth + GROUP_GAP }}
            />
            {ordered.map((group) => {
              const isPinned = activePinned.includes(group.id);
              const isCollapsed = activeCollapsedGroups.has(group.id);
              const width = groupWidth(group);
              const head = (
                <TimelineGroupHead
                  key={group.id}
                  group={group}
                  isPinned={isPinned}
                  isCollapsed={isCollapsed}
                  width={width}
                  fullWidth={groupFullWidth(group)}
                  grid={gridOf(group)}
                  onTogglePin={() => togglePin(group.id)}
                  onToggleGroup={() => toggleGroup(group.id)}
                />
              );
              return isPinned ? (
                <div
                  key={group.id}
                  className="apt-mask apt-pinmask"
                  data-last={group.id === lastPinned ? "" : undefined}
                  style={{
                    left: pinOffset(group.id),
                    width: width + GROUP_GAP,
                  }}
                >
                  {head}
                </div>
              ) : (
                head
              );
            })}
          </div>
          {showPhases ? (
            groups.map((group) => {
              const collapsed = isPhaseCollapsed(group);
              const durWeeks = group.range?.durationWeeks ?? 0;
              const weekIn =
                group.current && group.range
                  ? Math.floor(daysBetween(group.range.startDate, today) / 7) +
                    1
                  : undefined;
              const progress =
                weekIn !== undefined && durWeeks > 0
                  ? Math.min(
                      100,
                      Math.max(0, Math.round((weekIn / durWeeks) * 100)),
                    )
                  : undefined;
              const summary = collapsed
                ? groupSummary(entries, group.weeks)
                : undefined;
              const firstDay = group.weeks.reduce(
                (a, w) => (w.monday < a ? w.monday : a),
                group.weeks[0].monday,
              );
              const lastDay = group.weeks.reduce(
                (a, w) => (w.sunday > a ? w.sunday : a),
                group.weeks[0].sunday,
              );
              return (
                <section
                  className="apt-phase"
                  data-current={group.current || undefined}
                  data-collapsed={collapsed || undefined}
                  key={group.key}
                >
                  <button
                    type="button"
                    className="apt-phase-head"
                    onClick={() => togglePhase(group.key)}
                    aria-expanded={!collapsed}
                  >
                    <ChevronRight
                      className="apt-phase-chev"
                      size={14}
                      aria-hidden="true"
                    />
                    <span className="apt-phase-strip" aria-hidden="true" />
                    <b className="apt-phase-name">{group.name}</b>
                    <span className="apt-sub">
                      {String(group.weeks.length)} weeks
                    </span>
                    {progress !== undefined && weekIn !== undefined && (
                      <span className="apt-phase-progress">
                        Week {String(weekIn)} of {String(durWeeks)} ·{" "}
                        {String(progress)}%
                      </span>
                    )}
                    {collapsed && summary && (
                      <span className="apt-phase-summary">
                        {group.range
                          ? `${dayShort(group.range.startDate)} – ${dayShort(group.range.endDate)}`
                          : `${dayShort(firstDay)} – ${dayShort(lastDay)}`}
                        {summary.weight && ` · ${summary.weight}`}
                        {summary.rate && ` · ${summary.rate}`}
                        {summary.kcal && ` · ${summary.kcal}`}
                      </span>
                    )}
                    {progress !== undefined && (
                      <span className="apt-phase-bar" aria-hidden="true">
                        <i style={{ inlineSize: `${String(progress)}%` }} />
                      </span>
                    )}
                  </button>
                  <Collapsible open={!collapsed} className="apt-phase-rows">
                    {() => group.shown.map(renderWeek)}
                  </Collapsible>
                </section>
              );
            })
          ) : (
            <section className="apt-phase" data-flat="">
              <div className="apt-phase-rows">
                {displayWeeks.filter(shown).map(renderWeek)}
              </div>
            </section>
          )}
        </div>
      </div>
      {order === "oldest" && upcomingButton}
      {editPhases && showPhases && (
        <PhasePlanDialog
          client={client}
          onPreview={setPreviewPhases}
          onClose={() => {
            setEditPhases(false);
            setPreviewPhases(undefined);
          }}
          toast={toast}
        />
      )}
    </section>
  );
}

// ─── Animated column-group pieces ──────────────────────────────────

function TimelineGroupHead({
  group,
  isPinned,
  isCollapsed,
  width,
  fullWidth,
  grid,
  onTogglePin,
  onToggleGroup,
}: {
  group: RenderGroup;
  isPinned: boolean;
  isCollapsed: boolean;
  width: number;
  fullWidth: number;
  grid: string;
  onTogglePin: () => void;
  onToggleGroup: () => void;
}) {
  const full = useFadePresence(!isCollapsed);
  const strip = useFadePresence(isCollapsed);

  return (
    <div
      className="apt-hg"
      data-group={group.id}
      data-collapsed={isCollapsed ? "" : undefined}
      style={{ width }}
    >
      {full.mounted && (
        <div
          className="apt-hg-full"
          style={{ width: fullWidth }}
          data-visible={full.visible ? "" : undefined}
          aria-hidden={!full.visible || undefined}
          inert={!full.visible || undefined}
        >
          <div className="apt-hg-title v8-overline">
            <span>{group.label}</span>
            <span className="apt-hg-actions">
              <button
                type="button"
                onClick={onTogglePin}
                aria-label={`${isPinned ? "Unpin" : "Pin"} ${group.label}`}
                title={isPinned ? "Unpin" : "Pin next to the week column"}
                data-on={isPinned ? "" : undefined}
              >
                {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
              </button>
              <button
                type="button"
                onClick={onToggleGroup}
                aria-label={`Collapse ${group.label}`}
                title="Collapse"
                aria-expanded={true}
              >
                <Shrink size={12} />
              </button>
            </span>
          </div>
          <div className="apt-hg-labels" style={{ gridTemplateColumns: grid }}>
            {group.cols.map((rc) => {
              const header = headerParts(rc.col.label);
              return (
                <span
                  key={rc.key}
                  className={`apt-clab${isTextCol(rc.col) ? " apt-txt" : ""}`}
                >
                  {header.name}
                  {header.unit && (
                    <span className="apt-subtle"> {header.unit}</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {strip.mounted && (
        <button
          type="button"
          className="apt-hg-strip"
          data-visible={strip.visible ? "" : undefined}
          onClick={onToggleGroup}
          title={`Expand ${group.label}`}
          aria-label={`Expand ${group.label}`}
          aria-expanded={false}
          aria-hidden={!strip.visible || undefined}
          tabIndex={strip.visible ? undefined : -1}
        >
          {collapsedLabel(group)}
        </button>
      )}
    </div>
  );
}

const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 80;
const NUTRIENT_COLUMNS = ["kcal", "P", "C", "F"] as const;

/**
 * Hover intent for the nutrition popover: open after a short delay, close with
 * a grace period, and never open while the timeline is drag-panning.
 */
function useNutritionHover({
  enabled,
  anchorRef,
  dismissSignal,
}: {
  enabled: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  dismissSignal: number;
}) {
  const [open, setOpen] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const clearOpenTimer = useCallback(() => {
    window.clearTimeout(openTimer.current);
    openTimer.current = undefined;
  }, []);
  const clearCloseTimer = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  }, []);
  const close = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setOpen(false);
  }, [clearOpenTimer, clearCloseTimer]);

  // Phase/column collapse and other layout changes dismiss every popover.
  useEffect(() => {
    if (dismissSignal > 0) close();
  }, [dismissSignal, close]);

  useEffect(() => {
    if (!open) return;
    const scroller = anchorRef.current?.closest<HTMLElement>(".apt-scroll");
    const onScroll = () => close();
    const onPointerDown = () => close();
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    scroller?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      scroller?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, anchorRef]);

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const onPointerEnter = () => {
    if (!enabled || !canHover) return;
    const scroller = anchorRef.current?.closest<HTMLElement>(".apt-scroll");
    if (scroller?.dataset.panning) return;
    clearCloseTimer();
    if (open) return;
    clearOpenTimer();
    openTimer.current = window.setTimeout(() => {
      openTimer.current = undefined;
      const current = anchorRef.current?.closest<HTMLElement>(".apt-scroll");
      if (current?.dataset.panning) return;
      setOpen(true);
    }, HOVER_OPEN_MS);
  };
  const onPointerLeave = () => {
    clearOpenTimer();
    if (!open) return;
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = undefined;
      setOpen(false);
    }, HOVER_CLOSE_MS);
  };
  const onPointerDown = () => close();

  return { open, close, onPointerEnter, onPointerLeave, onPointerDown };
}

function NutritionHoverPopover({
  ctx,
  open,
  anchorRef,
  container,
}: {
  ctx: Ctx;
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  container: RefObject<HTMLElement | null>;
}) {
  const breakdown = nutritionOf(ctx);
  const { week } = ctx;
  if (!breakdown.average) return null;
  const dateLabel = `${dayShort(week.monday)} – ${dayShort(week.sunday)}`;
  const values = (nutrients: Nutrients) => [
    integer.format(Math.round(nutrients.calories)),
    integer.format(Math.round(nutrients.protein)),
    integer.format(Math.round(nutrients.carbs)),
    integer.format(Math.round(nutrients.fat)),
  ];
  return (
    <Popover.Root open={open} modal={false}>
      <Popover.Portal container={container}>
        <Popover.Positioner
          anchor={anchorRef}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          collisionAvoidance={{
            side: "flip",
            align: "shift",
            fallbackAxisSide: "start",
          }}
          className="apt-nut-positioner"
        >
          <Popover.Popup
            className="apt-nut-pop"
            role="tooltip"
            aria-label="Nutrition targets"
            initialFocus={false}
            finalFocus={false}
          >
            <p className="apt-nut-title">Nutrition targets · {dateLabel}</p>
            <table className="apt-nut-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="v8-sr-only">Variant</span>
                  </th>
                  <th scope="col">kcal</th>
                  <th scope="col">P</th>
                  <th scope="col">C</th>
                  <th scope="col">F</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.variants.map((variant) => (
                  <tr key={variant.label}>
                    <th scope="row">
                      <b>{variant.label}</b>
                      <em>
                        {String(variant.days)}{" "}
                        {variant.days === 1 ? "day" : "days"}
                      </em>
                    </th>
                    {NUTRIENT_COLUMNS.map((column, index) => (
                      <td key={column}>{values(variant.nutrients)[index]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {breakdown.plannedDays < 7 && (
              <p className="apt-nut-note">
                {String(breakdown.plannedDays)} of 7 days planned
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function TimelineGroupCells({
  group,
  isPinned,
  isCollapsed,
  width,
  grid,
  pinOffset,
  lastPinned,
  ctx,
  portalContainer,
  dismissSignal,
  children,
}: {
  group: RenderGroup;
  isPinned: boolean;
  isCollapsed: boolean;
  width: number;
  grid: string;
  pinOffset: (id: string) => number;
  lastPinned?: string;
  ctx: Ctx;
  portalContainer: RefObject<HTMLElement | null>;
  dismissSignal: number;
  children: ReactNode | (() => ReactNode);
}) {
  const cells = useFadePresence(!isCollapsed);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const isNutrition = group.id === "Nutrition";
  const hasPlan = isNutrition && !!nutritionOf(ctx).average;
  const hover = useNutritionHover({
    enabled: isNutrition && !isCollapsed && hasPlan,
    anchorRef,
    dismissSignal,
  });
  // The breakdown belongs to the planned macro cells; the logged water column
  // shares the group but is not a plan target. Pointer-over (not enter) is used
  // so sliding from the water cell onto a macro cell still opens the popover.
  const overWaterCell = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest('[data-kind="water"]');

  return (
    <span
      ref={anchorRef}
      className={`apt-grp${isPinned ? " apt-grp-pinned" : ""}`}
      data-group={group.id}
      data-nutrition={isNutrition ? "" : undefined}
      data-collapsed={isCollapsed ? "" : undefined}
      data-last={isPinned && group.id === lastPinned ? "" : undefined}
      aria-hidden={!cells.visible || undefined}
      style={{
        left: isPinned ? pinOffset(group.id) : undefined,
        width,
      }}
      onPointerOver={(event) => {
        if (overWaterCell(event.target)) {
          hover.close();
          return;
        }
        hover.onPointerEnter();
      }}
      onPointerLeave={hover.onPointerLeave}
      onPointerDown={hover.onPointerDown}
    >
      {cells.mounted ? (
        <span
          className="apt-grp-cells"
          data-visible={cells.visible ? "" : undefined}
          style={{ gridTemplateColumns: grid }}
        >
          {typeof children === "function" ? children() : children}
        </span>
      ) : null}
      {isNutrition && (
        <NutritionHoverPopover
          ctx={ctx}
          open={hover.open}
          anchorRef={anchorRef}
          container={portalContainer}
        />
      )}
    </span>
  );
}

// ─── Week row ───────────────────────────────────────────────────────
function WeekRow({
  viewer,
  ctx,
  ordered,
  groupWidth,
  gridOf,
  collapsedGroups,
  pinned,
  pinOffset,
  lastPinned,
  weekWidth,
  expanded,
  portalContainer,
  dismissSignal,
  onToggle,
  onReview,
  onOpenCheckins,
}: {
  viewer: "coach" | "client";
  ctx: Ctx;
  ordered: RenderGroup[];
  groupWidth: (group: RenderGroup) => number;
  gridOf: (group: RenderGroup) => string;
  collapsedGroups: Set<string>;
  pinned: string[];
  pinOffset: (id: string) => number;
  lastPinned?: string;
  weekWidth: number;
  expanded: boolean;
  portalContainer: RefObject<HTMLElement | null>;
  dismissSignal: number;
  onToggle: () => void;
  onReview: (submissionId: string) => void;
  onOpenCheckins: () => void;
}) {
  const { navigate, route, setState } = useCoach();
  const { client, week, state, entries, today } = ctx;
  const isCurrent = inRange(today, week.monday, week.sunday);
  const isFuture = week.monday > today;
  const note = client.weekNotes?.[week.monday] ?? "";
  const checkin = eventsBetween(state, week.monday, week.sunday).find(
    (e) => e.clientId === client.id,
  );
  const checkinWeight = checkin
    ? metricOn(entries.get(checkin.date), "weight")
    : undefined;
  const canTemp = week.monday >= mondayOf(today);

  const renderCell = (rc: RenderCol) => {
    const { col } = rc;
    if (col.id === "changes") {
      const changes = weekChanges(client, week);
      return (
        <span
          key={rc.key}
          className="apt-cell apt-cell-chips"
          data-kind="changes"
          title="Changes"
        >
          <span className="apt-chips">
            {changes.slice(0, 3).map((change) => (
              <i key={change}>{change}</i>
            ))}
          </span>
        </span>
      );
    }
    const cell = col.cell(ctx);
    const value = isFuture && !cell.plain ? (cell.future ?? "—") : cell.value;
    const sub = isFuture && !cell.plain ? "" : (cell.sub ?? "");
    return (
      <span
        key={rc.key}
        className={`apt-cell${isTextCol(col) ? " apt-txt" : ""}`}
        data-tone={cell.tone}
        data-kind={col.id}
        data-future={isFuture && !cell.plain ? "" : undefined}
        title={col.label}
      >
        <b>{value}</b>
        <span className="apt-cell-sub">{sub}</span>
      </span>
    );
  };

  const dateLabel = `${formatDate(week.monday, {
    day: "numeric",
    month: "short",
  })} – ${formatDate(week.sunday, { day: "numeric", month: "short" })}`;

  return (
    <div
      className="apt-week"
      data-current={isCurrent || undefined}
      data-open={expanded || undefined}
    >
      <button
        type="button"
        className="apt-row"
        data-week={week.monday}
        data-future={isFuture ? "" : undefined}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span
          className="apt-weekcell apt-sticky-1"
          style={{ width: weekWidth }}
        >
          <span className="apt-weeknum" aria-hidden="true">
            <span className="v8-sr-only">Week </span>
            {week.index}
          </span>
          <span className="apt-dates">
            <span>{dateLabel}</span>
            <span className="apt-tagline">
              {isCurrent && <em className="apt-this">This week</em>}
            </span>
          </span>
        </span>
        {ordered.map((group) => {
          const isPinned = pinned.includes(group.id);
          const isCollapsed = collapsedGroups.has(group.id);
          const width = groupWidth(group);
          // A collapsed group keeps its slim header column; the body contributes
          // an empty track so the following groups stay aligned with the header.
          return (
            <TimelineGroupCells
              key={group.id}
              group={group}
              isPinned={isPinned}
              isCollapsed={isCollapsed}
              width={width}
              grid={gridOf(group)}
              pinOffset={pinOffset}
              lastPinned={lastPinned}
              ctx={ctx}
              portalContainer={portalContainer}
              dismissSignal={dismissSignal}
            >
              {() => group.cols.map(renderCell)}
            </TimelineGroupCells>
          );
        })}
        <ChevronRight className="apt-chev" size={15} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="apt-detail">
          <section className="apt-block">
            {checkin ? (
              <button
                type="button"
                className="apt-checkin-row"
                onClick={() =>
                  checkin.submission
                    ? onReview(checkin.submission.id)
                    : onOpenCheckins()
                }
              >
                Check-in{" "}
                {formatDate(checkin.date, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {checkin.status}
                {checkinWeight !== undefined &&
                  ` · ${number1.format(checkinWeight)} kg`}{" "}
                ·{" "}
                <span className="apt-link">
                  {viewer === "client" ? "View check-in" : "Open review"}
                </span>
              </button>
            ) : (
              <p className="apt-sub">No check-in this week</p>
            )}
            {viewer === "client" && note.trim() && (
              <p className="apt-sub" style={{ whiteSpace: "pre-wrap" }}>
                Coach note · {note}
              </p>
            )}
            {viewer === "coach" && (
              <TextArea
                label="Coach note"
                labelClassName="v8-overline"
                value={note}
                placeholder="Coach note for this week"
                onChange={(event) => {
                  const value = event.target.value;
                  setState((s) => ({
                    ...s,
                    clients: s.clients.map((c) =>
                      c.id === client.id
                        ? {
                            ...c,
                            weekNotes: {
                              ...(c.weekNotes ?? {}),
                              [week.monday]: value,
                            },
                          }
                        : c,
                    ),
                  }));
                }}
              />
            )}
            {viewer === "coach" && (
              <div className="apt-detail-actions">
                <AdjustmentControl ctx={ctx} />
                <Button
                  variant="secondary"
                  disabled={!canTemp}
                  title={
                    canTemp
                      ? `Temporary plan from ${dayShort(week.monday)}`
                      : "Past weeks can't get a temporary plan"
                  }
                  onClick={() =>
                    navigate({
                      ...route,
                      plan: `temporary:new@${week.monday}`,
                    })
                  }
                >
                  Temporary plan
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function AdjustmentControl({ ctx }: { ctx: Ctx }) {
  const { setState, toast } = useCoach();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingAdjustment | undefined>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const plan = ctx.client.plans?.training.active?.content;
  const planWeek =
    plan && ctx.week.sunday >= plan.startDate
      ? displayWeek(plan, ctx.week.monday)
      : undefined;
  // The timeline row is a Mon–Sun week, so match the ranged event directly
  // instead of relying on plan-week indexes that can shift mid-week.
  const adjustment = (plan?.adjustments ?? []).find(
    (candidate) =>
      candidate.startDate <= ctx.week.sunday &&
      candidate.endDate >= ctx.week.monday,
  );
  const intensity = assignedVariant(ctx.client)?.training.intensity;
  const events = ctx.client.timelineEvents ?? [];
  const eventAdjustmentIds = new Set(
    (plan?.adjustments ?? []).map((entry) => entry.id),
  );
  // Plain week tags and orphaned adjustment events remain removable.
  const marker = adjustment
    ? undefined
    : events.find(
        (event) =>
          (event.kind === "deload" || event.kind === "intro") &&
          event.startDate <= ctx.week.sunday &&
          event.endDate >= ctx.week.monday &&
          (!event.adjustmentId || !eventAdjustmentIds.has(event.adjustmentId)),
      );
  const removeMarker = () => {
    if (!marker) return;
    setState((s) => ({
      ...s,
      clients: s.clients.map((client) =>
        client.id === ctx.client.id
          ? {
              ...client,
              timelineEvents: (client.timelineEvents ?? []).filter(
                (event) => event.id !== marker.id,
              ),
            }
          : client,
      ),
    }));
    toast(marker.kind === "intro" ? "Intro week removed" : "Deload removed");
  };
  return (
    <>
      {adjustment && (
        <div className="apt-adjustment" data-kind={adjustment.kind}>
          <div className="apt-adjustment-copy">
            <strong>
              {adjustment.kind === "intro" ? "Intro week" : "Deload"}
            </strong>
            <span>
              {dayShort(adjustment.startDate)} – {dayShort(adjustment.endDate)}
            </span>
            <span>{adjustmentSummary(adjustment, intensity)}</span>
            {adjustment.note && (
              <span className="apt-adjustment-note">{adjustment.note}</span>
            )}
          </div>
          <div className="apt-adjustment-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditing(adjustment);
                setOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmRemove(true)}
            >
              Remove
            </Button>
          </div>
        </div>
      )}
      {!adjustment && marker && (
        <div className="apt-adjustment" data-kind={marker.kind}>
          <div className="apt-adjustment-copy">
            <strong>{marker.kind === "intro" ? "Intro week" : "Deload"}</strong>
            <span>
              {dayShort(marker.startDate)} – {dayShort(marker.endDate)}
            </span>
            <span>Timeline marker only</span>
            {marker.note && (
              <span className="apt-adjustment-note">{marker.note}</span>
            )}
          </div>
          <div className="apt-adjustment-actions">
            <Button variant="secondary" size="sm" onClick={removeMarker}>
              Remove
            </Button>
          </div>
        </div>
      )}
      <Button
        variant="secondary"
        onClick={() => {
          setEditing(undefined);
          setOpen(true);
        }}
      >
        Add deload or intro week
      </Button>
      {open && (
        <AdjustmentDialog
          ctx={ctx}
          plan={plan}
          planWeek={planWeek}
          week={ctx.week}
          intensity={intensity}
          editing={editing}
          onClose={() => {
            setOpen(false);
            setEditing(undefined);
          }}
        />
      )}
      {confirmRemove && adjustment && (
        <Dialog
          title={`Remove ${adjustment.kind === "intro" ? "intro week" : "deload"}?`}
          onClose={() => setConfirmRemove(false)}
        >
          <p className="apt-sub">
            This restores the original training weeks and removes the timeline
            event.
          </p>
          <div className="apt-dialog-actions">
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setState((s) =>
                  removeTrainingAdjustment(s, ctx.client.id, adjustment.id),
                );
                toast(
                  adjustment.kind === "intro"
                    ? "Intro week removed"
                    : "Deload removed",
                );
                setConfirmRemove(false);
              }}
            >
              Remove
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function TweakStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="apt-adjust-stepper">
      <span>{label}</span>
      <div className="apt-adjust-stepper-controls">
        <IconButton
          label={`Decrease ${label}`}
          size="sm"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus size={14} />
        </IconButton>
        <b>{value}</b>
        <IconButton
          label={`Increase ${label}`}
          size="sm"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Plus size={14} />
        </IconButton>
      </div>
    </div>
  );
}

function AdjustmentDialog({
  ctx,
  plan,
  planWeek,
  week,
  intensity,
  editing,
  onClose,
}: {
  ctx: Ctx;
  plan: TrainingPlan | undefined;
  planWeek: number | undefined;
  week: Week;
  intensity: "off" | "rir" | "rpe" | undefined;
  editing?: TrainingAdjustment;
  onClose: () => void;
}) {
  const { setState, toast, navigate, route } = useCoach();
  const [kind, setKind] = useState<TrainingAdjustment["kind"]>(
    editing?.kind ?? "deload",
  );
  const [startDate, setStartDate] = useState(editing?.startDate ?? week.monday);
  const [endDate, setEndDate] = useState(editing?.endDate ?? week.sunday);
  const [mode, setMode] = useState<TrainingAdjustment["mode"]>(
    editing?.mode ?? (plan ? "rules" : "none"),
  );
  const [sets, setSets] = useState(() =>
    Math.abs(editing?.rules?.setsDelta ?? -1),
  );
  const [rir, setRir] = useState(
    editing?.rules?.rirDelta ?? (kind === "intro" ? 1 : 2),
  );
  const [rpe, setRpe] = useState(
    editing?.rules?.rpeDelta ?? (kind === "intro" ? 1 : 2),
  );
  const [note, setNote] = useState(editing?.note ?? "");

  const snapped = plan
    ? snapRangeToPlanWeeks(plan, startDate, endDate)
    : {
        startDate: mondayOf(startDate),
        endDate: addLocalDays(mondayOf(endDate), 6),
        fromWeek: 1,
        toWeek: 1,
      };
  const effectiveMode = plan ? mode : "none";
  const candidate: TrainingAdjustment = {
    id: editing?.id ?? "adjustment-preview",
    kind,
    fromWeek: snapped.fromWeek,
    toWeek: snapped.toWeek,
    startDate: snapped.startDate,
    endDate: snapped.endDate,
    mode: effectiveMode,
    rules:
      effectiveMode === "rules"
        ? {
            setsDelta: -Math.min(3, Math.max(0, sets)),
            ...(intensity === "rir" && rir > 0 ? { rirDelta: rir } : {}),
            ...(intensity === "rpe" && rpe > 0 ? { rpeDelta: rpe } : {}),
          }
        : undefined,
    note: note.trim() || undefined,
  };
  const otherAdjustments = (plan?.adjustments ?? []).filter(
    (adjustment) => adjustment.id !== editing?.id,
  );
  const previewWeek = plan
    ? planWeek !== undefined &&
      snapped.fromWeek <= planWeek &&
      planWeek <= snapped.toWeek
      ? planWeek
      : snapped.fromWeek
    : 1;
  const baseSessions = plan ? resolveTrainingWeek(plan, previewWeek) : [];
  const previewPlan = plan
    ? { ...plan, adjustments: [...otherAdjustments, candidate] }
    : undefined;
  const adjustedSessions = previewPlan
    ? resolveTrainingWeek(previewPlan, previewWeek)
    : [];
  const beforeSets = countWorkingSets(baseSessions);
  const afterSets =
    effectiveMode === "none" ? 0 : countWorkingSets(adjustedSessions);
  const weekCount = Math.max(1, snapped.toWeek - snapped.fromWeek + 1);
  const affectedWeeks = plan
    ? Array.from({ length: weekCount }, (_, index) => snapped.fromWeek + index)
    : [];
  const affectedSessions = plan
    ? affectedWeeks.reduce(
        (total, weekNumber) =>
          total +
          resolveTrainingWeek(
            { ...plan, adjustments: otherAdjustments },
            weekNumber,
          ).length,
        0,
      )
    : 0;
  const existingEventId = (ctx.client.timelineEvents ?? []).find(
    (event) => event.adjustmentId === candidate.id,
  )?.id;
  const validationError = plan
    ? validateAdjustment(plan, candidate)
    : validateTimelineEvent(
        ctx.client,
        {
          id: candidate.id,
          kind,
          startDate: snapped.startDate,
          endDate: snapped.endDate,
          note: note.trim(),
        },
        { ignoreId: existingEventId },
      );
  const introHint =
    kind === "intro" && plan
      ? snapped.fromWeek === 1
        ? "Intro weeks ease into the first week of a plan."
        : (plan.adjustments ?? []).some(
              (adjustment) =>
                adjustment.kind === "deload" &&
                adjustment.toWeek >= snapped.fromWeek - 1,
            )
          ? "This intro week follows a deload."
          : ""
      : "";
  const changeKind = (next: TrainingAdjustment["kind"]) => {
    setKind(next);
    if (intensity === "rir") setRir(next === "intro" ? 1 : 2);
    if (intensity === "rpe") setRpe(next === "intro" ? 1 : 2);
  };
  const save = () => {
    if (validationError) return;
    const saved: TrainingAdjustment = {
      ...candidate,
      id: editing?.id ?? uid("adjustment"),
    };
    setState((s) => saveTrainingAdjustment(s, ctx.client.id, saved));
    toast(kind === "intro" ? "Intro week saved" : "Deload saved");
    onClose();
    if (effectiveMode === "manual" && plan)
      navigate({
        ...route,
        section: "clients",
        client: ctx.client.id,
        plan: "training",
        week: String(saved.fromWeek),
      });
  };
  return (
    <Dialog
      title={editing ? "Edit deload or intro week" : "Add deload or intro week"}
      onClose={onClose}
      wide
    >
      <div className="apt-adjust">
        <div className="apt-adjust-field">
          <span className="v8-field__label">Type</span>
          <SegmentedControl
            label="Type"
            value={kind}
            onValueChange={(value) =>
              changeKind(value as TrainingAdjustment["kind"])
            }
            options={[
              { value: "deload", label: "Deload" },
              { value: "intro", label: "Intro week" },
            ]}
          />
        </div>
        <div className="apt-adjust-dates">
          <DatePicker
            label="Start"
            value={startDate}
            onValueChange={setStartDate}
            size="md"
          />
          <DatePicker
            label="End"
            value={endDate}
            onValueChange={setEndDate}
            size="md"
          />
        </div>
        <p className="apt-adjust-snapped">
          {dayShort(snapped.startDate)} – {dayShort(snapped.endDate)}
          {plan &&
            ` · ${String(weekCount)} plan week${weekCount === 1 ? "" : "s"} · ${String(affectedSessions)} session${affectedSessions === 1 ? "" : "s"} affected`}
        </p>
        {introHint && <p className="apt-adjust-hint">{introHint}</p>}
        {plan ? (
          <div className="apt-adjust-field">
            <span className="v8-field__label">Training</span>
            <SegmentedControl
              label="Training"
              value={mode}
              onValueChange={(value) =>
                setMode(value as TrainingAdjustment["mode"])
              }
              options={[
                { value: "none", label: "No training" },
                { value: "rules", label: "Adapt automatically" },
                { value: "manual", label: "Set up manually" },
              ]}
            />
          </div>
        ) : (
          <p className="apt-adjust-hint">
            No training plan - only a timeline marker will be added.
          </p>
        )}
        {plan && mode === "rules" && (
          <div className="apt-adjust-rules">
            <TweakStepper
              label="Remove working sets per exercise"
              value={sets}
              min={0}
              max={3}
              onChange={setSets}
            />
            <p className="apt-adjust-hint">
              Exercises with only one set stay unchanged.
            </p>
            {intensity === "rir" && (
              <TweakStepper
                label="Raise RIR by"
                value={rir}
                min={0}
                max={5}
                onChange={setRir}
              />
            )}
            {intensity === "rpe" && (
              <TweakStepper
                label="Lower RPE by"
                value={rpe}
                min={0}
                max={5}
                onChange={setRpe}
              />
            )}
            <p className="apt-adjust-preview">
              Weekly working sets {beforeSets} → {afterSets}
            </p>
          </div>
        )}
        {plan && mode === "manual" && (
          <p className="apt-adjust-hint">
            Sessions start as a copy of the original week. Edit them in the
            training editor; the base plan is left unchanged.
          </p>
        )}
        <TextArea
          label="Note to athlete"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {validationError && (
          <p className="apt-adjust-error" role="alert">
            {validationError}
          </p>
        )}
        <div className="apt-dialog-actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button primary disabled={!!validationError} onClick={save}>
            {!plan
              ? "Add timeline marker"
              : effectiveMode === "manual"
                ? "Create and edit sessions"
                : kind === "intro"
                  ? "Save intro week"
                  : "Save deload"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Phase plan dialog ──────────────────────────────────────────────

const PHASE_SUGGESTIONS = [
  "Fat loss",
  "Muscle gain",
  "Contest prep",
  "Recovery",
  "Maintenance",
  "Reverse diet",
];

function PhasePlanDialog({
  client,
  onPreview,
  onClose,
  toast,
}: {
  client: CoachClient;
  onPreview: (phases: ClientPhase[] | undefined) => void;
  onClose: () => void;
  toast: (text: string) => void;
}) {
  const { setState } = useCoach();
  const firstNameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstNameRef.current?.focus();
  }, []);
  const [draft, setDraft] = useState<ClientPhase[]>(() =>
    structuredClone(
      client.phases?.length
        ? normalizePhases(client.phases)
        : [
            {
              id: uid("phase"),
              name: client.phase || "Fat loss",
              startDate: mondayOf(localToday()),
              durationWeeks: 4,
            },
          ],
    ),
  );
  // Live preview: the week rows regroup as the draft changes.
  const preview = (phases: ClientPhase[]) => {
    setDraft(phases);
    onPreview(phases);
  };
  const draftRanges = phaseRanges(draft);
  const rangeById = new Map(draftRanges.map((r) => [r.id, r]));
  const patch = (id: string, patch: Partial<ClientPhase>) =>
    preview(
      draft.map((phase) => (phase.id === id ? { ...phase, ...patch } : phase)),
    );
  const remove = (id: string) =>
    preview(draft.filter((phase) => phase.id !== id));
  const add = () => {
    const last = draftRanges.at(-1);
    preview([
      ...draft,
      {
        id: uid("phase"),
        name: "Fat loss",
        startDate: last
          ? addLocalDays(last.endDate, 1)
          : mondayOf(localToday()),
        durationWeeks: 4,
      },
    ]);
  };
  const valid = canSavePhases(draft);
  return (
    <Dialog title="Edit phases" onClose={onClose} wide>
      <div className="apt-phases">
        <datalist id="apt-phase-names">
          {PHASE_SUGGESTIONS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <div className="apt-phase-rows">
          {draft.map((phase, index) => {
            const range = rangeById.get(phase.id);
            return (
              <div className="apt-phase-item" key={phase.id}>
                <div className="apt-phase-fields">
                  <Input
                    label="Phase name"
                    list="apt-phase-names"
                    placeholder="e.g. Fat loss"
                    value={phase.name}
                    ref={index === 0 ? firstNameRef : undefined}
                    onChange={(event) =>
                      patch(phase.id, { name: event.target.value })
                    }
                  />
                  <span className="apt-phase-dates">
                    {range
                      ? `${dayShort(range.startDate)} – ${dayShort(range.endDate)}`
                      : ""}
                  </span>
                </div>
                {index === 0 ? (
                  <DatePicker
                    label="Start"
                    value={phase.startDate}
                    onValueChange={(startDate) =>
                      patch(phase.id, { startDate })
                    }
                    error={
                      !isValidPhaseStartDate(phase.startDate)
                        ? "Choose a valid start date."
                        : undefined
                    }
                    size="md"
                  />
                ) : (
                  <div className="apt-phase-start">
                    <span className="v8-field__label">Start</span>
                    <span className="apt-phase-startval">
                      {range ? dayShort(range.startDate) : "—"}
                    </span>
                  </div>
                )}
                <Input
                  label="Weeks"
                  type="number"
                  min={1}
                  max={52}
                  value={phase.durationWeeks}
                  onChange={(event) =>
                    patch(phase.id, {
                      durationWeeks: Number(event.target.value),
                    })
                  }
                />
                <IconButton
                  label={`Remove ${phase.name}`}
                  onClick={() => remove(phase.id)}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            );
          })}
        </div>
        <Button variant="secondary" onClick={add}>
          <Plus size={14} aria-hidden="true" /> Add phase
        </Button>
        <div className="apt-dialog-actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            primary
            disabled={!valid}
            onClick={() => {
              const phases = draft.length ? normalizePhases(draft) : undefined;
              setState((s) => ({
                ...s,
                clients: s.clients.map((c) =>
                  c.id === client.id ? { ...c, phases } : c,
                ),
              }));
              toast(phases ? "Phases saved" : "Phases removed");
              onClose();
            }}
          >
            Save phases
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
