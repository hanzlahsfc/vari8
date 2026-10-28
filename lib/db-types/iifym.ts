/**
 * PR-M0 (schema v2, V3-L1-IIFYM) - iifym_plan draft/version payload
 * shape: { options: IifymOption[], schedule: VariantSchedule }. Mirrors
 * `IifymOption` in frontend/src/components/coach/plans/types.ts and
 * `VariantSchedule` in frontend/src/components/ethereal/mealplan/model.ts.
 */
import { z } from "zod";

import { mealTargets } from "./meal-targets";

export const iifymOption = z.object({
  id: z.string(),
  label: z.string(),
  targets: mealTargets,
});
export type IifymOption = z.infer<typeof iifymOption>;

// ISO weekday keys "1" (Monday) through "7" (Sunday).
export const weekdayKey = z.enum(["1", "2", "3", "4", "5", "6", "7"]);

export const variantSchedule = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("manual"), selectedVariantId: z.string() }),
  z.object({
    mode: z.literal("weekly"),
    days: z.partialRecord(weekdayKey, z.string()),
  }),
  z.object({
    mode: z.literal("cycle"),
    anchorDate: z.string(),
    steps: z.array(z.object({ variantId: z.string(), days: z.number() })),
  }),
  z.object({ mode: z.literal("flexible") }),
]);
export type VariantSchedule = z.infer<typeof variantSchedule>;

export const iifymPayload = z.object({
  options: z.array(iifymOption),
  schedule: variantSchedule,
});
export type IifymPayload = z.infer<typeof iifymPayload>;
