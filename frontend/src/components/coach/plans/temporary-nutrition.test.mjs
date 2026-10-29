import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTemporaryNutrition,
  normalizeTemporaryNutrition,
  removeTemporaryNutrition,
  splitTemporaryNutrition,
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

test("normalizeTemporaryNutrition reduces a legacy multi-variant plan to one", () => {
  const t = {
    id: "temp-1",
    kind: "refeed",
    label: "Refeed",
    startDate: "2026-10-29",
    endDate: "2026-10-30",
    source: "mealPlan",
    plan: {
      ...structuredClone(mealPlan),
      variants: [
        { id: "train", label: "TD", meals: [] },
        { id: "non", label: "NTD", meals: [] },
        { id: "third", label: "Option 3", meals: [] },
      ],
      activeVariantId: "train",
      schedule: { mode: "manual", selectedVariantId: "non" },
    },
    createdAt: "2026-10-27T08:00:00Z",
  };
  const n = normalizeTemporaryNutrition(t);
  assert.equal(n.plan.variants.length, 1);
  // keeps the manually-selected variant
  assert.equal(n.plan.variants[0].id, "non");
  assert.equal(n.plan.activeVariantId, "non");
  assert.equal(n.plan.schedule.mode, "manual");
  assert.equal(n.plan.schedule.selectedVariantId, "non");
  // a single-variant plan is left alone
  const single = normalizeTemporaryNutrition({
    ...t,
    plan: {
      ...t.plan,
      variants: [t.plan.variants[0]],
      schedule: { mode: "manual", selectedVariantId: "train" },
    },
  });
  assert.equal(single.plan.variants.length, 1);
});

test("splitTemporaryNutrition: boundaries are inclusive, past is newest-first", () => {
  const mk = (id, startDate, endDate) => ({
    id,
    source: "mealPlan",
    kind: "mealPlan",
    label: id,
    createdAt: "2026-10-01T00:00:00Z",
    startDate,
    endDate,
    plan: {
      id,
      clientId: "c",
      name: id,
      startDate,
      variants: [],
      activeVariantId: "",
      schedule: { mode: "manual", selectedVariantId: "" },
      archivedPlans: [],
      reusableMeals: [],
    },
  });
  const today = "2026-10-27";
  const list = [
    mk("starts-today", today, "2026-10-30"),
    mk("ends-today", "2026-10-20", today),
    mk("ended-yesterday", "2026-10-10", "2026-10-26"),
    mk("ended-earlier", "2026-10-01", "2026-10-15"),
    mk("upcoming", "2026-10-30", "2026-11-02"),
  ];
  const { current, past } = splitTemporaryNutrition(list, today);
  assert.deepEqual(
    current.map((t) => t.id),
    ["ends-today", "starts-today", "upcoming"],
    "today === startDate and today === endDate are current",
  );
  assert.deepEqual(
    past.map((t) => t.id),
    ["ended-yesterday", "ended-earlier"],
    "endDate < today is past, newest first",
  );
});
