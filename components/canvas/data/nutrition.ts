// Nutrition domain provider (PR-W0). Owns the per-client nutrition plan
// lifecycles (meal-plan and IIFYM versions) and the supplement plan of the
// coach store, plus the ethereal meal-plan workspace key. W2-A2 wires the
// coach-facing lifecycles to the server: the slice stays a write-through
// cache so first paint is instant, and the store hydration below
// re-reads `/api/v1` as the authority on every client switch.

import type { CoachState } from "../coach/model";
import {
  type ClientPlans,
  emptyClientPlans,
  type IifymPlan,
  type TemporaryNutrition,
} from "../coach/plans/types";
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
 * imports server modules. `null` is "not recorded", never zero. The wire
 * carries the stored `calories`; render prefers it and derives kcal
 * (4/4/9) only as the null fallback.
 * ---------------------------------------------------------------------- */

export type NutritionLogMacrosWire = {
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  calories?: number | null;
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

/* -------------------------------------------------------------------------
 * Card 10 (#175) remote surface: the caller's own CURRENT published IIFYM
 * macro-target version (immutable payload: options + weekday schedule).
 * Wire shapes mirror `lib/iifym/service.ts` and `lib/db-types` —
 * duplicated here so the canvas never imports server modules. The server
 * resolves which VERSION applies; the screen resolves which OPTION
 * applies on the selected weekday (`scheduledOption` from the shared
 * canvas domain). Calories are never stored: macros-style targets derive
 * kcal at render (4/4/9); calories-style targets are entered directly.
 * ---------------------------------------------------------------------- */

export type IifymTargetValueWire =
  | { kind: "fixed"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "minimum"; value: number };

export type IifymTargetsWire = {
  style: "calories" | "macros";
  calories?: IifymTargetValueWire;
  protein?: IifymTargetValueWire;
  carbs?: IifymTargetValueWire;
  fat?: IifymTargetValueWire;
};

export type IifymOptionWire = {
  id: string;
  label: string;
  targets: IifymTargetsWire;
};

export type IifymScheduleWire =
  | { mode: "manual"; selectedVariantId: string }
  | { mode: "weekly"; days: Partial<Record<string, string>> }
  | {
      mode: "cycle";
      anchorDate: string;
      steps: { variantId: string; days: number }[];
    };

export type IifymPayloadWire = {
  options: IifymOptionWire[];
  name?: string;
  startDate?: string;
  schedule?: IifymScheduleWire;
};

export type OwnIifymPlanWire = {
  current: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
    payload: IifymPayloadWire;
  } | null;
  upcoming: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
  } | null;
};

/** GET iifym-plans — the caller's own published macro target version. */
export function fetchOwnIifymPlan(
  workspaceId: string,
): Promise<OwnIifymPlanWire> {
  return apiFetch<OwnIifymPlanWire>(`/workspaces/${workspaceId}/iifym-plans`);
}

/* -------------------------------------------------------------------------
 * W2-A2 remote surface: staff meal-plan and staff IIFYM lifecycles. Wire
 * shapes mirror `lib/mealplan/service.ts` and `lib/iifym/service.ts` -
 * duplicated here so the canvas never imports server modules.
 *
 * Meal plan: GET returns the shared draft plus version HEADERS; the active
 * payload needs the version-detail read (`fetchStaffMealPlanVersion`). PUT
 * saves the shared draft under `expectedRevision` CAS; POST publish mints
 * an immutable version.
 *
 * IIFYM: same lifecycle over the existing `/clients/{cp}/iifym-plans`
 * routes. There is no staff version-detail read in the iifym service, so
 * the store resolves the ACTIVE content from the draft (W2-A2 boundary
 * note) - publish freezes the current draft, so the shapes agree at the
 * moment of publication.
 * ---------------------------------------------------------------------- */

export type MealPlanVersionHeaderWire = {
  id: string;
  versionSeq: number;
  effectiveDate: string;
  effectiveTimezone: string;
  publishedAt: string;
};

export type StaffMealPlanWire = {
  plan: {
    id: string;
    title: string;
    timezone: string | null;
    draftRevision: number;
    draft: {
      variants: unknown[];
      name?: string;
      startDate?: string;
      activeVariantId?: string;
      schedule?: unknown;
    } | null;
  } | null;
  versions: MealPlanVersionHeaderWire[];
  nextCursor: number | null;
  currentVersionId: string | null;
  upcoming: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
  } | null;
  canWrite: boolean;
};

export type MealPlanVersionDetailWire = {
  id: string;
  versionSeq: number;
  effectiveDate: string;
  effectiveTimezone: string;
  activationInstant: string;
  payload: MealPlanDraftWire | null;
  publishedAt: string;
};

/** GET clients/:clientProfileId/meal-plans - staff draft + version headers. */
export function fetchStaffMealPlan(
  workspaceId: string,
  clientProfileId: string,
): Promise<StaffMealPlanWire> {
  return apiFetch<StaffMealPlanWire>(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/meal-plans`,
  );
}

/** GET clients/:clientProfileId/meal-plans/versions/:versionId - payload. */
export function fetchStaffMealPlanVersion(
  workspaceId: string,
  clientProfileId: string,
  versionId: string,
): Promise<MealPlanVersionDetailWire> {
  return apiFetch<MealPlanVersionDetailWire>(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/meal-plans/versions/${versionId}`,
  );
}

/** PUT clients/:clientProfileId/meal-plans - shared draft CAS save. */
export function saveStaffMealPlanDraft(
  workspaceId: string,
  clientProfileId: string,
  body: {
    expectedRevision: number;
    title?: string;
    draft: unknown;
    timezone?: string;
  },
): Promise<{ planId: string; revision: number }> {
  return apiFetch(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/meal-plans`,
    { method: "PUT", body },
  );
}

/** POST clients/:clientProfileId/meal-plans/publish - mint a version. */
export function publishStaffMealPlan(
  workspaceId: string,
  clientProfileId: string,
  body: { expectedRevision: number; effectiveDate: string },
): Promise<{ versionId: string; versionSeq: number }> {
  return apiFetch(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/meal-plans/publish`,
    { method: "POST", body },
  );
}

export type StaffIifymWire = {
  plan: {
    id: string;
    title: string;
    timezone: string | null;
    draftRevision: number;
    draft: {
      options: { id: string; label: string; targets: IifymTargetsWire }[];
      name?: string;
      startDate?: string;
      schedule?: IifymScheduleWire;
    } | null;
  } | null;
  versions: MealPlanVersionHeaderWire[];
  currentVersionId: string | null;
  upcoming: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
  } | null;
  canWrite: boolean;
};

/** GET clients/:clientProfileId/iifym-plans - staff draft + headers. */
export function fetchStaffIifymPlan(
  workspaceId: string,
  clientProfileId: string,
): Promise<StaffIifymWire> {
  return apiFetch<StaffIifymWire>(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/iifym-plans`,
  );
}

/** PUT clients/:clientProfileId/iifym-plans - shared draft CAS save. */
export function saveStaffIifymDraft(
  workspaceId: string,
  clientProfileId: string,
  body: {
    expectedRevision: number;
    title?: string;
    draft: unknown;
    timezone?: string;
  },
): Promise<{ planId: string; revision: number }> {
  return apiFetch(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/iifym-plans`,
    { method: "PUT", body },
  );
}

/** POST clients/:clientProfileId/iifym-plans/publish - mint a version. */
export function publishStaffIifym(
  workspaceId: string,
  clientProfileId: string,
  body: { expectedRevision: number; effectiveDate: string },
): Promise<{ versionId: string; versionSeq: number }> {
  return apiFetch(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/iifym-plans/publish`,
    { method: "POST", body },
  );
}

/* -------------------------------------------------------------------------
 * W2-A2 canvas<->wire mapping helpers. Backend drafts carry only payload
 * fields; the canvas `MealPlan`/`IifymPlan` add id, clientId and the
 * coach-local archives (`archivedPlans`, `reusableMeals`). Strip on write,
 * re-add on read, preserve the coach-local fields already in state.
 * ---------------------------------------------------------------------- */

export type MealPlanDraftWire = {
  variants: MealPlan["variants"];
  name?: string;
  startDate?: string;
  activeVariantId?: string;
  schedule?: MealPlan["schedule"];
};

/** Canvas meal plan -> backend draft payload (closed key set). */
export function mealPlanToDraftWire(plan: MealPlan): MealPlanDraftWire {
  return {
    variants: plan.variants,
    name: plan.name,
    startDate: plan.startDate,
    activeVariantId: plan.activeVariantId,
    schedule: plan.schedule,
  };
}

/** Backend draft payload -> canvas meal plan shell. */
export function draftWireToMealPlan(
  draft: MealPlanDraftWire | null,
  meta: { id: string; clientId: string; title: string },
  fallback?: Pick<MealPlan, "archivedPlans" | "reusableMeals">,
): MealPlan {
  return {
    id: meta.id,
    clientId: meta.clientId,
    name: draft?.name ?? meta.title,
    startDate: draft?.startDate ?? "",
    variants: (draft?.variants as MealPlan["variants"] | undefined) ?? [],
    activeVariantId: draft?.activeVariantId ?? "",
    schedule:
      (draft?.schedule as MealPlan["schedule"] | undefined) ?? {
        mode: "manual",
        selectedVariantId: "",
      },
    archivedPlans: fallback?.archivedPlans ?? [],
    reusableMeals: fallback?.reusableMeals ?? [],
  };
}

/** Canvas IIFYM plan -> backend draft payload (closed key set). */
export function iifymPlanToDraftWire(plan: IifymPlan): {
  options: IifymPlan["options"];
  name?: string;
  startDate?: string;
  schedule?: IifymPlan["schedule"];
} {
  return {
    options: plan.options,
    name: plan.name,
    startDate: plan.startDate,
    schedule: plan.schedule,
  };
}

/** Backend IIFYM draft payload -> canvas plan shell. */
export function iifymDraftWireToPlan(
  draft: NonNullable<StaffIifymWire["plan"]>["draft"] | null,
  meta: { id: string; clientId: string; title: string },
): IifymPlan {
  return {
    id: meta.id,
    clientId: meta.clientId,
    name: draft?.name ?? meta.title,
    startDate: draft?.startDate ?? "",
    options: (draft?.options ?? []) as IifymPlan["options"],
    schedule:
      (draft?.schedule as IifymPlan["schedule"] | undefined) ?? {
        mode: "manual",
        selectedVariantId: "",
      },
  };
}
