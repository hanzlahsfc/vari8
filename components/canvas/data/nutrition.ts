// Nutrition domain provider (PR-W0). Owns the per-client nutrition plan
// lifecycles (meal-plan and IIFYM versions) and the supplement plan of the
// coach store, plus the ethereal meal-plan workspace key. PR-W7 wires this
// domain to the server; it edits this file only.

import type { CoachState } from "../coach/model";
import { emptyClientPlans, type ClientPlans } from "../coach/plans/types";
import { isMealPlan, type MealPlan } from "../ethereal/mealplan/model";
import { apiFetch } from "./http";
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

/* -------------------------------------------------------------------------
 * Card 05a remote surface: nutrition entries live on the same daily-entry
 * routes as the tracker (Routes table row "Nutrition entries — as the
 * tracker rows above"). The screen reads these aliases so its provider is
 * named in its own domain file.
 * ---------------------------------------------------------------------- */

export {
  fetchDailyEntrySurface,
  saveDailyEntryRemote,
} from "./tracker";

/* -------------------------------------------------------------------------
 * Card 09 (#173) remote surface: the client's own daily macro actuals and
 * the staff date-range read. Wire shapes mirror
 * `lib/daily-entry/nutrition-log.ts`; duplicated here so the canvas never
 * imports server modules. `null` is "not recorded", never zero; there is
 * no calories field anywhere - kcal derives at render (4/4/9).
 * ---------------------------------------------------------------------- */

export type NutritionLogMacrosWire = {
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

export type NutritionLogDayWire = NutritionLogMacrosWire & {
  entryDate: string;
};

export type NutritionLogSurfaceWire =
  | {
      state: "ready";
      entryDate: string;
      log: NutritionLogMacrosWire | null;
      history: NutritionLogDayWire[];
    }
  | { state: "not_applicable" }
  | { state: "consent_missing" };

/** GET nutrition-logs?date= — the caller's own actuals for the day. */
export function fetchNutritionLogSurface(
  workspaceId: string,
  date?: string,
): Promise<NutritionLogSurfaceWire> {
  const suffix = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetch<NutritionLogSurfaceWire>(
    `/workspaces/${workspaceId}/nutrition-logs${suffix}`,
  );
}

/** PUT nutrition-logs/:date — one save against the caller's own day log. */
export function saveNutritionLogRemote(
  workspaceId: string,
  entryDate: string,
  macros: NutritionLogMacrosWire,
): Promise<{ status: "saved" | "no_op" }> {
  return apiFetch(`/workspaces/${workspaceId}/nutrition-logs/${entryDate}`, {
    method: "PUT",
    body: macros,
  });
}

export type StaffNutritionLogListWire =
  | {
      state: "ready";
      clientName: string;
      items: NutritionLogDayWire[];
    }
  | { state: "consent_missing" };

/** GET clients/:clientProfileId/nutrition-logs?from=&to= — staff range. */
export function fetchStaffNutritionLogs(
  workspaceId: string,
  clientProfileId: string,
  range?: { from?: string; to?: string },
): Promise<StaffNutritionLogListWire> {
  const parts: string[] = [];
  if (range?.from) parts.push(`from=${encodeURIComponent(range.from)}`);
  if (range?.to) parts.push(`to=${encodeURIComponent(range.to)}`);
  const suffix = parts.length ? `?${parts.join("&")}` : "";
  return apiFetch<StaffNutritionLogListWire>(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/nutrition-logs${suffix}`,
  );
}
