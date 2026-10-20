// PR-M5 (D29, D11, D14, #36) — shared nutrition math guards. Literal
// totals for the canvas demo plan's first two meals (Oats 50 g, Chicken
// Breast (Cooked) 150 g — `frontend/src/data/food-database.json`
// food-057 and food-001, the foods `createInitialMealPlan` picks), the
// 4/4/9 ring percentages, and blank-stays-missing behavior. These
// numbers are what the canvas shows; a wrong factor or a zero-vs-blank
// slip fails the test.

import { describe, expect, it } from "vitest";

import {
  addNutrients,
  calculateMealNutrients,
  calculatePortionNutrients,
  calculateVariantNutrients,
  emptyNutrients,
  iifymTargetNutrients,
  macroEnergyShares,
  targetNumber,
  type Food,
} from "../../lib/nutrition/math";

const OATS: Food = {
  id: "food-057",
  name: "Oats",
  amount: 100,
  unit: "g",
  protein: 10.9,
  carbs: 64,
  fat: 8.1,
  calories: 374,
};
const CHICKEN: Food = {
  id: "food-001",
  name: "Chicken Breast (Cooked)",
  amount: 100,
  unit: "g",
  protein: 32,
  carbs: 0,
  fat: 1.9,
  calories: 145,
};
const SKYR: Food = {
  id: "food-451",
  name: "Arla 0% Fat Vanilla Skyr",
  amount: 100,
  unit: "g",
  protein: 8.6,
  carbs: 8.3,
  fat: 0.2,
  calories: 72,
};
const SALMON: Food = {
  id: "food-005",
  name: "Salmon (Cooked)",
  amount: 100,
  unit: "g",
  protein: 24.6,
  carbs: 0,
  fat: 15.6,
  calories: 239,
};

const FOODS = new Map(
  [OATS, CHICKEN, SKYR, SALMON].map((food) => [food.id, food]),
);

// The canvas `createInitialMealPlan` demo variant ("TD"): 4 meals.
const DEMO_VARIANT = {
  meals: [
    { label: "Breakfast", portions: [{ foodId: "food-057", quantity: 50 }] },
    {
      label: "Lunch",
      portions: [{ foodId: "food-001", quantity: 150 }],
    },
    {
      label: "Afternoon",
      portions: [{ foodId: "food-451", quantity: 200 }],
    },
    { label: "Dinner", portions: [{ foodId: "food-005", quantity: 150 }] },
  ],
};

describe("PR-M5 nutrition math — demo meal literals", () => {
  it("Oats 50 g portion: half the 100 g row", () => {
    expect(calculatePortionNutrients(OATS, 50)).toEqual({
      calories: 187,
      protein: 5.45,
      carbs: 32,
      fat: 4.05,
    });
  });

  it("Chicken 150 g portion: 1.5x the 100 g row", () => {
    const n = calculatePortionNutrients(CHICKEN, 150);
    // 1.9 * 1.5 is not exactly representable; the canvas returns the
    // same IEEE754 product, so literals compare with closeTo.
    expect(n.calories).toBeCloseTo(217.5, 10);
    expect(n.protein).toBeCloseTo(48, 10);
    expect(n.carbs).toBeCloseTo(0, 10);
    expect(n.fat).toBeCloseTo(2.85, 10);
  });

  it("demo variant totals match the canvas overview", () => {
    const totals = calculateVariantNutrients(DEMO_VARIANT, FOODS);
    expect(totals.calories).toBeCloseTo(907, 10);
    expect(totals.protein).toBeCloseTo(107.55, 10);
    expect(totals.carbs).toBeCloseTo(48.6, 10);
    expect(totals.fat).toBeCloseTo(30.7, 10);
  });
});

describe("PR-M5 nutrition math — 4/4/9 ring", () => {
  it("macroEnergyShares on the demo variant totals", () => {
    const shares = macroEnergyShares(
      calculateVariantNutrients(DEMO_VARIANT, FOODS),
    );
    // 107.55*4=430.2, 48.6*4=194.4, 30.7*9=276.3; total 900.9.
    expect(shares.protein).toBeCloseTo(430.2 / 900.9, 10);
    expect(shares.carbs).toBeCloseTo(194.4 / 900.9, 10);
    expect(shares.fat).toBeCloseTo(276.3 / 900.9, 10);
    expect(shares.protein + shares.carbs + shares.fat).toBeCloseTo(1, 10);
  });

  it("literal shares on a round synthetic total", () => {
    const shares = macroEnergyShares({
      calories: 390,
      protein: 25,
      carbs: 50,
      fat: 10,
    });
    // 100 / 200 / 90 of 390.
    expect(shares.protein).toBeCloseTo(100 / 390, 10);
    expect(shares.carbs).toBeCloseTo(200 / 390, 10);
    expect(shares.fat).toBeCloseTo(90 / 390, 10);
  });
});

describe("PR-M5 nutrition math — blank stays missing (#36)", () => {
  it("a portion to an unknown food contributes nothing", () => {
    const meal = {
      portions: [
        { foodId: "food-057", quantity: 50 },
        { foodId: "food-gone", quantity: 100 },
      ],
    };
    expect(calculateMealNutrients(meal, FOODS)).toEqual({
      calories: 187,
      protein: 5.45,
      carbs: 32,
      fat: 4.05,
    });
    expect(
      calculateMealNutrients(
        { portions: [{ foodId: "food-gone", quantity: 100 }] },
        FOODS,
      ),
    ).toEqual(emptyNutrients());
  });

  it("an all-zero meal yields all-zero ring shares, not invented splits", () => {
    expect(
      macroEnergyShares({ calories: 0, protein: 0, carbs: 0, fat: 0 }),
    ).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });

  it("a zero-quantity portion contributes zeros", () => {
    expect(calculatePortionNutrients(OATS, 0)).toEqual(emptyNutrients());
  });
});

describe("PR-M5 nutrition math — target numbers and IIFYM derived kcal", () => {
  it("targetNumber reads fixed/minimum value and range midpoint", () => {
    expect(targetNumber({ kind: "fixed", value: 2400 })).toBe(2400);
    expect(targetNumber({ kind: "minimum", value: 160 })).toBe(160);
    expect(targetNumber({ kind: "range", min: 2200, max: 2600 })).toBe(2400);
    expect(targetNumber(undefined)).toBe(0);
  });

  it("IIFYM macro-style derives kcal at 4/4/9", () => {
    expect(
      iifymTargetNutrients({
        style: "macros",
        protein: { kind: "fixed", value: 180 },
        carbs: { kind: "fixed", value: 260 },
        fat: { kind: "fixed", value: 70 },
      }),
    ).toEqual({ calories: 2390, protein: 180, carbs: 260, fat: 70 });
  });

  it("IIFYM calories-style reads the entered kcal target verbatim", () => {
    expect(
      iifymTargetNutrients({
        style: "calories",
        calories: { kind: "fixed", value: 2200 },
      }),
    ).toEqual({ calories: 2200, protein: 0, carbs: 0, fat: 0 });
  });

  it("addNutrients sums field-wise", () => {
    expect(
      addNutrients(
        { calories: 187, protein: 5.45, carbs: 32, fat: 4.05 },
        { calories: 217.5, protein: 48, carbs: 0, fat: 2.85 },
      ),
    ).toEqual({ calories: 404.5, protein: 53.45, carbs: 32, fat: 6.9 });
  });
});
