import {
  defaultDecimals,
  defaultSummary,
} from "../client-tracker-preview/preview-model";
import {
  ALL_PARAMETERS,
  type CoachClient,
  type CoachState,
  type FieldConfig,
  type Parameter,
} from "../model";

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
export type Group = { id: string; label: string; cols: Col[] };

export const GROUPS: [string, string[]][] = [
  ["Body", ["Weight basics"]],
  ["Health", ["Health readings"]],
  ["Cycle", ["Cycle tracking"]],
  [
    "Nutrition",
    [
      "Nutrition",
      "Fluids",
      "Salt & sodium",
      "Caffeine & alcohol",
      "Fruit & vegetables",
      "Hunger & appetite",
      "Digestion",
    ],
  ],
  [
    "Recovery",
    [
      "Sleep",
      "Energy and readiness",
      "Stress, mood and focus",
      "Soreness & discomfort",
      "Recovery context note",
    ],
  ],
  ["Training", ["How training feels"]],
  ["Activity", ["Movement and cardio", "Activity context note"]],
  ["Notes", ["Day context", "Notes"]],
];
const groupOf = (parameterGroup: string) =>
  GROUPS.find(([, sources]) => sources.includes(parameterGroup))?.[0] ??
  "Notes";

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

/** Template tracker fields: snapshot order, live template settings win. */
export function trackerFields(
  state: CoachState,
  client: CoachClient,
): FieldConfig[] {
  const assignment = client.assignment;
  if (!assignment) return [];
  const live = state.templates
    .find((template) => template.id === assignment.templateId)
    ?.variants.find((variant) => variant.id === assignment.variantId);
  const snapshot =
    assignment.snapshot.variants.find((v) => v.id === assignment.variantId) ??
    assignment.snapshot.variants[0];
  const liveById = new Map((live?.fields ?? []).map((f) => [f.id, f]));
  const out = (snapshot?.fields ?? []).map((f) => ({
    ...f,
    ...liveById.get(f.id),
  }));
  for (const field of live?.fields ?? [])
    if (!out.some((f) => f.id === field.id)) out.push(field);
  return out;
}

export function buildGroups(state: CoachState, client: CoachClient): Group[] {
  const byGroup = new Map<string, Col[]>();
  for (const field of trackerFields(state, client)) {
    const parameter = ALL_PARAMETERS.find((p) => p.id === field.id);
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
  return GROUPS.map(([id]) => ({
    id,
    label: id,
    cols: byGroup.get(id) ?? [],
  })).filter((group) => group.cols.length > 0);
}
