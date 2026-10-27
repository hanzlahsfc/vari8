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

/** Split temporary plans into current (active today or upcoming, sorted by
 *  start) and past (finished before today, sorted by end newest first). */
export function splitTemporaryNutrition(
  list: TemporaryNutrition[],
  today: string,
): { current: TemporaryNutrition[]; past: TemporaryNutrition[] } {
  const active = list.filter((t) => t.startDate <= today && today <= t.endDate);
  const upcoming = list
    .filter((t) => t.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = list
    .filter((t) => t.endDate < today)
    .sort((a, b) => b.endDate.localeCompare(a.endDate));
  return {
    current: [...active, ...upcoming].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    ),
    past,
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

/** Legacy temporary plans copied the whole active plan, so they can carry
 * several variants the coach never meant to override. A temporary plan is a
 * single day plan applied to every day of its range — reduce it to the one
 * variant its schedule selects (manual `selectedVariantId`), else the first,
 * and lock the schedule to manual. IIFYM plans get the same one-option cut. */
export function normalizeTemporaryNutrition(
  t: TemporaryNutrition,
): TemporaryNutrition {
  if (t.source === "iifym") {
    const p = t.plan as IifymPlan;
    if (p.options.length <= 1) return t;
    const id =
      p.schedule.mode === "manual"
        ? p.schedule.selectedVariantId
        : p.options[0]?.id;
    const opt = p.options.find((o) => o.id === id) ?? p.options[0];
    return {
      ...t,
      plan: {
        ...p,
        options: opt ? [opt] : [],
        schedule: { mode: "manual", selectedVariantId: opt?.id ?? "" },
      },
    };
  }
  const p = t.plan as MealPlan;
  if (p.variants.length <= 1) return t;
  const id =
    p.schedule.mode === "manual"
      ? p.schedule.selectedVariantId
      : (p.activeVariantId ?? p.variants[0]?.id);
  const v = p.variants.find((x) => x.id === id) ?? p.variants[0];
  return {
    ...t,
    plan: {
      ...p,
      variants: v ? [v] : [],
      activeVariantId: v?.id ?? "",
      schedule: { mode: "manual", selectedVariantId: v?.id ?? "" },
    },
  };
}
