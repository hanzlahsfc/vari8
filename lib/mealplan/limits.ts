/**
 * MEAL-PLAN-I1 (decision #115 — reviewed MEAL-PLAN-P3 contract) +
 * PR-M5 (canvas payload reshape) — payload/count/size bounds. Everything
 * here is a structural limit, never a nutrition rule: totals are
 * computed by `lib/nutrition/math.ts`, never stored.
 */
export const MEALPLAN_LIMITS = {
  titleMax: 80,
  /** Canvas `MealPlan.name` (payload field, distinct from the row title). */
  planNameMax: 120,
  maxVariants: 8,
  minPublishVariants: 1,
  maxMealsPerVariant: 24,
  minPublishMeals: 1,
  variantLabelMax: 80,
  variantIdMax: 64,
  mealLabelMax: 80,
  mealIdMax: 64,
  mealTimeMax: 40,
  mealFrequencyMax: 80,
  /** Portion/swap `foodId` is an opaque catalog-row reference — the
   * pure normalizer bounds its shape, existence is a caller concern. */
  foodIdMax: 64,
  maxPortionsPerMeal: 50,
  maxSwapsPerPortion: 10,
  swapNoteMax: 500,
  /** Cycle schedule bounds (canvas `validateMealPlan`). */
  cycleStepDaysMin: 1,
  cycleStepDaysMax: 28,
  cycleDaysMax: 365,
  /** Entered quantities and target values: 0 ≤ v ≤ 99,999.9, at most one
   * decimal — enforced by decimal-string comparison (never float math). */
  valueMax: 99999.9,
  /** Normalized draft/version payload cap. */
  payloadMaxBytes: 64 * 1024,
  /** Bounded staff version-history page size. */
  versionPageSize: 20,
  /** Declared effective dates: year bounds come from the shared timezone
   * utility (2000–2100); forward horizon is server-UTC today + this many
   * days. */
  effectiveDateAheadDays: 366,
} as const;
