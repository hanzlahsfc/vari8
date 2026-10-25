// Temporary nutrition plans: deep copies of an active plan applied to a
// bounded date range (refeeds, diet breaks, ad-hoc overrides). Pure helpers;
// callers persist the result on `ClientPlans.nutrition.temporary`.

import type { MealPlan } from "../../ethereal/mealplan/model";
import { isLocalCalendarDate } from "../targets/model";
import type { ClientPlans, IifymPlan, TemporaryNutrition } from "./types";

export const TEMPORARY_NUTRITION_MAX_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayCountInclusive(startDate: string, endDate: string): number {
  return (
    (new Date(`${endDate}T12:00:00`).getTime() -
      new Date(`${startDate}T12:00:00`).getTime()) /
      DAY_MS +
    1
  );
}

export function createTemporaryNutrition(
  activePlan: MealPlan | IifymPlan,
  source: TemporaryNutrition["source"],
  detail: {
    kind: TemporaryNutrition["kind"];
    label: string;
    startDate: string;
    endDate: string;
  },
  now: string,
): TemporaryNutrition {
  const plan = structuredClone(activePlan);
  plan.id = `${activePlan.id}-temporary-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id: `temp-nutrition-${crypto.randomUUID()}`,
    kind: detail.kind,
    label: detail.label.trim() || "Custom nutrition",
    startDate: detail.startDate,
    endDate: detail.endDate,
    source,
    plan,
    createdAt: now,
  };
}

export function upsertTemporaryNutrition(
  plans: ClientPlans,
  temporary: TemporaryNutrition,
): ClientPlans {
  const list = plans.nutrition.temporary ?? [];
  const idx = list.findIndex((t) => t.id === temporary.id);
  const next = idx < 0 ? [...list, temporary] : list.with(idx, temporary);
  return { ...plans, nutrition: { ...plans.nutrition, temporary: next } };
}

export function removeTemporaryNutrition(
  plans: ClientPlans,
  id: string,
): ClientPlans {
  const temporary = (plans.nutrition.temporary ?? []).filter(
    (t) => t.id !== id,
  );
  return { ...plans, nutrition: { ...plans.nutrition, temporary } };
}

export function validateTemporaryNutrition(
  t: Pick<TemporaryNutrition, "startDate" | "endDate"> &
    Partial<TemporaryNutrition>,
): string | null {
  if (!isLocalCalendarDate(t.startDate) || !isLocalCalendarDate(t.endDate)) {
    return "Choose valid start and end dates.";
  }
  if (t.endDate < t.startDate) return "End date must be on or after start.";
  if (
    dayCountInclusive(t.startDate, t.endDate) > TEMPORARY_NUTRITION_MAX_DAYS
  ) {
    return `A temporary plan can cover at most ${TEMPORARY_NUTRITION_MAX_DAYS} days.`;
  }
  if (t.label !== undefined && !t.label.trim()) return "Add a label.";
  return null;
}

/** Latest `createdAt` wins when overlapping ranges cover the same date. */
export function temporaryNutritionForDate(
  temporary: TemporaryNutrition[] | undefined,
  date: string,
  source: TemporaryNutrition["source"],
): TemporaryNutrition | null {
  let best: TemporaryNutrition | null = null;
  for (const t of temporary ?? []) {
    if (t.source !== source) continue;
    if (t.startDate > date || t.endDate < date) continue;
    if (!best || t.createdAt > best.createdAt) best = t;
  }
  return best;
}
