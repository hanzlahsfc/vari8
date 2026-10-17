/**
 * MEAL-PLAN-I1 (decision #115 — reviewed MEAL-PLAN-P3 contract §4.1) —
 * strict structural validation + normalization of the meal-plan draft /
 * version payload.
 *
 * Contract:
 * - Declared keys ONLY at every nesting level — root `variants`, each
 *   variant `id|label|targetMode|targets|meals`, `targets` carries only
 *   `kcal|proteinG|carbsG|fatG`, each target entry matches the variant's
 *   targetMode shape, each meal carries only the declared fields. Any
 *   extra key rejects — nothing is smuggled into the immutable snapshot.
 * - Optional ≠ zero: absent or `null` values are omitted from the
 *   normalized shape; an entered `0` is preserved verbatim.
 * - Numeric bounds: finite numbers 0 ≤ v ≤ 99,999.9 with at most one
 *   decimal, enforced by decimal-string comparison (never float math).
 * - No cross-field derivation — this module never sums, converts,
 *   scores, or aggregates nutrition values.
 */

import { MEALPLAN_LIMITS } from "./limits";

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

export const MEALPLAN_TARGET_MODES = ["FIXED", "RANGE", "MINIMUM"] as const;
export type MealPlanTargetMode = (typeof MEALPLAN_TARGET_MODES)[number];

export type MealPlanTarget =
  { value: number } | { min: number; max: number } | { min: number };

export type MealPlanMacroTargets = {
  kcal: MealPlanTarget | null;
  proteinG: MealPlanTarget | null;
  carbsG: MealPlanTarget | null;
  fatG: MealPlanTarget | null;
};

export type MealPlanMeal = {
  order: number;
  name: string;
  time?: string;
  frequency?: string;
  foodText: string;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
};

export type MealPlanVariant = {
  id: string;
  label: string;
  targetMode: MealPlanTargetMode;
  targets: MealPlanMacroTargets;
  meals: MealPlanMeal[];
};

export type MealPlanDraft = { variants: MealPlanVariant[] };

const ROOT_KEYS = new Set(["variants"]);
const VARIANT_KEYS = new Set(["id", "label", "targetMode", "targets", "meals"]);
const TARGET_KEYS = new Set(["kcal", "proteinG", "carbsG", "fatG"]);
const MEAL_KEYS = new Set([
  "order",
  "name",
  "time",
  "frequency",
  "foodText",
  "kcal",
  "proteinG",
  "carbsG",
  "fatG",
]);

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

const mintVariantId = () => `v_${crypto.randomUUID()}`;

function isVariantId(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[a-z0-9_-]{1,64}$/i.test(v) &&
    v.length <= MEALPLAN_LIMITS.variantIdMax
  );
}

function cleanTarget(v: unknown, mode: MealPlanTargetMode): MealPlanTarget {
  if (!isPlainObject(v)) throw new MealPlanError("invalid_input");
  const keys = Object.keys(v);
  if (mode === "FIXED") {
    rejectUnknownKeys(v, new Set(["value"]));
    if (keys.length !== 1) throw new MealPlanError("invalid_input");
    const value = cleanValue(v.value);
    if (value === undefined) throw new MealPlanError("invalid_input");
    return { value };
  }
  if (mode === "RANGE") {
    rejectUnknownKeys(v, new Set(["min", "max"]));
    if (keys.length !== 2) throw new MealPlanError("invalid_input");
    const min = cleanValue(v.min);
    const max = cleanValue(v.max);
    if (min === undefined || max === undefined || min >= max)
      throw new MealPlanError("invalid_input");
    return { min, max };
  }
  // MINIMUM
  rejectUnknownKeys(v, new Set(["min"]));
  if (keys.length !== 1) throw new MealPlanError("invalid_input");
  const min = cleanValue(v.min);
  if (min === undefined) throw new MealPlanError("invalid_input");
  return { min };
}

/**
 * Validate + normalize a draft/version payload. `forPublish` enforces the
 * publishable floor (≥ 1 variant, ≥ 1 meal per variant) and reports
 * `publish_incomplete` rather than `invalid_input` for count violations.
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

  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const variants: MealPlanVariant[] = rawVariants.map((raw) => {
    if (!isPlainObject(raw)) throw new MealPlanError("invalid_input");
    rejectUnknownKeys(raw, VARIANT_KEYS);

    let id: string;
    if (raw.id === undefined || raw.id === null) {
      id = mintVariantId();
    } else {
      if (!isVariantId(raw.id)) throw new MealPlanError("invalid_input");
      id = raw.id;
    }
    if (seenIds.has(id)) throw new MealPlanError("invalid_input");
    seenIds.add(id);

    const label = cleanText(raw.label, MEALPLAN_LIMITS.variantLabelMax);
    if (seenLabels.has(label)) throw new MealPlanError("invalid_input");
    seenLabels.add(label);

    const targetMode = raw.targetMode;
    if (
      typeof targetMode !== "string" ||
      !(MEALPLAN_TARGET_MODES as readonly string[]).includes(targetMode)
    )
      throw new MealPlanError("invalid_input");

    if (!isPlainObject(raw.targets)) throw new MealPlanError("invalid_input");
    rejectUnknownKeys(raw.targets, TARGET_KEYS);
    const targets: MealPlanMacroTargets = {
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
    };
    for (const key of TARGET_KEYS) {
      const v = raw.targets[key];
      if (v === undefined || v === null) continue;
      targets[key as keyof MealPlanMacroTargets] = cleanTarget(
        v,
        targetMode as MealPlanTargetMode,
      );
    }

    const rawMeals = raw.meals;
    if (!Array.isArray(rawMeals)) throw new MealPlanError("invalid_input");
    if (rawMeals.length > MEALPLAN_LIMITS.maxMealsPerVariant)
      throw countError();
    if (opts.forPublish && rawMeals.length < MEALPLAN_LIMITS.minPublishMeals)
      throw countError();

    const orders = new Set<number>();
    const meals: MealPlanMeal[] = rawMeals.map((rawMeal) => {
      if (!isPlainObject(rawMeal)) throw new MealPlanError("invalid_input");
      rejectUnknownKeys(rawMeal, MEAL_KEYS);
      if (
        typeof rawMeal.order !== "number" ||
        !Number.isInteger(rawMeal.order) ||
        rawMeal.order < 0
      )
        throw new MealPlanError("invalid_input");
      if (orders.has(rawMeal.order)) throw new MealPlanError("invalid_input");
      orders.add(rawMeal.order);
      const foodText = cleanText(rawMeal.foodText, MEALPLAN_LIMITS.foodTextMax);
      const meal: MealPlanMeal = {
        order: rawMeal.order,
        name: cleanText(rawMeal.name, MEALPLAN_LIMITS.mealNameMax),
        foodText,
      };
      const time = optionalText(rawMeal.time, MEALPLAN_LIMITS.mealTimeMax);
      if (time !== undefined) meal.time = time;
      const frequency = optionalText(
        rawMeal.frequency,
        MEALPLAN_LIMITS.mealFrequencyMax,
      );
      if (frequency !== undefined) meal.frequency = frequency;
      const kcal = cleanValue(rawMeal.kcal);
      if (kcal !== undefined) meal.kcal = kcal;
      const proteinG = cleanValue(rawMeal.proteinG);
      if (proteinG !== undefined) meal.proteinG = proteinG;
      const carbsG = cleanValue(rawMeal.carbsG);
      if (carbsG !== undefined) meal.carbsG = carbsG;
      const fatG = cleanValue(rawMeal.fatG);
      if (fatG !== undefined) meal.fatG = fatG;
      return meal;
    });

    // Unique client-declared orders → dense renumbering 1..N.
    meals.sort((a, b) => a.order - b.order);
    meals.forEach((m, i) => (m.order = i + 1));

    return {
      id,
      label,
      targetMode: targetMode as MealPlanTargetMode,
      targets,
      meals,
    };
  });

  const draft: MealPlanDraft = { variants };
  if (
    Buffer.byteLength(JSON.stringify(draft), "utf8") >
    MEALPLAN_LIMITS.payloadMaxBytes
  )
    throw new MealPlanError("invalid_input");
  return draft;
}
