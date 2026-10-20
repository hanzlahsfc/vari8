export type SizeName = "Compact" | "Regular" | "Wide" | "Tall" | "Expanded";

export type WidgetKind =
  | "BN21"
  | "BN01"
  | "BN08"
  | "BN15"
  | "BN19"
  | "TL26"
  | "TL28"
  | "TL06"
  | "TL11"
  | "TL14"
  | "TL21"
  | "TL22"
  | "CU01"
  | "CU02"
  | "CU03"
  | "CU04"
  | "CU06"
  | "CU09"
  | "CU10"
  | "CU16";

export interface WidgetSettings {
  title: string;
  source: string;
  summary: string;
  period: string;
  target: boolean;
  size: SizeName;
  fields: string[];
  option: string;
  unit: string;
  labels?: Record<string, string>;
  historyPeriod?: "auto" | "3m" | "6m" | "1y";
}

export interface WidgetInstance {
  id: string;
  kind: WidgetKind;
  settings: WidgetSettings;
}

export interface CatalogueEntry {
  id: WidgetKind;
  name: string;
  category: string;
  description: string;
  aliases: string;
  defaultSize: SizeName;
  sizes: SizeName[];
}

export type NutritionOption = "TD" | "NTD";
export type TargetKind = "fixed" | "range" | "minimum";

export interface NumericRecord {
  date: string;
  value: number | null;
  unit: string;
  source?: string;
}

export interface MacroTarget {
  macro: "protein" | "carbs" | "fat";
  option: NutritionOption;
  kind: TargetKind;
  low: number;
  high?: number;
  unit: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface CalorieTarget {
  option: NutritionOption;
  kind: TargetKind;
  low: number;
  high?: number;
  unit: "kcal";
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface CalorieIntakeRecord {
  date: string;
  option: NutritionOption;
  value: number;
  unit: "kcal";
}

export interface CoachingPhase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface CoachingPlanContext {
  startDate: string;
  currentWeek: number;
  currentPhase: CoachingPhase;
}

export interface PublishedWeeklyFocus {
  week: number;
  emphasis: string;
  successCue: string;
  updatedAt: string;
}

export interface RoadmapMetricTarget {
  kind: TargetKind;
  low: number;
  high?: number;
  unit: string;
}

export interface RoadmapMetric {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  target?: RoadmapMetricTarget;
  coverage?: { loggedDays: number; totalDays: number };
}

export interface RoadmapWeek {
  week: number;
  startDate: string;
  endDate: string;
  label: string;
  metrics: RoadmapMetric[];
  asOf?: string;
  isCurrent?: boolean;
}

export interface PublishedMilestone {
  id: string;
  label: string;
  date: string;
  kind: "phase-end" | "goal";
  published: boolean;
  phaseId?: string;
}

export interface WeekPrescription {
  week: number;
  effectiveFrom: string;
  label: string;
  name: string;
  exercises: {
    id: string;
    name: string;
    sets: number;
    reps: string;
    note?: string;
  }[];
}

export interface ExerciseSession {
  date: string;
  exerciseId: string;
  exercise: string;
  load: number;
  reps: number;
  sets: number;
  unit: string;
}

export interface HabitRecord {
  id: string;
  name: string;
  target: string;
  scheduledDates: string[];
  completions: { date: string; status: "done" | "skipped" }[];
}

export interface ClientTask {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
}

export interface CheckInSubmission {
  id: string;
  date: string;
  status: "submitted" | "draft" | "feedback received";
  summary: string;
  visualCount: number;
}

export interface CoachFeedback {
  id: string;
  sentAt: string;
  excerpt: string;
  read: boolean;
  video: boolean;
  links: { label: string; destination: string }[];
}

export interface ClientMessage {
  id: string;
  date: string;
  sender: "Maya" | "Coach";
  excerpt: string;
  unread: boolean;
}

export interface SourceRecords {
  sampleHistoryVersion?: number;
  stepsTarget?: number;
  client: { name: string; asOf: string };
  activeNutritionOption: NutritionOption;
  bodyweight: NumericRecord[];
  waist: NumericRecord[];
  steps: NumericRecord[];
  macroTargets: MacroTarget[];
  /** Optional additions keep older saved JSON valid and readable. */
  calorieTargets?: CalorieTarget[];
  calorieIntake?: CalorieIntakeRecord[];
  sleep?: NumericRecord[];
  coachingPlan?: CoachingPlanContext;
  publishedWeeklyFocus?: PublishedWeeklyFocus;
  roadmapWeeks?: RoadmapWeek[];
  publishedMilestones?: PublishedMilestone[];
  macroIntake: {
    date: string;
    option: NutritionOption;
    protein?: number;
    carbs?: number;
    fat?: number;
  }[];
  prescriptions: WeekPrescription[];
  workoutSchedule: {
    date: string;
    week: number;
    name: string;
    exercises: { id: string; name: string; sets: number; reps: string }[];
  }[];
  exerciseSessions: ExerciseSession[];
  recovery: {
    field: string;
    label: string;
    scale: string[];
    entries: { date: string; value: string }[];
  }[];
  habits: HabitRecord[];
  tasks: ClientTask[];
  checkInSchedule: { date: string; kind: "recurring" | "additional" }[];
  checkIns: CheckInSubmission[];
  feedback: CoachFeedback[];
  messages: ClientMessage[];
}

const allSizes: SizeName[] = ["Compact", "Regular", "Wide", "Tall", "Expanded"];

export const catalogue: CatalogueEntry[] = [
  {
    id: "BN21",
    name: "Custom metric card",
    category: "Data/Progress",
    description:
      "Bind one enabled numeric measure to its real unit, period and optional defined target.",
    aliases:
      "metric tracker measurement value numeric target average observed total",
    defaultSize: "Compact",
    sizes: allSizes,
  },
  {
    id: "BN01",
    name: "Bodyweight trend",
    category: "Data/Progress",
    description:
      "Follow dated bodyweight readings while keeping missing days visible.",
    aliases: "weight weigh-in kg lb trend average tracker",
    defaultSize: "Wide",
    sizes: allSizes,
  },
  {
    id: "BN08",
    name: "Weekly bodyweight change",
    category: "Data/Progress",
    description:
      "Review weekly average bodyweight and observed week-to-week change from valid logged readings.",
    aliases: "bodyweight weekly change average weight rate ROG ROL",
    defaultSize: "Regular",
    sizes: allSizes,
  },
  {
    id: "BN15",
    name: "Macro target summary",
    category: "Nutrition",
    description:
      "Compare logged protein, carbohydrate and fat with the selected day’s active targets.",
    aliases:
      "nutrition protein carbs carbohydrate fat intake macros TD NTD food",
    defaultSize: "Wide",
    sizes: allSizes,
  },
  {
    id: "BN19",
    name: "Nutrition intake trend",
    category: "Nutrition",
    description:
      "Compare consumed calories or macros with dated targets as lines or stacked columns.",
    aliases:
      "nutrition calorie calories macros protein carbs fat actual goal range minimum",
    defaultSize: "Wide",
    sizes: allSizes,
  },
  {
    id: "TL26",
    name: "Current / next workout",
    category: "Training",
    description:
      "Preview the prescribed workout effective now and the next scheduled session.",
    aliases:
      "training exercise program workout prescription week current next sets reps",
    defaultSize: "Regular",
    sizes: allSizes,
  },
  {
    id: "TL28",
    name: "Exercise performance trend",
    category: "Training",
    description: "Track a named exercise metric across recorded sessions.",
    aliases: "training lift load reps sets performance history sessions",
    defaultSize: "Wide",
    sizes: allSizes,
  },
  {
    id: "TL06",
    name: "Step count",
    category: "Activity",
    description:
      "Review daily step entries, valid-day average and period total.",
    aliases: "steps activity walking count target",
    defaultSize: "Compact",
    sizes: allSizes,
  },
  {
    id: "TL11",
    name: "Sleep duration",
    category: "Recovery",
    description:
      "Show recorded sleep duration by date and summarize the selected period.",
    aliases: "sleep duration hours nightly tracker recovery",
    defaultSize: "Regular",
    sizes: allSizes,
  },
  {
    id: "TL14",
    name: "Recovery ratings",
    category: "Recovery",
    description:
      "Review self-reported recovery answers with their original labels and scales.",
    aliases: "recovery energy stress fatigue sleep readiness tracker",
    defaultSize: "Regular",
    sizes: allSizes,
  },
  {
    id: "TL21",
    name: "Today’s habits",
    category: "Habits",
    description:
      "See scheduled habits and record done or skipped without treating unlogged as failure.",
    aliases: "habit checklist today scheduled completion skipped",
    defaultSize: "Tall",
    sizes: allSizes,
  },
  {
    id: "TL22",
    name: "Habit consistency",
    category: "Habits",
    description:
      "Summarize done, skipped and unlogged states against each selected habit’s own scheduled opportunities.",
    aliases: "habit consistency completion schedule done skipped adherence",
    defaultSize: "Compact",
    sizes: allSizes,
  },
  {
    id: "CU01",
    name: "Weekly focus",
    category: "Coaching",
    description:
      "Show the current phase and published weekly focus with its coach-written success cue.",
    aliases: "coaching phase focus weekly emphasis success cue",
    defaultSize: "Compact",
    sizes: ["Compact", "Regular", "Wide"],
  },
  {
    id: "CU02",
    name: "This week at a glance",
    category: "Coaching",
    description:
      "Summarize selected weekly roadmap metrics for the client’s current coaching week.",
    aliases: "coaching week weekly summary roadmap metrics current",
    defaultSize: "Compact",
    sizes: ["Compact", "Regular", "Wide"],
  },
  {
    id: "CU03",
    name: "Client tasks",
    category: "Coaching",
    description:
      "Show assigned client tasks with due dates and completion controls.",
    aliases: "task assignment due date todo client",
    defaultSize: "Regular",
    sizes: allSizes,
  },
  {
    id: "CU04",
    name: "Check-in status",
    category: "Coaching",
    description:
      "Pair the next scheduled check-in with the latest submitted status.",
    aliases: "check in checkin schedule submission status due response",
    defaultSize: "Compact",
    sizes: allSizes,
  },
  {
    id: "CU06",
    name: "Coach feedback",
    category: "Coaching",
    description:
      "Show published coach feedback and its sent plan-change links.",
    aliases: "coach response feedback video plan changes unread",
    defaultSize: "Wide",
    sizes: allSizes,
  },
  {
    id: "CU09",
    name: "Selected roadmap metrics",
    category: "Roadmap",
    description:
      "Show selected weekly roadmap metrics with their source labels, units and configured targets.",
    aliases: "roadmap timeline metrics weekly trend target",
    defaultSize: "Regular",
    sizes: allSizes,
  },
  {
    id: "CU10",
    name: "Current phase progress",
    category: "Roadmap",
    description:
      "Show a published milestone date and time remaining, with phase dates when the milestone ends a phase.",
    aliases: "milestone countdown phase end date goal published",
    defaultSize: "Compact",
    sizes: allSizes,
  },
  {
    id: "CU16",
    name: "Quick links launcher",
    category: "Shortcuts",
    description:
      "Open enabled client-facing areas from a concise list of links.",
    aliases: "shortcut navigation tracker mealplan training chat",
    defaultSize: "Regular",
    sizes: ["Compact", "Regular", "Wide"],
  },
];

const defaults: Record<WidgetKind, WidgetSettings> = {
  BN21: {
    title: "Body measurements",
    source: "waist",
    summary: "latest",
    period: "30d",
    target: false,
    size: "Compact",
    fields: [],
    option: "default",
    unit: "cm",
  },
  BN01: {
    title: "Bodyweight trend",
    source: "bodyweight",
    summary: "daily",
    period: "30d",
    target: false,
    size: "Wide",
    fields: [],
    option: "default",
    unit: "kg",
  },
  BN08: {
    title: "Weekly bodyweight change",
    source: "bodyweight",
    summary: "weekly-average-change",
    period: "8w",
    target: false,
    size: "Regular",
    fields: [],
    option: "absolute",
    unit: "kg",
  },
  BN15: {
    title: "Nutrition today",
    source: "nutrition:active",
    summary: "daily",
    period: "today",
    target: true,
    size: "Wide",
    fields: ["protein", "carbs", "fat"],
    option: "circles",
    unit: "g",
  },
  BN19: {
    title: "Nutrition intake trend",
    source: "nutrition:active",
    summary: "actual-target",
    period: "month",
    target: true,
    size: "Wide",
    fields: ["calories"],
    option: "line",
    unit: "kcal",
  },
  TL26: {
    title: "Your training",
    source: "workouts",
    summary: "current",
    period: "week",
    target: false,
    size: "Regular",
    fields: ["exercise", "sets", "reps"],
    option: "current",
    unit: "",
  },
  TL28: {
    title: "Deadlift progress",
    source: "exercise:deadlift",
    summary: "load",
    period: "8w",
    target: false,
    size: "Wide",
    fields: [],
    option: "default",
    unit: "kg",
  },
  TL06: {
    title: "Daily steps",
    source: "steps",
    summary: "average",
    period: "7d",
    target: false,
    size: "Compact",
    fields: [],
    option: "default",
    unit: "steps",
  },
  TL11: {
    title: "Sleep duration",
    source: "sleep",
    summary: "average",
    period: "7d",
    target: false,
    size: "Regular",
    fields: [],
    option: "hours",
    unit: "h",
  },
  TL14: {
    title: "Recovery",
    source: "recovery",
    summary: "latest",
    period: "30d",
    target: false,
    size: "Regular",
    fields: ["energy", "stress", "readiness"],
    option: "default",
    unit: "",
  },
  TL21: {
    title: "Today’s habits",
    source: "habits",
    summary: "today",
    period: "today",
    target: false,
    size: "Tall",
    fields: ["walk", "water", "mobility", "protein", "sleep"],
    option: "list",
    unit: "",
  },
  TL22: {
    title: "Habit consistency",
    source: "habits",
    summary: "scheduled-statuses",
    period: "7d",
    target: false,
    size: "Compact",
    fields: ["walk", "water", "mobility"],
    option: "scheduled",
    unit: "%",
  },
  CU01: {
    title: "This week’s focus",
    source: "coaching:current",
    summary: "phase-focus",
    period: "current-week",
    target: false,
    size: "Compact",
    fields: ["phase", "focus", "successCue"],
    option: "published",
    unit: "",
  },
  CU02: {
    title: "This week at a glance",
    source: "roadmap:current-week",
    summary: "selected-metrics",
    period: "current-week",
    target: false,
    size: "Compact",
    fields: ["bodyweight", "steps", "protein"],
    option: "current-week",
    unit: "",
  },
  CU03: {
    title: "Your tasks",
    source: "tasks",
    summary: "open",
    period: "30d",
    target: false,
    size: "Regular",
    fields: [],
    option: "open",
    unit: "",
  },
  CU04: {
    title: "Check-in",
    source: "checkins",
    summary: "status",
    period: "30d",
    target: false,
    size: "Compact",
    fields: [],
    option: "default",
    unit: "",
  },
  CU06: {
    title: "Coach feedback",
    source: "feedback",
    summary: "latest",
    period: "30d",
    target: false,
    size: "Wide",
    fields: [],
    option: "default",
    unit: "",
  },
  CU09: {
    title: "Selected roadmap metrics",
    source: "roadmap:selected",
    summary: "weekly-trends",
    period: "8w",
    target: false,
    size: "Regular",
    fields: ["bodyweight", "steps", "protein"],
    option: "selected",
    unit: "",
  },
  CU10: {
    title: "Current phase progress",
    source: "milestones:published",
    summary: "phase-progress",
    period: "current-phase",
    target: false,
    size: "Compact",
    fields: ["strength-foundation-end"],
    option: "published",
    unit: "days",
  },
  CU16: {
    title: "Quick links",
    source: "links",
    summary: "enabled",
    period: "",
    target: false,
    size: "Regular",
    fields: ["Tracker", "Mealplan", "Training", "Check-in"],
    option: "default",
    unit: "",
  },
};

export function defaultSettings(kind: WidgetKind): WidgetSettings {
  return { ...defaults[kind], fields: [...defaults[kind].fields] };
}

export function sourceOptions(
  kind: WidgetKind,
): { value: string; label: string; disabled?: boolean }[] {
  const options: Record<
    WidgetKind,
    { value: string; label: string; disabled?: boolean }[]
  > = {
    BN21: [
      { value: "bodyweight", label: "Bodyweight · kg" },
      { value: "waist", label: "Waist · cm" },
      { value: "steps", label: "Steps · count" },
    ],
    BN01: [{ value: "bodyweight", label: "Bodyweight entries" }],
    BN08: [{ value: "bodyweight", label: "Bodyweight entries" }],
    BN15: [
      { value: "nutrition:active", label: "Active day option (shared)" },
      { value: "nutrition:TD", label: "Training day (TD)" },
      { value: "nutrition:NTD", label: "Non-training day (NTD)" },
    ],
    BN19: [
      { value: "nutrition:active", label: "Active day option (shared)" },
      { value: "nutrition:TD", label: "Training day (TD)" },
      { value: "nutrition:NTD", label: "Non-training day (NTD)" },
    ],
    TL26: [{ value: "workouts", label: "Assigned training program" }],
    TL28: [
      { value: "exercise:deadlift", label: "Deadlift · logbook" },
      { value: "exercise:hip-thrust", label: "Hip thrust · logbook" },
    ],
    TL06: [{ value: "steps", label: "Step count" }],
    TL11: [{ value: "sleep", label: "Sleep duration entries" }],
    TL14: [{ value: "recovery", label: "Recovery tracker" }],
    TL21: [{ value: "habits", label: "Scheduled habits" }],
    TL22: [{ value: "habits", label: "Scheduled habits" }],
    CU01: [
      {
        value: "coaching:current",
        label: "Published current coaching context",
      },
    ],
    CU02: [
      { value: "roadmap:current-week", label: "Current coaching week metrics" },
    ],
    CU03: [{ value: "tasks", label: "Client-assigned tasks" }],
    CU04: [{ value: "checkins", label: "Schedule and submissions" }],
    CU06: [{ value: "feedback", label: "Sent client feedback" }],
    CU09: [{ value: "roadmap:selected", label: "Selected roadmap metrics" }],
    CU10: [{ value: "milestones:published", label: "Published milestones" }],
    CU16: [{ value: "links", label: "Enabled client destinations" }],
  };
  return options[kind];
}

export function summaryOptions(kind: WidgetKind, source: string): string[] {
  if (kind === "BN21")
    return source === "steps"
      ? ["latest", "average", "total"]
      : ["latest", "average"];
  if (kind === "BN01") return ["daily", "weekly-average"];
  if (kind === "BN08") return ["weekly-average-change", "weekly-history"];
  if (kind === "BN15") return ["daily"];
  if (kind === "BN19") return ["actual-target", "actual"];
  if (kind === "TL26") return ["current", "next", "both"];
  if (kind === "TL28") return ["load", "reps", "sets"];
  if (kind === "TL06") return ["latest", "average", "total"];
  if (kind === "TL11") return ["average", "latest", "history"];
  if (kind === "TL14") return ["latest", "distribution", "history"];
  if (kind === "TL21") return ["today"];
  if (kind === "TL22") return ["scheduled-statuses", "completion-count"];
  if (kind === "CU01") return ["phase-focus", "focus"];
  if (kind === "CU02") return ["selected-metrics"];
  if (kind === "CU03") return ["open", "completed", "both"];
  if (kind === "CU04") return ["status", "schedule", "submission"];
  if (kind === "CU06") return ["latest", "unread"];
  if (kind === "CU09") return ["weekly-trends", "latest-values"];
  if (kind === "CU10") return ["phase-progress"];
  return ["enabled"];
}

export function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.valueOf())
    ? date
    : new Intl.DateTimeFormat("en", options).format(parsed);
}

const baseInitialRecords: SourceRecords = {
  client: { name: "Maya Chen", asOf: "2026-10-06" },
  activeNutritionOption: "TD",
  bodyweight: [
    { date: "2026-09-09", value: 68.4, unit: "kg" },
    { date: "2026-09-12", value: 68.1, unit: "kg" },
    { date: "2026-09-16", value: null, unit: "kg" },
    { date: "2026-09-20", value: 67.9, unit: "kg" },
    { date: "2026-09-24", value: 68.0, unit: "kg" },
    { date: "2026-09-28", value: null, unit: "kg" },
    { date: "2026-10-02", value: 67.7, unit: "kg" },
    { date: "2026-10-06", value: 67.8, unit: "kg" },
  ],
  waist: [
    { date: "2026-09-08", value: 76.5, unit: "cm" },
    { date: "2026-09-22", value: 76.1, unit: "cm" },
    { date: "2026-10-06", value: 75.8, unit: "cm" },
  ],
  steps: [
    { date: "2026-09-30", value: 8240, unit: "steps" },
    { date: "2026-10-01", value: null, unit: "steps" },
    { date: "2026-10-02", value: 10418, unit: "steps" },
    { date: "2026-10-03", value: 0, unit: "steps" },
    { date: "2026-10-04", value: 7312, unit: "steps" },
    { date: "2026-10-05", value: 9126, unit: "steps" },
    { date: "2026-10-06", value: 4860, unit: "steps" },
  ],
  macroTargets: [
    {
      macro: "protein",
      option: "TD",
      kind: "fixed",
      low: 125,
      unit: "g",
      effectiveFrom: "2025-10-07",
      effectiveTo: "2026-03-31",
    },
    {
      macro: "carbs",
      option: "TD",
      kind: "range",
      low: 200,
      high: 240,
      unit: "g",
      effectiveFrom: "2025-10-07",
      effectiveTo: "2026-03-31",
    },
    {
      macro: "fat",
      option: "TD",
      kind: "minimum",
      low: 55,
      unit: "g",
      effectiveFrom: "2025-10-07",
      effectiveTo: "2026-03-31",
    },
    {
      macro: "protein",
      option: "NTD",
      kind: "fixed",
      low: 120,
      unit: "g",
      effectiveFrom: "2025-10-07",
      effectiveTo: "2026-03-31",
    },
    {
      macro: "carbs",
      option: "NTD",
      kind: "range",
      low: 180,
      high: 210,
      unit: "g",
      effectiveFrom: "2025-10-07",
      effectiveTo: "2026-03-31",
    },
    {
      macro: "fat",
      option: "NTD",
      kind: "minimum",
      low: 60,
      unit: "g",
      effectiveFrom: "2025-10-07",
      effectiveTo: "2026-03-31",
    },
    {
      macro: "protein",
      option: "TD",
      kind: "fixed",
      low: 128,
      unit: "g",
      effectiveFrom: "2026-04-01",
      effectiveTo: "2026-08-31",
    },
    {
      macro: "carbs",
      option: "TD",
      kind: "range",
      low: 190,
      high: 230,
      unit: "g",
      effectiveFrom: "2026-04-01",
      effectiveTo: "2026-08-31",
    },
    {
      macro: "fat",
      option: "TD",
      kind: "minimum",
      low: 55,
      unit: "g",
      effectiveFrom: "2026-04-01",
      effectiveTo: "2026-08-31",
    },
    {
      macro: "protein",
      option: "NTD",
      kind: "fixed",
      low: 122,
      unit: "g",
      effectiveFrom: "2026-04-01",
      effectiveTo: "2026-08-31",
    },
    {
      macro: "carbs",
      option: "NTD",
      kind: "range",
      low: 175,
      high: 205,
      unit: "g",
      effectiveFrom: "2026-04-01",
      effectiveTo: "2026-08-31",
    },
    {
      macro: "fat",
      option: "NTD",
      kind: "minimum",
      low: 60,
      unit: "g",
      effectiveFrom: "2026-04-01",
      effectiveTo: "2026-08-31",
    },
    {
      macro: "protein",
      option: "TD",
      kind: "fixed",
      low: 130,
      unit: "g",
      effectiveFrom: "2026-10-01",
    },
    {
      macro: "carbs",
      option: "TD",
      kind: "range",
      low: 190,
      high: 230,
      unit: "g",
      effectiveFrom: "2026-10-01",
    },
    {
      macro: "fat",
      option: "TD",
      kind: "minimum",
      low: 55,
      unit: "g",
      effectiveFrom: "2026-10-01",
    },
    {
      macro: "protein",
      option: "TD",
      kind: "fixed",
      low: 125,
      unit: "g",
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-09-30",
    },
    {
      macro: "carbs",
      option: "TD",
      kind: "range",
      low: 185,
      high: 220,
      unit: "g",
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-09-30",
    },
    {
      macro: "fat",
      option: "TD",
      kind: "minimum",
      low: 55,
      unit: "g",
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-09-30",
    },
    {
      macro: "protein",
      option: "NTD",
      kind: "fixed",
      low: 125,
      unit: "g",
      effectiveFrom: "2026-10-01",
    },
    {
      macro: "carbs",
      option: "NTD",
      kind: "range",
      low: 175,
      high: 200,
      unit: "g",
      effectiveFrom: "2026-10-01",
    },
    {
      macro: "fat",
      option: "NTD",
      kind: "minimum",
      low: 60,
      unit: "g",
      effectiveFrom: "2026-10-01",
    },
    {
      macro: "protein",
      option: "NTD",
      kind: "fixed",
      low: 120,
      unit: "g",
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-09-30",
    },
    {
      macro: "carbs",
      option: "NTD",
      kind: "range",
      low: 165,
      high: 190,
      unit: "g",
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-09-30",
    },
    {
      macro: "fat",
      option: "NTD",
      kind: "minimum",
      low: 58,
      unit: "g",
      effectiveFrom: "2026-09-01",
      effectiveTo: "2026-09-30",
    },
  ],
  calorieTargets: [
    {
      option: "TD",
      kind: "range",
      low: 2150,
      high: 2350,
      unit: "kcal",
      effectiveFrom: "2025-10-07",
      effectiveTo: "2026-03-31",
    },
    {
      option: "NTD",
      kind: "range",
      low: 1950,
      high: 2150,
      unit: "kcal",
      effectiveFrom: "2025-10-07",
      effectiveTo: "2026-03-31",
    },
    {
      option: "TD",
      kind: "range",
      low: 2100,
      high: 2250,
      unit: "kcal",
      effectiveFrom: "2026-04-01",
      effectiveTo: "2026-09-30",
    },
    {
      option: "NTD",
      kind: "range",
      low: 1900,
      high: 2050,
      unit: "kcal",
      effectiveFrom: "2026-04-01",
      effectiveTo: "2026-09-30",
    },
    {
      option: "TD",
      kind: "range",
      low: 2050,
      high: 2200,
      unit: "kcal",
      effectiveFrom: "2026-10-01",
    },
    {
      option: "NTD",
      kind: "range",
      low: 1850,
      high: 2000,
      unit: "kcal",
      effectiveFrom: "2026-10-01",
    },
  ],
  calorieIntake: [
    { date: "2026-10-04", option: "NTD", value: 1940, unit: "kcal" },
    { date: "2026-10-05", option: "TD", value: 2180, unit: "kcal" },
    { date: "2026-10-06", option: "TD", value: 1460, unit: "kcal" },
    { date: "2026-10-06", option: "NTD", value: 1872, unit: "kcal" },
  ],
  sleep: [
    { date: "2026-09-30", value: 7.2, unit: "h", source: "manual" },
    { date: "2026-10-01", value: 6.8, unit: "h", source: "manual" },
    { date: "2026-10-02", value: 7.6, unit: "h", source: "manual" },
    { date: "2026-10-03", value: 7.1, unit: "h", source: "manual" },
    { date: "2026-10-04", value: null, unit: "h", source: "manual" },
    { date: "2026-10-05", value: 7.4, unit: "h", source: "manual" },
    { date: "2026-10-06", value: 7.8, unit: "h", source: "manual" },
  ],
  coachingPlan: {
    startDate: "2026-08-31",
    currentWeek: 6,
    currentPhase: {
      id: "strength-foundation",
      name: "Strength foundation",
      startDate: "2026-08-31",
      endDate: "2026-11-01",
    },
  },
  publishedWeeklyFocus: {
    week: 6,
    emphasis:
      "Keep lower-body training steady while making each rep controlled.",
    successCue: "Finish the main lift with about two reps in reserve.",
    updatedAt: "2026-10-05T16:30:00Z",
  },
  roadmapWeeks: [
    {
      week: 5,
      startDate: "2026-09-28",
      endDate: "2026-10-04",
      label: "Week 5",
      metrics: [
        {
          key: "bodyweight",
          label: "Bodyweight average",
          value: 67.7,
          unit: "kg",
        },
        {
          key: "steps",
          label: "Daily steps average",
          value: 7539,
          unit: "steps",
        },
        {
          key: "protein",
          label: "Protein logged average",
          value: 124,
          unit: "g",
          target: { kind: "fixed", low: 130, unit: "g" },
        },
      ],
    },
    {
      week: 6,
      startDate: "2026-10-05",
      endDate: "2026-10-11",
      label: "Week 6",
      metrics: [
        {
          key: "bodyweight",
          label: "Bodyweight average",
          value: 67.8,
          unit: "kg",
        },
        {
          key: "steps",
          label: "Daily steps average",
          value: 6993,
          unit: "steps",
        },
        {
          key: "protein",
          label: "Protein logged average",
          value: 112,
          unit: "g",
          target: { kind: "fixed", low: 130, unit: "g" },
        },
      ],
    },
  ],
  publishedMilestones: [
    {
      id: "strength-foundation-end",
      label: "Strength foundation complete",
      date: "2026-11-01",
      kind: "phase-end",
      published: true,
      phaseId: "strength-foundation",
    },
  ],
  macroIntake: [
    { date: "2026-10-06", option: "NTD", protein: 125, carbs: 190, fat: 68 },
    { date: "2026-09-25", option: "TD", protein: 124, carbs: 202, fat: 57 },
    { date: "2026-10-04", option: "NTD", protein: 121, carbs: 204, fat: 61 },
    { date: "2026-10-05", option: "TD", protein: 136, carbs: 218, fat: 52 },
    { date: "2026-10-06", option: "TD", protein: 88, carbs: 142, fat: 60 },
  ],
  prescriptions: [
    {
      week: 5,
      effectiveFrom: "2026-09-28",
      label: "Week 5",
      name: "Lower strength",
      exercises: [
        {
          id: "deadlift",
          name: "Deadlift",
          sets: 4,
          reps: "5",
          note: "Controlled lowering",
        },
        { id: "split-squat", name: "Split squat", sets: 3, reps: "8 / side" },
        {
          id: "hamstring-curl",
          name: "Hamstring curl",
          sets: 3,
          reps: "10–12",
        },
        { id: "calf-raise", name: "Calf raise", sets: 3, reps: "12" },
      ],
    },
    {
      week: 6,
      effectiveFrom: "2026-10-05",
      label: "Week 6",
      name: "Lower strength",
      exercises: [
        {
          id: "deadlift",
          name: "Deadlift",
          sets: 4,
          reps: "4–5",
          note: "Leave two reps in reserve",
        },
        { id: "split-squat", name: "Split squat", sets: 3, reps: "8 / side" },
        {
          id: "hamstring-curl",
          name: "Hamstring curl",
          sets: 3,
          reps: "10–12",
        },
        { id: "calf-raise", name: "Calf raise", sets: 3, reps: "12" },
      ],
    },
  ],
  workoutSchedule: [
    {
      date: "2026-10-06",
      week: 6,
      name: "Lower strength",
      exercises: [
        { id: "deadlift", name: "Deadlift", sets: 4, reps: "4–5" },
        { id: "split-squat", name: "Split squat", sets: 3, reps: "8 / side" },
      ],
    },
    {
      date: "2026-10-08",
      week: 6,
      name: "Upper strength",
      exercises: [
        { id: "bench", name: "Bench press", sets: 4, reps: "6" },
        { id: "row", name: "Chest-supported row", sets: 3, reps: "8–10" },
      ],
    },
  ],
  exerciseSessions: [
    {
      date: "2026-09-08",
      exerciseId: "deadlift",
      exercise: "Deadlift",
      load: 55,
      reps: 5,
      sets: 4,
      unit: "kg",
    },
    {
      date: "2026-09-15",
      exerciseId: "deadlift",
      exercise: "Deadlift",
      load: 57.5,
      reps: 5,
      sets: 4,
      unit: "kg",
    },
    {
      date: "2026-09-22",
      exerciseId: "deadlift",
      exercise: "Deadlift",
      load: 60,
      reps: 5,
      sets: 4,
      unit: "kg",
    },
    {
      date: "2026-09-29",
      exerciseId: "deadlift",
      exercise: "Deadlift",
      load: 60,
      reps: 4,
      sets: 4,
      unit: "kg",
    },
    {
      date: "2026-10-06",
      exerciseId: "deadlift",
      exercise: "Deadlift",
      load: 62.5,
      reps: 4,
      sets: 4,
      unit: "kg",
    },
    {
      date: "2026-09-10",
      exerciseId: "hip-thrust",
      exercise: "Hip thrust",
      load: 72.5,
      reps: 8,
      sets: 3,
      unit: "kg",
    },
    {
      date: "2026-09-17",
      exerciseId: "hip-thrust",
      exercise: "Hip thrust",
      load: 75,
      reps: 8,
      sets: 3,
      unit: "kg",
    },
    {
      date: "2026-09-24",
      exerciseId: "hip-thrust",
      exercise: "Hip thrust",
      load: 77.5,
      reps: 8,
      sets: 3,
      unit: "kg",
    },
    {
      date: "2026-10-01",
      exerciseId: "hip-thrust",
      exercise: "Hip thrust",
      load: 80,
      reps: 8,
      sets: 3,
      unit: "kg",
    },
  ],
  recovery: [
    {
      field: "energy",
      label: "Energy outside training",
      scale: ["Low", "Steady", "High"],
      entries: [
        { date: "2026-10-04", value: "Steady" },
        { date: "2026-10-06", value: "High" },
      ],
    },
    {
      field: "stress",
      label: "Stress",
      scale: ["Low", "Moderate", "High"],
      entries: [
        { date: "2026-10-04", value: "Moderate" },
        { date: "2026-10-06", value: "Low" },
      ],
    },
    {
      field: "readiness",
      label: "Perceived readiness",
      scale: ["Low", "Okay", "Ready"],
      entries: [
        { date: "2026-10-05", value: "Okay" },
        { date: "2026-10-06", value: "Ready" },
      ],
    },
  ],
  habits: [
    {
      id: "walk",
      name: "Outdoor walk",
      target: "20 minutes",
      scheduledDates: ["2026-10-06"],
      completions: [{ date: "2026-10-06", status: "done" }],
    },
    {
      id: "water",
      name: "Water before coffee",
      target: "1 glass",
      scheduledDates: ["2026-10-06"],
      completions: [],
    },
    {
      id: "mobility",
      name: "Evening mobility",
      target: "8 minutes",
      scheduledDates: ["2026-10-06"],
      completions: [],
    },
    {
      id: "protein",
      name: "Include protein at breakfast",
      target: "1 serving",
      scheduledDates: ["2026-10-06"],
      completions: [{ date: "2026-10-06", status: "skipped" }],
    },
    {
      id: "sleep",
      name: "Consistent bedtime",
      target: "Before 22:30",
      scheduledDates: ["2026-10-06"],
      completions: [],
    },
  ],
  tasks: [
    {
      id: "photos",
      title: "Add front and side progress photos",
      dueDate: "2026-10-07",
      completed: false,
    },
    {
      id: "meal-notes",
      title: "Note meals that felt low energy",
      dueDate: "2026-10-09",
      completed: false,
    },
    {
      id: "schedule",
      title: "Confirm next week’s training times",
      dueDate: "2026-10-12",
      completed: true,
    },
  ],
  checkInSchedule: [
    { date: "2026-10-09", kind: "recurring" },
    { date: "2026-10-13", kind: "additional" },
  ],
  checkIns: [
    {
      id: "checkin-2026-09-28",
      date: "2026-09-28",
      status: "feedback received",
      summary: "Sleep was improving; keep the evening walk.",
      visualCount: 1,
    },
    {
      id: "checkin-2026-10-05",
      date: "2026-10-05",
      status: "submitted",
      summary: "Energy steadier; training felt strong.",
      visualCount: 2,
    },
    {
      id: "checkin-2026-10-09-draft",
      date: "2026-10-09",
      status: "draft",
      summary: "",
      visualCount: 0,
    },
  ],
  feedback: [
    {
      id: "feedback-2026-10-04",
      sentAt: "2026-10-04",
      excerpt:
        "Great consistency this week. Keep the deadlift effort steady; I’ve adjusted the next block and added a recovery note.",
      read: false,
      video: true,
      links: [
        { label: "Week 6 training update", destination: "Training" },
        { label: "Recovery notes", destination: "Check-in" },
      ],
    },
  ],
  messages: [
    {
      id: "message-2026-10-05-1",
      date: "2026-10-05",
      sender: "Maya",
      excerpt:
        "The new schedule feels manageable. I can train Tuesday and Thursday next week.",
      unread: false,
    },
    {
      id: "message-2026-10-05-2",
      date: "2026-10-05",
      sender: "Coach",
      excerpt: "Great, I’ve lined the sessions up with those days.",
      unread: true,
    },
  ],
};

/** Add a small, clearly fictional history when upgrading older sample records. */
export function upgradeHabitFixture(records: SourceRecords): SourceRecords {
  if ((records.sampleHistoryVersion ?? 0) >= 4) return records;
  const currentDate = records.client.asOf;
  const historyStart = new Date(`${currentDate}T00:00:00Z`);
  historyStart.setUTCDate(historyStart.getUTCDate() - 364);
  const scheduleDays: Record<string, (weekday: number) => boolean> = {
    walk: (weekday) => weekday !== 0,
    water: () => true,
    mobility: (weekday) => [1, 3, 5].includes(weekday),
    protein: (weekday) => weekday >= 1 && weekday <= 5,
    sleep: () => true,
  };
  const habits = records.habits.map((habit, habitIndex) => {
    const scheduledDates = new Set(habit.scheduledDates);
    const originalScheduledDates = new Set(habit.scheduledDates);
    const completions = new Map(
      habit.completions.map((completion) => [completion.date, completion]),
    );
    const cursor = new Date(historyStart);
    let scheduledIndex = 0;
    while (cursor.toISOString().slice(0, 10) < currentDate) {
      const date = cursor.toISOString().slice(0, 10);
      const weekday = cursor.getUTCDay();
      if ((scheduleDays[habit.id] ?? (() => true))(weekday)) {
        scheduledDates.add(date);
        if (!originalScheduledDates.has(date) && !completions.has(date)) {
          const pattern = (scheduledIndex + habitIndex * 2) % 7;
          if (pattern < 4) completions.set(date, { date, status: "done" });
          else if (pattern === 4)
            completions.set(date, { date, status: "skipped" });
        }
        scheduledIndex += 1;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return {
      ...habit,
      scheduledDates: [...scheduledDates].sort(),
      completions: [...completions.values()].sort((left, right) =>
        left.date.localeCompare(right.date),
      ),
    };
  });
  return { ...records, habits };
}

/**
 * Attach newly introduced sample sources to older saved fixtures without
 * overwriting values that already exist, including intentionally empty arrays.
 */
/** Extend older nonempty demo sources before their first record; preserve empty sources and existing gaps. */
export function upgradeSampleHistory(records: SourceRecords): SourceRecords {
  if ((records.sampleHistoryVersion ?? 0) >= 4) return records;
  const day = (offset: number) => {
    const date = new Date(`${records.client.asOf}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const sameSeed = (value: unknown, seed: unknown) =>
    JSON.stringify(value) === JSON.stringify(seed);
  const mergeByDate = <T extends { date: string }>(
    generated: T[],
    original: T[],
  ) => {
    const entries = new Map(generated.map((item) => [item.date, item]));
    for (const item of original) entries.set(item.date, item);
    return [...entries.values()].sort((a, b) => a.date.localeCompare(b.date));
  };
  const extendBeforeFirstDate = <T extends { date: string }>(
    generated: T[],
    original: T[],
  ) => {
    if (original.length === 0) return original;
    const firstDate = original.reduce(
      (first, item) => (item.date < first ? item.date : first),
      original[0].date,
    );
    const entries = new Map(original.map((item) => [item.date, item]));
    for (const item of generated) {
      if (item.date < firstDate && !entries.has(item.date))
        entries.set(item.date, item);
    }
    return [...entries.values()].sort((a, b) => a.date.localeCompare(b.date));
  };
  const mergeMacroHistory = (
    generated: SourceRecords["macroIntake"],
    original: SourceRecords["macroIntake"],
    asOf: string,
    fillKnownRecentSeed = false,
  ) => {
    if (original.length === 0) return original;
    const firstByOption = new Map<NutritionOption, string>();
    for (const item of original) {
      const first = firstByOption.get(item.option);
      if (first === undefined || item.date < first)
        firstByOption.set(item.option, item.date);
    }
    const entries = new Map(
      original.map((item) => [`${item.date}:${item.option}`, item]),
    );
    for (const item of generated) {
      const firstDate = firstByOption.get(item.option);
      const key = `${item.date}:${item.option}`;
      const knownRecentSeedDate =
        fillKnownRecentSeed && item.date >= day(-35) && item.date <= asOf;
      if (
        (firstDate === undefined ||
          item.date < firstDate ||
          item.date === asOf ||
          knownRecentSeedDate) &&
        !entries.has(key)
      )
        entries.set(key, item);
    }
    for (const item of original) {
      const key = `${item.date}:${item.option}`;
      const seededPartial =
        item.date === asOf &&
        item.option === "TD" &&
        item.protein === 88 &&
        item.carbs === 142 &&
        item.fat === undefined;
      entries.set(key, seededPartial ? { ...item, fat: 60 } : item);
    }
    return [...entries.values()].sort((a, b) =>
      a.date === b.date
        ? a.option.localeCompare(b.option)
        : a.date.localeCompare(b.date),
    );
  };
  const mergeCalorieHistory = (
    generated: CalorieIntakeRecord[],
    original: CalorieIntakeRecord[],
    fillKnownRecentSeed = false,
  ) => {
    if (original.length === 0) return original;
    const firstByOption = new Map<NutritionOption, string>();
    for (const item of original) {
      const first = firstByOption.get(item.option);
      if (first === undefined || item.date < first)
        firstByOption.set(item.option, item.date);
    }
    const entries = new Map(
      original.map((item) => [`${item.date}:${item.option}`, item]),
    );
    for (const item of generated) {
      const firstDate = firstByOption.get(item.option);
      const key = `${item.date}:${item.option}`;
      const knownRecentSeedDate =
        fillKnownRecentSeed &&
        item.date >= day(-35) &&
        item.date <= records.client.asOf;
      if (
        (firstDate === undefined ||
          item.date < firstDate ||
          item.date === records.client.asOf ||
          knownRecentSeedDate) &&
        !entries.has(key)
      )
        entries.set(key, item);
    }
    return [...entries.values()].sort((a, b) =>
      a.date === b.date
        ? a.option.localeCompare(b.option)
        : a.date.localeCompare(b.date),
    );
  };
  const oldSeedMacros: SourceRecords["macroIntake"] = [
    { date: "2026-09-25", option: "TD", protein: 124, carbs: 202, fat: 57 },
    { date: "2026-10-04", option: "NTD", protein: 121, carbs: 204, fat: 61 },
    { date: "2026-10-05", option: "TD", protein: 136, carbs: 218, fat: 52 },
    { date: "2026-10-06", option: "TD", protein: 88, carbs: 142 },
  ];
  const oldSeedCalories: CalorieIntakeRecord[] = [
    { date: "2026-10-04", option: "NTD", value: 1940, unit: "kcal" },
    { date: "2026-10-05", option: "TD", value: 2180, unit: "kcal" },
    { date: "2026-10-06", option: "TD", value: 1460, unit: "kcal" },
  ];
  const knownRecentSeed =
    JSON.stringify(records.macroIntake) ===
      JSON.stringify(baseInitialRecords.macroIntake) ||
    JSON.stringify(records.macroIntake) === JSON.stringify(oldSeedMacros);
  const knownRecentCalories =
    JSON.stringify(records.calorieIntake ?? []) ===
      JSON.stringify(baseInitialRecords.calorieIntake) ||
    JSON.stringify(records.calorieIntake ?? []) ===
      JSON.stringify(oldSeedCalories);
  const weights: NumericRecord[] = [];
  for (let offset = -364; offset < -30; offset += 7)
    weights.push({
      date: day(offset),
      unit: "kg",
      value:
        Math.round(
          (68.4 + (-offset - 30) * 0.005 + Math.sin(offset * 0.12) * 0.18) * 10,
        ) / 10,
    });
  for (let offset = -30; offset <= 0; offset++)
    weights.push({
      date: day(offset),
      unit: "kg",
      value:
        Math.round(
          (67.8 - offset * 0.018 + Math.sin(offset * 0.8) * 0.15) * 10,
        ) / 10,
    });
  const macros: SourceRecords["macroIntake"] = [];
  const calories: CalorieIntakeRecord[] = [];
  const steps: NumericRecord[] = [];
  for (let offset = -364; offset <= 0; offset++) {
    const date = day(offset);
    const option: NutritionOption = [0, 3, 5].includes(
      new Date(`${date}T12:00:00Z`).getUTCDay(),
    )
      ? "NTD"
      : "TD";
    const missed =
      offset !== 0 &&
      ((offset * 13) % 17 === 0 || offset === -18 || offset === -9);
    if (!missed) {
      const options: NutritionOption[] =
        offset < -35 || offset === 0 ? ["TD", "NTD"] : [option];
      for (const historyOption of options) {
        const recent = offset >= -35;
        const activeDayForOption = offset === 0 && historyOption === "NTD";
        const protein = activeDayForOption
          ? 125
          : recent
            ? 118 + (((offset + 35) * 7) % 25)
            : (historyOption === "TD" ? 122 : 118) +
              (((offset + 364) * 7) % 24);
        const carbs = activeDayForOption
          ? 190
          : recent
            ? (historyOption === "TD" ? 205 : 168) +
              Math.round(Math.sin(offset) * 18)
            : (historyOption === "TD" ? 207 : 177) +
              Math.round(Math.sin(offset * 0.19) * 22);
        const fat = activeDayForOption
          ? 68
          : recent
            ? 52 + (((offset + 35) * 3) % 13)
            : (historyOption === "TD" ? 54 : 60) + (((offset + 364) * 3) % 15);
        macros.push({ date, option: historyOption, protein, carbs, fat });
        calories.push({
          date,
          option: historyOption,
          value: protein * 4 + carbs * 4 + fat * 9,
          unit: "kcal",
        });
      }
    }
    steps.push({
      date,
      value:
        offset === -18
          ? null
          : 6100 +
            (((offset >= -35 ? offset + 35 : offset + 364) * 997) % 5400),
      unit: "steps",
    });
  }
  return {
    ...records,
    sampleHistoryVersion: 4,
    stepsTarget: records.stepsTarget ?? 8000,
    bodyweight: sameSeed(records.bodyweight, baseInitialRecords.bodyweight)
      ? mergeByDate(weights, records.bodyweight)
      : extendBeforeFirstDate(weights, records.bodyweight),
    steps: sameSeed(records.steps, baseInitialRecords.steps)
      ? mergeByDate(steps, records.steps)
      : extendBeforeFirstDate(steps, records.steps),
    macroIntake: mergeMacroHistory(
      macros,
      records.macroIntake,
      records.client.asOf,
      knownRecentSeed,
    ),
    calorieIntake: mergeCalorieHistory(
      calories,
      records.calorieIntake ?? [],
      knownRecentCalories,
    ),
  };
}

export function upgradeAdditionalFixture(
  records: SourceRecords,
): SourceRecords {
  const habitHistory = upgradeHabitFixture(records);
  const upgraded = upgradeSampleHistory(habitHistory);
  const habitsUpgraded = upgraded;
  const oldMacroPlan = baseInitialRecords.macroTargets.filter(
    (target) => target.effectiveFrom >= "2026-09-01",
  );
  const oldCaloriePlan = baseInitialRecords.calorieTargets?.filter(
    (target) => target.effectiveFrom === "2026-10-01",
  );
  const legacyMacroTargets =
    JSON.stringify(records.macroTargets) === JSON.stringify(oldMacroPlan);
  const legacyCalorieTargets =
    records.calorieTargets !== undefined &&
    JSON.stringify(records.calorieTargets) === JSON.stringify(oldCaloriePlan);
  const historicalMacroTargets = baseInitialRecords.macroTargets.filter(
    (target) => target.effectiveFrom < "2026-09-01",
  );
  const historicalCalorieTargets = baseInitialRecords.calorieTargets?.filter(
    (target) => target.effectiveFrom < "2026-10-01",
  );
  return {
    ...habitsUpgraded,
    ...(legacyMacroTargets
      ? { macroTargets: [...historicalMacroTargets, ...records.macroTargets] }
      : {}),
    ...(records.calorieTargets === undefined
      ? { calorieTargets: baseInitialRecords.calorieTargets }
      : legacyCalorieTargets
        ? {
            calorieTargets: [
              ...(historicalCalorieTargets ?? []),
              ...(records.calorieTargets ?? []),
            ],
          }
        : {}),
    ...(records.calorieIntake === undefined
      ? {
          calorieIntake: upgradeSampleHistory(baseInitialRecords).calorieIntake,
        }
      : {}),
    ...(records.sleep === undefined ? { sleep: baseInitialRecords.sleep } : {}),
    ...(records.coachingPlan === undefined
      ? { coachingPlan: baseInitialRecords.coachingPlan }
      : {}),
    ...(records.publishedWeeklyFocus === undefined
      ? { publishedWeeklyFocus: baseInitialRecords.publishedWeeklyFocus }
      : {}),
    ...(records.roadmapWeeks === undefined
      ? { roadmapWeeks: baseInitialRecords.roadmapWeeks }
      : {}),
    ...(records.publishedMilestones === undefined
      ? { publishedMilestones: baseInitialRecords.publishedMilestones }
      : {}),
    macroIntake: habitsUpgraded.macroIntake.map((entry) => ({
      ...entry,
    })),
    habits: habitsUpgraded.habits.map((habit) => ({
      ...habit,
      scheduledDates: [...habit.scheduledDates],
      completions: habit.completions.map((completion) => ({ ...completion })),
    })),
  };
}

export function getCurrentCoachingContext(records: SourceRecords) {
  const plan = records.coachingPlan;
  if (!plan) return undefined;
  return {
    plan,
    weeklyFocus:
      records.publishedWeeklyFocus?.week === plan.currentWeek
        ? records.publishedWeeklyFocus
        : undefined,
    currentWeek: getCurrentRoadmapWeek(records),
    milestones: getPublishedMilestones(records),
  };
}

function dayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).valueOf();
  const end = new Date(`${endDate}T00:00:00Z`).valueOf();
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? Math.floor((end - start) / 86_400_000) + 1
    : 0;
}

function roundRoadmapValue(value: number, unit: string): number {
  const precision = unit === "kg" ? 2 : unit === "steps" ? 0 : 1;
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function targetForMacroEntry(
  records: SourceRecords,
  macro: "protein" | "carbs" | "fat",
  date: string,
  option: NutritionOption,
): RoadmapMetricTarget | undefined {
  const target = records.macroTargets.find(
    (candidate) =>
      candidate.macro === macro &&
      candidate.option === option &&
      candidate.effectiveFrom <= date &&
      (!candidate.effectiveTo || candidate.effectiveTo >= date),
  );
  return target
    ? {
        kind: target.kind,
        low: target.low,
        ...(target.high === undefined ? {} : { high: target.high }),
        unit: target.unit,
      }
    : undefined;
}

/** Recalculate the selected sample roadmap metrics from their dated sources. */
export function getRoadmapWeeks(records: SourceRecords): RoadmapWeek[] {
  return (records.roadmapWeeks ?? []).map((week) => {
    const totalDays = dayCount(week.startDate, week.endDate);
    const selectedMetrics = week.metrics.map((selection): RoadmapMetric => {
      if (selection.key === "bodyweight" || selection.key === "steps") {
        const source = records[selection.key];
        const valuesByDate = new Map<string, number>();
        for (const row of source) {
          if (
            row.date >= week.startDate &&
            row.date <= week.endDate &&
            row.date <= records.client.asOf &&
            row.value !== null &&
            Number.isFinite(row.value)
          ) {
            valuesByDate.set(row.date, row.value);
          }
        }
        const values = [...valuesByDate.values()];
        const unit = source.find((row) => row.unit)?.unit ?? selection.unit;
        const value =
          values.length === 0
            ? null
            : roundRoadmapValue(
                values.reduce((sum, current) => sum + current, 0) /
                  values.length,
                unit,
              );
        return {
          ...selection,
          value,
          unit,
          coverage: { loggedDays: values.length, totalDays },
        };
      }

      if (selection.key === "protein") {
        const rowsByDate = new Map<
          string,
          (typeof records.macroIntake)[number]
        >();
        const sourceRows = records.macroIntake.filter(
          (row) =>
            row.date >= week.startDate &&
            row.date <= week.endDate &&
            row.date <= records.client.asOf &&
            typeof row.protein === "number" &&
            Number.isFinite(row.protein),
        );
        for (const row of sourceRows) {
          const existing = rowsByDate.get(row.date);
          if (!existing || row.option === records.activeNutritionOption) {
            rowsByDate.set(row.date, row);
          }
        }
        const rows = [...rowsByDate.values()];
        const valuesByDate = new Map(
          rows.map((row) => [row.date, row.protein as number]),
        );
        const values = [...valuesByDate.values()];
        const targetDefinitions = rows.map((row) =>
          targetForMacroEntry(records, "protein", row.date, row.option),
        );
        const firstTarget = targetDefinitions[0];
        const sameTarget = targetDefinitions.every(
          (target) =>
            target?.kind === firstTarget?.kind &&
            target?.low === firstTarget?.low &&
            target?.high === firstTarget?.high &&
            target?.unit === firstTarget?.unit,
        );
        return {
          ...selection,
          value:
            values.length === 0
              ? null
              : roundRoadmapValue(
                  values.reduce((sum, current) => sum + current, 0) /
                    values.length,
                  "g",
                ),
          unit: "g",
          ...(sameTarget && firstTarget
            ? { target: firstTarget }
            : { target: undefined }),
          coverage: { loggedDays: values.length, totalDays },
        };
      }

      return {
        ...selection,
        value: null,
        coverage: { loggedDays: 0, totalDays },
      };
    });
    return {
      ...week,
      metrics: selectedMetrics,
      asOf: records.client.asOf,
      isCurrent:
        records.client.asOf >= week.startDate &&
        records.client.asOf <= week.endDate,
    };
  });
}

export function getCurrentRoadmapWeek(
  records: SourceRecords,
): RoadmapWeek | undefined {
  const currentWeek = records.coachingPlan?.currentWeek;
  return currentWeek === undefined
    ? undefined
    : getRoadmapWeeks(records).find((week) => week.week === currentWeek);
}

export function getPublishedMilestones(
  records: SourceRecords,
): PublishedMilestone[] {
  return (records.publishedMilestones ?? []).filter(
    (milestone) => milestone.published,
  );
}

export const initialRecords = upgradeAdditionalFixture(
  upgradeHabitFixture(baseInitialRecords),
);

export const fixture = initialRecords;
