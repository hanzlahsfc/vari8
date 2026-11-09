// Tracker helpers for temporary nutrition plans (refeeds, diet breaks,
// ad-hoc overrides). The tracker opens the temporary plan editor from its
// date markers and previews the resolved day's targets on hover.

import { calculateVariantNutrients } from "../../ethereal/mealplan/model";
import type { CoachClient } from "../model";
import { planFoodMap, scheduledOption } from "../plans/domain";
import type { IifymPlan, TemporaryNutrition } from "../plans/types";
import { nutritionForDate } from "./timeline";

const round = (value: number) => Math.round(value);
const targetNumber = (
  target:
    | { kind: "fixed"; value: number }
    | { kind: "range"; min: number; max: number }
    | { kind: "minimum"; value: number }
    | undefined,
): number => {
  if (!target) return 0;
  if (target.kind === "range") return round((target.min + target.max) / 2);
  return round(target.value);
};

/** The Plans workspace route that opens the full-page temporary plan editor. */
export function temporaryPlanRoute(
  temporary: Pick<TemporaryNutrition, "id"> | undefined,
): string | undefined {
  return temporary ? `temporary:${temporary.id}` : undefined;
}

export function temporaryPlanForDate(
  client: CoachClient,
  date: string,
): TemporaryNutrition | undefined {
  return nutritionForDate(client, date).temporary;
}

export type TemporaryPlanTargets = {
  /** Temporary plan id, used for routing. */
  id: string;
  /** Coach-authored temporary plan name, e.g. "Refeed". */
  label: string;
  /** The variant/option the plan resolves to on this date. */
  optionLabel: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Resolve the temporary plan covering `date` and the exact variant/option
 *  that applies that day (a legacy temporary plan can still carry several). */
export function temporaryPlanTargets(
  client: CoachClient,
  date: string,
): TemporaryPlanTargets | undefined {
  const temporary = temporaryPlanForDate(client, date);
  if (!temporary) return undefined;
  const plan = temporary.plan;
  if ("variants" in plan) {
    const ids = plan.variants.map((variant) => variant.id);
    const id = scheduledOption(plan.schedule, ids, date);
    const variant =
      plan.variants.find((entry) => entry.id === id) ?? plan.variants[0];
    if (!variant) return undefined;
    const nutrients = calculateVariantNutrients(variant, planFoodMap);
    return {
      id: temporary.id,
      label: temporary.label,
      optionLabel: variant.label,
      kcal: round(nutrients.calories),
      protein: round(nutrients.protein),
      carbs: round(nutrients.carbs),
      fat: round(nutrients.fat),
    };
  }
  const iifym = plan as IifymPlan;
  const ids = iifym.options.map((option) => option.id);
  const id = scheduledOption(iifym.schedule, ids, date);
  const option =
    iifym.options.find((entry) => entry.id === id) ?? iifym.options[0];
  if (!option) return undefined;
  return {
    id: temporary.id,
    label: temporary.label,
    optionLabel: option.label,
    kcal: targetNumber(option.targets.calories),
    protein: targetNumber(option.targets.protein),
    carbs: targetNumber(option.targets.carbs),
    fat: targetNumber(option.targets.fat),
  };
}
