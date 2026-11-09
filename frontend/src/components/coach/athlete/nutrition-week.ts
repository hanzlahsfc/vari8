// Pure weekly nutrition-target maths for the athlete timeline. The timeline
// shows one planned average per week (kcal, P, C, F) instead of one column set
// per variant slot, so every planned day is resolved through the same per-day
// nutrition resolver the athlete sees: plan version, variant/option schedule
// and temporary-plan coverage all apply day by day.

import {
  calculateVariantNutrients,
  type MealPlan,
  type Nutrients,
} from "../../ethereal/mealplan/model";
import type { CoachClient } from "../model";
import { planFoodMap, targetNumber } from "../plans/domain";
import type { IifymPlan } from "../plans/types";
import { nutritionForDate } from "./timeline";

/** The minimal week shape the breakdown needs (matches the timeline `Week`). */
export type NutritionWeek = {
  monday: string;
  sunday: string;
  days: string[];
};

export type NutritionDayTarget = {
  date: string;
  label: string;
  nutrients: Nutrients;
};

export type NutritionVariantBreakdown = {
  label: string;
  days: number;
  nutrients: Nutrients;
};

export type WeekNutritionBreakdown = {
  plannedDays: number;
  average: Nutrients | undefined;
  /** Variant rows ordered by the active plan's variant order, then first day. */
  variants: NutritionVariantBreakdown[];
};

const emptyNutrients = (): Nutrients => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

const addNutrients = (a: Nutrients, b: Nutrients): Nutrients => ({
  calories: a.calories + b.calories,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fat: a.fat + b.fat,
});

const divideNutrients = (total: Nutrients, days: number): Nutrients => ({
  calories: total.calories / days,
  protein: total.protein / days,
  carbs: total.carbs / days,
  fat: total.fat / days,
});

/** IIFYM targets use the same calories fallback as the rest of the coach UI. */
function iifymNutrients(option: IifymPlan["options"][number]): Nutrients {
  const protein = targetNumber(option.targets.protein);
  const carbs = targetNumber(option.targets.carbs);
  const fat = targetNumber(option.targets.fat);
  return {
    calories:
      targetNumber(option.targets.calories) ||
      protein * 4 + carbs * 4 + fat * 9,
    protein,
    carbs,
    fat,
  };
}

/**
 * One planned target per day of the week. Temporary plans are deliberately
 * excluded (they are shown as Changes chips); days before a plan starts, days
 * without a scheduled variant/option and flexible schedules contribute nothing.
 */
export function nutritionDayTargets(
  client: CoachClient,
  week: NutritionWeek,
): NutritionDayTarget[] {
  const out: NutritionDayTarget[] = [];
  for (const date of week.days) {
    const resolved = nutritionForDate(client, date);
    if (
      !resolved.plan ||
      resolved.temporary ||
      !resolved.optionId ||
      !resolved.label
    )
      continue;
    let nutrients: Nutrients | undefined;
    if (resolved.source === "iifym") {
      const plan = resolved.plan as IifymPlan;
      const option = plan.options.find(
        (entry) => entry.id === resolved.optionId,
      );
      if (option) nutrients = iifymNutrients(option);
    } else {
      const plan = resolved.plan as MealPlan;
      const variant = plan.variants.find(
        (entry) => entry.id === resolved.optionId,
      );
      if (variant) nutrients = calculateVariantNutrients(variant, planFoodMap);
    }
    if (nutrients) out.push({ date, label: resolved.label, nutrients });
  }
  return out;
}

/** Variant labels in the order of the plan active on the week's last planned day. */
function activeVariantOrder(
  client: CoachClient,
  week: NutritionWeek,
  planned: NutritionDayTarget[],
): string[] {
  for (let i = week.days.length - 1; i >= 0; i -= 1) {
    const date = week.days[i];
    if (!planned.some((entry) => entry.date === date)) continue;
    const resolved = nutritionForDate(client, date);
    if (!resolved.plan || resolved.temporary) continue;
    return resolved.source === "iifym"
      ? (resolved.plan as IifymPlan).options.map((option) => option.label)
      : (resolved.plan as MealPlan).variants.map((variant) => variant.label);
  }
  return [];
}

/**
 * Weighted daily average of the planned targets across the days that have a
 * regular plan. Values stay unrounded; the timeline rounds only for display.
 */
export function weekNutritionBreakdown(
  client: CoachClient,
  week: NutritionWeek,
): WeekNutritionBreakdown {
  const planned = nutritionDayTargets(client, week);
  const plannedDays = planned.length;
  if (!plannedDays) return { plannedDays: 0, average: undefined, variants: [] };

  const grouped = new Map<
    string,
    { label: string; days: number; totals: Nutrients; first: number }
  >();
  planned.forEach((entry, index) => {
    const bucket = grouped.get(entry.label) ?? {
      label: entry.label,
      days: 0,
      totals: emptyNutrients(),
      first: index,
    };
    bucket.days += 1;
    bucket.totals = addNutrients(bucket.totals, entry.nutrients);
    grouped.set(entry.label, bucket);
  });

  const order = [
    ...activeVariantOrder(client, week, planned),
    ...[...grouped.values()]
      .sort((a, b) => a.first - b.first)
      .map((entry) => entry.label),
  ];
  const seen = new Set<string>();
  const variants: NutritionVariantBreakdown[] = [];
  for (const label of order) {
    if (seen.has(label)) continue;
    seen.add(label);
    const bucket = grouped.get(label);
    if (!bucket) continue;
    variants.push({
      label,
      days: bucket.days,
      nutrients: divideNutrients(bucket.totals, bucket.days),
    });
  }

  const totals = planned.reduce(
    (sum, entry) => addNutrients(sum, entry.nutrients),
    emptyNutrients(),
  );
  return {
    plannedDays,
    average: divideNutrients(totals, plannedDays),
    variants,
  };
}
