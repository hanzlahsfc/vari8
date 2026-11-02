import type { TrackerEntry } from "../ethereal/client-tracker/model";
import {
  createInitialClients,
  type WorkspaceClient,
} from "../ethereal/clients/model";
import {
  type AthleteOverviewSetting,
  isAthleteOverviewSetting,
} from "./athlete/overview-widgets";
import { isTimelineEvent, type TimelineEvent } from "./athlete/timeline";
import { adoptAthleteDataDemo } from "./athlete-data-demo";
import { adoptAthleteProfileDemo } from "./athlete-profile-demo";
import {
  createDashboardDraft,
  type DashboardDraft,
  isValidDashboardDraft,
} from "./builder/schema";
import { adoptClientAppDemo } from "./client-app-demo";
import { isClientPlans, plansOwnedBy, planTargets } from "./plans/domain";
import { type ClientPhase, isClientPhase } from "./plans/phase-planning";
import { adoptAmaraTrainingExample } from "./plans/training/amara-example";
import type {
  TrainingOptionKey,
  TrainingOptions,
} from "./plans/training-options";
import type {
  ClientPlans,
  ExerciseDefinition,
  LogField,
  TrainingSessionLog,
} from "./plans/types";
import {
  type ActivityMetric,
  formatActivityTarget,
  localToday,
  resolveActivityTarget,
} from "./targets/model";
import { adoptTrainingLogDemo } from "./training-log-demo";

export const STORAGE_KEY = "coach-desktop-mockup-v1";
export const TODAY = "2026-10-13";
export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const CORE_VIEWS = [
  "Dashboard",
  "Tracker",
  "Timeline / Roadmap",
  "Nutrition",
  "Training Program",
  "Check-In",
];
export type Section =
  | "clients"
  | "templates"
  | "check-ins"
  | "messages"
  | "notes";
export type Route = {
  section: Section;
  client?: string;
  editor?: string;
  review?: string;
  plan?: string;
  module?: string;
  tab?: string;
};
export type Parameter = {
  id: string;
  name: string;
  group: string;
  units: string[];
  sample: number | string;
  calculations: string[];
  inputType?:
    | "time"
    | "blood-pressure"
    | "text"
    | "choice"
    | "multi-choice"
    | "location-rating"
    | "context"
    | "period-start"
    | "cycle-day";
  options?: string[];
};
const avgTrend = ["Weekly average", "Trend"];
const ratingUnits = ["1–10", "1–5", "Word labels"];
const parameter = (
  id: string,
  name: string,
  group: string,
  units: string[],
  sample: number | string,
  calculations: string[] = [],
  inputType?: Parameter["inputType"],
  options?: string[],
): Parameter => ({
  id,
  name,
  group,
  units,
  sample,
  calculations,
  inputType,
  options,
});

// This is the coach-facing tracker catalog. Its group order is also the display order.
export const PARAMETERS: Parameter[] = [
  parameter("weight", "Bodyweight", "Weight basics", ["kg", "lb"], 64.2, [
    ...avgTrend,
    "Target vs actual",
  ]),
  parameter(
    "time",
    "Weigh-in time",
    "Weight basics",
    ["24-hour", "12-hour"],
    "07:15",
    [],
    "time",
  ),
  parameter(
    "waist",
    "Waist circumference",
    "Weight basics",
    ["cm", "in"],
    71,
    avgTrend,
  ),
  parameter("calories", "Energy intake", "Nutrition", ["kcal", "kJ"], 2180, [
    "Weekly average",
    "Trend",
    "Target vs actual",
    "Adherence",
  ]),
  parameter("protein", "Protein intake", "Nutrition", ["g"], 140, [
    "Weekly average",
    "Target vs actual",
    "Adherence",
  ]),
  parameter("carbs", "Carbohydrate intake", "Nutrition", ["g"], 220, [
    "Weekly average",
    "Target vs actual",
    "Adherence",
  ]),
  parameter("fat", "Fat intake", "Nutrition", ["g"], 60, [
    "Weekly average",
    "Target vs actual",
    "Adherence",
  ]),
  parameter("water", "Water intake", "Fluids", ["L", "fl oz"], 2.2, avgTrend),
  parameter(
    "other-fluid-intake",
    "Other fluid intake",
    "Fluids",
    ["L", "fl oz"],
    0.5,
    avgTrend,
  ),
  parameter(
    "sodium-intake",
    "Sodium intake",
    "Salt & sodium",
    ["mg", "g"],
    2200,
    avgTrend,
  ),
  parameter(
    "salt-intake",
    "Salt intake",
    "Salt & sodium",
    ["g"],
    5.5,
    avgTrend,
  ),
  parameter(
    "caffeine-intake",
    "Caffeine intake",
    "Caffeine & alcohol",
    ["mg"],
    120,
    avgTrend,
  ),
  parameter(
    "alcohol-intake",
    "Alcohol intake",
    "Caffeine & alcohol",
    ["units"],
    0,
    avgTrend,
  ),
  parameter(
    "fruit-servings",
    "Fruit servings",
    "Fruit & vegetables",
    ["servings"],
    2,
    avgTrend,
  ),
  parameter(
    "vegetable-servings",
    "Vegetable servings",
    "Fruit & vegetables",
    ["servings"],
    3,
    avgTrend,
  ),
  parameter("hunger", "Hunger", "Hunger & appetite", ratingUnits, 5, avgTrend),
  parameter(
    "fullness",
    "Fullness",
    "Hunger & appetite",
    ratingUnits,
    6,
    avgTrend,
  ),
  parameter(
    "appetite",
    "Appetite",
    "Hunger & appetite",
    ratingUnits,
    5,
    avgTrend,
  ),
  parameter(
    "cravings",
    "Cravings",
    "Hunger & appetite",
    ratingUnits,
    3,
    avgTrend,
  ),
  parameter("sleep", "Sleep duration", "Sleep", ["hours"], 7.6, [
    ...avgTrend,
    "Target vs actual",
  ]),
  parameter(
    "sleep-quality",
    "Sleep quality",
    "Sleep",
    ratingUnits,
    7,
    avgTrend,
  ),
  parameter("bedtime", "Bedtime", "Sleep", ["time"], "22:30", [], "time"),
  parameter("wake-time", "Wake time", "Sleep", ["time"], "06:15", [], "time"),
  parameter(
    "night-awakenings",
    "Night awakenings",
    "Sleep",
    ["count"],
    1,
    avgTrend,
  ),
  parameter("nap-duration", "Nap duration", "Sleep", ["minutes"], 0, avgTrend),
  parameter(
    "energy",
    "Energy outside gym",
    "Energy and readiness",
    ratingUnits,
    8,
    avgTrend,
  ),
  parameter(
    "general-motivation",
    "General motivation",
    "Energy and readiness",
    ratingUnits,
    7,
    avgTrend,
  ),
  parameter(
    "perceived-readiness",
    "Perceived readiness",
    "Energy and readiness",
    ratingUnits,
    7,
    avgTrend,
  ),
  parameter(
    "fatigue",
    "Fatigue",
    "Energy and readiness",
    ratingUnits,
    3,
    avgTrend,
  ),
  parameter(
    "feeling-rested",
    "Feeling rested",
    "Energy and readiness",
    ratingUnits,
    7,
    avgTrend,
  ),
  parameter(
    "stress",
    "Stress",
    "Stress, mood and focus",
    ratingUnits,
    3,
    avgTrend,
  ),
  parameter(
    "mood-outside-training",
    "Mood outside training",
    "Stress, mood and focus",
    ratingUnits,
    7,
    avgTrend,
  ),
  parameter(
    "focus",
    "Focus",
    "Stress, mood and focus",
    ratingUnits,
    7,
    avgTrend,
  ),
  parameter(
    "muscle-soreness",
    "Muscle soreness / DOMS",
    "Soreness & discomfort",
    ["rating"],
    3,
    [],
    "location-rating",
  ),
  parameter(
    "pain-discomfort",
    "Pain or discomfort severity",
    "Soreness & discomfort",
    ["rating"],
    0,
    [],
    "location-rating",
  ),
  parameter(
    "recovery-context-note",
    "Recovery context note",
    "Recovery context note",
    [],
    "",
    [],
    "text",
  ),
  parameter("steps", "Step count", "Movement and cardio", ["steps"], 8430, [
    "Weekly average",
    "Trend",
    "Target vs actual",
    "Adherence",
  ]),
  parameter(
    "active-minutes",
    "Active minutes",
    "Movement and cardio",
    ["minutes"],
    46,
    ["Weekly average", "Trend", "Target vs actual", "Adherence"],
  ),
  parameter(
    "cardio-duration",
    "Cardio duration",
    "Movement and cardio",
    ["minutes"],
    30,
    avgTrend,
  ),
  parameter(
    "cardio-type",
    "Cardio type",
    "Movement and cardio",
    ["type"],
    "Walking",
    [],
    "choice",
    ["Walking", "Running", "Cycling", "Swimming", "Other"],
  ),
  parameter(
    "cardio-sessions",
    "Cardio sessions",
    "Movement and cardio",
    ["sessions"],
    1,
    avgTrend,
  ),
  parameter(
    "activity-context-note",
    "Activity context note",
    "Activity context note",
    [],
    "",
    [],
    "text",
  ),
  parameter(
    "desire-to-train",
    "Desire to train",
    "How training feels",
    ratingUnits,
    7,
    avgTrend,
  ),
  parameter(
    "energy-in-gym",
    "Energy in the gym",
    "How training feels",
    ratingUnits,
    8,
    avgTrend,
  ),
  parameter(
    "mood-in-gym",
    "Mood in the gym",
    "How training feels",
    ratingUnits,
    7,
    avgTrend,
  ),
  parameter(
    "rhr",
    "Resting heart rate",
    "Health readings",
    ["bpm"],
    58,
    avgTrend,
  ),
  parameter(
    "bp",
    "Blood pressure",
    "Health readings",
    ["mmHg"],
    "118 / 76",
    [],
    "blood-pressure",
  ),
  parameter("hrv", "HRV", "Health readings", ["ms"], 54, avgTrend),
  parameter(
    "fbg",
    "Fasted blood glucose",
    "Health readings",
    ["mmol/L", "mg/dL"],
    4.8,
    avgTrend,
  ),
  parameter(
    "respiratory-rate",
    "Respiratory rate",
    "Health readings",
    ["breaths/min"],
    14,
    avgTrend,
  ),
  parameter(
    "oxygen-saturation",
    "Oxygen saturation",
    "Health readings",
    ["%"],
    98,
    avgTrend,
  ),
  parameter(
    "bleeding-level",
    "Bleeding level",
    "Cycle tracking",
    ["level"],
    "None",
    [],
    "choice",
    ["None", "Light", "Medium", "Heavy"],
  ),
  parameter("cramps", "Cramps", "Cycle tracking", ratingUnits, 0, avgTrend),
  parameter(
    "pms-symptoms",
    "PMS symptoms",
    "Cycle tracking",
    ["symptoms"],
    "",
    [],
    "multi-choice",
    [
      "Tender breasts",
      "Headache",
      "Bloating",
      "Acne",
      "Mood changes",
      "Fatigue",
      "Other",
    ],
  ),
  parameter(
    "basal-body-temperature",
    "Basal body temperature",
    "Cycle tracking",
    ["°C", "°F"],
    36.6,
    avgTrend,
  ),
  parameter(
    "period-start",
    "Mark period start",
    "Cycle tracking",
    ["date"],
    "",
    [],
    "period-start",
  ),
  parameter(
    "cycle-day",
    "Cycle day",
    "Cycle tracking",
    ["day"],
    "Calculated automatically",
    [],
    "cycle-day",
  ),
  parameter(
    "bowel-movements",
    "Bowel movements",
    "Digestion",
    ["count"],
    1,
    avgTrend,
  ),
  parameter("bloating", "Bloating", "Digestion", ratingUnits, 1, avgTrend),
  parameter("nausea", "Nausea", "Digestion", ratingUnits, 0, avgTrend),
  parameter(
    "abdominal-discomfort",
    "Abdominal discomfort",
    "Digestion",
    ratingUnits,
    0,
    avgTrend,
  ),
  parameter(
    "work-duration",
    "Work duration",
    "Day context",
    ["hours"],
    8,
    avgTrend,
  ),
  parameter(
    "work-shift-type",
    "Work shift type",
    "Day context",
    ["shift"],
    "Day",
    [],
    "choice",
    ["Day", "Night", "Other"],
  ),
  parameter(
    "travel-day",
    "Travel day",
    "Day context",
    ["yes/no"],
    "No",
    [],
    "context",
    ["No", "Yes"],
  ),
  parameter(
    "illness",
    "Illness",
    "Day context",
    ["yes/no"],
    "No",
    [],
    "context",
    ["No", "Yes"],
  ),
  parameter("daily-note", "Client daily note", "Notes", [], "", [], "text"),
];

// Keep the legacy extension point for saved templates; nutrition fields are now selectable.
export const LEGACY_PARAMETERS: Parameter[] = [];
export const ALL_PARAMETERS = [...PARAMETERS, ...LEGACY_PARAMETERS];
export const getParameter = (id: string) =>
  ALL_PARAMETERS.find((item) => item.id === id);
export const TRAINING_FIELDS = [
  "Sets",
  "Fixed reps",
  "Rep ranges",
  "Tempo",
  "Set type",
  "Rest / pause",
  "Detailed instructions",
  "Progression notes",
];
export type FieldConfig = {
  id: string;
  unit: string;
  options?: string[];
  decimals?: 0 | 1 | 2;
  summary?: "avg" | "sum" | "count" | "none";
};
export type Widget = {
  id: string;
  name: string;
  category: string;
  source: string;
  summary: string;
  size: "small" | "wide" | "large";
};
export type Question = {
  id: string;
  label: string;
  type:
    | "Short text"
    | "Long text"
    | "Numeric"
    | "Rating"
    | "Choice"
    | "Visual upload";
  required: boolean;
  options: string;
};
export type Variant = {
  id: string;
  name: string;
  nutrition: "Meal plan" | "IIFYM";
  cycleTrackingEnabled?: boolean;
  /** Ordered daily overview metrics; undefined retains existing summary defaults. */
  trackerHighlights?: string[];
  views: string[];
  habits: boolean;
  widgets: Widget[];
  dashboard?: DashboardDraft;
  /** Athlete profile overview layout (widget order + visibility). */
  athleteOverview?: AthleteOverviewSetting;
  fields: FieldConfig[];
  roadmap: { source: string; calculation: string; comparison: boolean }[];
  roadmapPhases?: boolean;
  phaseOptions?: string[];
  /** Coach-selected activity planning columns for the weekly timeline. */
  roadmapActivityTargets?: ActivityMetric[];
  training: {
    options?: TrainingOptions;
    defaults?: Record<TrainingOptionKey, string>;
    fields: string[];
    logFields?: LogField[];
    loadUnit?: "kg" | "lb";
    volume: boolean;
    breakdown: string;
    presentation: string;
  };
  questions: Question[];
  summaries: string[];
};
export type Template = {
  id: string;
  name: string;
  description: string;
  updated: string;
  defaultVariant: string;
  variants: Variant[];
  legacyConfigurations?: Variant[];
};
export type Assignment = {
  templateId: string;
  variantId: string;
  snapshot: Template;
};
export type Schedule = { effective: string; weekdays: number[] };
export type Extra = {
  id: string;
  clientId: string;
  date: string;
  type: "Full" | "Custom";
  note: string;
};
export type Plan = {
  calories: number;
  protein: number;
  sets: number;
  instructions: string;
  nutritionVariant: "Training day" | "Rest day";
  program: "Evergreen" | "Week-based";
  weeks: number;
};
export type CoachClient = WorkspaceClient & {
  assignment?: Assignment;
  phases?: ClientPhase[];
  contestDate?: string;
  timelineEvents?: TimelineEvent[];
  /** Persisted client tracker log; falls back to `entries` when absent. */
  tracking?: { entries: TrackerEntry[]; text: Record<string, string> };
  /** Coach notes per timeline week, keyed by the week's Monday ISO date. */
  weekNotes?: Record<string, string>;
  schedules: Schedule[];
  plan: Plan;
  plans?: ClientPlans;
  retiredHabits?: CoachClient["habits"];
  entries: {
    date: string;
    weight: number;
    sleep: number;
    steps: number;
    calories: number;
  }[];
  habits: {
    id: string;
    name: string;
    frequency: string | HabitFrequency;
    goal: string;
    reason: string;
    completed: number;
  }[];
  habitLog?: Record<string, string[]>;
};
export type HabitFrequency =
  | { kind: "daily" }
  | { kind: "per-week"; count: number }
  | { kind: "every-n-days"; n: number }
  | { kind: "weekdays"; days: number[] };
export type Media = {
  id: string;
  name: string;
  type: string;
  size: number;
  demo?: "voice" | "video";
  /** PR-MEDIA: set once the bytes are stored via /api/v1/media. */
  mediaObjectId?: string;
};
export type Message = {
  id: string;
  clientId: string;
  text: string;
  from: "client" | "coach";
  date: string;
  read: boolean;
  priority: boolean;
  attachments: Media[];
  link?: { label: string; route: Route };
  links?: { label: string; route: Route }[];
  local?: boolean;
};
export type Submission = {
  id: string;
  clientId: string;
  date: string;
  eventId: string;
  type: "Full" | "Custom";
  answers: { question: string; answer: string }[];
  metrics: string[];
  visuals: string[];
  photos?: { pose: string; src: string }[];
  note: string;
  flags: { exercise: string; set: number; date: string; text: string }[];
  response?: { text: string; video?: Media; changes: string[]; date: string };
};
export type ReviewDraft = {
  text: string;
  video?: Media;
  activations?: {
    kind: "nutrition" | "training";
    versionId: string;
    name: string;
    startDate: string;
  }[];
  changes: {
    field: keyof Plan;
    before: string | number;
    after: string | number;
  }[];
};
export type CoachState = {
  version: 1;
  demoSeeds?: {
    amaraTraining?: 1;
    clientAppDemo?: 1;
    trainingLogDemo?: 1;
    athleteProfileDemo?: 1;
    athleteDataDemo?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  };
  exerciseLibrary?: ExerciseDefinition[];
  coachNotes?: { id: string; text: string }[];
  coachTodos?: {
    id: string;
    title: string;
    complete: boolean;
    deadline?: string;
    reminderAt?: string;
    notes?: string;
    priority?: "low" | "normal" | "high";
    clientId?: string;
  }[];
  templates: Template[];
  clients: CoachClient[];
  extras: Extra[];
  submissions: Submission[];
  trainingLogs?: TrainingSessionLog[];
  /** Coach-wide timeline-tab views (column lists); built-ins are
   *  reorderable but not deletable. */
  timelineViews?: {
    id: string;
    name: string;
    columns: string[];
    builtIn?: boolean;
    compare?: boolean;
  }[];
  /** Coach-wide week ordering on the timeline tab. */
  timelineOrder?: "newest" | "oldest";
  messages: Message[];
  drafts: Record<
    string,
    { text: string; attachments: Media[]; link?: Message["link"] }
  >;
  reviewDrafts: Record<string, ReviewDraft>;
  editorDrafts: Record<string, Template>;
  preferences: {
    mode: "dark" | "light";
    accent: string;
    availability: string;
    notifications: boolean;
    priorityNotifications: boolean;
    logo?: { name: string; dataUrl: string };
    sidebarCollapsed?: boolean;
  };
};
export type Event = {
  id: string;
  clientId: string;
  date: string;
  origin: "Recurring" | "Additional";
  type: "Full" | "Custom";
  status: "Scheduled" | "Overdue" | "Awaiting feedback" | "Feedback sent";
  submission?: Submission;
  extra?: Extra;
};
export function clone<T>(value: T): T {
  return structuredClone(value);
}
export function uid(prefix = "id") {
  return `${prefix}-${crypto.randomUUID()}`;
}
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monday(date: string) {
  return addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
}
export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Vienna",
    ...options,
  }).format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date));
}
export function sampleValue(field: FieldConfig, client?: CoachClient) {
  const p = getParameter(field.id);
  let v = p?.sample ?? "—";
  if (client && field.id === "weight") v = client.entries.at(-1)?.weight ?? v;
  if (typeof v === "number") {
    if (field.unit === "lb") v = +(v * 2.20462).toFixed(1);
    if (field.unit === "in") v = +(v / 2.54).toFixed(1);
    if (field.unit === "mg/dL") v = +(v * 18).toFixed(0);
    if (field.unit === "kJ") v = Math.round(v * 4.184);
    if (field.unit === "1–5") v = Math.ceil(v / 2);
  }
  if (field.unit === "Word labels")
    return field.id === "stress" ? "Low" : "Good";
  if (field.unit === "12-hour") return "7:15 am";
  return `${v}${["1–10", "1–5"].includes(field.unit) ? ` / ${field.unit.slice(2)}` : ` ${field.unit === "24-hour" ? "" : field.unit}`}`;
}
const ACTIVITY_SUMMARY_METRICS: Record<string, ActivityMetric> = {
  steps: "steps",
  "cardio-duration": "cardio",
  "cardio-sessions": "cardio",
};
export function summaryPreview(
  field: FieldConfig,
  calculation: string,
  client?: CoachClient,
  options?: { asOf?: string },
) {
  const parameter = getParameter(field.id);
  if (parameter?.inputType || typeof parameter?.sample !== "number") {
    return {
      value: String(parameter?.sample ?? "—"),
      target: "No target defined",
      count: 0,
    };
  }
  const base = typeof parameter?.sample === "number" ? parameter.sample : 0;
  const clientKey = field.id as "weight" | "sleep" | "steps" | "calories";
  const values =
    client && ["weight", "sleep", "steps", "calories"].includes(field.id)
      ? client.entries.map((e) => e[clientKey])
      : client
        ? []
        : Array.from(
            { length: 7 },
            (_, i) =>
              base +
              (field.id === "weight"
                ? (6 - i) * 0.08
                : field.id === "steps"
                  ? (i - 3) * 170
                  : field.id === "calories"
                    ? (i - 3) * 12
                    : 0),
          );
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const nutrition = client ? planTargets(client, TODAY) : undefined;
  const activityMetric = ACTIVITY_SUMMARY_METRICS[field.id];
  const activityVersions =
    client && activityMetric
      ? (client.plans?.activityTargets ?? []).filter(
          (version) => version.metric === activityMetric,
        )
      : [];
  const structured = activityVersions.length > 0;
  const target = structured
    ? undefined
    : client
      ? field.id === "calories" || field.id === "protein"
        ? nutrition?.[field.id]
        : client.plans?.goals.filter((goal) => goal.fieldId === field.id).at(-1)
            ?.value
      : (
          {
            weight: 64,
            steps: 8000,
            calories: 2200,
            protein: 140,
            sleep: 8,
          } as Record<string, number>
        )[field.id];
  const convert = (value: number) =>
    field.unit === "lb"
      ? value * 2.20462
      : field.unit === "in"
        ? value / 2.54
        : field.unit === "mg/dL"
          ? value * 18
          : field.unit === "kJ"
            ? value * 4.184
            : field.unit === "1–5"
              ? value / 2
              : value;
  const format = (value: number) =>
    `${Number(convert(value).toFixed(["steps", "calories", "protein"].includes(field.id) ? 0 : 1))} ${field.unit}`;
  const value = !values.length
    ? "Not recorded"
    : calculation === "Adherence" && structured
      ? "—"
      : calculation === "Adherence"
        ? `${Math.round((values.filter((v) => target !== undefined && v >= target).length / (values.length || 1)) * 100)}%`
        : calculation === "Trend"
          ? format((values.at(-1) ?? 0) - (values[0] ?? 0))
          : format(mean);
  return {
    value,
    target:
      structured && client && activityMetric
        ? formatActivityTarget(
            resolveActivityTarget({
              versions: client.plans?.activityTargets ?? [],
              metric: activityMetric,
              date: options?.asOf ?? localToday(),
            }),
          )
        : target === undefined
          ? "No target defined"
          : format(target),
    count: values.length,
  };
}
export function newVariant(id = "meal-plan", name = "Meal plan"): Variant {
  return {
    id,
    name,
    nutrition: "Meal plan",
    cycleTrackingEnabled: false,
    views: [...CORE_VIEWS],
    habits: true,
    dashboard: createDashboardDraft(),
    widgets: [
      {
        id: "w-weight",
        name: "Weight trend",
        category: "Lifestyle",
        source: "weight",
        summary: "Weekly average",
        size: "wide",
      },
      {
        id: "w-nutrition",
        name: "Daily nutrition",
        category: "Nutrition",
        source: "calories",
        summary: "Target vs actual",
        size: "small",
      },
      {
        id: "w-training",
        name: "Training week",
        category: "Training",
        source: "sessions",
        summary: "Completed sessions",
        size: "small",
      },
      {
        id: "w-sleep",
        name: "Recovery",
        category: "Lifestyle",
        source: "sleep",
        summary: "Weekly average",
        size: "small",
      },
    ],
    fields: [
      "weight",
      "time",
      "sleep",
      "energy",
      "steps",
      "calories",
      "protein",
    ].map((id) => ({
      id,
      unit: getParameter(id)?.units[0] ?? "",
    })),
    roadmap: [
      { source: "weight", calculation: "Weekly average", comparison: false },
      { source: "calories", calculation: "Target vs actual", comparison: true },
      { source: "sleep", calculation: "Weekly average", comparison: false },
    ],
    roadmapPhases: true,
    phaseOptions: ["Fat loss", "Maintenance", "Muscle gain", "Recovery"],
    training: {
      fields: [...TRAINING_FIELDS],
      volume: true,
      breakdown: "Muscle groups / week",
      presentation: "Table",
    },
    questions: [
      {
        id: "q-energy",
        label: "How did you feel this week?",
        type: "Long text",
        required: true,
        options: "",
      },
      {
        id: "q-training",
        label: "How was your training?",
        type: "Rating",
        required: true,
        options: "1–10",
      },
      {
        id: "q-note",
        label: "Anything you would like me to know?",
        type: "Long text",
        required: false,
        options: "",
      },
    ],
    summaries: ["weight", "calories", "sleep", "habits"],
  };
}
export function newTemplate(id: string): Template {
  return {
    id,
    name: "Untitled template",
    description: "",
    updated: TODAY,
    defaultVariant: "meal-plan",
    variants: [newVariant()],
  };
}
export function assignTemplate(
  state: CoachState,
  clientId: string,
  template: Template,
  variantId: string,
): CoachState {
  variantId = template.defaultVariant;
  if (
    !template.variants.some((v) => v.id === variantId) ||
    !state.clients.some((c) => c.id === clientId && !c.archived)
  )
    return state;
  return {
    ...state,
    clients: state.clients.map((c) =>
      c.id === clientId
        ? {
            ...c,
            assignment: {
              templateId: template.id,
              variantId,
              snapshot: clone(template),
            },
          }
        : c,
    ),
  };
}
export function switchVariant(
  state: CoachState,
  clientId: string,
  variantId: string,
): CoachState {
  return {
    ...state,
    clients: state.clients.map((c) =>
      c.id === clientId &&
      c.assignment?.snapshot.variants.some((v) => v.id === variantId)
        ? { ...c, assignment: { ...c.assignment, variantId } }
        : c,
    ),
  };
}
export function eventsBetween(
  state: CoachState,
  start: string,
  end: string,
): Event[] {
  const events = new Map<string, Event>();
  const put = (
    id: string,
    clientId: string,
    date: string,
    origin: Event["origin"],
    type: Event["type"],
    extra?: Extra,
  ) => {
    const submission = state.submissions.find((s) => s.eventId === id);
    events.set(id, {
      id,
      clientId,
      date,
      origin,
      type: submission?.type ?? type,
      extra,
      submission,
      status: submission?.response
        ? "Feedback sent"
        : submission
          ? "Awaiting feedback"
          : date < TODAY
            ? "Overdue"
            : "Scheduled",
    });
  };
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    for (const c of state.clients) {
      const schedule = [...c.schedules]
        .sort((a, b) => b.effective.localeCompare(a.effective))
        .find((s) => s.effective <= date);
      if (schedule?.weekdays.includes(weekday))
        put(`recurring:${c.id}:${date}`, c.id, date, "Recurring", "Full");
    }
  }
  for (const x of state.extras.filter((e) => e.date >= start && e.date <= end))
    put(x.id, x.clientId, x.date, "Additional", x.type, x);
  // Submitted history survives schedule changes; matching is by explicit event ID.
  for (const s of state.submissions.filter(
    (s) => s.date >= start && s.date <= end,
  ))
    if (!events.has(s.eventId))
      put(
        s.eventId,
        s.clientId,
        s.date,
        s.eventId.startsWith("recurring:") ? "Recurring" : "Additional",
        s.type,
      );
  return [...events.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.clientId.localeCompare(b.clientId),
  );
}
export function addExtra(state: CoachState, extra: Extra) {
  if (
    state.extras.some(
      (e) => e.clientId === extra.clientId && e.date === extra.date,
    )
  )
    return state;
  return { ...state, extras: [...state.extras, extra] };
}
export function unreadCount(state: CoachState, clientId?: string) {
  return state.messages.filter(
    (m) =>
      !m.read && m.from === "client" && (!clientId || m.clientId === clientId),
  ).length;
}
export function readConversation(
  state: CoachState,
  clientId: string,
): CoachState {
  return {
    ...state,
    messages: state.messages.map((m) =>
      m.clientId === clientId && m.from === "client" ? { ...m, read: true } : m,
    ),
  };
}
export function submitFeedback(
  state: CoachState,
  id: string,
  now: string,
): CoachState {
  const sub = state.submissions.find((s) => s.id === id);
  const draft = state.reviewDrafts[id];
  if (!sub || sub.response || !draft || (!draft.text.trim() && !draft.video))
    return state;
  const legacyChanges = draft.changes
    .filter((c) => c.before !== c.after)
    .map(
      (c) =>
        `${c.field === "calories" ? "Daily energy target" : c.field === "sets" ? "Training sets" : c.field === "protein" ? "Protein target" : c.field}: ${c.before} → ${c.after}`,
    );
  const changes = [
    ...legacyChanges,
    ...(draft.activations ?? []).map(
      (a) =>
        `${a.kind === "nutrition" ? "Nutrition" : "Training"} plan activated: ${a.name} · starts ${a.startDate}`,
    ),
  ];
  const message: Message = {
    id: `feedback:${id}`,
    clientId: sub.clientId,
    text: [draft.text.trim(), ...changes].filter(Boolean).join("\n\n"),
    from: "coach",
    date: now,
    read: true,
    priority: false,
    attachments: draft.video ? [draft.video] : [],
    local: true,
    links: draft.activations?.map((a) => ({
      label: `View ${a.kind} plan`,
      route: { section: "clients", client: sub.clientId, plan: a.kind },
    })),
    link: {
      label: changes.length
        ? "View updated client plan"
        : "View check-in feedback",
      route: changes.length
        ? {
            section: "clients",
            client: sub.clientId,
            plan:
              draft.activations?.at(-1)?.kind ??
              (draft.changes.some((c) =>
                ["calories", "protein", "nutritionVariant"].includes(c.field),
              )
                ? "nutrition"
                : "training"),
          }
        : { section: "check-ins", review: id },
    },
  };
  return {
    ...state,
    submissions: state.submissions.map((s) =>
      s.id === id
        ? {
            ...s,
            response: {
              text: draft.text,
              video: draft.video,
              changes,
              date: now,
            },
          }
        : s,
    ),
    messages: [...state.messages, message],
  };
}
export function trainingSets(week: number) {
  return week < 4 ? 3 : 4;
}
export function seedState(
  { demo = true, today = localToday() }: { demo?: boolean; today?: string } = {},
): CoachState {
  const strength = newTemplate("strength");
  strength.name = "Strength & balance";
  strength.description =
    "A complete coaching setup for sustainable strength, nutrition and everyday progress.";
  strength.updated = "2026-10-12";
  const iifym = clone(strength.variants[0]);
  iifym.id = "iifym";
  iifym.name = "IIFYM";
  iifym.nutrition = "IIFYM";
  strength.variants.push(iifym);
  const performance = clone(strength);
  performance.id = "performance";
  performance.name = "Performance foundation";
  performance.description =
    "Training-led coaching with recovery, activity and a detailed weekly review.";
  performance.updated = "2026-10-10";
  performance.variants = [newVariant("performance", "Performance")];
  performance.defaultVariant = "performance";
  const simple = newTemplate("essentials");
  simple.name = "Everyday essentials";
  simple.description =
    "A lighter starting point. The essentials, with room to make it their own.";
  simple.updated = "2026-10-08";
  simple.variants[0].habits = false;
  simple.variants[0].widgets = simple.variants[0].widgets.slice(0, 2);
  const clients: CoachClient[] = clone(createInitialClients()).map((c, i) => ({
    ...c,
    priorityMessages: i === 0 || i === 4,
    schedules: demo
      ? [{ effective: "2026-10-01", weekdays: i === 14 ? [] : [i % 7] }]
      : [],
    plan: {
      calories: 2200,
      protein: 140,
      sets: 3,
      instructions: "Controlled reps. Keep two reps in reserve.",
      nutritionVariant: "Training day",
      program: "Week-based",
      weeks: 8,
    },
    entries: Array.from({ length: 7 }, (_, d) => ({
      date: addDays("2026-10-06", d),
      weight: +((c.bodyweightKg ?? 64.2) + 0.48 - d * 0.08).toFixed(1),
      sleep: +(7.2 + d * 0.1).toFixed(1),
      steps: 7800 + d * 210,
      calories: 2140 + d * 12,
    })),
    habits: [
      {
        id: `habit-${c.id}`,
        name: "Evening walk",
        frequency: "Daily",
        goal: "20 minutes",
        reason: "Create a calm transition into the evening.",
        completed: 5,
      },
    ],
    assignment:
      i < 8
        ? {
            templateId: strength.id,
            variantId: i === 4 ? "iifym" : "meal-plan",
            snapshot: clone(strength),
          }
        : i < 13
          ? {
              templateId: performance.id,
              variantId: "performance",
              snapshot: clone(performance),
            }
          : undefined,
  }));
  const extras: Extra[] = [
    {
      id: "extra-maya",
      clientId: "client-005",
      date: "2026-10-14",
      type: "Custom",
      note: "Mid-week energy and recovery update",
    },
    {
      id: "extra-emma",
      clientId: "client-001",
      date: "2026-10-15",
      type: "Custom",
      note: "How is the knee after the adjusted session?",
    },
  ];
  const submissions: Submission[] = [
    {
      id: "submission-emma",
      clientId: "client-001",
      date: "2026-10-12",
      eventId: "recurring:client-001:2026-10-12",
      type: "Full",
      answers: [
        {
          question: "How did you feel this week?",
          answer:
            "Energy was good and the morning routine really helped. A busy Friday, but meal prep kept me on track.",
        },
        {
          question: "How was your training?",
          answer: "8 / 10 — feeling stronger",
        },
        {
          question: "Anything you would like me to know?",
          answer:
            "My left knee felt unsettled on the last split-squat set. Could we look at the setup?",
        },
      ],
      metrics: ["weight", "calories", "sleep", "habits"],
      visuals: ["Front · 12 October", "Side · 12 October"],
      note: "Kept all three sessions this week.",
      flags: [
        {
          exercise: "Bulgarian split squat",
          set: 3,
          date: "2026-10-11",
          text: "Left knee feels unsettled near the bottom. Is my stance too short?",
        },
      ],
    },
    {
      id: "submission-lily",
      clientId: "client-003",
      date: "2026-10-12",
      eventId: "extra-lily-submitted",
      type: "Custom",
      answers: [
        { question: "Bodyweight", answer: "67.0 kg" },
        { question: "Sleep", answer: "7.8 hours" },
      ],
      metrics: ["weight", "sleep"],
      visuals: [],
      note: "Just a quick update after the weekend. Feeling rested!",
      flags: [],
    },
    {
      id: "submission-oliver",
      clientId: "client-004",
      date: "2026-10-08",
      eventId: "recurring:client-004:2026-10-08",
      type: "Full",
      answers: [
        {
          question: "How did you feel?",
          answer: "A consistent week, no concerns.",
        },
      ],
      metrics: ["weight", "sleep"],
      visuals: [],
      note: "",
      flags: [],
      response: {
        text: "Keep the controlled tempo this week. Great consistency.",
        changes: [],
        date: "2026-10-09T08:30:00Z",
      },
    },
  ];
  const messages: Message[] = clients.slice(0, 10).flatMap((c, i) => [
    {
      id: `seed-coach-${i}`,
      clientId: c.id,
      text: "How did the adjusted session feel? We can look at it together in your check-in.",
      from: "coach" as const,
      date: "2026-10-12T08:10:00Z",
      read: true,
      priority: false,
      attachments: [],
      link: {
        label: "Training program",
        route: { section: "clients" as const, client: c.id, plan: "training" },
      },
    },
    {
      id: `seed-client-${i}`,
      clientId: c.id,
      text:
        i === 0
          ? "Just sent my check-in! I added a note about the split squats. Everything else felt really good this week."
          : i === 4
            ? "A quick question before tomorrow’s session — could we check the rest times?"
            : i === 1
              ? "Work has been running late. I’ll send my update this evening."
              : "The new routine is feeling good. Thanks for the guidance!",
      from: "client" as const,
      date: `2026-10-13T${String(9 - Math.floor(i / 3)).padStart(2, "0")}:${String(40 - i * 3).padStart(2, "0")}:00Z`,
      read: i > 4,
      priority: i === 4,
      attachments: [],
    },
  ]);
  const seeded: CoachState = {
    version: 1,
    templates: [strength, performance, simple],
    clients,
    // W2-CHK-I4: check-in rows are demo content too. A real workspace reads
    // them only through the flag-gated hydration; a non-demo seed that ships
    // them presents fixtures as live data when the flag is unset.
    extras: demo ? extras : [],
    submissions: demo ? submissions : [],
    messages,
    drafts: {},
    reviewDrafts: {},
    editorDrafts: {},
    preferences: {
      mode: "dark",
      accent: "#EB91B8",
      availability: "Weekdays · 09:00–18:00",
      notifications: true,
      priorityNotifications: true,
    },
  };
  // Card 05a: the adopters only mount when the caller wants the demo.
  return demo ? adoptCanvasDemos(seeded, today) : seeded;
}

/**
 * The client-007 (Amara) demo chain: contest/competition fixtures, settings
 * and the rest of the canvas demo content for the domains that still have no
 * store endpoint. Gated behind `?demo=` by the store provider.
 */
export function adoptCanvasDemos(
  state: CoachState,
  today: string,
): CoachState {
  return adoptAthleteDataDemo(
    adoptAthleteProfileDemo(
      adoptTrainingLogDemo(
        adoptClientAppDemo(adoptAmaraTrainingExample(state), today),
        today,
      ),
      today,
    ),
    today,
  );
}

// Validate the complete nested envelope before any UI uses persisted content.
type Guard = (v: unknown) => boolean;
const str: Guard = (v) => typeof v === "string";
const num: Guard = (v) => typeof v === "number" && Number.isFinite(v);
const nulNum: Guard = (v) => v === null || num(v);
const bool: Guard = (v) => typeof v === "boolean";
const arr =
  (g: Guard): Guard =>
  (v) =>
    Array.isArray(v) && v.every(g);
const one =
  (values: readonly unknown[]): Guard =>
  (v) =>
    values.includes(v);
const obj =
  (shape: Record<string, Guard>): Guard =>
  (v) =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.entries(shape).every(([k, g]) =>
      g((v as Record<string, unknown>)[k]),
    );
const opt =
  (g: Guard): Guard =>
  (v) =>
    v === undefined || g(v);
const dict =
  (g: Guard): Guard =>
  (v) =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.values(v).every(g);
const isHabitFrequency: Guard = (v) =>
  obj({ kind: one(["daily"]) })(v) ||
  obj({ kind: one(["per-week"]), count: num })(v) ||
  obj({ kind: one(["every-n-days"]), n: num })(v) ||
  obj({ kind: one(["weekdays"]), days: arr(num) })(v);
const date: Guard = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v));
const logoGuard = obj({
  name: (v) => typeof v === "string" && v.length > 0 && v.length <= 200,
  dataUrl: (v) =>
    typeof v === "string" &&
    v.length <= 700000 &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) &&
    v.slice(v.indexOf(",") + 1).length % 4 === 0,
});
const mediaGuard = obj({
  id: str,
  name: str,
  type: str,
  size: num,
  demo: opt(one(["voice", "video"])),
});
const variantGuard = obj({
  id: str,
  name: str,
  nutrition: one(["Meal plan", "IIFYM"]),
  cycleTrackingEnabled: opt(bool),
  views: arr(one(CORE_VIEWS)),
  habits: bool,
  dashboard: opt(isValidDashboardDraft),
  athleteOverview: opt(isAthleteOverviewSetting),
  widgets: arr(
    obj({
      id: str,
      name: str,
      category: str,
      source: str,
      summary: str,
      size: one(["small", "wide", "large"]),
    }),
  ),
  fields: arr(
    obj({
      id: one(ALL_PARAMETERS.map((p) => p.id)),
      unit: str,
      options: opt(arr(str)),
      decimals: opt(one([0, 1, 2])),
      summary: opt(one(["avg", "sum", "count", "none"])),
    }),
  ),
  roadmap: arr(
    obj({
      source: one(ALL_PARAMETERS.map((p) => p.id)),
      calculation: str,
      comparison: bool,
    }),
  ),
  roadmapPhases: opt(bool),
  phaseOptions: opt(arr(str)),
  roadmapActivityTargets: opt(arr(one(["steps", "cardio"]))),
  training: obj({
    options: opt(
      obj({
        setType: arr(str),
        progression: arr(str),
        tempo: arr(str),
        rest: arr(str),
      }),
    ),
    defaults: opt(
      obj({ setType: str, progression: str, tempo: str, rest: str }),
    ),
    fields: arr(one(TRAINING_FIELDS)),
    logFields: opt(arr(one(["weight", "reps", "rpe", "rir", "note"]))),
    loadUnit: opt(one(["kg", "lb"])),
    volume: bool,
    breakdown: str,
    presentation: str,
  }),
  questions: arr(
    obj({
      id: str,
      label: str,
      type: one([
        "Short text",
        "Long text",
        "Numeric",
        "Rating",
        "Choice",
        "Visual upload",
      ]),
      required: bool,
      options: str,
    }),
  ),
  summaries: arr(str),
  trackerHighlights: opt(arr(str)),
});
const templateGuard: Guard = (v) =>
  obj({
    id: str,
    name: str,
    description: str,
    updated: date,
    defaultVariant: str,
    variants: arr(variantGuard),
    legacyConfigurations: opt(arr(variantGuard)),
  })(v) &&
  (v as Template).variants.length > 0 &&
  (v as Template).variants.some((x) => x.id === (v as Template).defaultVariant);
const routeGuard = obj({
  section: one(["clients", "templates", "check-ins", "messages", "notes"]),
  client: opt(str),
  editor: opt(str),
  review: opt(str),
  plan: opt(str),
  tab: opt(str),
});
const changeGuard = obj({
  field: one([
    "calories",
    "protein",
    "sets",
    "instructions",
    "nutritionVariant",
    "program",
    "weeks",
  ]),
  before: (v) => str(v) || num(v),
  after: (v) => str(v) || num(v),
});
const reviewGuard = obj({
  activations: opt(
    arr(
      obj({
        kind: one(["nutrition", "training"]),
        versionId: str,
        name: str,
        startDate: date,
      }),
    ),
  ),
  text: str,
  video: opt(mediaGuard),
  changes: arr(changeGuard),
});
const clientGuard = obj({
  id: str,
  name: str,
  initials: str,
  label: str,
  phase: str,
  template: str,
  email: str,
  coachingSince: str,
  priorityMessages: bool,
  archived: bool,
  internalNotes: arr(obj({ id: str, text: str, pinned: opt(bool) })),
  generalNotes: arr(obj({ id: str, text: str })),
  coachTasks: arr(
    obj({
      id: str,
      title: str,
      complete: bool,
      deadline: opt(str),
      reminderAt: opt(str),
      notes: opt(str),
      priority: opt(one(["low", "normal", "high"])),
    }),
  ),
  clientTasks: arr(
    obj({
      id: str,
      title: str,
      dueDate: str,
      status: one(["open", "complete", "overdue"]),
    }),
  ),
  onboarding: arr(obj({ question: str, answer: str })),
  retiredHabits: opt(
    arr(
      obj({
        id: str,
        name: str,
        frequency: (v) => str(v) || isHabitFrequency(v),
        goal: str,
        reason: str,
        completed: num,
      }),
    ),
  ),
  plans: opt(isClientPlans),
  schedules: arr(
    obj({ effective: date, weekdays: arr(one([0, 1, 2, 3, 4, 5, 6])) }),
  ),
  plan: obj({
    calories: num,
    protein: num,
    sets: num,
    instructions: str,
    nutritionVariant: one(["Training day", "Rest day"]),
    program: one(["Evergreen", "Week-based"]),
    weeks: num,
  }),
  entries: arr(
    obj({ date, weight: num, sleep: num, steps: num, calories: num }),
  ),
  habits: arr(
    obj({
      name: str,
      frequency: (v) => str(v) || isHabitFrequency(v),
      goal: str,
      reason: str,
      completed: num,
    }),
  ),
  habitLog: opt(dict(arr(str))),
  assignment: opt(
    obj({ templateId: str, variantId: str, snapshot: templateGuard }),
  ),
  phases: opt(arr(isClientPhase)),
  contestDate: opt(date),
  timelineEvents: opt(arr(isTimelineEvent)),
  tracking: opt(
    obj({
      entries: arr(
        obj({
          date,
          values: dict((v) => v === null || num(v)),
        }),
      ),
      text: dict(str),
    }),
  ),
  weekNotes: opt(dict(str)),
});
export function isCoachState(v: unknown): v is CoachState {
  return (
    obj({
      version: one([1]),
      demoSeeds: opt(
        obj({
          amaraTraining: opt(one([1])),
          clientAppDemo: opt(one([1])),
          trainingLogDemo: opt(one([1])),
          athleteProfileDemo: opt(one([1])),
          athleteDataDemo: opt(one([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])),
        }),
      ),
      exerciseLibrary: opt(
        arr(
          obj({
            id: str,
            name: str,
            muscle: str,
            secondaryMuscles: arr(str),
            notes: str,
          }),
        ),
      ),
      coachNotes: opt(arr(obj({ id: str, text: str }))),
      timelineViews: opt(
        arr(
          obj({
            id: str,
            name: str,
            columns: arr(str),
            builtIn: opt(bool),
            compare: opt(bool),
          }),
        ),
      ),
      timelineOrder: opt(one(["newest", "oldest"])),
      coachTodos: opt(
        arr(
          obj({
            id: str,
            title: str,
            complete: bool,
            deadline: opt(str),
            reminderAt: opt(str),
            notes: opt(str),
            priority: opt(one(["low", "normal", "high"])),
            clientId: opt(str),
          }),
        ),
      ),
      templates: arr(templateGuard),
      clients: arr(clientGuard),
      extras: arr(
        obj({
          id: str,
          clientId: str,
          date,
          type: one(["Full", "Custom"]),
          note: str,
        }),
      ),
      trainingLogs: opt(
        arr(
          obj({
            id: str,
            clientId: str,
            planId: str,
            week: num,
            occurrenceKey: str,
            sessionId: str,
            sessionName: str,
            scheduledDate: date,
            logFields: arr(one(["weight", "reps", "rpe", "rir", "note"])),
            loadUnit: one(["kg", "lb"]),
            exercises: arr(
              obj({
                exerciseId: str,
                exerciseKey: str,
                prescription: obj({
                  libraryId: opt(str),
                  secondaryMuscles: opt(arr(str)),
                  generalNotes: opt(str),
                  id: str,
                  name: str,
                  muscle: opt(str),
                  instructions: str,
                  progression: str,
                  sets: arr(
                    obj({
                      id: str,
                      reps: num,
                      repsMax: opt(num),
                      tempo: str,
                      type: str,
                      rest: str,
                      instructions: str,
                    }),
                  ),
                }),
                sets: arr(
                  obj({
                    setId: str,
                    done: bool,
                    weight: nulNum,
                    reps: nulNum,
                    rpe: nulNum,
                    rir: nulNum,
                    note: str,
                    flagged: bool,
                  }),
                ),
              }),
            ),
            status: one(["in-progress", "finished"]),
            startedAt: str,
            finishedAt: opt(str),
          }),
        ),
      ),
      submissions: arr(
        obj({
          id: str,
          clientId: str,
          date,
          eventId: str,
          type: one(["Full", "Custom"]),
          answers: arr(obj({ question: str, answer: str })),
          metrics: arr(str),
          visuals: arr(str),
          photos: opt(arr(obj({ pose: str, src: str }))),
          note: str,
          flags: arr(obj({ exercise: str, set: num, date, text: str })),
          response: opt(
            obj({
              text: str,
              video: opt(mediaGuard),
              changes: arr(str),
              date: str,
            }),
          ),
        }),
      ),
      messages: arr(
        obj({
          id: str,
          clientId: str,
          text: str,
          from: one(["client", "coach"]),
          date: str,
          read: bool,
          priority: bool,
          attachments: arr(mediaGuard),
          link: opt(obj({ label: str, route: routeGuard })),
          links: opt(arr(obj({ label: str, route: routeGuard }))),
          local: opt(bool),
        }),
      ),
      drafts: dict(
        obj({
          text: str,
          attachments: arr(mediaGuard),
          link: opt(obj({ label: str, route: routeGuard })),
        }),
      ),
      reviewDrafts: dict(reviewGuard),
      editorDrafts: dict(templateGuard),
      preferences: obj({
        mode: one(["dark", "light"]),
        accent: (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v),
        availability: str,
        notifications: bool,
        priorityNotifications: bool,
        logo: opt(logoGuard),
        sidebarCollapsed: opt(bool),
      }),
    })(v) &&
    (v as CoachState).clients.every((client) =>
      plansOwnedBy(client.plans, client.id),
    )
  );
}
