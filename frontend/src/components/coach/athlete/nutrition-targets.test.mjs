import assert from "node:assert/strict";
import { test } from "node:test";
import { nutritionTargetsModel } from "./nutrition-targets.ts";

const TODAY = "2026-10-22"; // Thursday

const snapshot = (nutrition) => ({
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
        nutrition,
        views: [],
        habits: false,
        widgets: [],
        questions: [],
        fields: [],
      },
    ],
  },
});

const mealPlan = {
  id: "mp",
  clientId: "c1",
  name: "Prep nutrition",
  startDate: "2026-10-01",
  variants: [
    {
      id: "train",
      label: "Training day",
      meals: [
        {
          id: "m1",
          label: "Meal 1",
          time: "08:00",
          portions: [{ foodId: "food-001", quantity: 200 }],
        },
      ],
    },
    {
      id: "rest",
      label: "Rest day",
      meals: [
        {
          id: "m2",
          label: "Meal 1",
          time: "08:00",
          portions: [{ foodId: "food-001", quantity: 100 }],
        },
      ],
    },
    { id: "refeed", label: "Refeed day", meals: [] },
  ],
  activeVariantId: "train",
  schedule: {
    mode: "weekly",
    days: {
      1: "train",
      2: "train",
      3: "train",
      4: "train",
      5: "train",
      6: "rest",
      7: "rest",
    },
  },
  archivedPlans: [],
  reusableMeals: [],
};

const iifymPlan = {
  id: "ip",
  clientId: "c1",
  name: "Macro targets",
  startDate: "2026-10-01",
  options: [
    {
      id: "td",
      label: "Training day",
      targets: {
        style: "calories",
        calories: { kind: "fixed", value: 2600 },
      },
    },
    {
      id: "rd",
      label: "Rest day",
      targets: {
        style: "calories",
        calories: { kind: "range", min: 2300, max: 2500 },
      },
    },
    {
      id: "rf",
      label: "Refeed day",
      targets: {
        style: "macros",
        protein: { kind: "fixed", value: 180 },
        carbs: { kind: "range", min: 200, max: 220 },
        fat: { kind: "minimum", value: 60 },
      },
    },
  ],
  schedule: { mode: "manual", selectedVariantId: "td" },
};

const clientMeal = {
  id: "c1",
  assignment: snapshot("Meal plan"),
  plans: {
    nutrition: {
      mealPlan: {
        active: {
          id: "v1",
          content: mealPlan,
          activatedAt: "2026-10-01T08:00:00Z",
        },
        history: [],
      },
      iifym: { history: [] },
    },
    training: { history: [] },
    goals: [],
  },
  timelineEvents: [
    {
      id: "ev-rf",
      kind: "refeed",
      startDate: "2026-10-24",
      endDate: "2026-10-24",
      note: "",
      nutritionOverride: { source: "mealPlan", optionId: "refeed" },
    },
  ],
};

const clientIifym = {
  ...clientMeal,
  assignment: snapshot("IIFYM"),
  plans: {
    nutrition: {
      mealPlan: { history: [] },
      iifym: {
        active: {
          id: "v1",
          content: iifymPlan,
          activatedAt: "2026-10-01T08:00:00Z",
        },
        history: [],
      },
    },
    training: { history: [] },
    goals: [],
  },
  timelineEvents: [],
};

test("meal plan: one column per variant with computed totals and the scheduled today marker", () => {
  const model = nutritionTargetsModel(clientMeal, TODAY);
  assert.equal(model.source, "mealPlan");
  assert.equal(model.planName, "Prep nutrition");
  assert.equal(model.options.length, 3);
  const train = model.options.find((o) => o.id === "train");
  assert.equal(train.today, true); // Thursday → scheduled "train"
  // 200 g chicken (145 kcal / 32 P / 0 C / 1.9 F per 100 g)
  assert.equal(train.cells.kcal, "290");
  assert.equal(train.cells.protein, "64");
  assert.equal(train.cells.carbs, "0");
  assert.equal(train.cells.fat, "3.8");
  const rest = model.options.find((o) => o.id === "rest");
  assert.equal(rest.today, false);
  assert.equal(rest.cells.kcal, "145");
});

test("today marker respects timeline overrides", () => {
  const model = nutritionTargetsModel(clientMeal, "2026-10-24");
  assert.equal(model.options.find((o) => o.id === "refeed").today, true);
  assert.equal(model.options.find((o) => o.id === "rest").today, false);
});

test("iifym: fixed / range / minimum wording per option", () => {
  const model = nutritionTargetsModel(clientIifym, TODAY);
  assert.equal(model.source, "iifym");
  assert.equal(model.planName, "Macro targets");
  const td = model.options.find((o) => o.id === "td");
  assert.equal(td.today, true);
  assert.equal(td.cells.kcal, "2,600");
  assert.equal(td.cells.protein, "—");
  const rd = model.options.find((o) => o.id === "rd");
  assert.equal(rd.cells.kcal, "2,300–2,500");
  const rf = model.options.find((o) => o.id === "rf");
  // Macros style: energy is derived (180*4 + 200-220*4 + ≥60*9) → ≥2,060
  assert.equal(rf.cells.kcal, "≥2,060");
  assert.equal(rf.cells.protein, "180");
  assert.equal(rf.cells.carbs, "200–220");
  assert.equal(rf.cells.fat, "≥60");
});

test("returns undefined when there is no active plan", () => {
  const empty = {
    ...clientMeal,
    plans: {
      nutrition: { mealPlan: { history: [] }, iifym: { history: [] } },
      training: { history: [] },
      goals: [],
    },
  };
  assert.equal(nutritionTargetsModel(empty, TODAY), undefined);
});
