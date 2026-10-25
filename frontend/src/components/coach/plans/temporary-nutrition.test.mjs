import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTemporaryNutrition,
  removeTemporaryNutrition,
  temporaryNutritionForDate,
  upsertTemporaryNutrition,
  validateTemporaryNutrition,
} from "./temporary-nutrition.ts";

const mealPlan = {
  id: "mp",
  clientId: "c1",
  name: "Prep nutrition",
  startDate: "2026-10-01",
  variants: [{ id: "train", label: "Training day", meals: [] }],
  schedule: { mode: "manual", selectedVariantId: "train" },
};

const detail = {
  kind: "refeed",
  label: "Refeed",
  startDate: "2026-10-24",
  endDate: "2026-10-25",
};

const base = {
  nutrition: {
    mealPlan: { history: [] },
    iifym: { history: [] },
  },
  training: { history: [] },
  goals: [],
};

test("createTemporaryNutrition deep-copies the active plan with new ids", () => {
  const t = createTemporaryNutrition(
    mealPlan,
    "mealPlan",
    detail,
    "2026-10-22T08:00:00Z",
  );
  assert.equal(t.kind, "refeed");
  assert.equal(t.label, "Refeed");
  assert.equal(t.source, "mealPlan");
  assert.notEqual(t.plan.id, mealPlan.id);
  assert.notEqual(t.plan, mealPlan);
  t.plan.variants[0].label = "Changed";
  assert.equal(mealPlan.variants[0].label, "Training day");
});

test("upsert then remove a temporary plan", () => {
  const t = createTemporaryNutrition(
    mealPlan,
    "mealPlan",
    detail,
    "2026-10-22T08:00:00Z",
  );
  const withOne = upsertTemporaryNutrition(base, t);
  assert.equal(withOne.nutrition.temporary.length, 1);
  // Upsert by id replaces, not duplicates.
  const updated = upsertTemporaryNutrition(withOne, {
    ...t,
    label: "Refeed 2.0",
  });
  assert.equal(updated.nutrition.temporary.length, 1);
  assert.equal(updated.nutrition.temporary[0].label, "Refeed 2.0");
  const removed = removeTemporaryNutrition(updated, t.id);
  assert.equal(removed.nutrition.temporary.length, 0);
});

test("temporaryNutritionForDate covers the range, respects source, latest wins", () => {
  const older = { ...detail, createdAt: "2026-10-20T08:00:00Z" };
  const a = createTemporaryNutrition(
    mealPlan,
    "mealPlan",
    detail,
    older.createdAt,
  );
  const b = {
    ...createTemporaryNutrition(
      mealPlan,
      "mealPlan",
      detail,
      "2026-10-21T08:00:00Z",
    ),
    id: "newer",
  };
  const iifym = {
    ...createTemporaryNutrition(
      mealPlan,
      "iifym",
      detail,
      "2026-10-22T08:00:00Z",
    ),
    id: "iifym-temp",
  };
  const list = [a, b, iifym];
  assert.equal(
    temporaryNutritionForDate(list, "2026-10-24", "mealPlan")?.id,
    "newer",
  );
  assert.equal(temporaryNutritionForDate(list, "2026-10-26", "mealPlan"), null);
  assert.equal(temporaryNutritionForDate(list, "2026-10-23", "mealPlan"), null);
  assert.equal(
    temporaryNutritionForDate(list, "2026-10-24", "iifym")?.id,
    "iifym-temp",
  );
  assert.equal(
    temporaryNutritionForDate(undefined, "2026-10-24", "mealPlan"),
    null,
  );
});

test("validateTemporaryNutrition checks dates, order and length", () => {
  assert.equal(validateTemporaryNutrition(detail), null);
  assert.match(
    validateTemporaryNutrition({ ...detail, startDate: "nope" }),
    /valid/i,
  );
  assert.match(
    validateTemporaryNutrition({
      ...detail,
      startDate: "2026-10-26",
      endDate: "2026-10-24",
    }),
    /after/i,
  );
  assert.match(
    validateTemporaryNutrition({
      ...detail,
      startDate: "2026-10-01",
      endDate: "2026-10-30",
    }),
    /28/,
  );
  assert.match(
    validateTemporaryNutrition({ ...detail, label: "  " }),
    /label/i,
  );
});
