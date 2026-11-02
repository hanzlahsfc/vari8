import type { Food, FoodPortion } from "../../../ethereal/mealplan/model";
import {
  cloneVariant,
  type MealPlan,
  type MealPlanVariant,
  type VariantSchedule,
} from "../../../ethereal/mealplan/model";
import type { IifymOption, IifymPlan } from "../types";

export function replacementQuantity(
  source: Food,
  sourceQuantity: number,
  replacement: Food,
): number {
  if (source.unit === replacement.unit) return sourceQuantity;
  const sourceCalories = (source.calories / source.amount) * sourceQuantity;
  const equivalent =
    sourceCalories > 0 && replacement.calories > 0
      ? (sourceCalories / replacement.calories) * replacement.amount
      : replacement.amount;
  return Math.max(1, Math.round(equivalent));
}

export function alternativeQuantity(
  source: Food,
  sourceQuantity: number,
  alternative: Food,
): number {
  const sourceCalories = (source.calories / source.amount) * sourceQuantity;
  const equivalent =
    sourceCalories > 0 && alternative.calories > 0
      ? (sourceCalories / alternative.calories) * alternative.amount
      : alternative.amount;
  return Math.max(1, Math.round(equivalent));
}

export function addFoodAlternative(
  portion: FoodPortion,
  foodId: string,
  quantity: number,
): FoodPortion {
  if (
    foodId === portion.foodId ||
    portion.swaps?.some((swap) => swap.foodId === foodId)
  )
    return portion;
  return {
    ...portion,
    swaps: [...(portion.swaps ?? []), { foodId, quantity }],
  };
}

/** When a portion's quantity changes, its alternatives keep the same ratio to
 *  the main food: newAlt = oldAlt x newQty / oldQty. Rounded like the editor —
 *  5 for weighed units (g/ml), whole units for piece foods — min one step.
 *  If the old quantity was 0, the alternatives are kept unchanged. */
export function scaleFoodAlternatives(
  portion: FoodPortion,
  newQuantity: number,
  foodMap: Map<string, Food>,
): Partial<FoodPortion> {
  if (!portion.swaps?.length || portion.quantity <= 0)
    return { quantity: newQuantity };
  const ratio = newQuantity / portion.quantity;
  return {
    quantity: newQuantity,
    swaps: portion.swaps.map((swap) => {
      const food = foodMap.get(swap.foodId);
      const step = food && /^(g|ml)$/i.test(food.unit) ? 5 : 1;
      return {
        ...swap,
        quantity: Math.max(
          step,
          Math.round((swap.quantity * ratio) / step) * step,
        ),
      };
    }),
  };
}

export function replacePortionFood(
  portion: FoodPortion,
  source: Food,
  replacement: Food,
): FoodPortion {
  const quantity =
    portion.swaps?.find((swap) => swap.foodId === replacement.id)?.quantity ??
    replacementQuantity(source, portion.quantity, replacement);
  const swaps = (portion.swaps ?? []).filter(
    (swap) => swap.foodId !== replacement.id,
  );
  return { ...portion, foodId: replacement.id, quantity, swaps };
}

export type CoachWeeklySchedule = Extract<
  VariantSchedule,
  { mode: "weekly" }
> & {
  roles?: { training: string; rest: string };
};

export function mealDropTargetIndex(
  mealIds: string[],
  sourceMealId: string,
  targetMealId: string,
): number | undefined {
  if (sourceMealId === targetMealId || !mealIds.includes(sourceMealId))
    return undefined;
  const targetIndex = mealIds.indexOf(targetMealId);
  return targetIndex < 0 ? undefined : targetIndex;
}

export function moveMeal(
  variant: MealPlanVariant,
  mealId: string,
  targetIndex: number,
): MealPlanVariant {
  const sourceIndex = variant.meals.findIndex((meal) => meal.id === mealId);
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= variant.meals.length ||
    sourceIndex === targetIndex
  )
    return variant;
  const meals = [...variant.meals];
  const [meal] = meals.splice(sourceIndex, 1);
  meals.splice(targetIndex, 0, meal);
  return { ...variant, meals };
}

const id = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

export function cloneIifymOption(option: IifymOption): IifymOption {
  return {
    ...structuredClone(option),
    id: id("target"),
    label: `${option.label} copy`,
    targets: structuredClone(option.targets),
  };
}

export function duplicateMealOption(
  plan: MealPlan,
  optionId: string,
): MealPlan {
  const source = plan.variants.find((option) => option.id === optionId);
  if (!source) return plan;
  const duplicate: MealPlanVariant = cloneVariant(source);
  return {
    ...plan,
    variants: [...plan.variants, duplicate],
    activeVariantId: duplicate.id,
    schedule: structuredClone(plan.schedule),
  };
}

export function duplicateIifymOption(
  plan: IifymPlan,
  optionId: string,
): IifymPlan {
  const source = plan.options.find((option) => option.id === optionId);
  if (!source) return plan;
  const duplicate = cloneIifymOption(source);
  return {
    ...plan,
    options: [...plan.options, duplicate],
    schedule: structuredClone(plan.schedule),
  };
}

function remapSchedule(
  schedule: VariantSchedule,
  deletedId: string,
  fallbackId: string,
): VariantSchedule {
  const remap = (current: string) =>
    current === deletedId ? fallbackId : current;
  if (schedule.mode === "manual")
    return {
      ...schedule,
      selectedVariantId: remap(schedule.selectedVariantId),
    };
  if (schedule.mode === "weekly") {
    const roles = (schedule as CoachWeeklySchedule).roles;
    return {
      ...schedule,
      ...(roles
        ? {
            roles: { training: remap(roles.training), rest: remap(roles.rest) },
          }
        : {}),
      days: Object.fromEntries(
        Object.entries(schedule.days).map(([day, current]) => [
          day,
          current ? remap(current) : current,
        ]),
      ) as typeof schedule.days,
    };
  }
  if (schedule.mode === "cycle")
    return {
      ...schedule,
      steps: schedule.steps.map((step) => ({
        ...step,
        variantId: remap(step.variantId),
      })),
    };
  return schedule;
}

export function removeMealOption(plan: MealPlan, optionId: string): MealPlan {
  if (
    plan.variants.length <= 1 ||
    !plan.variants.some((o) => o.id === optionId)
  )
    return plan;
  const variants = plan.variants.filter((option) => option.id !== optionId);
  const fallbackId = variants[0].id;
  return {
    ...plan,
    variants,
    activeVariantId:
      plan.activeVariantId === optionId ? fallbackId : plan.activeVariantId,
    schedule: remapSchedule(plan.schedule, optionId, fallbackId),
  };
}

export function removeIifymOption(
  plan: IifymPlan,
  optionId: string,
): IifymPlan {
  if (plan.options.length <= 1 || !plan.options.some((o) => o.id === optionId))
    return plan;
  const options = plan.options.filter((option) => option.id !== optionId);
  return {
    ...plan,
    options,
    schedule: remapSchedule(plan.schedule, optionId, options[0].id),
  };
}
