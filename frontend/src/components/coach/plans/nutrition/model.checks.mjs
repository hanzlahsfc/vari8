import assert from "node:assert/strict";
import {
  duplicateIifymOption,
  duplicateMealOption,
  removeIifymOption,
  removeMealOption,
} from "./model.ts";

const mealPlan = {
  id: "meal-plan",
  clientId: "client",
  name: "Plan",
  startDate: "2026-01-01",
  variants: [
    {
      id: "option-a",
      label: "A",
      meals: [
        {
          id: "meal-a",
          label: "Breakfast",
          time: "08:00",
          portions: [
            {
              foodId: "oats",
              quantity: 40,
              swaps: [{ foodId: "rice", quantity: 45 }],
            },
          ],
        },
      ],
    },
    { id: "option-b", label: "B", meals: [] },
  ],
  activeVariantId: "option-a",
  schedule: { mode: "manual", selectedVariantId: "option-a" },
  archivedPlans: [],
  reusableMeals: [],
};

const duplicate = duplicateMealOption(mealPlan, "option-a");
const duplicateOption = duplicate.variants.at(-1);
assert.notEqual(duplicateOption.id, "option-a");
assert.notEqual(duplicateOption.meals[0].id, "meal-a");
assert.notEqual(
  duplicateOption.meals[0].portions[0].swaps[0],
  mealPlan.variants[0].meals[0].portions[0].swaps[0],
);
duplicateOption.meals[0].portions[0].quantity = 99;
duplicateOption.meals[0].portions[0].swaps[0].quantity = 100;
assert.equal(mealPlan.variants[0].meals[0].portions[0].quantity, 40);
assert.equal(mealPlan.variants[0].meals[0].portions[0].swaps[0].quantity, 45);
assert.deepEqual(
  duplicate.schedule,
  mealPlan.schedule,
  "adding an option leaves existing assignments unchanged",
);
assert.notEqual(duplicate.schedule, mealPlan.schedule);

for (const schedule of [
  { mode: "manual", selectedVariantId: "option-a" },
  { mode: "weekly", days: { 1: "option-a", 2: "option-b" } },
  {
    mode: "cycle",
    anchorDate: "2026-01-01",
    steps: [
      { variantId: "option-a", days: 2 },
      { variantId: "option-b", days: 1 },
    ],
  },
]) {
  const removed = removeMealOption(
    { ...mealPlan, schedule, activeVariantId: "option-a" },
    "option-a",
  );
  assert.equal(removed.variants.length, 1);
  assert.equal(removed.activeVariantId, "option-b");
  if (schedule.mode === "manual")
    assert.equal(removed.schedule.selectedVariantId, "option-b");
  if (schedule.mode === "weekly")
    assert.deepEqual(removed.schedule.days, { 1: "option-b", 2: "option-b" });
  if (schedule.mode === "cycle")
    assert.deepEqual(
      removed.schedule.steps.map((step) => step.variantId),
      ["option-b", "option-b"],
    );
}

const roleSchedule = {
  mode: "weekly",
  days: { 1: "option-a", 2: "option-b" },
  roles: { training: "option-a", rest: "option-b" },
};
const roleCopy = duplicateMealOption(
  { ...mealPlan, schedule: roleSchedule },
  "option-a",
);
assert.deepEqual(roleCopy.schedule.roles, roleSchedule.roles);
assert.notEqual(roleCopy.schedule.roles, roleSchedule.roles);
const removedRole = removeMealOption(
  { ...mealPlan, schedule: roleSchedule },
  "option-a",
);
assert.deepEqual(removedRole.schedule.roles, {
  training: "option-b",
  rest: "option-b",
});
assert.deepEqual(roleSchedule.roles, {
  training: "option-a",
  rest: "option-b",
});

const iifym = {
  id: "targets",
  clientId: "client",
  name: "Targets",
  startDate: "2026-01-01",
  options: [
    {
      id: "target-a",
      label: "Training",
      targets: {
        style: "macros",
        protein: { kind: "range", min: 100, max: 120 },
        carbs: { kind: "fixed", value: 200 },
        fat: { kind: "minimum", value: 50 },
      },
    },
    {
      id: "target-b",
      label: "Rest",
      targets: { style: "calories", calories: { kind: "fixed", value: 1800 } },
    },
  ],
  schedule: {
    mode: "cycle",
    anchorDate: "2026-01-01",
    steps: [
      { variantId: "target-a", days: 1 },
      { variantId: "target-b", days: 1 },
    ],
  },
};
const targetCopyPlan = duplicateIifymOption(iifym, "target-a");
const targetCopy = targetCopyPlan.options.at(-1);
assert.notEqual(targetCopy.id, "target-a");
targetCopy.targets.protein.min = 1;
assert.equal(iifym.options[0].targets.protein.min, 100);
assert.deepEqual(
  targetCopyPlan.schedule,
  iifym.schedule,
  "adding a target option leaves existing assignments unchanged",
);
assert.notEqual(targetCopyPlan.schedule, iifym.schedule);
assert.notEqual(targetCopyPlan.schedule.steps, iifym.schedule.steps);
const removedTarget = removeIifymOption(iifym, "target-a");
assert.deepEqual(
  removedTarget.schedule.steps.map((step) => step.variantId),
  ["target-b", "target-b"],
);
assert.equal(iifym.options[0].targets.protein.min, 100);
