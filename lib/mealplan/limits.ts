/**
 * MEAL-PLAN-I1 (decision #115 — reviewed MEAL-PLAN-P3 contract) —
 * payload/count/size bounds. Everything here is a structural limit, never
 * a nutrition rule: values are stored and rendered exactly as entered.
 */
export const MEALPLAN_LIMITS = {
  titleMax: 80,
  maxVariants: 8,
  minPublishVariants: 1,
  maxMealsPerVariant: 24,
  minPublishMeals: 1,
  variantLabelMax: 80,
  variantIdMax: 64,
  mealNameMax: 80,
  mealTimeMax: 40,
  mealFrequencyMax: 80,
  foodTextMax: 2000,
  /** Entered nutrition values: 0 ≤ v ≤ 99,999.9, at most one decimal. */
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
