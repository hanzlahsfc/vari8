import assert from "node:assert/strict";
import { calculatePortionNutrients } from "../../../ethereal/mealplan/model.ts";
import {
  addFoodAlternative,
  alternativeQuantity,
  duplicateIifymOption,
  duplicateMealOption,
  mealDropTargetIndex,
  moveMeal,
  removeIifymOption,
  removeMealOption,
  replacementQuantity,
  replacePortionFood,
  scaleFoodAlternatives,
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

const sourceFood = {
  id: "oats",
  name: "Oats",
  amount: 100,
  unit: "g",
  calories: 380,
  protein: 13,
  carbs: 68,
  fat: 7,
};
const replacementFood = {
  id: "rice",
  name: "Rice",
  amount: 100,
  unit: "cup",
  calories: 360,
  protein: 7,
  carbs: 80,
  fat: 1,
};
assert.equal(
  replacementQuantity(sourceFood, 50, { ...sourceFood, id: "oats-2" }),
  50,
  "replacement preserves quantity when units match",
);
assert.equal(
  replacementQuantity(sourceFood, 50, replacementFood),
  53,
  "replacement uses a rounded calorie-equivalent quantity when units differ",
);
assert.equal(
  alternativeQuantity(sourceFood, 50, { ...replacementFood, unit: "g" }),
  53,
  "alternatives retain calorie-equivalent quantity even when units match",
);
const sourcePortion = {
  foodId: "oats",
  quantity: 50,
  swaps: [{ foodId: "rice", quantity: 53 }],
};
assert.equal(
  addFoodAlternative(sourcePortion, "oats", 50),
  sourcePortion,
  "source food cannot be added as its own alternative",
);
assert.equal(
  addFoodAlternative(sourcePortion, "rice", 53),
  sourcePortion,
  "duplicate alternatives are ignored",
);
const withAlternative = addFoodAlternative(sourcePortion, "beans", 70);
assert.deepEqual(withAlternative.swaps, [
  ...sourcePortion.swaps,
  { foodId: "beans", quantity: 70 },
]);
assert.equal(
  calculatePortionNutrients(
    replacementFood,
    replacementQuantity(sourceFood, 50, replacementFood),
  ).calories,
  190.8,
);
const portionWithNotes = {
  foodId: "oats",
  quantity: 50,
  swaps: [
    { foodId: "rice", quantity: 61, note: "Existing rice note" },
    { foodId: "beans", quantity: 70, note: "Keep this note" },
  ],
};
const promoted = replacePortionFood(
  portionWithNotes,
  sourceFood,
  replacementFood,
);
assert.equal(promoted.foodId, "rice");
assert.equal(
  promoted.quantity,
  61,
  "promoting an existing alternative retains its coach-entered quantity",
);
assert.deepEqual(
  promoted.swaps,
  [{ foodId: "beans", quantity: 70, note: "Keep this note" }],
  "promoting an existing alternative removes it from swaps and preserves unrelated alternatives and their notes",
);

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

const reordered = moveMeal(mealPlan.variants[0], "meal-a", 0);
assert.equal(
  reordered,
  mealPlan.variants[0],
  "no-op reorder preserves identity",
);
const twoMealVariant = {
  ...mealPlan.variants[0],
  meals: [
    mealPlan.variants[0].meals[0],
    { id: "meal-b", label: "Lunch", time: "12:00", portions: [] },
  ],
};
const movedMealVariant = moveMeal(twoMealVariant, "meal-b", 0);
assert.deepEqual(
  movedMealVariant.meals.map((meal) => meal.id),
  ["meal-b", "meal-a"],
  "reordering moves a meal to the requested position",
);
assert.deepEqual(
  twoMealVariant.meals.map((meal) => meal.id),
  ["meal-a", "meal-b"],
);
const mealIds = twoMealVariant.meals.map((meal) => meal.id);
const dropIndex = mealDropTargetIndex(mealIds, "meal-b", "meal-a");
assert.equal(dropIndex, 0, "pointer drop resolves to the target meal position");
assert.deepEqual(
  moveMeal(twoMealVariant, "meal-b", dropIndex).meals.map((meal) => meal.id),
  ["meal-b", "meal-a"],
);
assert.equal(mealDropTargetIndex(mealIds, "meal-a", "meal-a"), undefined);

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

// Alternatives scale with the main quantity.
const scaleMap = new Map([
  [
    "skyr",
    {
      id: "skyr",
      name: "Skyr",
      unit: "g",
      calories: 63,
      amount: 100,
      protein: 11,
      carbs: 4,
      fat: 0,
    },
  ],
  [
    "egg",
    {
      id: "egg",
      name: "Egg",
      unit: "pc",
      calories: 72,
      amount: 1,
      protein: 6,
      carbs: 0,
      fat: 5,
    },
  ],
]);
{
  const portion = {
    foodId: "yoghurt",
    quantity: 200,
    swaps: [
      { foodId: "skyr", quantity: 250 },
      { foodId: "egg", quantity: 3 },
    ],
  };
  // Halve the main quantity → alternatives halve, weighed food to 5 g steps,
  // piece food to whole units, min one step.
  const halved = scaleFoodAlternatives(portion, 100, scaleMap);
  assert.equal(halved.quantity, 100);
  assert.equal(halved.swaps[0].quantity, 125); // 250 * 0.5
  assert.equal(halved.swaps[1].quantity, 2); // 3 * 0.5 = 1.5 → rounds to 2
  // A 0 old quantity keeps the alternatives unchanged (the patch leaves
  // swaps alone).
  const zeroed = scaleFoodAlternatives(
    { ...portion, quantity: 0 },
    100,
    scaleMap,
  );
  assert.equal(zeroed.quantity, 100);
  assert.equal(zeroed.swaps, undefined);
  // Rounds to the 5 g step (260 * 0.5 = 130 stays a 5 g multiple).
  const stepped = scaleFoodAlternatives(
    {
      foodId: "yoghurt",
      quantity: 200,
      swaps: [{ foodId: "skyr", quantity: 261 }],
    },
    100,
    scaleMap,
  );
  assert.equal(stepped.swaps[0].quantity, 130); // 130.5 → 130 (5 g step)
}
