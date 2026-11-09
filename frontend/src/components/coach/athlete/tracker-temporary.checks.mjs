import assert from "node:assert/strict";
import { test } from "node:test";
import {
  temporaryPlanRoute,
  temporaryPlanTargets,
} from "./tracker-temporary.ts";

const portion = (quantity) => ({
  foodId: "food-001",
  quantity,
});
const variant = (id, label, quantity) => ({
  id,
  label,
  meals: [
    {
      id: `${id}-meal`,
      name: "Meal 1",
      portions: [portion(quantity)],
    },
  ],
});

const temporary = {
  id: "temp-nutrition-refeed",
  kind: "refeed",
  label: "Refeed",
  startDate: "2026-11-06",
  endDate: "2026-11-07",
  source: "mealPlan",
  createdAt: "2026-11-04T08:00:00Z",
  plan: {
    id: "meal-plan-temporary",
    clientId: "client-007",
    name: "Refeed",
    startDate: "2026-11-06",
    variants: [
      variant("refeed-day", "Refeed day", 200),
      variant("rest-day", "Rest day", 100),
    ],
    activeVariantId: "refeed-day",
    schedule: {
      mode: "weekly",
      // 2026-11-06 is Friday (5), 2026-11-07 is Saturday (6).
      days: { 5: "refeed-day", 6: "rest-day" },
    },
  },
};

const client = {
  id: "client-007",
  plans: {
    nutrition: {
      mealPlan: { history: [] },
      iifym: { history: [] },
      temporary: [temporary],
    },
    training: { history: [] },
    goals: [],
  },
};

test("temporary plan markers route to the temporary editor", () => {
  assert.equal(
    temporaryPlanRoute(temporary),
    "temporary:temp-nutrition-refeed",
  );
  assert.equal(temporaryPlanRoute(undefined), undefined);
});

test("targets resolve the variant scheduled on the hovered date", () => {
  // 200 g chicken breast: 290 kcal, 64 g protein, 0 g carbs, 3.8 g fat.
  assert.deepEqual(temporaryPlanTargets(client, "2026-11-06"), {
    id: "temp-nutrition-refeed",
    label: "Refeed",
    optionLabel: "Refeed day",
    kcal: 290,
    protein: 64,
    carbs: 0,
    fat: 4,
  });
  // The temporary plan covers the whole range; Saturday resolves its own variant.
  assert.deepEqual(temporaryPlanTargets(client, "2026-11-07"), {
    id: "temp-nutrition-refeed",
    label: "Refeed",
    optionLabel: "Rest day",
    kcal: 145,
    protein: 32,
    carbs: 0,
    fat: 2,
  });
});

test("dates outside the temporary range keep the regular plan", () => {
  assert.equal(temporaryPlanTargets(client, "2026-11-08"), undefined);
  assert.equal(temporaryPlanTargets(client, "2026-11-05"), undefined);
});
