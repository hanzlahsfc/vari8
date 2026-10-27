"use client";

/**
 * Athlete profile → Timeline tab: dense week-by-week rows grouped under
 * collapsible phase headers, grouped column views with plan-vs-logged
 * comparison, expandable weekly context, phase editing and deload
 * management. Data comes from the persisted tracking log, plan lifecycles,
 * temporary nutrition and timeline events.
 */

import {
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import {
  Fragment,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  displayWeek,
  scheduledSessions,
  sessionStatus,
} from "../../client-app/training-log/model";
import {
  calculateVariantNutrients,
  type MealPlan,
  type Nutrients,
} from "../../ethereal/mealplan/model";
import { Checkbox, Input, SegmentedControl } from "../../vari8/components";
import { DatePicker, TextArea } from "../../vari8/inputs";
import {
  addDays,
  type CoachClient,
  type CoachState,
  eventsBetween,
  formatDate,
  uid,
} from "../model";
import {
  applicablePlan,
  planFoodMap,
  scheduledOption,
  targetNumber,
} from "../plans/domain";
import {
  type ClientPhase,
  type ClientPhaseRange,
  canSavePhases,
  isValidPhaseStartDate,
  normalizePhases,
  phaseRanges,
} from "../plans/phase-planning";
import {
  fetchActivityTargets,
  versionsFromWire,
} from "../../data/activity-targets";
import { TemporaryPlanDialog } from "../plans/temporary-plan-dialog";
import { emptyClientPlans, type IifymPlan } from "../plans/types";
import { useCoach } from "../store";
import {
  addLocalDays,
  localToday,
  mondayOf,
  resolveActivityTarget,
} from "../targets/model";
import { templateSetup } from "../template-setup";
import { clientTracking } from "../tracking/data";
import { Button, Dialog, IconButton } from "../ui";
import { nutritionForDate } from "./timeline";
import "./timeline-tab.css";

let measureCtx: CanvasRenderingContext2D | null | undefined;
/** Canvas-measured header label width (+ breathing room). */
function textWidth(text: string, font: string): number {
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width + 4;
}
const BAND_FONT = "700 10px";
const SUB_FONT = "600 10px";

const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const number1 = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
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
  for (const event of client.timelineEvents ?? [])
    if (event.startDate <= week.sunday && event.endDate >= week.monday)
      out.add(EVENT_KIND_LABEL[event.kind] ?? "Event");
  return [...out];
}
const EVENT_KIND_LABEL: Record<string, string> = {
  deload: "Deload",
  "diet-break": "Diet break",
  refeed: "Refeed",
};

// ─── Plan-of-the-week resolution ────────────────────────────────────

type NutritionSource = "mealPlan" | "iifym";

/** The regular (non-temporary) nutrition plan that applies on a date. */
function regularNutritionPlan(
  client: CoachClient,
  date: string,
): { source: NutritionSource; plan: MealPlan | IifymPlan | undefined } {
  const setup = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const source: NutritionSource =
    setup?.nutrition === "IIFYM" ? "iifym" : "mealPlan";
  const plans = client.plans;
  const plan = plans
    ? source === "iifym"
      ? applicablePlan(plans.nutrition.iifym, date)
      : applicablePlan(plans.nutrition.mealPlan, date)
    : undefined;
  return { source, plan: plan as MealPlan | IifymPlan | undefined };
}

/** One rendered sub-column inside the Nutrition plan group. */
type Slot = { key: string; label: string };
const IIFYM_SLOT: Slot = { key: "__targets__", label: "Targets" };

/**
 * Variant sub-groups: the union of variant labels across the visible weeks,
 * ordered by the currently active plan's variant order, then others. IIFYM
 * clients get a single "Targets" slot.
 */
function variantSlots(
  client: CoachClient,
  weeks: Week[],
  today: string,
): Slot[] {
  const current = regularNutritionPlan(client, today);
  if (current.source === "iifym") {
    const any =
      !!current.plan ||
      weeks.some((w) => regularNutritionPlan(client, w.monday).plan);
    return any ? [IIFYM_SLOT] : [];
  }
  const labels: string[] = [];
  const add = (plan: MealPlan | IifymPlan | undefined) => {
    for (const variant of (plan as MealPlan | undefined)?.variants ?? [])
      if (!labels.includes(variant.label)) labels.push(variant.label);
  };
  add(current.plan);
  for (const week of weeks) add(regularNutritionPlan(client, week.monday).plan);
  return labels.map((label) => ({ key: label, label }));
}

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

/** The regular nutrition plan governing most of the week. */
function weekNutritionPlan(
  client: CoachClient,
  week: Week,
): { source: NutritionSource; plan: MealPlan | IifymPlan | undefined } {
  const plan = majorityWeek(
    week,
    (day) => regularNutritionPlan(client, day),
    (r) => r.plan?.id ?? "",
    (a, b) => (a.plan?.startDate ?? "").localeCompare(b.plan?.startDate ?? ""),
  );
  return plan ?? { source: "mealPlan", plan: undefined };
}

/** The slot's planned macro targets for a week ("—" when absent). */
function slotNutrients(ctx: Ctx, slot: Slot): Nutrients | undefined {
  const { source, plan } = weekNutritionPlan(ctx.client, ctx.week);
  if (!plan) return undefined;
  if (source === "iifym") {
    const p = plan as IifymPlan;
    const option = p.options.find(
      (entry) =>
        entry.id ===
        scheduledOption(
          p.schedule,
          p.options.map((o) => o.id),
          ctx.week.monday,
        ),
    );
    if (!option) return undefined;
    const protein = targetNumber(option.targets.protein);
    const carbs = targetNumber(option.targets.carbs);
    const fat = targetNumber(option.targets.fat);
    return {
      calories:
        targetNumber(option.targets.calories) ||
        protein * 4 + carbs * 4 + fat * 9,
      protein,
      carbs,
      fat,
    };
  }
  const variant = (plan as MealPlan).variants.find(
    (entry) => entry.label === slot.label,
  );
  return variant ? calculateVariantNutrients(variant, planFoodMap) : undefined;
}

/** Logged intake split by the plan variant scheduled that day. */
type VariantLogged = Map<string, Record<keyof Nutrients, number[]>>;
function weekVariantLogged(ctx: Ctx): VariantLogged {
  const out: VariantLogged = new Map();
  for (const day of ctx.week.days) {
    const r = nutritionForDate(ctx.client, day);
    if (!r.plan || r.temporary) continue;
    const entry = ctx.entries.get(day);
    if (!entry) continue;
    const key = r.source === "iifym" ? IIFYM_SLOT.key : (r.label ?? "");
    if (!key) continue;
    const bucket = out.get(key) ?? {
      calories: [],
      protein: [],
      carbs: [],
      fat: [],
    };
    for (const k of ["calories", "protein", "carbs", "fat"] as const) {
      const v = metricOn(entry, k);
      if (v != null) bucket[k].push(v);
    }
    out.set(key, bucket);
  }
  return out;
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

type ColGroup =
  | "Bodyweight"
  | "Nutrition plan"
  | "Activity plan"
  | "Logged"
  | "Recovery"
  | "Training"
  | "Notes";
const GROUP_ORDER: ColGroup[] = [
  "Bodyweight",
  "Nutrition plan",
  "Activity plan",
  "Logged",
  "Recovery",
  "Training",
  "Notes",
];

type ColDef = {
  id: string;
  /** Column header label. */
  label: string;
  /** Label in the customize catalog (defaults to `label`). */
  catalogLabel?: string;
  /** Catalog hint, e.g. "per variant". */
  hint?: string;
  group: ColGroup;
  /** Grid track width. */
  width: string;
  cell: (ctx: Ctx, slot?: Slot) => Cell;
};

type Ctx = {
  state: CoachState;
  client: CoachClient;
  week: Week;
  entries: Map<string, DayEntry>;
  today: string;
  compare: boolean;
  _logged?: VariantLogged;
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
const loggedFor = (ctx: Ctx, slot: Slot, key: keyof Nutrients) => {
  if (!ctx.compare) return undefined;
  ctx._logged ??= weekVariantLogged(ctx);
  const vals = ctx._logged.get(slot.key)?.[key];
  return vals?.length ? mean(vals) : undefined;
};

/** Plan-column cell: planned value plus optional "compare with logged" sub. */
const planCell =
  (key: keyof Nutrients) =>
  (ctx: Ctx, slot?: Slot): Cell => {
    const n = slot ? slotNutrients(ctx, slot) : undefined;
    const target = n?.[key];
    const value =
      target === undefined ? "—" : integer.format(Math.round(target));
    let sub = "";
    let tone: Cell["tone"];
    const actual = slot ? loggedFor(ctx, slot, key) : undefined;
    if (actual !== undefined && target !== undefined && target > 0) {
      sub = `${integer.format(Math.round(actual))}${pct(actual, target)}`;
      tone = accuracyTone(actual, target);
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
    ? applicablePlan(ctx.client.plans.training, ctx.week.monday)
    : undefined;
  if (!plan)
    return { planned: 0, done: 0, name: undefined as string | undefined };
  const week = displayWeek(plan, ctx.week.monday);
  const items = week !== undefined ? scheduledSessions(plan, week) : [];
  const logs = (ctx.state.trainingLogs ?? []).filter(
    (log) => log.clientId === ctx.client.id,
  );
  return {
    planned: items.length,
    done: items.filter(
      (item) => sessionStatus(item, logs, ctx.today) === "done",
    ).length,
    name: plan.name,
  };
}

const COLS: ColDef[] = [
  // ── Bodyweight (logged by nature) ──
  {
    id: "weight-avg",
    label: "Ø kg",
    catalogLabel: "Weight ø",
    group: "Bodyweight",
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
    group: "Bodyweight",
    width: "52px",
    cell: (ctx) => {
      const avg = weekWeightAvg(ctx);
      const prev = prevWeekWeightAvg(ctx);
      const diff =
        avg !== undefined && prev !== undefined ? avg - prev : undefined;
      return {
        value:
          diff === undefined
            ? "—"
            : `${diff >= 0 ? "+" : "−"}${number1.format(Math.abs(diff))}`,
        future: "—",
      };
    },
  },
  {
    id: "weight-rate",
    label: "Δ %",
    group: "Bodyweight",
    width: "52px",
    cell: (ctx) => {
      const avg = weekWeightAvg(ctx);
      const prev = prevWeekWeightAvg(ctx);
      const rate =
        avg !== undefined && prev !== undefined && prev > 0
          ? ((avg - prev) / prev) * 100
          : undefined;
      return {
        value:
          rate === undefined
            ? "—"
            : `${rate >= 0 ? "+" : "−"}${number1.format(Math.abs(rate))}%`,
        future: "—",
      };
    },
  },
  // ── Nutrition plan (per variant) ──
  {
    id: "kcal-plan",
    label: "kcal",
    catalogLabel: "Calories",
    hint: "per variant",
    group: "Nutrition plan",
    width: "60px",
    cell: planCell("calories"),
  },
  {
    id: "protein",
    label: "P",
    catalogLabel: "Protein",
    hint: "per variant",
    group: "Nutrition plan",
    width: "50px",
    cell: planCell("protein"),
  },
  {
    id: "carbs",
    label: "C",
    catalogLabel: "Carbs",
    hint: "per variant",
    group: "Nutrition plan",
    width: "50px",
    cell: planCell("carbs"),
  },
  {
    id: "fat",
    label: "F",
    catalogLabel: "Fat",
    hint: "per variant",
    group: "Nutrition plan",
    width: "50px",
    cell: planCell("fat"),
  },
  // ── Activity plan ──
  {
    id: "steps-plan",
    label: "Steps",
    catalogLabel: "Steps target",
    group: "Activity plan",
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
    catalogLabel: "Cardio target",
    group: "Activity plan",
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
  // ── Logged ──
  {
    id: "kcal",
    label: "kcal Ø",
    catalogLabel: "Calorie intake ø",
    group: "Logged",
    width: "52px",
    cell: (ctx) => {
      const v = avgOf(ctx, "calories");
      return {
        value: v === undefined ? "—" : integer.format(Math.round(v)),
        future: "—",
      };
    },
  },
  {
    id: "steps",
    label: "Steps Ø",
    catalogLabel: "Steps ø",
    group: "Logged",
    width: "52px",
    cell: (ctx) => {
      const v = avgOf(ctx, "steps");
      return {
        value: v === undefined ? "—" : integer.format(Math.round(v)),
        future: "—",
      };
    },
  },
  {
    id: "cardio",
    label: "Cardio",
    catalogLabel: "Cardio min",
    group: "Logged",
    width: "52px",
    cell: (ctx) => {
      const v = weekCardioMinutes(ctx);
      return {
        value: v > 0 ? `${integer.format(Math.round(v))} min` : "—",
        future: "—",
      };
    },
  },
  // ── Recovery ──
  {
    id: "sleep",
    label: "Sleep",
    catalogLabel: "Sleep ø",
    group: "Recovery",
    width: "52px",
    cell: (ctx) => {
      const v = avgOf(ctx, "sleep");
      return {
        value: v === undefined ? "—" : `${number1.format(v)} h`,
        future: "—",
      };
    },
  },
  {
    id: "water",
    label: "Water",
    catalogLabel: "Water ø",
    group: "Recovery",
    width: "52px",
    cell: (ctx) => {
      const v = avgOf(ctx, "water");
      return {
        value: v === undefined ? "—" : `${number1.format(v)} L`,
        future: "—",
      };
    },
  },
  {
    id: "checkin",
    label: "Check-in",
    group: "Recovery",
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
  // ── Training ──
  {
    id: "sessions",
    label: "Sess.",
    catalogLabel: "Sessions",
    group: "Training",
    width: "48px",
    cell: (ctx) => {
      const s = weekSessions(ctx);
      return {
        value: s.planned ? `${String(s.done)}/${String(s.planned)}` : "—",
        future: s.planned ? `–/${String(s.planned)}` : "—",
      };
    },
  },
  {
    id: "plan-name",
    label: "Plan",
    catalogLabel: "Training plan",
    group: "Training",
    width: "88px",
    cell: (ctx) => {
      const s = weekSessions(ctx);
      return { value: s.name ?? "—", future: s.name ?? "—" };
    },
  },
  // ── Notes ──
  {
    id: "changes",
    label: "Changes",
    group: "Notes",
    width: "166px",
    cell: () => ({ value: "", plain: true }),
  },
  {
    id: "note",
    label: "Note",
    group: "Notes",
    width: "minmax(160px, 1fr)",
    cell: (ctx) => ({
      value: ctx.client.weekNotes?.[ctx.week.monday] ?? "—",
      plain: true,
    }),
  },
];
const COL_MAP = new Map(COLS.map((col) => [col.id, col]));

type TimelineView = {
  id: string;
  name: string;
  columns: string[];
  builtIn?: boolean;
  compare?: boolean;
};
const BUILTIN_VIEWS: TimelineView[] = [
  {
    id: "overview",
    name: "Overview",
    columns: [
      "weight-avg",
      "weight-change",
      "weight-rate",
      "kcal-plan",
      "steps-plan",
      "cardio-plan",
      "sessions",
      "changes",
      "note",
    ],
    builtIn: true,
  },
  {
    id: "nutrition",
    name: "Nutrition",
    columns: [
      "weight-avg",
      "weight-change",
      "kcal-plan",
      "protein",
      "carbs",
      "fat",
      "kcal",
      "changes",
      "note",
    ],
    builtIn: true,
  },
  {
    id: "activity",
    name: "Activity",
    columns: [
      "steps-plan",
      "cardio-plan",
      "steps",
      "cardio",
      "changes",
      "note",
    ],
    builtIn: true,
  },
  {
    id: "recovery",
    name: "Recovery",
    columns: ["sleep", "water", "checkin", "note"],
    builtIn: true,
  },
  {
    id: "training",
    name: "Training",
    columns: ["sessions", "plan-name", "changes", "note"],
    builtIn: true,
  },
];

function resolveViews(saved: TimelineView[] | undefined): TimelineView[] {
  if (!saved?.length) return BUILTIN_VIEWS;
  const byId = new Map(BUILTIN_VIEWS.map((v) => [v.id, v]));
  const merged: TimelineView[] = [];
  for (const view of saved) {
    const base = byId.get(view.id);
    merged.push(
      base ? { ...view, builtIn: true } : { ...view, builtIn: false },
    );
  }
  for (const view of BUILTIN_VIEWS)
    if (!saved.some((v) => v.id === view.id)) merged.push(view);
  return merged;
}

/** One item in the rendered column sequence (data col or group gap). */
type RenderCol =
  | { kind: "gap"; key: string }
  | { kind: "col"; key: string; col: ColDef; slot?: Slot; width?: string };

type RenderGroup = {
  group: ColGroup;
  cols: Extract<RenderCol, { kind: "col" }>[];
  /** Sub-band spans, e.g. variant names over their metric columns. */
  subs: { label: string; span: number }[];
};

/**
 * Expand a view into render columns: groups in fixed order, view order
 * inside each group, nutrition plan items fanned out per variant slot.
 */
function renderGroups(view: TimelineView, slots: Slot[]): RenderGroup[] {
  const viewCols = view.columns
    .map((id) => COL_MAP.get(id))
    .filter((c): c is ColDef => !!c);
  const groups: RenderGroup[] = [];
  for (const group of GROUP_ORDER) {
    const items = viewCols.filter((c) => c.group === group);
    if (!items.length) continue;
    if (group === "Nutrition plan" && slots.length) {
      groups.push({
        group,
        cols: slots.flatMap((slot) =>
          items.map((col) => ({
            kind: "col" as const,
            key: `${col.id}@${slot.key}`,
            col,
            slot,
          })),
        ),
        subs: slots.map((slot) => ({ label: slot.label, span: items.length })),
      });
    } else {
      groups.push({
        group,
        cols: items.map((col) => ({ kind: "col" as const, key: col.id, col })),
        subs: [],
      });
    }
  }
  // Group/sub-band labels must never truncate: measure them and extend the
  // group's last column by any deficit (row templates stay shared).
  const family =
    typeof document === "undefined"
      ? "sans-serif"
      : getComputedStyle(document.body).fontFamily;
  for (const g of groups) {
    const widths = g.cols.map((c) => pxOf(c.col.width));
    const interior = (widths.length - 1) * COL_GAP;
    const needBand = textWidth(g.group.toUpperCase(), `${BAND_FONT} ${family}`);
    let need = needBand;
    for (const [i, sub] of g.subs.entries()) {
      const spanW =
        widths
          .slice(i * sub.span, (i + 1) * sub.span)
          .reduce((a, b) => a + b, 0) +
        (sub.span - 1) * COL_GAP;
      need = Math.max(
        need,
        textWidth(sub.label, `${SUB_FONT} ${family}`) -
          spanW +
          widths.reduce((a, b) => a + b, 0) +
          interior,
      );
    }
    const deficit = need - (widths.reduce((a, b) => a + b, 0) + interior);
    if (deficit > 0)
      g.cols[g.cols.length - 1].width =
        `${widths[widths.length - 1] + deficit}px`;
  }
  return groups;
}

const COL_GAP = 12;
/** Numeric track width for measurement; flex tracks use their min. */
function pxOf(width: string): number {
  const min = width.match(/minmax\((\d+(?:\.\d+)?)px/)?.[1];
  return Number(min ?? width.match(/^(\d+(?:\.\d+)?)px/)?.[1] ?? "0");
}

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
    rate:
      rateMean !== undefined
        ? `${rateMean >= 0 ? "+" : "−"}${number1.format(Math.abs(rateMean))}%/wk`
        : undefined,
    kcal:
      kcal !== undefined
        ? `ø ${integer.format(Math.round(kcal))} kcal`
        : undefined,
  };
}

// ─── Components ─────────────────────────────────────────────────────

export function AthleteTimelineTab({ client }: { client: CoachClient }) {
  const {
    state,
    setState,
    navigate,
    toast,
    workspaceId,
    clientProfileIdFor,
  } = useCoach();
  const today = localToday();
  const ranges = useMemo(() => phaseRanges(client.phases), [client.phases]);
  const weeks = useMemo(
    () => enumerateWeeks(client, ranges, today),
    [client, ranges, today],
  );
  const order = state.timelineOrder === "newest" ? "newest" : "oldest";
  const [expanded, setExpanded] = useState<string>(
    () =>
      weeks.find((week) => inRange(today, week.monday, week.sunday))?.monday ??
      "",
  );
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [phaseToggled, setPhaseToggled] = useState<Set<string>>(new Set());
  const views = resolveViews(state.timelineViews);
  const [viewId, setViewId] = useState("overview");
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const compare = view.compare === true;
  const [customize, setCustomize] = useState(false);
  const [editPhases, setEditPhases] = useState(false);
  const [previewPhases, setPreviewPhases] = useState<
    ClientPhase[] | undefined
  >();
  const shownRanges = previewPhases ? phaseRanges(previewPhases) : ranges;

  const entries = useMemo(
    () => new Map(clientTracking(client).map((entry) => [entry.date, entry])),
    [client],
  );

  // Issue #169: attached to a workspace the timeline resolves the persisted
  // day-effective versions through the same canvas resolver — a successful
  // read is authoritative, a failed read keeps the local copy.
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    void (async () => {
      const clientProfileId = await clientProfileIdFor(client.name);
      if (!live || !clientProfileId) return;
      try {
        const res = await fetchActivityTargets(workspaceId, clientProfileId);
        if (!live) return;
        const versions = versionsFromWire(res.versions);
        setState((current) => ({
          ...current,
          clients: current.clients.map((item) =>
            item.id === client.id
              ? {
                  ...item,
                  plans: {
                    ...(item.plans ?? emptyClientPlans()),
                    activityTargets: versions,
                  },
                }
              : item,
          ),
        }));
      } catch {
        // The timeline keeps its local versions rather than misreporting.
      }
    })();
    return () => {
      live = false;
    };
  }, [workspaceId, clientProfileIdFor, client.id, client.name, setState]);

  const isFutureWeek = (week: Week) => week.monday > today;
  const upcomingCount = weeks.filter(isFutureWeek).length;
  const shown = (week: Week) => !isFutureWeek(week) || showUpcoming;
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

  const isPhaseCollapsed = (group: Group) =>
    phaseToggled.has(group.key) ? group.current : !group.current;
  const togglePhase = (key: string) =>
    setPhaseToggled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // View → render columns: groups in fixed order, variant slots expanded.
  const slots = useMemo(
    () => variantSlots(client, weeks, today),
    [client, weeks, today],
  );
  const ctx = (week: Week): Ctx => ({
    state,
    client,
    week,
    entries,
    today,
    compare,
  });

  const groups2 = useMemo(() => renderGroups(view, slots), [view, slots]);
  const renderCols: RenderCol[] = groups2.flatMap((group, index) =>
    index === 0
      ? group.cols
      : [{ kind: "gap" as const, key: `gap-${group.group}` }, ...group.cols],
  );
  // Phone shows two key values: bodyweight ø + the first nutrition column.
  const mobileKeep = new Set(
    [
      renderCols.find((rc) => rc.kind === "col" && rc.col.id === "weight-avg"),
      renderCols.find(
        (rc) => rc.kind === "col" && rc.col.group === "Nutrition plan",
      ),
    ]
      .filter((rc): rc is Extract<RenderCol, { kind: "col" }> => !!rc)
      .map((rc) => rc.key),
  );
  if (!mobileKeep.size)
    renderCols
      .filter(
        (rc): rc is Extract<RenderCol, { kind: "col" }> => rc.kind === "col",
      )
      .slice(0, 2)
      .forEach((rc) => {
        mobileKeep.add(rc.key);
      });
  // Numeric columns size to content: min width, the header label, and the
  // widest value/sub-line across the visible weeks (deterministic per view
  // and compare state, so every row shares the template).
  const family =
    typeof document === "undefined"
      ? "sans-serif"
      : getComputedStyle(document.body).fontFamily;
  const sizingWeeks = weeks.filter(shown);
  for (const rc of renderCols) {
    if (rc.kind !== "col" || rc.col.id === "changes" || rc.col.id === "note")
      continue;
    let need = pxOf(rc.width ?? rc.col.width);
    need = Math.max(need, textWidth(rc.col.label, `600 11px ${family}`) + 6);
    for (const w of sizingWeeks) {
      const c = rc.col.cell(ctx(w), rc.slot);
      if (c.plain) continue;
      need = Math.max(need, textWidth(c.value, `600 13px ${family}`) + 8);
      if (c.future)
        need = Math.max(need, textWidth(c.future, `600 13px ${family}`) + 8);
      if (compare && c.sub)
        need = Math.max(need, textWidth(c.sub, `500 11px ${family}`) + 8);
    }
    const cur = pxOf(rc.width ?? rc.col.width);
    if (need > cur) rc.width = `${String(Math.ceil(need))}px`;
  }
  const template = `34px 102px ${renderCols
    .map((rc) => (rc.kind === "gap" ? "6px" : (rc.width ?? rc.col.width)))
    .join(" ")} 16px`;

  const setCompare = (on: boolean) =>
    setState((s) => ({
      ...s,
      timelineViews: resolveViews(s.timelineViews).map((v) =>
        v.id === view.id ? { ...v, compare: on } : v,
      ),
    }));

  // Scroll the current week into view when the tab opens.
  const currentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, []);

  // Right-edge fade when the column area overflows horizontally.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const overflowed = el.scrollWidth > el.clientWidth + 1;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      if (overflowed && !atEnd) el.dataset.fade = "1";
      else delete el.dataset.fade;
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  });

  // Drag to pan: mouse drags scroll horizontally (and the page vertically).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let panning = false;
    let moved = false;
    let suppress = false;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const vscroller = (): HTMLElement | null => {
      let n = el.parentElement;
      while (n) {
        const oy = getComputedStyle(n).overflowY;
        if (
          (oy === "auto" || oy === "scroll") &&
          n.scrollHeight > n.clientHeight
        )
          return n;
        n = n.parentElement;
      }
      return null;
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true'], a")
      )
        return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = el.scrollLeft;
      startTop = (vscroller() ?? document.scrollingElement ?? el).scrollTop;
      panning = true;
      moved = false;
    };
    const onMove = (event: PointerEvent) => {
      if (!panning || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!moved) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        moved = true;
        el.dataset.panning = "1";
      }
      el.scrollLeft = startLeft - dx;
      const vs = vscroller() ?? document.scrollingElement;
      if (vs) vs.scrollTop = startTop - dy;
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
      moved = false;
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
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, []);

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

  // Header helpers: grid position (1-based column index in the template).
  let colIndex = 3;
  return (
    <div className="apt">
      <div className="apt-bar">
        <SegmentedControl
          label="Timeline view"
          value={view.id}
          onValueChange={setViewId}
          options={views.map((v) => ({ value: v.id, label: v.name }))}
        />
        <span className="apt-bar-mid">
          <SegmentedControl
            label="Timeline order"
            value={order}
            onValueChange={(value) =>
              setState((s) => ({
                ...s,
                timelineOrder: value as "newest" | "oldest",
              }))
            }
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
        </span>
        <div className="apt-bar-actions">
          <Button variant="ghost" onClick={() => setCustomize(true)}>
            Customize view
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const id = uid("view");
              setState((s) => ({
                ...s,
                timelineViews: [
                  ...resolveViews(s.timelineViews),
                  {
                    id,
                    name: "New view",
                    columns: [...view.columns],
                  },
                ],
              }));
              setViewId(id);
              setCustomize(true);
            }}
          >
            <Plus size={14} aria-hidden="true" /> New view
          </Button>
          <Button variant="secondary" onClick={() => setEditPhases(true)}>
            <Pencil size={14} aria-hidden="true" /> Edit phases
          </Button>
        </div>
      </div>

      {order === "newest" && upcomingButton}

      <div className="apt-scroller" ref={scrollerRef}>
        <div className="apt-canvas">
          <div
            className="apt-colhead"
            style={{ gridTemplateColumns: template }}
          >
            <span
              className="apt-colhead-cell apt-sticky-1"
              style={{ gridRow: "1 / 4" }}
            />
            <span
              className="apt-colhead-cell apt-sticky-2"
              style={{ gridRow: "1 / 4" }}
            >
              Week
            </span>
            {groups2.map((group, gi) => {
              const start = colIndex + (gi > 0 ? 1 : 0);
              colIndex += group.cols.length + (gi > 0 ? 1 : 0);
              return (
                <Fragment key={group.group}>
                  <span
                    className="apt-colhead-band"
                    style={{
                      gridColumn: `${String(start)} / span ${String(group.cols.length)}`,
                      gridRow: 1,
                    }}
                  >
                    {group.group}
                  </span>
                  {group.subs.length ? (
                    group.subs.map((sub, si) => (
                      <span
                        key={sub.label}
                        className="apt-colhead-sub"
                        style={{
                          gridColumn: `${String(start + group.subs.slice(0, si).reduce((a, s) => a + s.span, 0))} / span ${String(sub.span)}`,
                          gridRow: 2,
                        }}
                      >
                        {sub.label}
                      </span>
                    ))
                  ) : (
                    <span
                      className="apt-colhead-sub"
                      style={{
                        gridColumn: `${String(start)} / span ${String(group.cols.length)}`,
                        gridRow: 2,
                      }}
                    />
                  )}
                  {group.cols.map((rc, ci) => (
                    <span
                      key={rc.key}
                      className="apt-colhead-cell"
                      style={{ gridColumn: start + ci, gridRow: 3 }}
                      title={
                        rc.slot
                          ? `${rc.col.label} · ${rc.slot.label}`
                          : (rc.col.catalogLabel ?? rc.col.label)
                      }
                    >
                      {rc.col.label}
                    </span>
                  ))}
                </Fragment>
              );
            })}
            <span
              className="apt-colhead-cell"
              style={{ gridColumn: colIndex, gridRow: "1 / 4" }}
            />
          </div>

          {groups.map((group) => {
            const collapsed = isPhaseCollapsed(group);
            const durWeeks = group.range?.durationWeeks ?? 0;
            const weekIn =
              group.current && group.range
                ? Math.floor(daysBetween(group.range.startDate, today) / 7) + 1
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
                  <b>{group.name}</b>
                  <span className="apt-sub">{group.weeks.length} weeks</span>
                  {progress !== undefined && weekIn !== undefined && (
                    <span className="apt-phase-progress">
                      Week {weekIn} of {durWeeks} · {progress}%
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
                {!collapsed &&
                  group.shown.map((week) => (
                    <WeekRow
                      key={week.monday}
                      ctx={ctx(week)}
                      renderCols={renderCols}
                      mobileKeep={mobileKeep}
                      template={template}
                      isCurrent={inRange(today, week.monday, week.sunday)}
                      isFuture={isFutureWeek(week)}
                      expanded={expanded === week.monday}
                      onToggle={() =>
                        setExpanded(expanded === week.monday ? "" : week.monday)
                      }
                      onReview={(submissionId) =>
                        navigate({
                          section: "check-ins",
                          review: submissionId,
                          client: client.id,
                        })
                      }
                      onOpenCheckins={() =>
                        navigate({ section: "check-ins", client: client.id })
                      }
                      currentRef={currentRef}
                    />
                  ))}
              </section>
            );
          })}
        </div>
      </div>

      {order === "oldest" && upcomingButton}

      {customize && (
        <CustomizeViewDialog
          views={views}
          view={view}
          onClose={() => setCustomize(false)}
        />
      )}
      {editPhases && (
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
    </div>
  );
}

// ─── Week row ───────────────────────────────────────────────────────

function WeekRow({
  ctx,
  renderCols,
  mobileKeep,
  template,
  isCurrent,
  isFuture,
  expanded,
  onToggle,
  onReview,
  onOpenCheckins,
  currentRef,
}: {
  ctx: Ctx;
  renderCols: RenderCol[];
  mobileKeep: Set<string>;
  template: string;
  isCurrent: boolean;
  isFuture: boolean;
  expanded: boolean;
  onToggle: () => void;
  onReview: (submissionId: string) => void;
  onOpenCheckins: () => void;
  currentRef: RefObject<HTMLDivElement | null>;
}) {
  const { setState } = useCoach();
  const { client, week, state } = ctx;
  const [tempOpen, setTempOpen] = useState(false);
  const changes = weekChanges(client, week);
  const note = client.weekNotes?.[week.monday] ?? "";
  const checkin = eventsBetween(state, week.monday, week.sunday).find(
    (e) => e.clientId === client.id,
  );
  const checkinWeight = checkin
    ? metricOn(ctx.entries.get(checkin.date), "weight")
    : undefined;
  const deload = (client.timelineEvents ?? []).find(
    (e) =>
      e.kind === "deload" &&
      e.startDate <= week.sunday &&
      e.endDate >= week.monday,
  );
  const canTemp = week.monday >= mondayOf(ctx.today);
  const renderCell = (rc: Extract<RenderCol, { kind: "col" }>) => {
    const { col } = rc;
    if (col.id === "changes")
      return (
        <span
          key={rc.key}
          className="apt-cell apt-cell-chips"
          data-kind="changes"
          title="Changes"
        >
          <span className="apt-chips">
            {changes.slice(0, 3).map((c) => (
              <i key={c}>{c}</i>
            ))}
          </span>
        </span>
      );
    const cell = col.cell(ctx, rc.slot);
    return (
      <span
        key={rc.key}
        className="apt-cell"
        data-tone={cell.tone}
        data-kind={col.id}
        data-mobile={mobileKeep.has(rc.key) || undefined}
        data-future={isFuture && !cell.plain ? true : undefined}
        title={rc.slot ? `${col.label} · ${rc.slot.label}` : col.label}
      >
        <b>{isFuture && !cell.plain ? (cell.future ?? "—") : cell.value}</b>
        <span className="apt-cell-sub">
          {isFuture && !cell.plain ? "" : (cell.sub ?? "")}
        </span>
      </span>
    );
  };
  return (
    <div
      className="apt-week"
      data-current={isCurrent || undefined}
      data-open={expanded || undefined}
      ref={isCurrent ? currentRef : undefined}
    >
      <button
        type="button"
        className="apt-row"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{ gridTemplateColumns: template }}
      >
        <span className="apt-weeknum apt-sticky-1" aria-hidden="true">
          {week.index}
        </span>
        <span className="apt-dates apt-sticky-2">
          <span>
            {formatDate(week.monday, { month: "short", day: "numeric" })} –{" "}
            {formatDate(week.sunday, { month: "short", day: "numeric" })}
          </span>
          <span className="apt-tagline">
            {isCurrent && <em className="apt-this">This week</em>}
          </span>
        </span>
        {renderCols.map((rc) =>
          rc.kind === "gap" ? (
            <i key={rc.key} className="apt-gap" aria-hidden="true" />
          ) : (
            renderCell(rc)
          ),
        )}
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
                · <span className="apt-link">Open review</span>
              </button>
            ) : (
              <p className="apt-sub">No check-in this week</p>
            )}
            <TextArea
              label="Coach note"
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
            <div className="apt-detail-actions">
              <DeloadToggle ctx={ctx} deloadId={deload?.id} />
              <Button
                variant="secondary"
                disabled={!canTemp}
                title={
                  canTemp
                    ? `Temporary plan from ${dayShort(week.monday)}`
                    : "Past weeks can't get a temporary plan"
                }
                onClick={() => setTempOpen(true)}
              >
                Temporary plan
              </Button>
            </div>
          </section>
        </div>
      )}
      {tempOpen && (
        <TemporaryPlanDialog
          client={client}
          initialStartDate={week.monday}
          onClose={() => setTempOpen(false)}
        />
      )}
    </div>
  );
}

function DeloadToggle({
  ctx,
  deloadId,
}: {
  ctx: Ctx;
  deloadId: string | undefined;
}) {
  const { setState, toast } = useCoach();
  return (
    <Button
      variant="secondary"
      onClick={() => {
        setState((s) => ({
          ...s,
          clients: s.clients.map((c) =>
            c.id !== ctx.client.id
              ? c
              : {
                  ...c,
                  timelineEvents: deloadId
                    ? (c.timelineEvents ?? []).filter((e) => e.id !== deloadId)
                    : [
                        ...(c.timelineEvents ?? []),
                        {
                          id: uid("timeline"),
                          kind: "deload" as const,
                          startDate: ctx.week.monday,
                          endDate: ctx.week.sunday,
                          note: "Deload",
                        },
                      ],
                },
          ),
        }));
        toast(deloadId ? "Deload removed" : "Deload added");
      }}
    >
      {deloadId ? "Remove deload" : "Add deload"}
    </Button>
  );
}

// ─── Customize view dialog ──────────────────────────────────────────

function CustomizeViewDialog({
  views,
  view,
  onClose,
}: {
  views: TimelineView[];
  view: TimelineView;
  onClose: () => void;
}) {
  const { setState, toast } = useCoach();
  const [name, setName] = useState(view.name);
  const [columns, setColumns] = useState<string[]>(
    view.columns.filter((id) => COL_MAP.has(id)),
  );
  const [compareOn, setCompareOn] = useState(view.compare === true);
  const save = (list: TimelineView[]) =>
    setState((s) => ({ ...s, timelineViews: list }));
  const remove = (id: string) =>
    setColumns((current) => current.filter((c) => c !== id));
  const add = (id: string) =>
    setColumns((current) =>
      current.includes(id) ? current : [...current, id],
    );
  const defaultView = BUILTIN_VIEWS.find((v) => v.id === view.id);
  const grouped = GROUP_ORDER.map((category) => ({
    category,
    cols: COLS.filter(
      (col) => col.group === category && !columns.includes(col.id),
    ),
  })).filter((group) => group.cols.length > 0);
  return (
    <Dialog title="Customize view" onClose={onClose} wide>
      <div className="apt-customize">
        <div className="apt-cz-top">
          {!view.builtIn ? (
            <Input
              label="View name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          ) : (
            <span className="apt-sub">{view.name} is a built-in view.</span>
          )}
          <Checkbox
            label="Compare with logged"
            checked={compareOn}
            onCheckedChange={setCompareOn}
          />
          {defaultView && (
            <Button
              variant="ghost"
              onClick={() => setColumns([...defaultView.columns])}
            >
              Reset to default
            </Button>
          )}
        </div>
        <div className="apt-cz-panes">
          <div className="apt-cz-pane">
            <h4 className="apt-block-h">Shown columns</h4>
            <Reorder.Group
              axis="y"
              values={columns}
              onReorder={setColumns}
              className="apt-cz-list"
            >
              {columns.map((id) => {
                const col = COL_MAP.get(id);
                if (!col) return null;
                return (
                  <ReorderItem
                    key={id}
                    id={id}
                    label={col.catalogLabel ?? col.label}
                    onRemove={() => remove(id)}
                  />
                );
              })}
            </Reorder.Group>
            {!columns.length && (
              <p className="apt-sub">Add columns from the list on the right.</p>
            )}
          </div>
          <div className="apt-cz-pane">
            <h4 className="apt-block-h">Available columns</h4>
            {grouped.map((group) => (
              <div className="apt-cz-cat" key={group.category}>
                <h5 className="apt-cz-cat-h">{group.category}</h5>
                <div className="apt-cz-avail">
                  {group.cols.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      className="apt-cz-add"
                      onClick={() => add(col.id)}
                    >
                      <Plus size={12} aria-hidden="true" />{" "}
                      {col.catalogLabel ?? col.label}
                      {col.hint && <small>{col.hint}</small>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!grouped.length && (
              <p className="apt-sub">All columns are shown.</p>
            )}
          </div>
        </div>
        <div className="apt-customize-actions">
          {!view.builtIn && (
            <Button
              variant="ghost"
              onClick={() => {
                save(views.filter((v) => v.id !== view.id));
                toast("View deleted");
                onClose();
              }}
            >
              <Trash2 size={14} aria-hidden="true" /> Delete view
            </Button>
          )}
          <Button
            primary
            disabled={!columns.length}
            onClick={() => {
              save(
                views.map((v) =>
                  v.id === view.id
                    ? {
                        ...v,
                        name: v.builtIn ? v.name : name,
                        columns,
                        compare: compareOn || undefined,
                      }
                    : v,
                ),
              );
              toast("View saved");
              onClose();
            }}
          >
            Save view
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ReorderItem({
  id,
  label,
  onRemove,
}: {
  id: string;
  label: string;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className="apt-cz-item"
    >
      <button
        type="button"
        className="apt-cz-grip"
        aria-label={`Drag to reorder ${label}`}
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <span className="apt-cz-item-label">{label}</span>
      <IconButton
        label={`Remove ${label}`}
        className="apt-cz-remove"
        onClick={onRemove}
      >
        <X size={13} />
      </IconButton>
    </Reorder.Item>
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
        <div className="apt-customize-actions">
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
