/**
 * PR-M0 (schema v2, N05/S06-10) - saved_meal.meal JSONB shape. Mirrors
 * the canvas `Meal` (incl. `TargetValue`/`MealTargets`, `FoodPortion`,
 * `FoodSwap`) in frontend/src/components/ethereal/mealplan/model.ts.
 */
import { z } from "zod";

import { mealTargets } from "./meal-targets";

export const savedMealFoodSwap = z.object({
  foodId: z.string(),
  quantity: z.number(),
  note: z.string().optional(),
});
export type SavedMealFoodSwap = z.infer<typeof savedMealFoodSwap>;

export const savedMealFoodPortion = z.object({
  foodId: z.string(),
  quantity: z.number(),
  swaps: z.array(savedMealFoodSwap).optional(),
});
export type SavedMealFoodPortion = z.infer<typeof savedMealFoodPortion>;

export const savedMealPayload = z.object({
  id: z.string(),
  label: z.string(),
  time: z.string(),
  frequency: z.string().optional(),
  portions: z.array(savedMealFoodPortion),
  target: mealTargets.optional(),
});
export type SavedMealPayload = z.infer<typeof savedMealPayload>;
