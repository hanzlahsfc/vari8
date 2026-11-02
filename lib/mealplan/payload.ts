/**
 * MEAL-PLAN-I1 (decision #115) + PR-M5 — strict structural validation +
 * normalization of the meal-plan draft / version payload.
 *
 * PR-M5 reshaped the payload to the canvas `MealPlan`
 * (`frontend/src/components/ethereal/mealplan/model.ts`): the stored
 * draft now carries the fields the canvas actually authors — plan
 * `name`/`startDate`, `activeVariantId`, the variant `schedule`
 * (manual / weekly / cycle), per-variant `dailyTarget`, per-meal
 * `target`, and food `portions` with approved `swaps`. The earlier
 * `foodText` blob plus hand-entered per-meal kcal/macros are gone:
 * food identity, quantity and unit survive (S06 blocker), and totals
 * are computed by `lib/nutrition/math.ts` (D29) instead of being typed
 * twice (S06-07 CONFLICT resolved for the canvas-computed numbers).
 * `archivedPlans` is not stored: superseded immutable versions ARE the
 * archive (O11). The saved-meal library lives in the `saved_meal` table
 * (PR-M0); the meal shape here matches `SavedMealPayload`
 * (`lib/db-types/saved-meal.ts`) so meals move between plan and library
 * unchanged.
 *
 * Contract (unchanged discipline):
 * - Declared keys ONLY at every nesting level. Any extra key rejects —
 *   nothing is smuggled into the immutable snapshot.
 * - Optional ≠ zero: absent or `null` values are omitted from the
 *   normalized shape; an entered `0` is preserved verbatim (#36 — a
 *   blank field stays missing, never becomes 0).
 * - Numeric bounds: finite numbers 0 ≤ v ≤ 99,999.9 with at most one
 *   decimal, enforced by decimal-string comparison (never float math).
 * - No cross-field derivation — this module never sums, converts,
 *   scores, or aggregates nutrition values.
 * - Draft save permits an INCOMPLETE plan (empty variants, missing
 *   schedule/targets) but never a MALFORMED one (unknown keys, dangling
 *   variant references, out-of-range numbers). `forPublish` adds the
 *   canvas activation floor: plan name, valid start date, an active
 *   variant, a complete schedule, and every meal carrying at least one
 *   positive-quantity portion (canvas `validateIndividualPlan`).
 */

import { MEALPLAN_LIMITS } from "./limits";
import type { MealTargets, TargetValue } from "../db-types/meal-targets";
import type { VariantSchedule } from "../db-types/iifym";

export type { MealTargets, TargetValue, VariantSchedule };

export type MealPlanErrorCode =
  | "invalid_input"
  | "plan_not_accessible"
  | "stale_revision"
  | "timezone_required"
  | "unrepresentable_date"
  | "publish_incomplete"
  | "consent_missing"
  | "policy_not_configured"
  | "serialization_conflict";

export class MealPlanError extends Error {
  constructor(readonly code: MealPlanErrorCode) {
    super(code);
    this.name = "MealPlanError";
  }
}

export type MealPlanSwap = {
  foodId: string;
  quantity: number;
  note?: string;
};

export type MealPlanPortion = {
  foodId: string;
  quantity: number;
  swaps?: MealPlanSwap[];
};

export type MealPlanMeal = {
  id: string;
  label: string;
  time: string;
  frequency?: string;
  portions: MealPlanPortion[];
  target?: MealTargets;
};

export type MealPlanVariant = {
  id: string;
  label: string;
  meals: MealPlanMeal[];
  dailyTarget?: MealTargets;
};

export type MealPlanDraft = {
  variants: MealPlanVariant[];
  name?: string;
  startDate?: string;
  activeVariantId?: string;
  schedule?: VariantSchedule;
};

const ROOT_KEYS = new Set([
  "variants",
  "name",
  "startDate",
  "activeVariantId",
  "schedule",
]);
const VARIANT_KEYS = new Set(["id", "label", "meals", "dailyTarget"]);
const MEAL_KEYS = new Set([
  "id",
  "label",
  "time",
  "frequency",
  "portions",
  "target",
]);
const PORTION_KEYS = new Set(["foodId", "quantity", "swaps"]);
const SWAP_KEYS = new Set(["foodId", "quantity", "note"]);
const TARGET_KEYS = new Set(["style", "calories", "protein", "carbs", "fat"]);
const TARGET_VALUE_KEYS = {
  fixed: new Set(["kind", "value"]),
  range: new Set(["kind", "min", "max"]),
  minimum: new Set(["kind", "value"]),
} as const;
const SCHEDULE_KEYS = {
  manual: new Set(["mode", "selectedVariantId"]),
  weekly: new Set(["mode", "days"]),
  cycle: new Set(["mode", "anchorDate", "steps"]),
  flexible: new Set(["mode"]),
} as const;
const STEP_KEYS = new Set(["variantId", "days"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype ||
      Object.getPrototypeOf(v) === null)
  );
}

function rejectUnknownKeys(obj: Record<string, unknown>, allowed: Set<string>) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) throw new MealPlanError("invalid_input");
  }
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") throw new MealPlanError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > max)
    throw new MealPlanError("invalid_input");
  return trimmed;
}

function optionalText(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new MealPlanError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) throw new MealPlanError("invalid_input");
  return trimmed;
}

const VALUE_RE = /^\d+(\.\d)?$/;

/** Finite entered value: 0 ≤ v ≤ 99,999.9, at most one decimal — the
 * decimal-string check rejects `30.05` and exponent/float artifacts
 * without float arithmetic. */
function cleanValue(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new MealPlanError("invalid_input");
  if (v < 0 || v > MEALPLAN_LIMITS.valueMax)
    throw new MealPlanError("invalid_input");
  if (!VALUE_RE.test(String(v))) throw new MealPlanError("invalid_input");
  return v;
}

const CALENDAR_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Strict calendar date — real YYYY-MM-DD (no Feb 30). */
function isCalendarDate(v: string): boolean {
  if (!CALENDAR_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function isEntityId(v: unknown, max: number): v is string {
  return (
    typeof v === "string" && /^[a-z0-9_-]{1,64}$/i.test(v) && v.length <= max
  );
}

const mintId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

/** Per-field target kind (canvas `TargetValue`): fixed/minimum carry
 * `value`, range carries `min` < `max`. Strict keys per kind. */
function cleanTargetValue(v: unknown): TargetValue {
  if (!isPlainObject(v)) throw new MealPlanError("invalid_input");
  const kind = v.kind;
  if (kind === "fixed" || kind === "minimum") {
    rejectUnknownKeys(v, TARGET_VALUE_KEYS[kind]);
    const value = cleanValue(v.value);
    if (value === undefined) throw new MealPlanError("invalid_input");
    return { kind, value };
  }
  if (kind === "range") {
    rejectUnknownKeys(v, TARGET_VALUE_KEYS.range);
    const min = cleanValue(v.min);
    const max = cleanValue(v.max);
    if (min === undefined || max === undefined || min >= max)
      throw new MealPlanError("invalid_input");
    return { kind: "range", min, max };
  }
  throw new MealPlanError("invalid_input");
}

const MACRO_FIELDS = ["protein", "carbs", "fat"] as const;
const TARGET_FIELDS = ["calories", ...MACRO_FIELDS] as const;

/** Canvas `MealTargets`: the style is exclusive — a calories-style block
 * may only carry `calories`, a macros-style block only the macro fields
 * (canvas `validateTargets`). A present block needs at least one goal. */
function cleanMealTargets(v: unknown): MealTargets {
  if (!isPlainObject(v)) throw new MealPlanError("invalid_input");
  rejectUnknownKeys(v, TARGET_KEYS);
  const style = v.style;
  if (style !== "calories" && style !== "macros")
    throw new MealPlanError("invalid_input");
  const allowed = style === "calories" ? ["calories"] : [...MACRO_FIELDS];
  for (const field of TARGET_FIELDS) {
    const present = v[field] !== undefined && v[field] !== null;
    if (present && !allowed.includes(field))
      throw new MealPlanError("invalid_input");
  }
  const out: Record<string, TargetValue> = {};
  let count = 0;
  for (const field of allowed) {
    const raw = v[field];
    if (raw === undefined || raw === null) continue;
    out[field] = cleanTargetValue(raw);
    count += 1;
  }
  if (count === 0) throw new MealPlanError("invalid_input");
  return { style, ...out } as MealTargets;
}

function cleanFoodId(v: unknown): string {
  if (typeof v !== "string") throw new MealPlanError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > MEALPLAN_LIMITS.foodIdMax)
    throw new MealPlanError("invalid_input");
  return trimmed;
}

function cleanSwap(v: unknown): MealPlanSwap {
  if (!isPlainObject(v)) throw new MealPlanError("invalid_input");
  rejectUnknownKeys(v, SWAP_KEYS);
  const swap: MealPlanSwap = {
    foodId: cleanFoodId(v.foodId),
    quantity: cleanQuantity(v.quantity),
  };
  const note = optionalText(v.note, MEALPLAN_LIMITS.swapNoteMax);
  if (note !== undefined) swap.note = note;
  return swap;
}

function cleanQuantity(v: unknown): number {
  const quantity = cleanValue(v);
  if (quantity === undefined) throw new MealPlanError("invalid_input");
  return quantity;
}

function cleanPortion(v: unknown): MealPlanPortion {
  if (!isPlainObject(v)) throw new MealPlanError("invalid_input");
  rejectUnknownKeys(v, PORTION_KEYS);
  const portion: MealPlanPortion = {
    foodId: cleanFoodId(v.foodId),
    quantity: cleanQuantity(v.quantity),
  };
  if (v.swaps !== undefined && v.swaps !== null) {
    if (!Array.isArray(v.swaps)) throw new MealPlanError("invalid_input");
    if (v.swaps.length > MEALPLAN_LIMITS.maxSwapsPerPortion)
      throw new MealPlanError("invalid_input");
    portion.swaps = v.swaps.map(cleanSwap);
  }
  return portion;
}

function cleanMeal(
  v: unknown,
  seenMealIds: Set<string>,
  forPublish: boolean,
): MealPlanMeal {
  if (!isPlainObject(v)) throw new MealPlanError("invalid_input");
  rejectUnknownKeys(v, MEAL_KEYS);
  let id: string;
  if (v.id === undefined || v.id === null) {
    id = mintId("meal");
  } else {
    if (!isEntityId(v.id, MEALPLAN_LIMITS.mealIdMax))
      throw new MealPlanError("invalid_input");
    id = v.id;
  }
  if (seenMealIds.has(id)) throw new MealPlanError("invalid_input");
  seenMealIds.add(id);
  const meal: MealPlanMeal = {
    id,
    label: cleanText(v.label, MEALPLAN_LIMITS.mealLabelMax),
    time: cleanText(v.time, MEALPLAN_LIMITS.mealTimeMax),
    portions: [],
  };
  if (forPublish && !TIME_RE.test(meal.time))
    throw new MealPlanError("publish_incomplete");
  const frequency = optionalText(v.frequency, MEALPLAN_LIMITS.mealFrequencyMax);
  if (frequency !== undefined) meal.frequency = frequency;
  if (!Array.isArray(v.portions)) throw new MealPlanError("invalid_input");
  if (v.portions.length > MEALPLAN_LIMITS.maxPortionsPerMeal)
    throw new MealPlanError("invalid_input");
  if (forPublish && v.portions.length === 0)
    throw new MealPlanError("publish_incomplete");
  meal.portions = v.portions.map((p) => {
    const portion = cleanPortion(p);
    if (forPublish && portion.quantity <= 0)
      throw new MealPlanError("publish_incomplete");
    return portion;
  });
  if (v.target !== undefined && v.target !== null)
    meal.target = cleanMealTargets(v.target);
  return meal;
}

/** Canvas `VariantSchedule` — references must resolve to declared
 * variant ids at every save (a dangling reference is malformed, not
 * incomplete). Completeness (all 7 weekly days, ≥1 cycle step) is a
 * publish-floor rule. */
function cleanSchedule(
  v: unknown,
  variantIds: Set<string>,
  forPublish: boolean,
): VariantSchedule {
  if (!isPlainObject(v)) throw new MealPlanError("invalid_input");
  const mode = v.mode;
  if (mode === "manual") {
    rejectUnknownKeys(v, SCHEDULE_KEYS.manual);
    const selectedVariantId = v.selectedVariantId;
    if (
      !isEntityId(selectedVariantId, MEALPLAN_LIMITS.variantIdMax) ||
      !variantIds.has(selectedVariantId)
    )
      throw new MealPlanError("invalid_input");
    return { mode: "manual", selectedVariantId };
  }
  if (mode === "weekly") {
    rejectUnknownKeys(v, SCHEDULE_KEYS.weekly);
    if (!isPlainObject(v.days)) throw new MealPlanError("invalid_input");
    const days: Record<string, string> = {};
    for (const [key, value] of Object.entries(v.days)) {
      if (!/^[1-7]$/.test(key) || typeof value !== "string")
        throw new MealPlanError("invalid_input");
      if (!variantIds.has(value)) throw new MealPlanError("invalid_input");
      days[key] = value;
    }
    if (forPublish && Object.keys(days).length !== 7)
      throw new MealPlanError("publish_incomplete");
    return { mode: "weekly", days } as VariantSchedule;
  }
  if (mode === "cycle") {
    rejectUnknownKeys(v, SCHEDULE_KEYS.cycle);
    if (typeof v.anchorDate !== "string" || !isCalendarDate(v.anchorDate))
      throw new MealPlanError("invalid_input");
    if (!Array.isArray(v.steps)) throw new MealPlanError("invalid_input");
    if (forPublish && v.steps.length === 0)
      throw new MealPlanError("publish_incomplete");
    let total = 0;
    const steps = v.steps.map((raw) => {
      if (!isPlainObject(raw)) throw new MealPlanError("invalid_input");
      rejectUnknownKeys(raw, STEP_KEYS);
      if (
        !isEntityId(raw.variantId, MEALPLAN_LIMITS.variantIdMax) ||
        !variantIds.has(raw.variantId)
      )
        throw new MealPlanError("invalid_input");
      if (
        typeof raw.days !== "number" ||
        !Number.isInteger(raw.days) ||
        raw.days < MEALPLAN_LIMITS.cycleStepDaysMin ||
        raw.days > MEALPLAN_LIMITS.cycleStepDaysMax
      )
        throw new MealPlanError("invalid_input");
      total += raw.days;
      return { variantId: raw.variantId, days: raw.days };
    });
    if (total > MEALPLAN_LIMITS.cycleDaysMax)
      throw new MealPlanError("invalid_input");
    return { mode: "cycle", anchorDate: v.anchorDate, steps };
  }
  if (mode === "flexible") {
    rejectUnknownKeys(v, SCHEDULE_KEYS.flexible);
    return { mode: "flexible" };
  }
  throw new MealPlanError("invalid_input");
}

/**
 * Validate + normalize a draft/version payload. `forPublish` enforces
 * the canvas activation floor (plan name, valid startDate, active
 * variant, complete schedule, ≥1 variant, ≥1 meal per variant, every
 * meal ≥1 positive-quantity portion, HH:MM meal times) and reports
 * `publish_incomplete` rather than `invalid_input` for completeness
 * violations.
 */
export function normalizeMealPlanPayload(
  input: unknown,
  opts: { forPublish: boolean },
): MealPlanDraft {
  if (!isPlainObject(input)) throw new MealPlanError("invalid_input");
  rejectUnknownKeys(input, ROOT_KEYS);
  const rawVariants = input.variants;
  if (!Array.isArray(rawVariants)) throw new MealPlanError("invalid_input");
  const countError = () =>
    new MealPlanError(opts.forPublish ? "publish_incomplete" : "invalid_input");
  if (rawVariants.length > MEALPLAN_LIMITS.maxVariants) throw countError();
  if (
    opts.forPublish &&
    rawVariants.length < MEALPLAN_LIMITS.minPublishVariants
  )
    throw countError();

  const draft: MealPlanDraft = { variants: [] };

  const name = optionalText(input.name, MEALPLAN_LIMITS.planNameMax);
  if (name !== undefined) draft.name = name;
  if (input.startDate !== undefined && input.startDate !== null) {
    if (typeof input.startDate !== "string" || !isCalendarDate(input.startDate))
      throw new MealPlanError("invalid_input");
    draft.startDate = input.startDate;
  }
  const activeVariantId = optionalText(
    input.activeVariantId,
    MEALPLAN_LIMITS.variantIdMax,
  );

  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const seenMealIds = new Set<string>();
  draft.variants = rawVariants.map((raw) => {
    if (!isPlainObject(raw)) throw new MealPlanError("invalid_input");
    rejectUnknownKeys(raw, VARIANT_KEYS);

    let id: string;
    if (raw.id === undefined || raw.id === null) {
      id = mintId("v");
    } else {
      if (!isEntityId(raw.id, MEALPLAN_LIMITS.variantIdMax))
        throw new MealPlanError("invalid_input");
      id = raw.id;
    }
    if (seenIds.has(id)) throw new MealPlanError("invalid_input");
    seenIds.add(id);

    const label = cleanText(raw.label, MEALPLAN_LIMITS.variantLabelMax);
    if (seenLabels.has(label)) throw new MealPlanError("invalid_input");
    seenLabels.add(label);

    const rawMeals = raw.meals;
    if (!Array.isArray(rawMeals)) throw new MealPlanError("invalid_input");
    if (rawMeals.length > MEALPLAN_LIMITS.maxMealsPerVariant)
      throw countError();
    if (opts.forPublish && rawMeals.length < MEALPLAN_LIMITS.minPublishMeals)
      throw countError();

    const variant: MealPlanVariant = {
      id,
      label,
      meals: rawMeals.map((m) => cleanMeal(m, seenMealIds, opts.forPublish)),
    };
    if (raw.dailyTarget !== undefined && raw.dailyTarget !== null)
      variant.dailyTarget = cleanMealTargets(raw.dailyTarget);
    return variant;
  });

  const variantIds = new Set(draft.variants.map((v) => v.id));
  if (activeVariantId !== undefined) {
    if (!variantIds.has(activeVariantId))
      throw new MealPlanError("invalid_input");
    draft.activeVariantId = activeVariantId;
  }
  if (input.schedule !== undefined && input.schedule !== null)
    draft.schedule = cleanSchedule(input.schedule, variantIds, opts.forPublish);

  if (opts.forPublish) {
    if (draft.name === undefined || draft.startDate === undefined)
      throw new MealPlanError("publish_incomplete");
    if (draft.activeVariantId === undefined || draft.schedule === undefined)
      throw new MealPlanError("publish_incomplete");
  }

  if (
    Buffer.byteLength(JSON.stringify(draft), "utf8") >
    MEALPLAN_LIMITS.payloadMaxBytes
  )
    throw new MealPlanError("invalid_input");
  return draft;
}

/** Every `foodId` referenced by a normalized payload (portions and
 * swaps) — the lookup set for catalog-backed rendering and totals. */
export function collectMealPlanFoodIds(draft: MealPlanDraft): string[] {
  const ids = new Set<string>();
  for (const variant of draft.variants)
    for (const meal of variant.meals)
      for (const portion of meal.portions) {
        ids.add(portion.foodId);
        for (const swap of portion.swaps ?? []) ids.add(swap.foodId);
      }
  return [...ids];
}
