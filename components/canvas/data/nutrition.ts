// Nutrition domain provider (PR-W0). Owns the per-client nutrition plan
// lifecycles (meal-plan and IIFYM versions) and the supplement plan of the
// coach store, plus the ethereal meal-plan workspace key. PR-W7 wires this
// domain to the server; it edits this file only.

import type { CoachState } from "../coach/model";
import { emptyClientPlans, type ClientPlans } from "../coach/plans/types";
import { isMealPlan, type MealPlan } from "../ethereal/mealplan/model";
import { type CoachSlice, readStorage, writeJson } from "./provider";

export const NUTRITION_KEY = "coach-data-nutrition-v1";

type NutritionEntry = {
  nutrition: ClientPlans["nutrition"];
  /** Supplement plan owned alongside nutrition (targets belong to training). */
  supplements?: ClientPlans["supplements"];
};
type NutritionSlice = Record<string, NutritionEntry>;

export const nutritionSlice: CoachSlice = {
  key: NUTRITION_KEY,
  extract: (state): NutritionSlice =>
    Object.fromEntries(
      state.clients.flatMap((client) =>
        client.plans
          ? [
              [
                client.id,
                {
                  nutrition: client.plans.nutrition,
                  supplements: client.plans.supplements,
                },
              ],
            ]
          : [],
      ),
    ),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid nutrition slice");
    const data = slice as NutritionSlice;
    for (const client of state.clients) {
      const entry = data[client.id];
      if (entry?.nutrition !== undefined)
        (client.plans ??= emptyClientPlans()).nutrition = entry.nutrition;
      if (client.plans) client.plans.supplements = entry?.supplements;
    }
  },
};

// --- Ethereal meal-plan workspace (coaching-mealplans-v1) ---

const MEALPLANS_KEY = "coaching-mealplans-v1";

/**
 * Reads the stored meal plans per client id. Undefined when nothing is
 * stored; malformed JSON throws so the caller can show its recovery notice.
 * Plans that fail `isMealPlan` are dropped, as the inline read did.
 */
export function loadMealPlans(): Record<string, MealPlan> | undefined {
  const raw = readStorage(MEALPLANS_KEY);
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as { plans?: unknown };
  if (!parsed.plans || typeof parsed.plans !== "object") return {};
  return Object.fromEntries(
    Object.entries(parsed.plans).filter(
      (entry): entry is [string, MealPlan] => isMealPlan(entry[1]),
    ),
  );
}

export function saveMealPlans(plans: Record<string, MealPlan>): void {
  writeJson(MEALPLANS_KEY, { plans });
}
