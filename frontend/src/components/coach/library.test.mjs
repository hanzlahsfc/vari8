import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateVariantNutrients,
  cloneVariant,
  createInitialMealPlan,
} from "../ethereal/mealplan/model.ts";
import {
  applyPlanToClient,
  cleanPlanLibrary,
  detachPlan,
  draftNeedsReplace,
  instantiateFromLibrary,
  isPlanLibraryValue,
  saveToLibrary,
  stripClientName,
  templateNameFromPlan,
} from "./library.ts";
import { adoptLibraryDemo } from "./library-demo.ts";
import { isCoachState, seedState } from "./model.ts";
import { foodCatalog } from "./plans/domain.ts";
import { createAmaraTrainingPlan } from "./plans/training/amara-example.ts";

const AMARA = "client-007";
const EMMA = "client-001";

const training = () => createAmaraTrainingPlan(AMARA);
const nutrition = () => {
  const plan = createInitialMealPlan(
    AMARA,
    foodCatalog,
    new Date("2026-10-01T12:00:00Z"),
  );
  const low = cloneVariant(plan.variants[0], "Low");
  plan.variants.push(low);
  plan.schedule = {
    mode: "weekly",
    days: { 1: plan.variants[0].id, 2: low.id, 3: plan.variants[0].id },
  };
  plan.activeVariantId = low.id;
  return plan;
};
const supplements = () => ({
  id: "supp-plan",
  clientId: AMARA,
  name: "Daily stack",
  savedAt: "2026-10-01T08:00:00Z",
  items: [
    {
      id: "supp-item-1",
      product: {
        id: "product-1",
        brand: "Example",
        name: "Creatine",
        referenceQuantity: 1,
        quantityUnit: "scoop",
        declaredAmount: 5,
        declaredUnit: "g",
        url: null,
      },
      quantity: 1,
      doseUnit: "scoop",
      timing: "Morning",
      status: "must-have",
      notes: "",
    },
  ],
});

const allSessionIds = (plan) =>
  Object.values(plan.overrides ?? {}).flatMap((sessions) =>
    sessions.map((s) => s.id),
  );
const allExerciseIds = (plan) =>
  Object.values(plan.overrides ?? {}).flatMap((sessions) =>
    sessions.flatMap((session) => session.exercises.map((e) => e.id)),
  );
const allSetIds = (plan) =>
  Object.values(plan.overrides ?? {}).flatMap((sessions) =>
    sessions.flatMap((session) =>
      session.exercises.flatMap((exercise) => exercise.sets.map((s) => s.id)),
    ),
  );

test("saveToLibrary stores detached content and keeps the source plan intact", () => {
  const state = seedState();
  const source = training();
  const snapshot = structuredClone(source);
  const next = saveToLibrary(state, "training", source, {
    name: "Lower body block",
    description: "Reusable block",
    updatedAt: "2026-11-01",
  });
  const entry = next.library.training.at(-1);
  assert.equal(entry.name, "Lower body block");
  assert.equal(entry.description, "Reusable block");
  assert.equal(entry.updatedAt, "2026-11-01");
  assert.equal(entry.sourceClientId, AMARA);
  assert.equal(entry.content.clientId, "");
  assert.equal(entry.content.startDate, "");
  assert.equal(entry.content.name, "");
  assert.equal(entry.content.adjustments, undefined);
  assert.deepEqual(source, snapshot);
  assert.equal(source.clientId, AMARA);
});

test("saveToLibrary replaces an existing entry in place", () => {
  const base = seedState();
  const state = {
    ...base,
    library: { training: [], nutrition: [], supplements: [] },
  };
  const first = saveToLibrary(state, "nutrition", nutrition(), {
    name: "Prep",
    description: "First",
    updatedAt: "2026-11-01",
  });
  const id = first.library.nutrition[0].id;
  const second = saveToLibrary(first, "nutrition", nutrition(), {
    name: "Prep v2",
    description: "Second",
    replaceId: id,
    updatedAt: "2026-11-02",
  });
  assert.equal(second.library.nutrition.length, 1);
  assert.equal(second.library.nutrition[0].id, id);
  assert.equal(second.library.nutrition[0].name, "Prep v2");
  assert.equal(second.library.nutrition[0].content.name, "");
});

test("training instantiation regenerates every id and remaps the rotation", () => {
  const state = seedState();
  const source = training();
  const saved = saveToLibrary(state, "training", source, {
    name: "Hypertrophy",
    description: "",
    updatedAt: "2026-11-01",
  });
  const entry = saved.library.training.at(-1);
  const before = structuredClone(entry);
  const draft = instantiateFromLibrary(entry, EMMA, "2026-11-03");
  assert.equal(draft.clientId, EMMA);
  assert.equal(draft.startDate, "2026-11-03");
  assert.equal(draft.name, "Hypertrophy");
  const oldSessions = new Set(allSessionIds(source));
  const newSessions = allSessionIds(draft);
  assert.equal(newSessions.length, oldSessions.size);
  assert.ok(newSessions.every((id) => !oldSessions.has(id)));
  assert.ok(new Set(newSessions).size === newSessions.length);
  const newExercises = allExerciseIds(draft);
  const oldExercises = new Set(allExerciseIds(source));
  assert.ok(newExercises.every((id) => !oldExercises.has(id)));
  const newSets = allSetIds(draft);
  const oldSets = new Set(allSetIds(source));
  assert.ok(newSets.every((id) => !oldSets.has(id)));
  const rotationIds = new Set([
    ...Object.values(draft.rotation.weekdays).flat(),
  ]);
  for (const id of rotationIds) assert.ok(newSessions.includes(id));
  assert.deepEqual(Object.keys(draft.overrides), Object.keys(source.overrides));
  assert.deepEqual(entry, before);
  const second = instantiateFromLibrary(entry, EMMA, "2026-11-03");
  assert.notEqual(second.overrides["1"][0].id, draft.overrides["1"][0].id);
});

test("nutrition instantiation remaps variants, meals and the weekly schedule", () => {
  const state = seedState();
  const source = nutrition();
  const saved = saveToLibrary(state, "nutrition", source, {
    name: "Prep",
    description: "",
    updatedAt: "2026-11-01",
  });
  const entry = saved.library.nutrition.at(-1);
  assert.equal(entry.content.archivedPlans.length, 0);
  assert.equal(entry.content.reusableMeals.length, 0);
  const draft = instantiateFromLibrary(entry, EMMA, "2026-11-03");
  const sourceVariants = new Set(source.variants.map((variant) => variant.id));
  const draftVariants = draft.variants.map((variant) => variant.id);
  assert.ok(draftVariants.every((id) => !sourceVariants.has(id)));
  assert.equal(draft.schedule.mode, "weekly");
  for (const id of Object.values(draft.schedule.days))
    assert.ok(draftVariants.includes(id));
  assert.ok(draftVariants.includes(draft.activeVariantId));
  const sourceMeals = new Set(
    source.variants.flatMap((variant) => variant.meals.map((meal) => meal.id)),
  );
  for (const meal of draft.variants.flatMap((variant) => variant.meals))
    assert.ok(!sourceMeals.has(meal.id));
  assert.equal(draft.clientId, EMMA);
  assert.equal(draft.name, "Prep");
});

test("nutrition cycle schedule follows regenerated variants", () => {
  const state = seedState();
  const source = nutrition();
  source.schedule = {
    mode: "cycle",
    anchorDate: "2026-11-03",
    steps: [
      { variantId: source.variants[0].id, days: 3 },
      { variantId: source.variants[1].id, days: 2 },
    ],
  };
  const saved = saveToLibrary(state, "nutrition", source, {
    name: "Cycle",
    description: "",
  });
  const draft = instantiateFromLibrary(
    saved.library.nutrition.at(-1),
    EMMA,
    "2026-11-03",
  );
  const ids = new Set(draft.variants.map((variant) => variant.id));
  assert.ok(draft.schedule.steps.every((step) => ids.has(step.variantId)));
});

test("supplement instantiation regenerates plan and item ids but keeps products", () => {
  const state = seedState();
  const source = supplements();
  const saved = saveToLibrary(state, "supplements", source, {
    name: "Essentials",
    description: "",
  });
  const entry = saved.library.supplements.at(-1);
  assert.equal(entry.content.clientId, "");
  const draft = instantiateFromLibrary(entry, EMMA, "2026-11-03");
  assert.equal(draft.clientId, EMMA);
  assert.equal(draft.name, "Essentials");
  assert.notEqual(draft.id, source.id);
  assert.notEqual(draft.items[0].id, source.items[0].id);
  assert.equal(draft.items[0].product.id, source.items[0].product.id);
});

test("library validation drops malformed entries and never throws", () => {
  const state = seedState();
  const saved = saveToLibrary(state, "training", training(), {
    name: "Good",
    description: "",
  });
  const entry = saved.library.training.at(-1);
  const cleaned = cleanPlanLibrary({
    training: [entry, { id: "bad" }, null, { ...entry, content: { id: "x" } }],
    nutrition: "nope",
    supplements: [
      {
        id: "bad-supp",
        name: "x",
        description: "",
        updatedAt: "2026",
        content: { id: "x" },
      },
    ],
  });
  assert.equal(cleaned.training.length, 1);
  assert.equal(cleaned.nutrition.length, 0);
  assert.equal(cleaned.supplements.length, 0);
  assert.equal(cleanPlanLibrary(null).training.length, 0);
  assert.equal(cleanPlanLibrary(undefined), undefined);
  assert.equal(isPlanLibraryValue(cleaned), true);
});

test("library state survives a complete JSON round trip", () => {
  const state = seedState();
  const withTraining = saveToLibrary(state, "training", training(), {
    name: "Round trip",
    description: "detached",
  });
  const withNutrition = saveToLibrary(withTraining, "nutrition", nutrition(), {
    name: "Meals",
    description: "",
  });
  assert.equal(isCoachState(withNutrition), true);
  const round = JSON.parse(JSON.stringify(withNutrition));
  assert.equal(isCoachState(round), true);
  assert.equal(round.library.training[0].content.clientId, "");
  assert.equal(round.library.nutrition[0].content.clientId, "");
});

test("seed library derives one detached template per kind with neutral copy", () => {
  const state = seedState();
  assert.equal(isCoachState(state), true);
  assert.equal(state.library.training.length, 1);
  assert.equal(state.library.nutrition.length, 1);
  assert.equal(state.library.supplements.length, 1);
  assert.equal(state.library.training[0].name, "Lower body block");
  assert.equal(state.library.nutrition[0].name, "Carb cycle · High/Medium/Low");
  assert.equal(state.library.supplements[0].name, "Contest prep stack");
  for (const kind of ["training", "nutrition", "supplements"]) {
    const entry = state.library[kind][0];
    assert.equal(entry.sourceClientId, AMARA);
    assert.equal(entry.content.clientId, "");
    assert.equal(entry.content.name, "");
    assert.doesNotMatch(
      `${entry.name} ${entry.description} ${JSON.stringify(entry.content)}`,
      /Amara/,
    );
  }
  assert.equal(state.library.training[0].content.adjustments, undefined);
  assert.equal(adoptLibraryDemo(state), state);
});

test("revision 2 renames seed-owned templates and keeps coach templates", () => {
  const state = seedState();
  const seeded = {
    ...state,
    demoSeeds: { ...state.demoSeeds, libraryDemo: 1 },
    library: {
      training: state.library.training.map((entry) => ({
        ...entry,
        name: "Hypertrophy - lower body priority",
        description: "Amara's four-day lower-body-led block.",
      })),
      nutrition: state.library.nutrition,
      supplements: state.library.supplements,
    },
  };
  const coachEntry = {
    ...state.library.training[0],
    id: "library-training-coach",
    name: "Amara block kept by the coach",
  };
  const next = adoptLibraryDemo({
    ...seeded,
    library: {
      ...seeded.library,
      training: [...seeded.library.training, coachEntry],
    },
  });
  const seededEntry = next.library.training.find(
    (entry) => entry.id === "library-demo-training",
  );
  assert.equal(seededEntry.name, "Lower body block");
  assert.equal(seededEntry.description, "Hypertrophy · 4 sessions");
  const kept = next.library.training.find(
    (entry) => entry.id === "library-training-coach",
  );
  assert.equal(kept.name, "Amara block kept by the coach");
  assert.equal(next.demoSeeds.libraryDemo, 3);
});

test("revision 3 refreshes seed-owned content from the active plan", () => {
  const state = seedState();
  const broken = {
    ...state.library.nutrition[0],
    content: {
      ...state.library.nutrition[0].content,
      variants: [state.library.nutrition[0].content.variants[0]],
      schedule: { mode: "flexible" },
    },
  };
  const next = adoptLibraryDemo({
    ...state,
    demoSeeds: { ...state.demoSeeds, libraryDemo: 2 },
    library: { ...state.library, nutrition: [broken] },
  });
  const entry = next.library.nutrition.find(
    (item) => item.id === "library-demo-nutrition",
  );
  assert.deepEqual(
    entry.content.variants.map((variant) => variant.label),
    ["High", "Medium", "Low"],
  );
  assert.equal(entry.content.schedule.mode, "weekly");
});

test("seeded nutrition entry is the High/Medium/Low carb cycle", () => {
  const state = seedState();
  const entry = state.library.nutrition.find(
    (item) => item.id === "library-demo-nutrition",
  );
  assert.ok(entry);
  const plan = entry.content;
  assert.deepEqual(
    plan.variants.map((variant) => variant.label),
    ["High", "Medium", "Low"],
  );
  assert.equal(plan.schedule.mode, "weekly");
  const byLabel = Object.fromEntries(
    plan.variants.map((variant) => [variant.id, variant.label]),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(plan.schedule.days).map(([day, id]) => [day, byLabel[id]]),
    ),
    {
      1: "High",
      2: "Medium",
      3: "Low",
      4: "High",
      5: "Low",
      6: "Medium",
      7: "Low",
    },
  );
  const foods = new Map(foodCatalog.map((food) => [food.id, food]));
  for (const variant of plan.variants) {
    const total = calculateVariantNutrients(variant, foods);
    assert.ok(
      total.calories > 1500,
      `${variant.label} day is implausibly small (${Math.round(total.calories)} kcal)`,
    );
    assert.ok(variant.meals.length >= 4);
  }
  for (const variant of plan.variants)
    assert.doesNotMatch(
      `${variant.label} ${variant.meals.map((meal) => meal.name).join(" ")}`,
      /Amara/,
    );
});

test("suggested template names drop the client's first and full name", () => {
  assert.equal(
    templateNameFromPlan("Amara · prep nutrition", "Amara Lewis", "fallback"),
    "prep nutrition",
  );
  assert.equal(
    templateNameFromPlan("Amara Lewis — prep", "Amara Lewis", "fallback"),
    "prep",
  );
  assert.equal(
    templateNameFromPlan("Amara", "Amara Lewis", "fallback"),
    "fallback",
  );
  assert.equal(
    templateNameFromPlan("Prep block", undefined, "fallback"),
    "Prep block",
  );
  assert.equal(
    stripClientName("Amara · Lower · Amara", "Amara Lewis"),
    "Lower",
  );
});

test("seed library fills only missing kinds and respects deletions", () => {
  const state = seedState();
  const partial = {
    ...state,
    demoSeeds: { ...state.demoSeeds, libraryDemo: undefined },
    library: {
      training: state.library.training,
      nutrition: [],
      supplements: state.library.supplements,
    },
  };
  const filled = adoptLibraryDemo(partial);
  assert.equal(filled.library.training.length, 1);
  assert.equal(filled.library.nutrition.length, 1);
  assert.equal(filled.library.supplements.length, 1);
  const cleared = {
    ...state,
    library: { training: [], nutrition: [], supplements: [] },
  };
  assert.equal(adoptLibraryDemo(cleared).library.training.length, 0);
});

test("draft replacement detection and plan application leave other clients alone", () => {
  const state = seedState();
  const amaraBefore = structuredClone(
    state.clients.find((client) => client.id === AMARA).plans,
  );
  const entry = state.library.training.at(-1);
  const draft = instantiateFromLibrary(entry, EMMA, "2026-11-03");
  assert.equal(draftNeedsReplace(state, EMMA, "training"), false);
  const next = applyPlanToClient(state, EMMA, "training", draft);
  assert.equal(draftNeedsReplace(next, EMMA, "training"), true);
  const emma = next.clients.find((client) => client.id === EMMA);
  assert.equal(emma.plans.training.draft.clientId, EMMA);
  assert.equal(emma.plans.training.draft.name, entry.name);
  const amara = next.clients.find((client) => client.id === AMARA);
  assert.deepEqual(amara.plans, amaraBefore);
  assert.equal(amara.plans.training.draft.clientId, AMARA);
});

test("detachPlan drops archives, saved meals and adjustments", () => {
  const meal = nutrition();
  meal.archivedPlans.push({
    id: "archive",
    planId: meal.id,
    name: "Old",
    startDate: "2026-09-01",
    archivedAt: "2026-10-01T00:00:00Z",
    variants: structuredClone(meal.variants),
    activeVariantId: meal.activeVariantId,
    schedule: structuredClone(meal.schedule),
  });
  meal.reusableMeals.push({
    id: "saved",
    name: "Meal",
    meal: structuredClone(meal.variants[0].meals[0]),
    savedAt: "2026-10-01T00:00:00Z",
  });
  const detached = detachPlan("nutrition", meal);
  assert.deepEqual(detached.archivedPlans, []);
  assert.deepEqual(detached.reusableMeals, []);
  const plan = training();
  plan.adjustments = [
    {
      id: "adjust",
      kind: "deload",
      fromWeek: 1,
      toWeek: 1,
      startDate: "2026-10-13",
      endDate: "2026-10-19",
      mode: "rules",
      rules: { setsDelta: -1 },
    },
  ];
  assert.equal(detachPlan("training", plan).adjustments, undefined);
});
