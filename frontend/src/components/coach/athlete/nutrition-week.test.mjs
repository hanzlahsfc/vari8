import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nutritionDayTargets,
  weekNutritionBreakdown,
} from "./nutrition-week.ts";

const closeTo = (actual, expected, tolerance = 0.001) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );

/** 100 g of food-328 (vegan beef) = 100 kcal, 25.5 P, 3.6 C, 5.5 F. */
const variant = (id, label, grams) => ({
  id,
  label,
  meals: [
    {
      id: `meal-${id}`,
      label: "Day",
      time: "",
      portions: [{ foodId: "food-328", quantity: grams }],
    },
  ],
});

const mealPlan = ({ id = "mp", startDate, variants, schedule }) => ({
  id,
  clientId: "c1",
  name: "Plan",
  startDate,
  variants,
  activeVariantId: variants[0].id,
  schedule,
  archivedPlans: [],
  reusableMeals: [],
});

const iifymOption = (id, label, protein, carbs, fat) => ({
  id,
  label,
  targets: {
    style: "macros",
    protein: { kind: "fixed", value: protein },
    carbs: { kind: "fixed", value: carbs },
    fat: { kind: "fixed", value: fat },
  },
});

const iifymPlan = ({ id = "iifym", startDate, options, schedule }) => ({
  id,
  clientId: "c1",
  name: "Targets",
  startDate,
  options,
  schedule,
});

const week = (monday) => ({
  monday,
  sunday: addDays(monday, 6),
  days: Array.from({ length: 7 }, (_, index) => addDays(monday, index)),
});

function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function clientFor({ source = "mealPlan", life, temporary = [] }) {
  return {
    id: "c1",
    assignment: {
      templateId: "t",
      variantId: "v",
      snapshot: {
        id: "t",
        name: "Template",
        description: "",
        updated: "2026-10-01",
        defaultVariant: "v",
        variants: [
          {
            id: "v",
            name: "Variant",
            nutrition: source === "iifym" ? "IIFYM" : "Meal plan",
            views: [],
            habits: false,
            widgets: [],
            questions: [],
            fields: [],
          },
        ],
      },
    },
    plans: {
      nutrition: {
        mealPlan: source === "mealPlan" ? life : { history: [] },
        iifym: source === "iifym" ? life : { history: [] },
        temporary,
      },
      training: { history: [] },
      goals: [],
    },
    entries: [],
  };
}

const activeLifecycle = (plan, activatedAt = "2026-09-30T08:00:00Z") => ({
  active: { id: `version-${plan.id}`, content: plan, activatedAt },
  history: [],
});

const WEEK = week("2026-10-05"); // Monday 5 Oct – Sunday 11 Oct

test("weekNutritionBreakdown averages 5 training + 2 rest days", () => {
  const plan = mealPlan({
    startDate: "2026-09-28",
    variants: [
      variant("td", "Training day", 2500),
      variant("ntd", "Rest day", 2000),
    ],
    schedule: {
      mode: "weekly",
      days: { 1: "td", 2: "td", 3: "td", 4: "td", 5: "td", 6: "ntd", 7: "ntd" },
    },
  });
  const breakdown = weekNutritionBreakdown(
    clientFor({ life: activeLifecycle(plan) }),
    WEEK,
  );

  assert.equal(breakdown.plannedDays, 7);
  assert.equal(Math.round(breakdown.average.calories), 2357);
  closeTo(breakdown.average.calories, 2357.142857);
  closeTo(breakdown.average.protein, 601.071429);
  closeTo(breakdown.average.carbs, 84.857143);
  closeTo(breakdown.average.fat, 129.642857);
  assert.deepEqual(
    breakdown.variants.map((entry) => [entry.label, entry.days]),
    [
      ["Training day", 5],
      ["Rest day", 2],
    ],
  );
});

test("variant order follows the active plan, then first day", () => {
  const plan = mealPlan({
    startDate: "2026-09-28",
    variants: [
      variant("ntd", "Rest day", 2000),
      variant("td", "Training day", 2500),
    ],
    schedule: {
      mode: "weekly",
      days: { 1: "td", 2: "td", 3: "td", 4: "td", 5: "td", 6: "ntd", 7: "ntd" },
    },
  });
  const breakdown = weekNutritionBreakdown(
    clientFor({ life: activeLifecycle(plan) }),
    WEEK,
  );
  assert.deepEqual(
    breakdown.variants.map((entry) => entry.label),
    ["Rest day", "Training day"],
  );
});

test("a mid-week plan start averages only the planned days", () => {
  const plan = mealPlan({
    startDate: "2026-10-07", // Wednesday
    variants: [variant("td", "Training day", 2500)],
    schedule: {
      mode: "weekly",
      days: { 1: "td", 2: "td", 3: "td", 4: "td", 5: "td", 6: "td", 7: "td" },
    },
  });
  const breakdown = weekNutritionBreakdown(
    clientFor({ life: activeLifecycle(plan) }),
    WEEK,
  );
  assert.equal(breakdown.plannedDays, 5);
  closeTo(breakdown.average.calories, 2500);
  assert.deepEqual(
    breakdown.variants.map((entry) => [entry.label, entry.days]),
    [["Training day", 5]],
  );
});

test("no plan leaves the average undefined", () => {
  const breakdown = weekNutritionBreakdown(
    clientFor({ life: { history: [] } }),
    WEEK,
  );
  assert.equal(breakdown.plannedDays, 0);
  assert.equal(breakdown.average, undefined);
  assert.deepEqual(breakdown.variants, []);
});

test("IIFYM resolves the option schedule by weekday, not by Monday", () => {
  const plan = iifymPlan({
    startDate: "2026-09-28",
    options: [
      iifymOption("td", "Training day", 180, 250, 70), // 2350 kcal
      iifymOption("ntd", "Rest day", 160, 180, 60), // 1900 kcal
    ],
    schedule: {
      mode: "weekly",
      days: {
        1: "td",
        2: "td",
        3: "td",
        4: "ntd",
        5: "ntd",
        6: "ntd",
        7: "ntd",
      },
    },
  });
  const client = clientFor({ source: "iifym", life: activeLifecycle(plan) });
  const breakdown = weekNutritionBreakdown(client, WEEK);

  assert.deepEqual(
    nutritionDayTargets(client, WEEK).map((entry) => entry.label),
    [
      "Training day",
      "Training day",
      "Training day",
      "Rest day",
      "Rest day",
      "Rest day",
      "Rest day",
    ],
  );
  assert.equal(breakdown.plannedDays, 7);
  closeTo(breakdown.average.calories, 2092.857143);
  assert.deepEqual(
    breakdown.variants.map((entry) => [entry.label, entry.days]),
    [
      ["Training day", 3],
      ["Rest day", 4],
    ],
  );
});

test("a mid-week plan change groups days by variant label", () => {
  const first = mealPlan({
    id: "first",
    startDate: "2026-10-01",
    variants: [variant("high", "High day", 2500)],
    schedule: {
      mode: "weekly",
      days: {
        1: "high",
        2: "high",
        3: "high",
        4: "high",
        5: "high",
        6: "high",
        7: "high",
      },
    },
  });
  const second = mealPlan({
    id: "second",
    startDate: "2026-10-08",
    variants: [
      variant("low", "Low day", 2000),
      variant("high", "High day", 2500),
    ],
    schedule: {
      mode: "weekly",
      days: {
        1: "low",
        2: "low",
        3: "low",
        4: "low",
        5: "low",
        6: "high",
        7: "high",
      },
    },
  });
  const life = {
    active: {
      id: "version-second",
      content: second,
      activatedAt: "2026-10-07T08:00:00Z",
    },
    history: [
      {
        id: "version-first",
        content: first,
        activatedAt: "2026-09-30T08:00:00Z",
        archivedOn: "2026-10-08",
      },
    ],
  };
  const breakdown = weekNutritionBreakdown(clientFor({ life }), WEEK);

  assert.equal(breakdown.plannedDays, 7);
  assert.equal(Math.round(breakdown.average.calories), 2357);
  // The active plan (second) lists Low day first even though High day appears
  // first in the week.
  assert.deepEqual(
    breakdown.variants.map((entry) => [entry.label, entry.days]),
    [
      ["Low day", 2],
      ["High day", 5],
    ],
  );
});

test("temporary plans stay out of the planned average", () => {
  const plan = mealPlan({
    startDate: "2026-09-28",
    variants: [variant("td", "Training day", 2500)],
    schedule: {
      mode: "weekly",
      days: { 1: "td", 2: "td", 3: "td", 4: "td", 5: "td", 6: "td", 7: "td" },
    },
  });
  const temporaryPlan = mealPlan({
    id: "temp-copy",
    startDate: "2026-09-28",
    variants: [variant("refeed", "Refeed", 3000)],
    schedule: { mode: "manual", selectedVariantId: "refeed" },
  });
  const temporary = [
    {
      id: "temp-1",
      kind: "refeed",
      label: "Refeed",
      startDate: "2026-10-07",
      endDate: "2026-10-07",
      source: "mealPlan",
      plan: temporaryPlan,
      createdAt: "2026-10-06T08:00:00Z",
    },
  ];
  const breakdown = weekNutritionBreakdown(
    clientFor({ life: activeLifecycle(plan), temporary }),
    WEEK,
  );
  assert.equal(breakdown.plannedDays, 6);
  closeTo(breakdown.average.calories, 2500);
});
