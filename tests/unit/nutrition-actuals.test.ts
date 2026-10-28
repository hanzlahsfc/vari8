// NUTRITION-LOG IIFYM actuals (issue #173, D11) — the owner-decided
// nullable semantics and the derived 4/4/9 kcal, exercised against the
// real module. A wrong factor or a null/0 slip fails the test.

import { describe, expect, it } from "vitest";

import {
  applyActualsPatch,
  deriveActualCalories,
  emptyActuals,
  toNutritionLogRecord,
} from "../../lib/nutrition/actuals";

describe("deriveActualCalories", () => {
  it("all macros absent records no calories — not zero", () => {
    expect(deriveActualCalories(emptyActuals())).toBeNull();
  });

  it("entered zeros derive 0 kcal — a recording, not null", () => {
    expect(deriveActualCalories({ protein: 0, carbs: 0, fat: 0 })).toBe(0);
  });

  it("protein only derives 4×protein; other macros stay not recorded", () => {
    const actuals = { protein: 40, carbs: null, fat: null };
    expect(deriveActualCalories(actuals)).toBe(160);
    expect(actuals.carbs).toBeNull();
    expect(actuals.fat).toBeNull();
  });

  it("all three macros derive 4×p + 4×c + 9×f", () => {
    expect(deriveActualCalories({ protein: 30, carbs: 50, fat: 20 })).toBe(
      120 + 200 + 180,
    );
  });

  it("partial day computes from the macros entered only", () => {
    expect(deriveActualCalories({ protein: null, carbs: null, fat: 10 })).toBe(
      90,
    );
    expect(deriveActualCalories({ protein: 0, carbs: 25, fat: null })).toBe(
      100,
    );
  });
});

describe("toNutritionLogRecord", () => {
  it("stores derived calories beside the entered macros", () => {
    expect(toNutritionLogRecord({ protein: 10, carbs: 0, fat: null })).toEqual({
      protein: 10,
      carbs: 0,
      fat: null,
      calories: 40,
    });
    expect(toNutritionLogRecord(emptyActuals())).toEqual({
      protein: null,
      carbs: null,
      fat: null,
      calories: null,
    });
  });
});

describe("applyActualsPatch", () => {
  it("unsubmitted fields keep earlier entries; explicit null means not recorded", () => {
    const record = { protein: 30, carbs: 40, fat: null };
    // a patch that supplies only fat leaves protein/carbs untouched —
    // switching modes does not clear earlier actuals
    expect(applyActualsPatch(record, { fat: 12 })).toEqual({
      protein: 30,
      carbs: 40,
      fat: 12,
    });
    // an explicit null re-records a field as not recorded
    expect(applyActualsPatch(record, { protein: null })).toEqual({
      protein: null,
      carbs: 40,
      fat: null,
    });
  });
});
