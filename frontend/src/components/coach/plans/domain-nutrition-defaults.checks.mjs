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
    "manual",
    "fresh plans do not enable a schedule",
  );
  assert.equal(plan.schedule.selectedVariantId, options[0].id);
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
