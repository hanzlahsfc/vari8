/**
 * PR-M0 (schema v2) - shared meal target shapes. Mirrors `TargetValue`,
 * `TargetStyle` and `MealTargets` in
 * frontend/src/components/ethereal/mealplan/model.ts.
 */
import { z } from "zod";

export const targetValue = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), value: z.number() }),
  z.object({ kind: z.literal("range"), min: z.number(), max: z.number() }),
  z.object({ kind: z.literal("minimum"), value: z.number() }),
]);
export type TargetValue = z.infer<typeof targetValue>;

export const targetStyle = z.enum(["calories", "macros"]);
export type TargetStyle = z.infer<typeof targetStyle>;

export const mealTargets = z.object({
  style: targetStyle,
  calories: targetValue.optional(),
  protein: targetValue.optional(),
  carbs: targetValue.optional(),
  fat: targetValue.optional(),
});
export type MealTargets = z.infer<typeof mealTargets>;
