import assert from "node:assert/strict";
import test from "node:test";
import {
  activateLifecycle,
  applicablePlan,
  archiveLifecycle,
  emptyIifymPlan,
  emptyMealPlan,
  emptyTrainingPlan,
  isClientPlans,
  migrateCoachState,
  plansOwnedBy,
  scheduledOption,
  validateIndividualPlan,
} from "./domain.ts";
import { adoptAmaraTrainingExample } from "./training/amara-example.ts";
import { emptyClientPlans } from "./types.ts";

const plan = (startDate, name) => ({
  id: `training-${name}`,
  clientId: "client-a",
  name,
  startDate,
  program: "Evergreen",
  weeks: 8,
  overrides: { 1: [] },
});

test("activation snapshots content and keeps prior versions effective before a future start", () => {
  const first = plan("2026-01-01", "Base block");
  let life = activateLifecycle({ history: [] }, first, "2025-12-01T12:00:00Z");
  first.name = "mutated after activation";
  assert.equal(life.active.content.name, "Base block");

  const future = plan("2026-04-01", "Spring block");
  life = activateLifecycle(life, future, "2026-03-01T12:00:00Z");
  future.name = "mutated after second activation";
  assert.equal(life.active.content.name, "Spring block");
  assert.equal(life.history.length, 1);
  assert.equal(life.history[0].content.name, "Base block");
  assert.equal(applicablePlan(life, "2026-03-31").name, "Base block");
  assert.equal(applicablePlan(life, "2026-04-01").name, "Spring block");
  assert.equal(applicablePlan(life, "2025-12-31"), undefined);
  assert.equal(applicablePlan(life, "2026-02-30"), undefined);
});

test("saving a changed draft cannot mutate active or historical content", () => {
  const original = plan("2026-01-01", "Active");
  const active = activateLifecycle(
    { history: [] },
    original,
    "2025-12-01T00:00:00Z",
  );
  const nextDraft = structuredClone(active.active.content);
  nextDraft.name = "Unpublished edit";
  const saved = { ...active, draft: nextDraft };
  assert.equal(saved.draft.name, "Unpublished edit");
  assert.equal(saved.active.content.name, "Active");
  assert.equal(saved.history.length, 0);
  const activated = activateLifecycle(
    saved,
    saved.draft,
    "2026-01-02T00:00:00Z",
  );
  assert.equal(activated.history.length, 1);
  assert.equal(activated.history[0].content.name, "Active");
  assert.equal(activated.active.content.name, "Unpublished edit");
});

test("archiving sets a date cutoff without losing earlier applicable versions", () => {
  let life = activateLifecycle(
    { history: [] },
    plan("2026-01-01", "First"),
    "2025-12-01T00:00:00Z",
  );
  life = activateLifecycle(
    life,
    plan("2026-03-01", "Second"),
    "2026-02-01T00:00:00Z",
  );
  const archived = archiveLifecycle(life, "2026-04-01");
  assert.equal(archived.active, undefined);
  assert.equal(applicablePlan(archived, "2026-02-28").name, "First");
  assert.equal(applicablePlan(archived, "2026-03-01").name, "Second");
  assert.equal(applicablePlan(archived, "2026-03-31").name, "Second");
  assert.equal(applicablePlan(archived, "2026-04-01"), undefined);
  assert.equal(
    archived.history.every((version) => version.archivedOn === "2026-04-01"),
    true,
  );
});

test("state migration preserves legacy profile data and creates only empty individual lifecycles", () => {
  const old = {
    clients: [
      {
        id: "client-a",
        plan: { calories: 2300, protein: 150 },
        entries: [{ date: "2026-01-01", weight: 70 }],
        assignment: { templateId: "t", variantId: "v", snapshot: { id: "t" } },
      },
      {
        id: "client-b",
        plan: { calories: 1800, protein: 100 },
        entries: [{ date: "2026-01-02", weight: 60 }],
      },
    ],
    templates: [{ id: "canonical" }],
    submissions: [{ id: "submitted" }],
    messages: [{ id: "message" }],
  };
  const before = structuredClone(old);
  const migrated = migrateCoachState(old);
  assert.deepEqual(old, before);
  assert.deepEqual(migrated.clients[0].plan, old.clients[0].plan);
  assert.deepEqual(migrated.clients[0].entries, old.clients[0].entries);
  assert.deepEqual(migrated.clients[0].assignment, old.clients[0].assignment);
  assert.deepEqual(migrated.templates, old.templates);
  assert.deepEqual(migrated.submissions, old.submissions);
  assert.deepEqual(migrated.messages, old.messages);
  assert.equal(migrated.clients[0].plans.training.active, undefined);
  assert.equal(migrated.clients[0].plans.training.draft, undefined);
  assert.equal(migrated.clients[0].plans.training.history.length, 0);
  assert.notEqual(migrated.clients[0].plans, migrated.clients[1].plans);
  migrated.clients[0].plans.goals.push({
    id: "goal",
    fieldId: "weight",
    value: 65,
    unit: "kg",
    date: "2026-01-03",
  });
  assert.equal(migrated.clients[1].plans.goals.length, 0);
});

test("migration preserves temporary nutrition plans", () => {
  const temporary = {
    id: "temp-1",
    kind: "refeed",
    label: "Refeed",
    startDate: "2026-10-24",
    endDate: "2026-10-25",
    source: "mealPlan",
    plan: emptyMealPlan("client-a", "2026-10-01"),
    createdAt: "2026-10-22T08:00:00Z",
  };
  const old = {
    clients: [
      {
        id: "client-a",
        plans: {
          ...emptyClientPlans(),
          nutrition: {
            mealPlan: { history: [] },
            iifym: { history: [] },
            temporary: [temporary],
          },
        },
      },
    ],
  };
  const migrated = migrateCoachState(old);
  assert.deepEqual(migrated.clients[0].plans.nutrition.temporary, [temporary]);
});

test("nested structural validation rejects malformed prescriptions while accepting valid empty drafts", () => {
  const meal = emptyMealPlan("client-a", "2026-01-01");
  const targets = emptyIifymPlan("client-a", "2026-01-01");
  const training = emptyTrainingPlan("client-a", "2026-01-01");
  const valid = {
    ...emptyClientPlans(),
    nutrition: {
      mealPlan: { draft: meal, history: [] },
      iifym: { draft: targets, history: [] },
    },
    training: { draft: training, history: [] },
  };
  assert.equal(isClientPlans(valid), true);
  const malformed = structuredClone(valid);
  malformed.training.draft.overrides["1"] = [
    {
      id: "s",
      name: "A",
      exercises: [
        {
          id: "e",
          name: "Squat",
          instructions: "",
          progression: "",
          sets: [
            {
              id: "set",
              reps: 5,
              tempo: 4,
              type: "Working",
              rest: "",
              instructions: "",
            },
          ],
        },
      ],
    },
  ];
  assert.equal(isClientPlans(malformed), false);
});

test("activation validates week bounds and resolves all authored week overrides", () => {
  const valid = emptyTrainingPlan("client-a", "2026-01-01");
  valid.program = "Week-based";
  valid.weeks = 52;
  valid.overrides["1"] = [
    {
      id: "session",
      name: "A",
      exercises: [
        {
          id: "e",
          name: "Squat",
          instructions: "",
          progression: "",
          sets: [
            {
              id: "set",
              reps: 5,
              tempo: "",
              type: "Working",
              rest: "",
              instructions: "",
            },
          ],
        },
      ],
    },
  ];
  assert.deepEqual(validateIndividualPlan("training", valid), []);
  const tooLong = { ...valid, weeks: 53 };
  assert.ok(
    validateIndividualPlan("training", tooLong).some((error) =>
      /1–52/.test(error),
    ),
  );
  const badRange = structuredClone(valid);
  badRange.overrides["1"][0].exercises[0].sets[0].repsMax = 4;
  assert.ok(
    validateIndividualPlan("training", badRange).some((error) =>
      /rep ranges/.test(error),
    ),
  );
});

test("a flexible schedule prescribes no option; new plans default to it", () => {
  const optionIds = ["day", "rest"];
  assert.equal(
    scheduledOption({ mode: "flexible" }, optionIds, "2026-03-29"),
    undefined,
  );
  // New meal + IIFYM plans start with no prescribed option (client chooses).
  assert.equal(
    emptyMealPlan("client-a", "2026-03-29").schedule.mode,
    "flexible",
  );
  assert.equal(
    emptyIifymPlan("client-a", "2026-03-29").schedule.mode,
    "flexible",
  );
  // Weekly + manual schedules still resolve their option.
  const weekly = {
    mode: "weekly",
    days: {
      1: "day",
      2: "day",
      3: "day",
      4: "day",
      5: "day",
      6: "rest",
      7: "rest",
    },
  };
  assert.equal(scheduledOption(weekly, optionIds, "2026-03-30"), "day"); // Monday
  assert.equal(scheduledOption(weekly, optionIds, "2026-03-29"), "rest"); // Sunday
  assert.equal(
    scheduledOption(
      { mode: "manual", selectedVariantId: "rest" },
      optionIds,
      "2026-03-29",
    ),
    "rest",
  );
});

test("unknown schedule references are rejected and cycle scheduling survives DST boundaries", () => {
  const optionIds = ["day", "rest"];
  assert.equal(
    scheduledOption(
      { mode: "manual", selectedVariantId: "missing" },
      optionIds,
      "2026-03-29",
    ),
    undefined,
  );
  const invalidWeekly = {
    ...emptyIifymPlan("client-a", "2026-03-01"),
    schedule: {
      mode: "weekly",
      days: {
        1: "missing",
        2: "day",
        3: "day",
        4: "day",
        5: "day",
        6: "day",
        7: "day",
      },
    },
  };
  assert.ok(
    validateIndividualPlan("iifym", invalidWeekly).some((error) =>
      /existing variants/.test(error),
    ),
  );
  const cycle = {
    mode: "cycle",
    anchorDate: "2026-03-28",
    steps: [
      { variantId: "day", days: 1 },
      { variantId: "rest", days: 1 },
    ],
  };
  assert.equal(scheduledOption(cycle, optionIds, "2026-03-28"), "day");
  assert.equal(scheduledOption(cycle, optionIds, "2026-03-29"), "rest");
  assert.equal(scheduledOption(cycle, optionIds, "2026-03-30"), "day");
  const invalidCycle = {
    ...emptyIifymPlan("client-a", "2026-03-28"),
    schedule: { ...cycle, steps: [{ variantId: "missing", days: 1 }] },
  };
  assert.ok(
    validateIndividualPlan("iifym", invalidCycle).some((error) =>
      /existing variants/.test(error),
    ),
  );
});

test("nutrition activation requires authored positive targets and valid plans retain client ownership", () => {
  const plan = emptyIifymPlan("client-a", "2026-01-01");
  assert.ok(
    validateIndividualPlan("iifym", plan).some((error) =>
      /positive targets/.test(error),
    ),
  );
  plan.options[0].targets.calories.value = 2100;
  assert.deepEqual(validateIndividualPlan("iifym", plan), []);
  const otherClient = { ...plan, clientId: "client-b" };
  assert.equal(otherClient.clientId === plan.clientId, false);
});

test("weekly day roles survive storage and activation without changing date assignments", () => {
  const content = emptyMealPlan("client-a", "2026-10-17");
  const restVariant = structuredClone(content.variants[0]);
  restVariant.id = "variant-rest";
  restVariant.label = "Rest day";
  content.variants.push(restVariant);
  const [training, rest] = content.variants.map((variant) => variant.id);
  content.schedule = {
    mode: "weekly",
    days: {
      1: training,
      2: rest,
      3: training,
      4: rest,
      5: training,
      6: rest,
      7: rest,
    },
    roles: { training, rest },
  };
  const stored = JSON.parse(
    JSON.stringify({
      ...emptyClientPlans(),
      nutrition: {
        mealPlan: { draft: content, history: [] },
        iifym: { history: [] },
      },
    }),
  );
  assert.equal(isClientPlans(stored), true);
  assert.deepEqual(stored.nutrition.mealPlan.draft.schedule.roles, {
    training,
    rest,
  });
  assert.equal(
    scheduledOption(content.schedule, [training, rest], "2026-10-19"),
    training,
  );
  assert.equal(
    scheduledOption(content.schedule, [training, rest], "2026-10-20"),
    rest,
  );
  const activated = activateLifecycle(
    { history: [] },
    content,
    "2026-10-17T12:00:00Z",
  );
  content.schedule.roles.training = "edited-after-activation";
  assert.deepEqual(activated.active.content.schedule.roles, { training, rest });
});

test("legacy plans migrate to empty activity targets and malformed records are rejected", () => {
  const migrated = migrateCoachState({
    clients: [
      {
        id: "client-a",
        plans: {
          goals: [
            {
              id: "g",
              fieldId: "weight",
              value: 65,
              unit: "kg",
              date: "2026-10-01",
            },
          ],
        },
      },
      { id: "client-b" },
    ],
  });
  assert.deepEqual(migrated.clients[0].plans.activityTargets, []);
  assert.deepEqual(migrated.clients[0].plans.goals, [
    { id: "g", fieldId: "weight", value: 65, unit: "kg", date: "2026-10-01" },
  ]);
  assert.equal(isClientPlans(migrated.clients[0].plans), true);
  assert.equal(isClientPlans(migrated.clients[1].plans), true);
  assert.notEqual(
    migrated.clients[0].plans.activityTargets,
    migrated.clients[1].plans.activityTargets,
  );
  const version = {
    id: "cardio-1",
    effectiveFrom: "2026-10-21",
    metric: "cardio",
    target: { sessionsPerWeek: 5, minutesPerSession: 20 },
  };
  const plans = { ...emptyClientPlans(), activityTargets: [version] };
  assert.equal(isClientPlans(plans), true);
  assert.equal(isClientPlans(JSON.parse(JSON.stringify(plans))), true);
  for (const bad of [
    null,
    "x",
    [{}],
    [{ ...version, metric: "sleep" }],
    [{ ...version, effectiveFrom: "2026-13-40" }],
    [{ ...version, target: { sessionsPerWeek: 5.5, minutesPerSession: 20 } }],
    [{ id: "x", effectiveFrom: "2026-10-21", metric: "steps" }],
  ]) {
    const malformed = { ...emptyClientPlans(), activityTargets: bad };
    assert.equal(isClientPlans(malformed), false, JSON.stringify(bad));
    const stored = migrateCoachState({
      clients: [
        {
          id: "client-a",
          plans: { ...emptyClientPlans(), activityTargets: bad },
        },
      ],
    });
    assert.equal(
      isClientPlans(stored.clients[0].plans),
      false,
      JSON.stringify(bad),
    );
  }
});

test("Amara training example adoption preserves recorded activity targets", () => {
  const version = {
    id: "steps-1",
    effectiveFrom: "2026-10-21",
    metric: "steps",
    target: { kind: "minimum", value: 8000 },
  };
  const state = {
    clients: [
      {
        id: "client-007",
        name: "Amara Lewis",
        plans: { ...emptyClientPlans(), activityTargets: [version] },
      },
    ],
  };
  const adopted = adoptAmaraTrainingExample(state);
  assert.ok(adopted.clients[0].plans.training.draft);
  assert.deepEqual(adopted.clients[0].plans.activityTargets, [version]);
  assert.equal(isClientPlans(adopted.clients[0].plans), true);
});

test("saved supplement plans validate, migrate and stay bound to their client", () => {
  const product = {
    id: "supplement-007",
    brand: "ESN",
    name: "Magnesium Complex",
    referenceQuantity: 3,
    quantityUnit: null,
    declaredAmount: 323,
    declaredUnit: "mg",
    url: "https://www.esn.com/products/magnesium-complex",
  };
  const item = {
    id: "i1",
    product,
    quantity: 3,
    doseUnit: "capsules",
    timing: "with breakfast",
    status: "must-have",
    notes: "",
  };
  const good = {
    id: "sp-1",
    clientId: "client-001",
    name: "Supplement plan",
    items: [item],
    savedAt: "2026-10-21T10:00:00.000Z",
  };
  const plans = { ...emptyClientPlans(), supplements: good };
  assert.equal(isClientPlans(plans), true);
  assert.equal(isClientPlans(JSON.parse(JSON.stringify(plans))), true);
  assert.equal(plansOwnedBy(plans, "client-001"), true);
  assert.equal(plansOwnedBy(plans, "client-002"), false);
  const empty = { ...emptyClientPlans(), supplements: { ...good, items: [] } };
  assert.equal(isClientPlans(empty), true);
  for (const bad of [
    null,
    {},
    { ...good, clientId: "" },
    { ...good, items: [{ ...item, quantity: 0 }] },
    { ...good, items: [{ ...item, status: "taken" }] },
  ]) {
    const malformed = { ...emptyClientPlans(), supplements: bad };
    assert.equal(isClientPlans(malformed), false, JSON.stringify(bad));
  }
  // migration defaults missing supplements to absent and preserves present ones
  const migrated = migrateCoachState({
    clients: [
      { id: "client-a", plans: { ...emptyClientPlans() } },
      { id: "client-b", plans },
    ],
  });
  assert.equal(migrated.clients[0].plans.supplements, undefined);
  assert.deepEqual(migrated.clients[1].plans.supplements, good);
});

test("Amara training example adoption preserves a saved supplement plan", () => {
  const supplements = {
    id: "sp-1",
    clientId: "client-007",
    name: "Supplement plan",
    items: [],
    savedAt: "2026-10-21T10:00:00.000Z",
  };
  const state = {
    clients: [
      {
        id: "client-007",
        name: "Amara Lewis",
        plans: { ...emptyClientPlans(), supplements },
      },
    ],
  };
  const adopted = adoptAmaraTrainingExample(state);
  assert.deepEqual(adopted.clients[0].plans.supplements, supplements);
  assert.equal(isClientPlans(adopted.clients[0].plans), true);
});
