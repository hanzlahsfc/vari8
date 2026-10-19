import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveCurrentPlan,
  calculateMealNutrients,
  calculatePortionNutrients,
  cloneVariant,
  createInitialMealPlan,
  type Food,
  type FoodPortion,
  getActiveVariant,
  isMealPlan,
  type MealPlan,
  type MealPlanVariant,
  type MealTargets,
  validateMealPlan,
  validateTargets,
} from "../src/components/ethereal/mealplan/model.ts";

const food = (
  id: string,
  amount: number,
  unit: string,
  calories: number,
  protein = 0,
  carbs = 0,
  fat = 0,
): Food => ({
  id,
  name: id,
  amount,
  unit,
  calories,
  protein,
  carbs,
  fat,
});

function first<T>(values: readonly T[]): T {
  const value = values[0];
  assert.ok(value);
  return value;
}

function samplePlan(): MealPlan {
  const td: MealPlanVariant = {
    id: "td",
    label: "TD",
    meals: [
      {
        id: "breakfast",
        label: "Breakfast",
        time: "08:00",
        frequency: "Daily",
        portions: [
          {
            foodId: "oats",
            quantity: 50,
            swaps: [{ foodId: "egg", quantity: 2 }],
          },
        ],
        target: { style: "macros", protein: { kind: "minimum", value: 25 } },
      },
    ],
    dailyTarget: {
      style: "calories",
      calories: { kind: "range", min: 1800, max: 2200 },
    },
  };
  const ntd: MealPlanVariant = { id: "ntd", label: "NTD", meals: [] };
  return {
    id: "plan-1",
    clientId: "client-1",
    name: "Plan A",
    startDate: "2026-10-10",
    variants: [td, ntd],
    activeVariantId: "td",
    schedule: { mode: "manual", selectedVariantId: "td" },
    archivedPlans: [],
    reusableMeals: [],
  };
}

test("scales mixed 100 g, one-item, and 100 mL bases without replacing database calories", () => {
  const oats = food("oats", 100, "g", 381, 13.2, 67.7, 6.5);
  const egg = food("egg", 1, "item", 72, 6.3, 0.4, 4.8);
  const milk = food("milk", 100, "mL", 46, 3.4, 4.8, 1.5);

  assert.deepEqual(calculatePortionNutrients(oats, 100), {
    calories: 381,
    protein: 13.2,
    carbs: 67.7,
    fat: 6.5,
  });
  assert.deepEqual(calculatePortionNutrients(egg, 1), {
    calories: 72,
    protein: 6.3,
    carbs: 0.4,
    fat: 4.8,
  });
  assert.deepEqual(calculatePortionNutrients(milk, 50), {
    calories: 23,
    protein: 1.7,
    carbs: 2.4,
    fat: 0.75,
  });
  assert.equal(calculatePortionNutrients(oats, 50).calories, 190.5);
});

test("food swaps are alternatives and do not contribute to meal totals", () => {
  const oats = food("oats", 100, "g", 380, 13, 68, 7);
  const egg = food("egg", 1, "item", 75, 6, 0.5, 5);
  const meal = first(first(samplePlan().variants).meals);
  const totals = calculateMealNutrients(
    meal,
    new Map([
      [oats.id, oats],
      [egg.id, egg],
    ]),
  );
  assert.deepEqual(totals, {
    calories: 190,
    protein: 6.5,
    carbs: 34,
    fat: 3.5,
  });
});

test("variant clones have fresh nested ids and independent mutable data", () => {
  const original = first(samplePlan().variants);
  const clone = cloneVariant(original, "HIGH");
  const originalMeal = first(original.meals);
  const cloneMeal = first(clone.meals);
  const originalPortion = first(originalMeal.portions);
  const clonePortion = first(cloneMeal.portions);
  const originalSwap = first(originalPortion.swaps ?? []);
  const cloneSwap = first(clonePortion.swaps ?? []);
  assert.notEqual(clone.id, original.id);
  assert.notEqual(cloneMeal.id, originalMeal.id);
  clonePortion.quantity = 999;
  cloneSwap.quantity = 50;
  const cloneCalories = clone.dailyTarget?.calories;
  assert.ok(cloneCalories);
  if (cloneCalories.kind === "range") cloneCalories.min = 0;
  assert.equal(originalPortion.quantity, 50);
  assert.equal(originalSwap.quantity, 2);
  assert.deepEqual(original.dailyTarget, {
    style: "calories",
    calories: { kind: "range", min: 1800, max: 2200 },
  });
});

test("archived plan snapshots retain schedule and stay independent from later edits", () => {
  const plan = samplePlan();
  plan.schedule = {
    mode: "weekly",
    days: { 1: "td", 2: "td", 3: "td", 4: "td", 5: "ntd", 6: "ntd", 7: "ntd" },
  };
  plan.activeVariantId = "ntd";
  const archivedPlan = archiveCurrentPlan(
    plan,
    new Date("2026-10-11T10:00:00Z"),
  );
  const snapshot = first(archivedPlan.archivedPlans);
  const repeatedSnapshot = first(
    archiveCurrentPlan(plan, new Date("2026-10-11T10:00:00Z")).archivedPlans,
  );
  assert.notEqual(snapshot.id, repeatedSnapshot.id);
  assert.equal(snapshot.planId, plan.id);
  assert.equal(snapshot.activeVariantId, "ntd");
  assert.deepEqual(snapshot.schedule, plan.schedule);
  const archivedMeal = first(first(snapshot.variants).meals);
  const archivedPortion = first(archivedMeal.portions);
  archivedPortion.quantity = 100;
  if (snapshot.schedule.mode === "weekly") snapshot.schedule.days[1] = "ntd";
  const originalPortion = first(first(first(plan.variants).meals).portions);
  assert.equal(originalPortion.quantity, 50);
  assert.equal(
    plan.schedule.mode === "weekly" ? plan.schedule.days[1] : undefined,
    "td",
  );
});

test("manual and weekly selection honor the plan start date and ISO weekdays", () => {
  const plan = samplePlan();
  const beforeStart = new Date(2026, 9, 9, 12);
  const afterStart = new Date(2026, 9, 10, 12);
  assert.equal(getActiveVariant(plan, beforeStart), undefined);
  assert.equal(getActiveVariant(plan, afterStart)?.id, "td");
  // Browsing another variant must not change the coach's daily prescription.
  plan.activeVariantId = "ntd";
  assert.equal(getActiveVariant(plan, afterStart)?.id, "td");
  plan.schedule = { mode: "manual", selectedVariantId: "ntd" };
  assert.equal(getActiveVariant(plan, afterStart)?.id, "ntd");

  plan.schedule = {
    mode: "weekly",
    days: { 1: "ntd", 2: "td", 3: "td", 4: "td", 5: "td", 6: "td", 7: "ntd" },
  };
  assert.equal(getActiveVariant(plan, new Date(2026, 9, 12, 12))?.id, "ntd"); // Monday
  assert.equal(getActiveVariant(plan, new Date(2026, 9, 11, 12))?.id, "ntd"); // Sunday
});

test("repeating rhythms honor anchors, block boundaries, month/year rollover, and browsing assignment", () => {
  const plan = samplePlan();
  plan.schedule = {
    mode: "cycle",
    anchorDate: "2026-12-31",
    steps: [
      { variantId: "td", days: 2 },
      { variantId: "ntd", days: 1 },
    ],
  };
  const day = (value: string) => new Date(`${value}T12:00:00`);
  assert.equal(getActiveVariant(plan, day("2026-12-30")), undefined); // Before plan start.
  plan.startDate = "2026-12-01";
  assert.equal(getActiveVariant(plan, day("2026-12-30")), undefined); // Before rhythm anchor.
  assert.equal(getActiveVariant(plan, day("2026-12-31"))?.id, "td");
  assert.equal(getActiveVariant(plan, day("2027-01-01"))?.id, "td");
  assert.equal(getActiveVariant(plan, day("2027-01-02"))?.id, "ntd");
  assert.equal(getActiveVariant(plan, day("2027-01-03"))?.id, "td"); // Cycle restarts.
  plan.activeVariantId = "ntd";
  assert.equal(getActiveVariant(plan, day("2027-01-03"))?.id, "td"); // Browsing is independent.
});

test("repeating rhythm day arithmetic stays aligned across daylight-saving changes", () => {
  const plan = samplePlan();
  plan.startDate = "2026-03-28";
  plan.schedule = {
    mode: "cycle",
    anchorDate: "2026-03-28",
    steps: [
      { variantId: "td", days: 1 },
      { variantId: "ntd", days: 1 },
    ],
  };
  const day = (value: string) => new Date(`${value}T12:00:00`);
  assert.equal(getActiveVariant(plan, day("2026-03-28"))?.id, "td");
  assert.equal(getActiveVariant(plan, day("2026-03-29"))?.id, "ntd");
  assert.equal(getActiveVariant(plan, day("2026-03-30"))?.id, "td");
});

test("cycle schedules are archived, structurally guarded, and domain-validated", () => {
  const plan = samplePlan();
  plan.schedule = {
    mode: "cycle",
    anchorDate: "2026-10-10",
    steps: [
      { variantId: "td", days: 2 },
      { variantId: "ntd", days: 2 },
    ],
  };
  const archived = archiveCurrentPlan(plan);
  assert.deepEqual(first(archived.archivedPlans).schedule, plan.schedule);
  assert.equal(isMealPlan(archived), true);

  const badAnchor = structuredClone(plan);
  if (badAnchor.schedule.mode === "cycle")
    badAnchor.schedule.anchorDate = "2026-02-30";
  assert.ok(
    validateMealPlan(badAnchor, new Map()).some((error) =>
      /repeating rhythm start date/.test(error),
    ),
  );

  const badSteps = structuredClone(plan);
  if (badSteps.schedule.mode === "cycle") {
    badSteps.schedule.steps = [
      { variantId: "missing", days: 29 },
      { variantId: "ntd", days: 337 },
    ];
  }
  const errors = validateMealPlan(badSteps, new Map());
  assert.ok(errors.some((error) => /1 to 28 days/.test(error)));
  assert.ok(errors.some((error) => /up to 365 days/.test(error)));
  assert.ok(errors.some((error) => /existing variants/.test(error)));

  const malformed = structuredClone(plan);
  malformed.schedule = {
    mode: "cycle",
    anchorDate: "2026-10-10",
    steps: [{ variantId: 3, days: 1 }],
  } as unknown as MealPlan["schedule"];
  assert.equal(isMealPlan(malformed), false);
});

test("initial plans use the selected local calendar date", () => {
  const now = new Date(2026, 9, 11, 0, 30);
  const plan = createInitialMealPlan("client-1", [], now);
  assert.equal(plan.startDate, "2026-10-11");
  const defaultVariant = first(plan.variants);
  assert.equal(defaultVariant.label, "TD");
  assert.equal(defaultVariant.meals.length, 4);
});

test("target validation rejects negative values and reversed ranges", () => {
  assert.match(
    validateTargets({
      style: "calories",
      calories: { kind: "fixed", value: -1 },
    }).join(" "),
    /non-negative/,
  );
  assert.match(
    validateTargets({
      style: "macros",
      protein: { kind: "range", min: 40, max: 30 },
    }).join(" "),
    /cannot exceed/,
  );
  assert.match(
    validateTargets({
      style: "macros",
      fat: { kind: "minimum", value: Number.NaN },
    }).join(" "),
    /non-negative/,
  );
  assert.deepEqual(
    validateTargets({
      style: "calories",
      calories: { kind: "fixed", value: 2000 },
    }),
    [],
  );
});

test("plan validation rejects invalid dates/times, incomplete weekly schedules, and unknown foods", () => {
  const plan = samplePlan();
  plan.startDate = "2026-02-30";
  plan.schedule = {
    mode: "weekly",
    days: { 1: "td", 2: "td", 3: "td", 4: "td", 5: "td", 6: "td" },
  };
  const meal = first(first(plan.variants).meals);
  first(meal.portions).foodId = "missing";
  meal.time = "25:61";
  first(meal.portions).quantity = -5;
  const errors = validateMealPlan(plan, new Map());
  assert.ok(errors.some((error) => /valid plan start date/.test(error)));
  assert.ok(errors.some((error) => /valid time/.test(error)));
  assert.ok(errors.some((error) => /every day/.test(error)));
  assert.ok(
    errors.some((error) => /food that is no longer available/.test(error)),
  );
  assert.ok(errors.some((error) => /valid quantity/.test(error)));
});

test("storage shape guard allows structurally sound drafts with invalid domain values", () => {
  const draft = samplePlan();
  draft.startDate = "not-a-date";
  draft.schedule = { mode: "weekly", days: { 1: "td" } };
  const meal = first(first(draft.variants).meals);
  meal.time = "29:80";
  meal.target = {
    style: "macros",
    protein: { kind: "range", min: 80, max: 40 },
  };
  first(meal.portions).quantity = -5;

  assert.equal(isMealPlan(draft), true);
});

test("storage shape guard rejects malformed nested portions, targets, schedules, archives, and reusable meals", () => {
  const badPortion = samplePlan();
  first(first(badPortion.variants).meals).portions = [
    null as unknown as FoodPortion,
  ];
  assert.equal(isMealPlan(badPortion), false);

  const badTarget = samplePlan();
  first(first(badTarget.variants).meals).target = {
    style: "macros",
    protein: { kind: "unknown", value: 20 },
  } as unknown as MealTargets;
  assert.equal(isMealPlan(badTarget), false);

  const missingWeeklyDays = samplePlan();
  missingWeeklyDays.schedule = {
    mode: "weekly",
  } as unknown as MealPlan["schedule"];
  assert.equal(isMealPlan(missingWeeklyDays), false);

  const invalidWeeklyKey = samplePlan();
  invalidWeeklyKey.schedule = {
    mode: "weekly",
    days: { 8: "td" },
  } as unknown as MealPlan["schedule"];
  assert.equal(isMealPlan(invalidWeeklyKey), false);

  const badArchive = archiveCurrentPlan(samplePlan());
  first(badArchive.archivedPlans).schedule =
    null as unknown as MealPlan["schedule"];
  assert.equal(isMealPlan(badArchive), false);

  const badReusableMeal = samplePlan();
  badReusableMeal.reusableMeals = [
    {
      id: "saved-1",
      name: "Broken",
      meal: null,
      savedAt: "now",
    } as unknown as MealPlan["reusableMeals"][number],
  ];
  assert.equal(isMealPlan(badReusableMeal), false);
});
