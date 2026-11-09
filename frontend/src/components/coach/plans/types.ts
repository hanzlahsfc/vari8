import type {
  MealPlan,
  MealTargets,
  VariantSchedule,
} from "../../ethereal/mealplan/model";
import type { SupplementPlan } from "../supplements/model";
import {
  type ActivityTargetVersion,
  addLocalDays,
  isLocalCalendarDate,
  mondayOf,
} from "../targets/model";
export type PlanVersion<T> = {
  id: string;
  content: T;
  activatedAt: string;
  archivedOn?: string;
};
export type PlanLifecycle<T> = {
  draft?: T;
  active?: PlanVersion<T>;
  history: PlanVersion<T>[];
};
export type IifymOption = { id: string; label: string; targets: MealTargets };
export type IifymPlan = {
  id: string;
  clientId: string;
  name: string;
  startDate: string;
  options: IifymOption[];
  schedule: VariantSchedule;
};
export type TrainingSet = {
  id: string;
  reps: number;
  repsMax?: number;
  tempo: string;
  type: string;
  rest: string;
  instructions: string;
  /** intensity target — used when the template's intensity is "rir" / "rpe" */
  rir?: number;
  rpe?: number;
};
export type ExerciseDefinition = {
  id: string;
  name: string;
  muscle: string;
  secondaryMuscles: string[];
  /** the UI calls this "Default cues" */
  notes: string;
  equipment?: string;
  movementPattern?: string;
  position?: string;
  primaryTarget?: string;
  additionalTargets?: string[];
};
/** Exercise-information fields a template can surface in the plan. */
export type ExerciseInfoField =
  | "equipment"
  | "movementPattern"
  | "position"
  | "cues";
export const EXERCISE_INFO_FIELDS: {
  id: ExerciseInfoField;
  label: string;
}[] = [
  { id: "equipment", label: "Equipment" },
  { id: "movementPattern", label: "Movement pattern" },
  { id: "position", label: "Position / setup" },
  { id: "cues", label: "Default cues" },
];

/**
 * Which exercise-library fields the template surfaces in the plan. `undefined`
 * (legacy) behaves as before — cues only.
 */
export function exerciseInfoFields(training?: {
  exerciseInfo?: ExerciseInfoField[];
}): ExerciseInfoField[] {
  return training?.exerciseInfo ?? ["cues"];
}
export type TrainingExercise = {
  libraryId?: string;
  secondaryMuscles?: string[];
  /** "Default cues" snapshot from the library entry */
  generalNotes?: string;
  /** info snapshots from the library entry */
  equipment?: string;
  movementPattern?: string;
  position?: string;
  primaryTarget?: string;
  additionalTargets?: string[];
  id: string;
  name: string;
  muscle?: string;
  instructions: string;
  progression: string;
  sets: TrainingSet[];
};
export type TrainingSession = {
  id: string;
  name: string;
  exercises: TrainingExercise[];
};
export type TrainingRotation =
  | { mode: "weekly"; weekdays: Record<string, string[]> }
  | { mode: "cycle"; sessionIds: (string | null)[] };
export type TrainingAdjustmentRules = {
  /** Working sets removed per exercise (0 or negative, default -1). */
  setsDelta: number;
  /** Added to each set's RIR; only used when the plan tracks RIR. */
  rirDelta?: number;
  /** Subtracted from each set's RPE; only used when the plan tracks RPE. */
  rpeDelta?: number;
};
export type TrainingAdjustment = {
  id: string;
  kind: "deload" | "intro";
  fromWeek: number;
  toWeek: number;
  /** Snapped Mon–Sun range covered by the adjustment. */
  startDate: string;
  endDate: string;
  mode: "none" | "rules" | "manual";
  rules?: TrainingAdjustmentRules;
  /** Plan week → sessions for manual adjustments; base when a week is absent. */
  manual?: Record<string, TrainingSession[]>;
  note?: string;
};
export type TrainingPlan = {
  id: string;
  clientId: string;
  name: string;
  startDate: string;
  program: "Evergreen" | "Week-based";
  weeks: number;
  overrides: Record<string, TrainingSession[]>;
  rotation?: TrainingRotation;
  /** Deload / intro windows applied on top of the week overrides. */
  adjustments?: TrainingAdjustment[];
  /** Coach-authored focus line shown on the athlete profile. */
  focus?: string;
};
export type ClientGoal = {
  id: string;
  fieldId: string;
  value: number;
  unit: string;
  date: string;
};
/** Date-less metric target ("sleep ≥ 7.5 h", "water 4–5 L"). */
export type ClientOtherTarget = {
  id: string;
  fieldId: string;
  kind: "minimum" | "maximum" | "range" | "exact";
  value?: number;
  min?: number;
  max?: number;
};
export type LogField = "weight" | "reps" | "rpe" | "rir" | "note";
export type LoggedSet = {
  setId: string;
  done: boolean;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  note: string;
  flagged: boolean;
};
export type LoggedExercise = {
  exerciseId: string;
  exerciseKey: string;
  prescription: TrainingExercise;
  sets: LoggedSet[];
};
export type TrainingSessionLog = {
  id: string;
  clientId: string;
  planId: string;
  /** Display week index (unbounded). */
  week: number;
  /** Rotation schedule entry key for this occurrence. */
  occurrenceKey: string;
  sessionId: string;
  sessionName: string;
  scheduledDate: string;
  logFields: LogField[];
  loadUnit: "kg" | "lb";
  exercises: LoggedExercise[];
  status: "in-progress" | "finished";
  startedAt: string;
  finishedAt?: string;
};
export type TrainingCoachNote = {
  id: string;
  clientId: string;
  /** TrainingSession.id */
  sessionId: string;
  /** exerciseKey(exercise) */
  exerciseKey: string;
  /** 0-based set index */
  setIndex?: number;
  /** the logged field the note points at; undefined = row-level (legacy) */
  field?: LogField;
  /** displayWeek of the current plan */
  fromWeek: number;
  /** === fromWeek for "only"; undefined = onwards */
  untilWeek?: number;
  text: string;
  createdAt: string;
  updatedAt?: string;
};
export type TemporaryNutrition = {
  id: string;
  kind: "refeed" | "diet-break" | "custom";
  label: string;
  startDate: string;
  endDate: string;
  source: "mealPlan" | "iifym";
  plan: MealPlan | IifymPlan;
  createdAt: string;
};
export type ClientPlans = {
  nutrition: {
    mealPlan: PlanLifecycle<MealPlan>;
    iifym: PlanLifecycle<IifymPlan>;
    /** Coach-scoped temporary plans applied by date range. */
    temporary?: TemporaryNutrition[];
  };
  training: PlanLifecycle<TrainingPlan>;
  goals: ClientGoal[];
  otherTargets?: ClientOtherTarget[];
  activityTargets?: ActivityTargetVersion[];
  supplements?: SupplementPlan;
};
export type ModuleKind = "mealPlan" | "iifym" | "training";
export const emptyClientPlans = (): ClientPlans => ({
  nutrition: { mealPlan: { history: [] }, iifym: { history: [] } },
  training: { history: [] },
  goals: [],
  activityTargets: [],
});
/** Mon–Sun calendar week index inside the plan (clamped to the plan length). */
export function trainingWeek(plan: TrainingPlan, date: string): number {
  return plan.program === "Evergreen"
    ? 1
    : Math.max(
        1,
        Math.min(
          plan.weeks,
          Math.floor(
            (Date.parse(`${date}T12:00:00Z`) -
              Date.parse(`${plan.startDate}T12:00:00Z`)) /
              604800000,
          ) + 1,
        ),
      );
}

export function isWarmupSet(set: TrainingSet): boolean {
  return /warm[ -]?up/i.test(set.type);
}

/** Working sets in a session list; warm-up sets never count. */
export function countWorkingSets(sessions: TrainingSession[]): number {
  return sessions.reduce(
    (total, session) =>
      total +
      session.exercises.reduce(
        (inner, exercise) =>
          inner + exercise.sets.filter((set) => !isWarmupSet(set)).length,
        0,
      ),
    0,
  );
}

export function isTrainingSessionValue(
  value: unknown,
): value is TrainingSession {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.id === "string" &&
    typeof session.name === "string" &&
    Array.isArray(session.exercises) &&
    session.exercises.every((exercise) => {
      if (
        typeof exercise !== "object" ||
        exercise === null ||
        Array.isArray(exercise)
      )
        return false;
      const entry = exercise as Record<string, unknown>;
      return (
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        (entry.muscle === undefined || typeof entry.muscle === "string") &&
        (entry.secondaryMuscles === undefined ||
          (Array.isArray(entry.secondaryMuscles) &&
            entry.secondaryMuscles.every(
              (item) => typeof item === "string",
            ))) &&
        (entry.libraryId === undefined ||
          typeof entry.libraryId === "string") &&
        (entry.generalNotes === undefined ||
          typeof entry.generalNotes === "string") &&
        typeof entry.instructions === "string" &&
        typeof entry.progression === "string" &&
        Array.isArray(entry.sets) &&
        entry.sets.every((set) => {
          if (typeof set !== "object" || set === null || Array.isArray(set))
            return false;
          const entrySet = set as Record<string, unknown>;
          return (
            typeof entrySet.id === "string" &&
            typeof entrySet.reps === "number" &&
            Number.isFinite(entrySet.reps) &&
            (entrySet.repsMax === undefined ||
              (typeof entrySet.repsMax === "number" &&
                Number.isFinite(entrySet.repsMax))) &&
            ["tempo", "type", "rest", "instructions"].every(
              (key) => typeof entrySet[key] === "string",
            ) &&
            (entrySet.rir === undefined || typeof entrySet.rir === "number") &&
            (entrySet.rpe === undefined || typeof entrySet.rpe === "number")
          );
        })
      );
    })
  );
}

const isAdjustmentRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isTrainingAdjustment(
  value: unknown,
): value is TrainingAdjustment {
  if (!isAdjustmentRecord(value)) return false;
  const adjustment = value;
  if (typeof adjustment.id !== "string" || !adjustment.id) return false;
  if (adjustment.kind !== "deload" && adjustment.kind !== "intro") return false;
  if (
    typeof adjustment.fromWeek !== "number" ||
    !Number.isInteger(adjustment.fromWeek) ||
    typeof adjustment.toWeek !== "number" ||
    !Number.isInteger(adjustment.toWeek) ||
    adjustment.fromWeek < 1 ||
    adjustment.toWeek < adjustment.fromWeek
  )
    return false;
  if (
    typeof adjustment.startDate !== "string" ||
    !isLocalCalendarDate(adjustment.startDate) ||
    typeof adjustment.endDate !== "string" ||
    !isLocalCalendarDate(adjustment.endDate) ||
    adjustment.endDate < adjustment.startDate
  )
    return false;
  if (
    adjustment.mode !== "none" &&
    adjustment.mode !== "rules" &&
    adjustment.mode !== "manual"
  )
    return false;
  if (adjustment.note !== undefined && typeof adjustment.note !== "string")
    return false;
  if (adjustment.rules !== undefined) {
    const rules = adjustment.rules;
    if (!isAdjustmentRecord(rules)) return false;
    if (
      typeof rules.setsDelta !== "number" ||
      !Number.isFinite(rules.setsDelta)
    )
      return false;
    if (
      rules.rirDelta !== undefined &&
      (typeof rules.rirDelta !== "number" || !Number.isFinite(rules.rirDelta))
    )
      return false;
    if (
      rules.rpeDelta !== undefined &&
      (typeof rules.rpeDelta !== "number" || !Number.isFinite(rules.rpeDelta))
    )
      return false;
  }
  if (adjustment.manual !== undefined) {
    if (!isAdjustmentRecord(adjustment.manual)) return false;
    for (const [week, sessions] of Object.entries(adjustment.manual)) {
      if (!/^[1-9]\d*$/.test(week)) return false;
      if (!Array.isArray(sessions) || !sessions.every(isTrainingSessionValue))
        return false;
    }
  }
  return true;
}

/** Accept only structurally sound adjustments; malformed values are dropped. */
export function cleanTrainingAdjustments(
  value: unknown,
): TrainingAdjustment[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.filter(isTrainingAdjustment) as TrainingAdjustment[];
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function resolveBaseTrainingWeek(
  plan: TrainingPlan,
  week: number,
): TrainingSession[] {
  const key = Object.keys(plan.overrides)
    .map(Number)
    .filter((n) => n <= week && n >= 1)
    .sort((a, b) => b - a)[0];
  return key === undefined ? [] : plan.overrides[String(key)];
}

export function adjustmentForWeek(
  plan: TrainingPlan,
  week: number,
): TrainingAdjustment | undefined {
  // Mon–Sun display weeks can map onto two plan weeks when the plan starts
  // mid-week, so more than one adjustment may match. The earlier-starting
  // adjustment owns the shared week; the next one takes over after its end.
  return (plan.adjustments ?? [])
    .filter(
      (adjustment) => adjustment.fromWeek <= week && week <= adjustment.toWeek,
    )
    .sort((a, b) => a.fromWeek - b.fromWeek || a.toWeek - b.toWeek)[0];
}

/**
 * Apply a deload/intro rules preset to a deep-cloned session list.
 * Working sets are removed from the end of each exercise, never below one.
 * Warm-up sets are neither removed nor counted. Intensity deltas only apply
 * for the intensity the plan tracks (`rir` / `rpe`); `off` ignores both.
 */
export function applyAdjustmentRules(
  sessions: TrainingSession[],
  rules: TrainingAdjustmentRules | undefined,
  intensity?: "off" | "rir" | "rpe",
): TrainingSession[] {
  const next = structuredClone(sessions);
  const rawDelta =
    typeof rules?.setsDelta === "number" && Number.isFinite(rules.setsDelta)
      ? Math.min(0, rules.setsDelta)
      : -1;
  const removeCount = Math.abs(Math.round(rawDelta));
  const rirDelta =
    typeof rules?.rirDelta === "number" && Number.isFinite(rules.rirDelta)
      ? Math.max(0, rules.rirDelta)
      : undefined;
  const rpeDelta =
    typeof rules?.rpeDelta === "number" && Number.isFinite(rules.rpeDelta)
      ? Math.max(0, rules.rpeDelta)
      : undefined;
  const applyRir =
    rirDelta !== undefined && (intensity === undefined || intensity === "rir");
  const applyRpe =
    rpeDelta !== undefined && (intensity === undefined || intensity === "rpe");

  for (const session of next) {
    for (const exercise of session.exercises) {
      if (removeCount > 0) {
        const workingIndexes = exercise.sets
          .map((set, index) => ({ set, index }))
          .filter((entry) => !isWarmupSet(entry.set))
          .map((entry) => entry.index);
        if (workingIndexes.length > 1) {
          const remove = Math.min(removeCount, workingIndexes.length - 1);
          const removed = new Set(workingIndexes.slice(-remove));
          exercise.sets = exercise.sets.filter(
            (_, index) => !removed.has(index),
          );
        }
      }
      for (const set of exercise.sets) {
        if (applyRir && typeof set.rir === "number")
          set.rir = clamp(set.rir + rirDelta, 0, 10);
        if (applyRpe && typeof set.rpe === "number")
          set.rpe = clamp(set.rpe - rpeDelta, 1, 10);
      }
    }
  }
  return next;
}

export function resolveTrainingWeek(
  plan: TrainingPlan,
  week: number,
): TrainingSession[] {
  const adjustment = adjustmentForWeek(plan, week);
  if (!adjustment) return resolveBaseTrainingWeek(plan, week);
  if (adjustment.mode === "none") return [];
  if (adjustment.mode === "manual")
    return (
      adjustment.manual?.[String(week)] ?? resolveBaseTrainingWeek(plan, week)
    );
  return applyAdjustmentRules(
    resolveBaseTrainingWeek(plan, week),
    adjustment.rules,
  );
}

export function setTrainingWeek(
  plan: TrainingPlan,
  week: number,
  sessions: TrainingSession[],
): TrainingPlan {
  const adjustment = adjustmentForWeek(plan, week);
  if (adjustment?.mode === "manual") {
    return {
      ...plan,
      adjustments: (plan.adjustments ?? []).map((candidate) =>
        candidate.id === adjustment.id
          ? {
              ...candidate,
              manual: {
                ...(candidate.manual ?? {}),
                [String(week)]: structuredClone(sessions),
              },
            }
          : candidate,
      ),
    };
  }
  return {
    ...plan,
    overrides: {
      ...plan.overrides,
      [plan.program === "Evergreen" ? "1" : String(week)]:
        structuredClone(sessions),
    },
  };
}

/**
 * Snap a date range to the whole Mon–Sun plan weeks it covers. Plan weeks use
 * `trainingWeek`, so a range that starts mid-week still reports its full week.
 */
export function snapRangeToPlanWeeks(
  plan: TrainingPlan,
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string; fromWeek: number; toWeek: number } {
  const start = mondayOf(startDate);
  const end = addLocalDays(mondayOf(endDate), 6);
  return {
    startDate: start,
    endDate: end,
    fromWeek: trainingWeek(plan, start),
    toWeek: trainingWeek(plan, end),
  };
}

/** Validate a candidate adjustment against a plan. Returns an error or null. */
export function validateAdjustment(
  plan: TrainingPlan,
  candidate: Pick<
    TrainingAdjustment,
    "id" | "fromWeek" | "toWeek" | "startDate" | "endDate"
  >,
): string | null {
  if (!isLocalCalendarDate(candidate.startDate))
    return "Choose a valid start date.";
  if (!isLocalCalendarDate(candidate.endDate))
    return "Choose a valid end date.";
  if (candidate.endDate < candidate.startDate)
    return "End date must be on or after the start date.";
  if (candidate.fromWeek > candidate.toWeek)
    return "Choose a date range that covers one or more plan weeks.";
  if (candidate.fromWeek < 1) return "Choose a range inside the training plan.";
  if (plan.program !== "Evergreen" && candidate.toWeek > plan.weeks)
    return `Choose a range inside the ${plan.weeks}-week plan.`;
  if (candidate.endDate < plan.startDate)
    return "Choose a range inside or after the plan start.";
  if (plan.program !== "Evergreen") {
    const planEnd = addLocalDays(plan.startDate, plan.weeks * 7 - 1);
    if (candidate.startDate > planEnd)
      return `Choose a range inside the ${plan.weeks}-week plan.`;
  }
  // Compare the snapped date ranges. Plan weeks can straddle a Mon–Sun
  // display week when a plan starts mid-week, but two non-overlapping date
  // ranges are still distinct adjustments.
  const clash = (plan.adjustments ?? []).find(
    (existing) =>
      existing.id !== candidate.id &&
      candidate.startDate <= existing.endDate &&
      existing.startDate <= candidate.endDate,
  );
  if (clash)
    return `This overlaps an existing ${clash.kind === "intro" ? "intro week" : "deload"}.`;
  return null;
}
