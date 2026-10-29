/**
 * Card 10 (#175): IIFYM payload/count/size bounds, mirroring
 * MEALPLAN_LIMITS where the shape is shared. Everything here is a
 * structural limit, never a nutrition rule: calories derive at 4/4/9
 * at read/render time, never stored.
 */
export const IIFYM_LIMITS = {
  titleMax: 80,
  /** Canvas `IifymPlan.name` (payload field, distinct from the row title). */
  planNameMax: 120,
  maxOptions: 8,
  minPublishOptions: 1,
  optionLabelMax: 80,
  optionIdMax: 64,
  /** Cycle schedule bounds (canvas `validateMealPlan` convention). */
  cycleStepDaysMin: 1,
  cycleStepDaysMax: 28,
  cycleDaysMax: 365,
  /** Entered target values: 0 ≤ v ≤ 99,999.9, at most one decimal,
   * enforced by decimal-string comparison (never float math). */
  valueMax: 99999.9,
  /** Normalized draft/version payload cap. */
  payloadMaxBytes: 64 * 1024,
  /** Bounded staff version-history page size. */
  versionPageSize: 20,
  /** Declared effective dates: year bounds come from the shared timezone
   * utility (2000 to 2100); forward horizon is server-UTC today + this many
   * days. */
  effectiveDateAheadDays: 366,
} as const;
