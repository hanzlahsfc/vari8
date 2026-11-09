import {
  defaultDecimals,
  defaultSummary,
} from "../client-tracker-preview/preview-model";
import {
  allParameters,
  type CoachClient,
  type FieldConfig,
  type Parameter,
  type TrackerLayout,
} from "../model";
import { assignedVariant } from "../template-setup";
import {
  AUTO_TRACKER_GROUPS as GROUPS,
  autoTrackerGroup as groupOf,
} from "./tracker-layout";

export type Summary = "avg" | "sum" | "count" | "none";
export type Kind =
  | "num"
  | "rating"
  | "text"
  | "short"
  | "flow"
  | "day"
  | "plan"
  | "session"
  | "coach";
export type Col = {
  key: string;
  label: string;
  unit: string;
  kind: Kind;
  /** Underlying template field type (e.g. "multi-choice"); derived cols omit it. */
  type?: string;
  decimals: number;
  summary: Summary;
  /** Rating scale maximum (5 or 10). */
  max: number;
  lowerBetter: boolean;
  countWord?: [string, string];
};
export type Group = {
  id: string;
  label: string;
  cols: Col[];
  /** Initial layout state from the client's configured tracker layout. */
  collapsed?: boolean;
  pinned?: boolean;
};

const RATING_UNITS = new Set(["1–10", "1–5", "Word labels"]);
const LOWER_BETTER = new Set([
  "stress",
  "hunger",
  "muscle-soreness",
  "pain-discomfort",
  "fatigue",
  "cramps",
  "bloating",
  "nausea",
  "abdominal-discomfort",
]);
const SHORT_LABEL: Record<string, string> = {
  weight: "Weight",
  time: "Weigh-in",
  waist: "Waist",
  calories: "kcal",
  protein: "P",
  carbs: "C",
  fat: "F",
  water: "Water",
  "salt-intake": "Salt",
  "sodium-intake": "Sodium",
  "caffeine-intake": "Caffeine",
  "alcohol-intake": "Alcohol",
  hunger: "Hunger",
  bloating: "Bloating",
  sleep: "Sleep",
  "sleep-quality": "Quality",
  energy: "Energy",
  stress: "Stress",
  "muscle-soreness": "DOMS",
  rhr: "RHR",
  fbg: "Glucose",
  bp: "BP",
  hrv: "HRV",
  "bleeding-level": "Flow",
  cramps: "Cramps",
  "pms-symptoms": "Symptoms",
  "energy-in-gym": "Energy",
  "mood-in-gym": "Mood",
  "desire-to-train": "Drive",
  steps: "Steps",
  "cardio-duration": "Cardio",
  "active-minutes": "Active",
  "daily-note": "Client",
};
const UNIT_LABEL: Record<string, string> = { minutes: "min", hours: "h" };
const TEXT_TYPES = new Set(["text", "context", "multi-choice"]);
const SHORT_TYPES = new Set(["time", "blood-pressure", "choice"]);
const SKIP_TYPES = new Set(["period-start", "location-rating-map"]);

export function colFor(field: FieldConfig, parameter: Parameter): Col {
  const type = parameter.inputType ?? "";
  const rating =
    parameter.units.some((unit) => RATING_UNITS.has(unit)) ||
    type === "location-rating";
  const kind: Kind =
    parameter.id === "bleeding-level"
      ? "flow"
      : TEXT_TYPES.has(type)
        ? "text"
        : SHORT_TYPES.has(type)
          ? "short"
          : rating
            ? "rating"
            : "num";
  const unit =
    kind === "num" ? (UNIT_LABEL[field.unit] ?? field.unit ?? "") : "";
  return {
    key: parameter.id,
    type: parameter.inputType,
    label: SHORT_LABEL[parameter.id] ?? parameter.name,
    unit: unit === "steps" || unit === "count" ? "" : unit,
    kind,
    decimals:
      kind === "num" ? (field.decimals ?? defaultDecimals(parameter)) : 0,
    summary:
      field.summary ??
      (parameter.id === "bleeding-level" ? "count" : defaultSummary(parameter)),
    max: field.unit === "1–5" ? 5 : 10,
    lowerBetter: LOWER_BETTER.has(parameter.id),
    countWord:
      parameter.id === "daily-note"
        ? ["note", "notes"]
        : kind === "flow"
          ? ["day", "days"]
          : kind === "text"
            ? ["day", "days"]
            : undefined,
  };
}

/**
 * Tracker fields for an assigned client: the assignment snapshot is the single
 * source of truth. Live library template edits never flow into an assigned
 * client.
 */
export function trackerFields(client: CoachClient): FieldConfig[] {
  return assignedVariant(client)?.fields ?? [];
}

/** Place the derived plan/session/coach columns into a layout group. */
function withDerived(
  layout: TrackerLayout,
  byGroup: Map<string, Col[]>,
): Group[] {
  const autoCols = new Map<string, Col>();
  for (const cols of byGroup.values())
    for (const col of cols) autoCols.set(col.key, col);
  const leading = new Map<string, string[]>([
    ["Nutrition", ["@day", "@plan"]],
    ["Training", ["@session"]],
  ]);
  const trailing = new Map<string, string[]>([["Notes", ["@coach"]]]);
  const placed = new Set<string>();
  const take = (keys: readonly string[]) => {
    const out: Col[] = [];
    for (const key of keys) {
      const col = autoCols.get(key);
      if (!col || placed.has(key)) continue;
      placed.add(key);
      out.push(col);
    }
    return out;
  };
  const groups: Group[] = layout.groups.map((group) => ({
    id: group.id,
    label: group.label,
    collapsed: group.collapsed,
    pinned: group.pinned,
    cols: [
      ...take(leading.get(group.id) ?? []),
      ...take(group.fieldIds),
      ...take(trailing.get(group.id) ?? []),
    ],
  }));
  // A derived column whose automatic group was removed keeps its place.
  for (const [id, keys] of leading) {
    const remaining = keys.filter(
      (key) => autoCols.has(key) && !placed.has(key),
    );
    if (!remaining.length) continue;
    const group = groups.find((candidate) => candidate.id === id) ?? {
      id,
      label: id,
      cols: [],
    };
    if (!groups.includes(group)) groups.push(group);
    group.cols = [...take(remaining), ...group.cols];
  }
  for (const [id, keys] of trailing) {
    const remaining = keys.filter(
      (key) => autoCols.has(key) && !placed.has(key),
    );
    if (!remaining.length) continue;
    const group = groups.find((candidate) => candidate.id === id) ?? {
      id,
      label: id,
      cols: [],
    };
    if (!groups.includes(group)) groups.push(group);
    group.cols = [...group.cols, ...take(remaining)];
  }
  return groups.filter((group) => group.cols.length > 0);
}

export function buildGroups(client: CoachClient): Group[] {
  const setup = assignedVariant(client);
  if (!setup) return [];
  const byGroup = new Map<string, Col[]>();
  for (const field of setup.fields) {
    const parameter = allParameters().find((p) => p.id === field.id);
    if (!parameter || SKIP_TYPES.has(parameter.inputType ?? "")) continue;
    if (parameter.id === "cycle-day") continue;
    const group = groupOf(parameter.group);
    byGroup.set(group, [
      ...(byGroup.get(group) ?? []),
      colFor(field, parameter),
    ]);
  }
  const plans = client.plans;
  const hasNutrition =
    !!plans &&
    !!(
      plans.nutrition.mealPlan.active ||
      plans.nutrition.mealPlan.history.length ||
      plans.nutrition.iifym.active ||
      plans.nutrition.iifym.history.length
    );
  const hasTraining =
    !!plans && !!(plans.training.active || plans.training.history.length);
  const derived = (key: string, label: string, kind: Kind): Col => ({
    key,
    label,
    unit: "",
    kind,
    decimals: 0,
    summary: kind === "day" ? "none" : "count",
    max: 10,
    lowerBetter: false,
    countWord:
      kind === "session"
        ? ["session", "sessions"]
        : kind === "coach"
          ? ["note", "notes"]
          : ["day", "days"],
  });
  if (hasNutrition)
    byGroup.set("Nutrition", [
      derived("@day", "Day", "day"),
      derived("@plan", "Plan", "plan"),
      ...(byGroup.get("Nutrition") ?? []),
    ]);
  if (hasTraining)
    byGroup.set("Training", [
      derived("@session", "Session", "session"),
      ...(byGroup.get("Training") ?? []),
    ]);
  byGroup.set("Notes", [
    ...(byGroup.get("Notes") ?? []),
    derived("@coach", "Coach", "coach"),
  ]);
  if (setup.trackerLayout) return withDerived(setup.trackerLayout, byGroup);
  return GROUPS.map(([id]) => ({
    id,
    label: id,
    cols: byGroup.get(id) ?? [],
  })).filter((group) => group.cols.length > 0);
}
