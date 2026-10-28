/**
 * NUTRITION-LOG IIFYM actuals (issue #173, owner decision 2026-10-22):
 * daily actual macros over daily entries, calories DERIVED — never
 * entered — at the shared 4/4/9 factors (same convention as
 * `lib/nutrition/math.ts`: `macroEnergyShares`, `iifymTargetNutrients`).
 *
 * Nullable semantics (approved): a missing macro stays "not recorded"
 * (`null`) and is never coerced to zero; an entered zero stays zero.
 * A partial day computes kcal from only the macros entered; when every
 * macro is absent there is no calorie figure at all (`null`) — the
 * owner may later reverse the partial-day default.
 */

export type MacroActuals = {
  /** grams; `null` = not recorded. */
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export const emptyActuals = (): MacroActuals => ({
  protein: null,
  carbs: null,
  fat: null,
});

/** Derived kcal for the entered macros at 4/4/9; `null` when nothing
 * was entered. Entered zeros contribute 0 — they are a recording. */
export function deriveActualCalories(actuals: MacroActuals): number | null {
  let kcal = 0;
  let entered = false;
  if (actuals.protein !== null) {
    kcal += actuals.protein * 4;
    entered = true;
  }
  if (actuals.carbs !== null) {
    kcal += actuals.carbs * 4;
    entered = true;
  }
  if (actuals.fat !== null) {
    kcal += actuals.fat * 9;
    entered = true;
  }
  return entered ? kcal : null;
}

/** Persisted row shape for the (schema-slot pending) `NutritionLog`:
 * the three independent nullable macros plus the derived calorie figure
 * — stored for the same reasons other derived columns are stored: coach
 * range reads and totals, never user-entered. */
export type NutritionLogRecord = MacroActuals & {
  calories: number | null;
};

export function toNutritionLogRecord(
  actuals: MacroActuals,
): NutritionLogRecord {
  return { ...actuals, calories: deriveActualCalories(actuals) };
}

/**
 * A write supplies only the fields the tracker submitted; keys absent
 * from `patch` keep their recorded values while an explicit `null`
 * records "not recorded". This is the record-level statement of the
 * approved behavior: switching between meal-plan and IIFYM modes never
 * touches earlier actuals — nothing rewrites or clears fields the
 * caller did not submit.
 */
export function applyActualsPatch(
  record: MacroActuals,
  patch: Partial<MacroActuals>,
): MacroActuals {
  return {
    protein: "protein" in patch ? (patch.protein ?? null) : record.protein,
    carbs: "carbs" in patch ? (patch.carbs ?? null) : record.carbs,
    fat: "fat" in patch ? (patch.fat ?? null) : record.fat,
  };
}
