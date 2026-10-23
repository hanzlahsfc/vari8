/** Nutrition targets widget view model: one column per nutrition option. */

import {
  calculateVariantNutrients,
  type MealPlan,
  type TargetValue,
} from "../../ethereal/mealplan/model";
import type { CoachClient } from "../model";
import { planFoodMap } from "../plans/domain";
import type { IifymPlan } from "../plans/types";
import { nutritionForDate } from "./timeline";

export type NutritionOptionColumn = {
  id: string;
  label: string;
  /** True when this option applies on `today` (incl. timeline overrides). */
  today: boolean;
  cells: { kcal: string; protein: string; carbs: string; fat: string };
};

export type NutritionTargetsModel = {
  source: "mealPlan" | "iifym";
  planName: string;
  options: NutritionOptionColumn[];
};

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Same wording as the plan workspace: 2,600 / 2,300–2,500 / ≥2,400 / —. */
export function targetWording(
  target: TargetValue | undefined,
  decimals = false,
): string {
  if (!target) return "—";
  const format = decimals ? number : integer;
  if (target.kind === "range")
    return `${format.format(target.min)}–${format.format(target.max)}`;
  return `${target.kind === "minimum" ? "≥" : ""}${format.format(target.value)}`;
}

function mealPlanColumns(
  plan: MealPlan,
  todayOptionId: string | undefined,
): NutritionOptionColumn[] {
  return plan.variants.map((variant) => {
    const totals = calculateVariantNutrients(variant, planFoodMap);
    return {
      id: variant.id,
      label: variant.label || "Untitled day",
      today: variant.id === todayOptionId,
      cells: {
        kcal: integer.format(Math.round(totals.calories)),
        protein: number.format(Math.round(totals.protein * 10) / 10),
        carbs: number.format(Math.round(totals.carbs * 10) / 10),
        fat: number.format(Math.round(totals.fat * 10) / 10),
      },
    };
  });
}

/** Macro-derived energy (P·4 + C·4 + F·9) when no calorie target exists. */
function derivedEnergy(option: IifymPlan["options"][number]): string {
  const factors: [TargetValue | undefined, number][] = [
    [option.targets.protein, 4],
    [option.targets.carbs, 4],
    [option.targets.fat, 9],
  ];
  if (!factors.some(([target]) => target)) return "—";
  const energy = (bound: "min" | "max") =>
    factors.reduce(
      (total, [target, factor]) =>
        total +
        factor *
          (!target
            ? 0
            : target.kind === "range"
              ? target[bound]
              : target.value),
      0,
    );
  const hasMinimum = factors.some(([target]) => target?.kind === "minimum");
  const hasRange = factors.some(([target]) => target?.kind === "range");
  const min = integer.format(energy("min"));
  const max = integer.format(energy("max"));
  if (hasMinimum) return `≥${min}`;
  return hasRange && min !== max ? `${min}–${max}` : min;
}

function iifymColumns(
  plan: IifymPlan,
  todayOptionId: string | undefined,
): NutritionOptionColumn[] {
  return plan.options.map((option) => ({
    id: option.id,
    label: option.label || "Untitled day",
    today: option.id === todayOptionId,
    cells: {
      kcal: option.targets.calories
        ? targetWording(option.targets.calories)
        : derivedEnergy(option),
      protein: targetWording(option.targets.protein),
      carbs: targetWording(option.targets.carbs),
      fat: targetWording(option.targets.fat),
    },
  }));
}

/**
 * Columns for the Nutrition targets widget, or undefined when the athlete
 * has no active plan on `today` (widget shows the empty state).
 */
export function nutritionTargetsModel(
  client: CoachClient,
  today: string,
): NutritionTargetsModel | undefined {
  const resolved = nutritionForDate(client, today);
  const plan = resolved.plan;
  if (!plan) return undefined;
  return {
    source: resolved.source,
    planName: (plan as { name?: string }).name ?? "Nutrition plan",
    options:
      resolved.source === "mealPlan"
        ? mealPlanColumns(plan as MealPlan, resolved.optionId)
        : iifymColumns(plan as IifymPlan, resolved.optionId),
  };
}
