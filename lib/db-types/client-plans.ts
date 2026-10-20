/**
 * PR-M0 (schema v2, V3-L1-ClientPlans) - row types composing the canvas
 * `ClientPlans` aggregate (frontend/src/components/coach/plans/types.ts).
 * TS only; no runtime schema.
 */
import type {
  ClientGoal,
  ClientPlan,
  IifymPlan,
  MealPlan,
  TrainingProgram,
} from "@prisma/client";

export type ClientPlansRows = {
  mealPlan: MealPlan | null;
  iifym: IifymPlan | null;
  training: TrainingProgram[];
  goals: ClientGoal[];
  plan: ClientPlan | null;
};
