import assert from "node:assert/strict";
import { emptyIifymPlan, emptyMealPlan } from "./domain.ts";

for (const plan of [
  emptyMealPlan("client", "2026-10-18"),
  emptyIifymPlan("client", "2026-10-18"),
]) {
  const options = "variants" in plan ? plan.variants : plan.options;
  assert.equal(
    options.length,
    1,
    "fresh nutrition plans start with one neutral option",
  );
  assert.equal(options[0].label, "Daily plan");
  assert.equal(
    plan.schedule.mode,
    "flexible",
    "fresh plans default to the client choosing each day",
  );
}

const existingMealPlan = {
  ...emptyMealPlan("client", "2026-10-18"),
  variants: [
    { id: "training", label: "Training Day", meals: [] },
    { id: "rest", label: "Rest Day", meals: [] },
  ],
  schedule: {
    mode: "weekly",
    days: {
      1: "rest",
      2: "rest",
      3: "rest",
      4: "rest",
      5: "rest",
      6: "rest",
      7: "rest",
    },
  },
};
assert.equal(existingMealPlan.schedule.mode, "weekly");
assert.deepEqual(
  existingMealPlan.variants.map((option) => option.label),
  ["Training Day", "Rest Day"],
  "existing saved options and schedules remain supported",
);

// A stored plan carrying no schedule migrates to "client chooses".
const { migrateCoachState } = await import("./domain.ts");
const migrated = migrateCoachState({
  clients: [
    {
      id: "c",
      plans: {
        nutrition: {
          mealPlan: {
            id: "m",
            clientId: "c",
            name: "Plan",
            startDate: "2026-10-01",
            variants: [{ id: "v", label: "A", meals: [] }],
            activeVariantId: "v",
          },
          iifym: null,
          temporary: [],
        },
      },
    },
  ],
});
const migratedPlan = migrated.clients[0].plans.nutrition.mealPlan;
assert.equal(
  migratedPlan.schedule?.mode ?? "flexible",
  "flexible",
  "a saved plan with no schedule resolves to the client choosing",
);

// Manual + several options migrates to flexible; single-option manual and
// weekly schedules are untouched.
const { migrateCoachState: migrate2 } = await import("./domain.ts");
const multiManual = migrate2({
  clients: [
    {
      id: "c",
      plans: {
        nutrition: {
          mealPlan: {
            draft: {
              id: "m",
              clientId: "c",
              name: "P",
              startDate: "2026-10-01",
              variants: [
                { id: "a", label: "A", meals: [] },
                { id: "b", label: "B", meals: [] },
              ],
              activeVariantId: "a",
              schedule: { mode: "manual", selectedVariantId: "a" },
            },
            active: null,
            history: [
              {
                id: "h",
                activatedAt: "2026-09-01",
                content: {
                  id: "m1",
                  clientId: "c",
                  name: "P1",
                  startDate: "2026-09-01",
                  variants: [
                    { id: "a", label: "A", meals: [] },
                    { id: "b", label: "B", meals: [] },
                  ],
                  activeVariantId: "a",
                  schedule: { mode: "manual", selectedVariantId: "a" },
                },
              },
            ],
          },
          iifym: {
            draft: {
              id: "i",
              clientId: "c",
              name: "I",
              startDate: "2026-10-01",
              options: [
                { id: "x", label: "X", targets: {} },
                { id: "y", label: "Y", targets: {} },
              ],
              schedule: { mode: "manual", selectedVariantId: "x" },
            },
            active: null,
            history: [],
          },
          temporary: [],
        },
      },
    },
  ],
});
assert.equal(
  multiManual.clients[0].plans.nutrition.mealPlan.draft.schedule.mode,
  "flexible",
  "multi-option manual meal plan -> flexible",
);
assert.equal(
  multiManual.clients[0].plans.nutrition.mealPlan.history[0].content.schedule
    .mode,
  "flexible",
  "multi-option manual history -> flexible",
);
assert.equal(
  multiManual.clients[0].plans.nutrition.iifym.draft.schedule.mode,
  "flexible",
  "multi-option manual iifym -> flexible",
);

const singleManual = migrate2({
  clients: [
    {
      id: "c",
      plans: {
        nutrition: {
          mealPlan: {
            draft: {
              id: "m",
              clientId: "c",
              name: "P",
              startDate: "2026-10-01",
              variants: [{ id: "a", label: "A", meals: [] }],
              activeVariantId: "a",
              schedule: { mode: "manual", selectedVariantId: "a" },
            },
            active: null,
            history: [],
          },
          iifym: null,
          temporary: [],
        },
      },
    },
  ],
});
assert.equal(
  singleManual.clients[0].plans.nutrition.mealPlan.draft.schedule.mode,
  "manual",
  "single-option manual stays manual",
);

const weeklyPlan = migrate2({
  clients: [
    {
      id: "c",
      plans: {
        nutrition: {
          mealPlan: {
            draft: {
              id: "m",
              clientId: "c",
              name: "P",
              startDate: "2026-10-01",
              variants: [
                { id: "a", label: "A", meals: [] },
                { id: "b", label: "B", meals: [] },
              ],
              activeVariantId: "a",
              schedule: { mode: "weekly", days: { 1: "a" } },
            },
            active: null,
            history: [],
          },
          iifym: null,
          temporary: [],
        },
      },
    },
  ],
});
assert.equal(
  weeklyPlan.clients[0].plans.nutrition.mealPlan.draft.schedule.mode,
  "weekly",
  "weekly schedules are untouched",
);
