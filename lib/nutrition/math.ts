/**
 * PR-M5 (D29, #36) — shared nutrition math. Ported verbatim from the
 * canvas so server and client compute the same numbers:
 * - `frontend/src/components/ethereal/mealplan/model.ts`
 *   (`Nutrients`, `Food`, `emptyNutrients`, `addNutrients`,
 *   `calculatePortionNutrients`, `calculateMealNutrients`,
 *   `calculateVariantNutrients`)
 * - `frontend/src/components/ethereal/mealplan/overview-model.ts`
 *   (`macroEnergyShares` — the 4/4/9 ring)
 * - `frontend/src/components/coach/plans/domain.ts`
 *   (`targetNumber`, the IIFYM derived-kcal branch of `planTargets`)
 *
 * The canvas keeps these functions in `frontend/` until a later wiring
 * PR rewires it to this module (standing orders rule 3: this card ports,
 * it does not edit `frontend/`).
 *
 * Blank stays missing (#36): callers pass only values that exist. This
 * module never invents a nutrient — a portion referencing an unknown
 * food contributes nothing, exactly as the canvas skips it.
 */

import type { MealTargets, TargetValue } from "../db-types/meal-targets";

export type Nutrients = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type Food = Nutrients & {
  id: string;
  name: string;
  /** Amount in `unit` the stored nutrient row describes. */
  amount: number;
  unit: string;
};

/** Minimal portion/meal/variant shapes — satisfied by the normalized
 * meal-plan payload (`lib/mealplan/payload.ts`) and by the canvas
 * `FoodPortion`/`Meal`/`MealPlanVariant` models. */
export type PortionLike = { foodId: string; quantity: number };
export type MealLike = { portions: readonly PortionLike[] };
export type VariantLike = { meals: readonly MealLike[] };

export const emptyNutrients = (): Nutrients => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

/** Portion nutrients: `quantity` in the food's own row unit scales the
 * row linearly; a non-positive `amount` contributes nothing (canvas
 * guard, not a correction). */
export function calculatePortionNutrients(
  food: Food,
  quantity: number,
): Nutrients {
  const factor = food.amount > 0 ? quantity / food.amount : 0;
  return {
    calories: food.calories * factor,
    protein: food.protein * factor,
    carbs: food.carbs * factor,
    fat: food.fat * factor,
  };
}

export function calculateMealNutrients(
  meal: MealLike,
  foods: ReadonlyMap<string, Food>,
): Nutrients {
  return meal.portions.reduce((total, portion) => {
    const food = foods.get(portion.foodId);
    if (!food) return total;
    const nutrients = calculatePortionNutrients(food, portion.quantity);
    return addNutrients(total, nutrients);
  }, emptyNutrients());
}

export function calculateVariantNutrients(
  variant: VariantLike,
  foods: ReadonlyMap<string, Food>,
): Nutrients {
  return variant.meals.reduce(
    (total, meal) => addNutrients(total, calculateMealNutrients(meal, foods)),
    emptyNutrients(),
  );
}

export type MacroEnergyShares = Pick<Nutrients, "protein" | "carbs" | "fat">;

/** Macro percentages use the standard 4/4/9 factors, independently of
 * source kcal — the canvas ring. All-zero input yields all-zero shares. */
export function macroEnergyShares(nutrients: Nutrients): MacroEnergyShares {
  const proteinEnergy = Math.max(0, nutrients.protein) * 4;
  const carbsEnergy = Math.max(0, nutrients.carbs) * 4;
  const fatEnergy = Math.max(0, nutrients.fat) * 9;
  const totalEnergy = proteinEnergy + carbsEnergy + fatEnergy;
  if (totalEnergy === 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: proteinEnergy / totalEnergy,
    carbs: carbsEnergy / totalEnergy,
    fat: fatEnergy / totalEnergy,
  };
}

/** Recorded-day macro actuals (card 09, #173): each field is the stored
 * gram amount or `null` when that macro was not recorded for the day.
 * `null` is not zero - it stays missing. */
export type MacroActuals = {
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

/** Derived actuals kcal: 4 kcal per gram of protein or carbohydrate, 9
 * per gram of fat, summed over the macros present. A missing macro
 * contributes nothing; an all-empty day yields 0 kcal, never null. This
 * value is display math only - it is never stored and never feeds the
 * sheet's own constants. */
export function caloriesFromMacros(actuals: MacroActuals): number {
  return (
    (actuals.protein ?? 0) * 4 +
    (actuals.carbohydrate ?? 0) * 4 +
    (actuals.fat ?? 0) * 9
  );
}

/** Canvas `targetNumber`: fixed/minimum read their value, a range reads
 * its midpoint; an absent target reads 0. */
export function targetNumber(target: TargetValue | undefined): number {
  return !target
    ? 0
    : target.kind === "range"
      ? (target.min + target.max) / 2
      : target.value;
}

/** Canvas `planTargets` IIFYM branch: calories-style options read the
 * entered calorie target; macro-style options derive kcal at 4/4/9 from
 * the macro targets. Macro fields read their target numbers verbatim. */
export function iifymTargetNutrients(targets: MealTargets): Nutrients {
  return {
    calories:
      targets.style === "calories"
        ? targetNumber(targets.calories)
        : targetNumber(targets.protein) * 4 +
          targetNumber(targets.carbs) * 4 +
          targetNumber(targets.fat) * 9,
    protein: targetNumber(targets.protein),
    carbs: targetNumber(targets.carbs),
    fat: targetNumber(targets.fat),
  };
}
