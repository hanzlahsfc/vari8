import assert from "node:assert/strict";
import test from "node:test";
import type {
  MealPlan,
  Nutrients,
} from "../src/components/ethereal/mealplan/model.ts";
import { validateMealPlan } from "../src/components/ethereal/mealplan/model.ts";
import { macroEnergyShares } from "../src/components/ethereal/mealplan/overview-model.ts";

test("macro energy shares use 4/4/9 and are independent of source calories", () => {
  const nutrients: Nutrients = {
    calories: 1000,
    protein: 100,
    carbs: 100,
    fat: 100,
  };
  const shares = macroEnergyShares(nutrients);
  assert.ok(Math.abs(shares.protein - 4 / 17) < 1e-12);
  assert.ok(Math.abs(shares.carbs - 4 / 17) < 1e-12);
  assert.ok(Math.abs(shares.fat - 9 / 17) < 1e-12);
  assert.ok(Math.abs(shares.protein + shares.carbs + shares.fat - 1) < 1e-12);
  assert.notEqual(nutrients.calories, 100 * 4 + 100 * 4 + 100 * 9);
});

test("macro energy shares return zeros when there is no macro energy", () => {
  assert.deepEqual(
    macroEnergyShares({ calories: 450, protein: 0, carbs: 0, fat: 0 }),
    { protein: 0, carbs: 0, fat: 0 },
  );
});

test("legacy target drafts do not block saving static meal plans", () => {
  const plan: MealPlan = {
    id: "plan-1",
    clientId: "client-1",
    name: "Plan",
    startDate: "2026-10-12",
    variants: [
      { id: "td", label: "TD", meals: [], dailyTarget: { style: "macros" } },
    ],
    activeVariantId: "td",
    schedule: { mode: "manual", selectedVariantId: "td" },
    archivedPlans: [],
    reusableMeals: [],
  };

  assert.deepEqual(validateMealPlan(plan, new Map()), []);

  const variant = plan.variants[0];
  assert.ok(variant);
  variant.meals.push({
    id: "meal-1",
    label: "Meal",
    time: "12:00",
    portions: [],
    target: { style: "macros", protein: { kind: "fixed", value: -1 } },
  });
  assert.deepEqual(validateMealPlan(plan, new Map()), []);
});
