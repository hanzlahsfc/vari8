import type {
  MealPlan,
  MealTargets,
  VariantSchedule,
} from "../../ethereal/mealplan/model";
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
export type TrainingPlan = {
  id: string;
  clientId: string;
  name: string;
  startDate: string;
  program: "Evergreen" | "Week-based";
  weeks: number;
  overrides: Record<string, TrainingSession[]>;
};
export type ClientGoal = {
  id: string;
  fieldId: string;
  value: number;
  unit: string;
  date: string;
};
export type ClientPlans = {
  nutrition: {
    mealPlan: PlanLifecycle<MealPlan>;
    iifym: PlanLifecycle<IifymPlan>;
  };
  training: PlanLifecycle<TrainingPlan>;
  goals: ClientGoal[];
};
export type ModuleKind = "mealPlan" | "iifym" | "training";
export const emptyClientPlans = (): ClientPlans => ({
  nutrition: { mealPlan: { history: [] }, iifym: { history: [] } },
  training: { history: [] },
  goals: [],
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
