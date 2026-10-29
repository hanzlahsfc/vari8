import type {
  MealPlan,
  MealTargets,
  VariantSchedule,
} from "../../ethereal/mealplan/model";
import type { SupplementPlan } from "../supplements/model";
import type { ActivityTargetVersion } from "../targets/model";
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
};
export type ExerciseDefinition = {
  id: string;
  name: string;
  muscle: string;
  secondaryMuscles: string[];
  notes: string;
};
export type TrainingExercise = {
  libraryId?: string;
  secondaryMuscles?: string[];
  generalNotes?: string;
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
export type TrainingPlan = {
  id: string;
  clientId: string;
  name: string;
  startDate: string;
  program: "Evergreen" | "Week-based";
  weeks: number;
  overrides: Record<string, TrainingSession[]>;
  rotation?: TrainingRotation;
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
/** Date-less metric target ("sleep ≥ 7.5 h", "water 4-5 L"). */
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
export function resolveTrainingWeek(
  plan: TrainingPlan,
  week: number,
): TrainingSession[] {
  const key = Object.keys(plan.overrides)
    .map(Number)
    .filter((n) => n <= week && n >= 1)
    .sort((a, b) => b - a)[0];
  return key === undefined ? [] : plan.overrides[String(key)];
}
export function setTrainingWeek(
  plan: TrainingPlan,
  week: number,
  sessions: TrainingSession[],
): TrainingPlan {
  return {
    ...plan,
    overrides: {
      ...plan.overrides,
      [plan.program === "Evergreen" ? "1" : String(week)]:
        structuredClone(sessions),
    },
  };
}
