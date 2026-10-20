import {
  cloneVariant,
  type MealPlan,
  type MealPlanVariant,
  type VariantSchedule,
} from "../../../ethereal/mealplan/model";
import type { IifymOption, IifymPlan } from "../types";

export type CoachWeeklySchedule = Extract<
  VariantSchedule,
  { mode: "weekly" }
> & {
  roles?: { training: string; rest: string };
};

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
  return {
    ...schedule,
    steps: schedule.steps.map((step) => ({
      ...step,
      variantId: remap(step.variantId),
    })),
  };
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
