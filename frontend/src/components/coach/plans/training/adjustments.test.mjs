import assert from "node:assert/strict";
import test from "node:test";
import { isCoachState, seedState } from "../../model.ts";
import { migrateCoachState } from "../domain.ts";
import {
  adjustmentForWeek,
  applyAdjustmentRules,
  resolveTrainingWeek,
  setTrainingWeek,
  snapRangeToPlanWeeks,
  validateAdjustment,
} from "../types.ts";
import {
  removeTrainingAdjustment,
  saveTrainingAdjustment,
} from "./adjustments.ts";
import { createAmaraTrainingPlan } from "./amara-example.ts";
import { prescribedTrainingVolume } from "./training-model.ts";

const set = (id, patch = {}) => ({
  id,
  reps: 8,
  tempo: "",
  type: "Working",
  rest: "",
  instructions: "",
  ...patch,
});
const exercise = (id, sets) => ({
  id,
  name: id,
  instructions: "",
  progression: "",
  sets,
});
const session = (id, exercises) => ({ id, name: id, exercises });
const baseSessions = () => [
  session("s1", [
    exercise("three", [set("a"), set("b"), set("c")]),
    exercise("one", [set("d")]),
    exercise("two", [set("e"), set("f")]),
    exercise("warm", [
      set("w", { type: "Warm-up" }),
      set("x"),
      set("y"),
      set("z"),
    ]),
  ]),
];
const plan = (patch = {}) => ({
  id: "p",
  clientId: "c",
  name: "Plan",
  startDate: "2026-10-12",
  program: "Week-based",
  weeks: 8,
  overrides: { 1: baseSessions() },
  ...patch,
});

test("applyAdjustmentRules removes working sets from the end and never below one", () => {
  const adjusted = applyAdjustmentRules(baseSessions(), { setsDelta: -1 });
  const [three, one, two, warm] = adjusted[0].exercises;
  assert.equal(three.sets.length, 2);
  assert.deepEqual(
    three.sets.map((entry) => entry.id),
    ["a", "b"],
    "the final working set is removed",
  );
  assert.equal(one.sets.length, 1, "a single-set exercise is untouched");
  assert.equal(two.sets.length, 1, "two sets with delta -2 stop at one");
  assert.equal(
    warm.sets.length,
    3,
    "one working set is removed but the warm-up set stays",
  );
  assert.equal(warm.sets[0].type, "Warm-up");
  assert.deepEqual(
    warm.sets.map((entry) => entry.id),
    ["w", "x", "y"],
  );

  const zero = applyAdjustmentRules(baseSessions(), { setsDelta: 0 });
  assert.equal(zero[0].exercises[0].sets.length, 3, "delta 0 removes nothing");
});

test("applyAdjustmentRules clamps RIR and RPE after applying deltas", () => {
  const sessions = [
    session("s", [
      exercise("e", [
        set("a", { rir: 9, rpe: 1 }),
        set("b", { rir: 2, rpe: 6 }),
      ]),
    ]),
  ];
  const rir = applyAdjustmentRules(
    sessions,
    { setsDelta: 0, rirDelta: 2 },
    "rir",
  );
  assert.equal(rir[0].exercises[0].sets[0].rir, 10);
  assert.equal(rir[0].exercises[0].sets[1].rir, 4);

  const rpe = applyAdjustmentRules(
    sessions,
    { setsDelta: 0, rpeDelta: 2 },
    "rpe",
  );
  assert.equal(rpe[0].exercises[0].sets[0].rpe, 1);
  assert.equal(rpe[0].exercises[0].sets[1].rpe, 4);
});

test("applyAdjustmentRules ignores intensity deltas the plan does not track", () => {
  const sessions = [
    session("s", [exercise("e", [set("a", { rir: 2, rpe: 6 })])]),
  ];
  const off = applyAdjustmentRules(
    sessions,
    { setsDelta: 0, rirDelta: 2, rpeDelta: 2 },
    "off",
  );
  assert.deepEqual(off, sessions);

  const onlyRir = applyAdjustmentRules(
    sessions,
    { setsDelta: 0, rirDelta: 2, rpeDelta: 2 },
    "rir",
  );
  assert.equal(onlyRir[0].exercises[0].sets[0].rir, 4);
  assert.equal(onlyRir[0].exercises[0].sets[0].rpe, 6);
});

test("resolveTrainingWeek applies none, rules and manual adjustments", () => {
  const none = plan({
    adjustments: [
      {
        id: "a",
        kind: "deload",
        fromWeek: 2,
        toWeek: 3,
        startDate: "2026-10-19",
        endDate: "2026-11-01",
        mode: "none",
      },
    ],
  });
  assert.deepEqual(resolveTrainingWeek(none, 2), []);
  assert.equal(resolveTrainingWeek(none, 4)[0].exercises[0].sets.length, 3);
  assert.ok(adjustmentForWeek(none, 3));
  assert.equal(adjustmentForWeek(none, 4), undefined);

  const rules = plan({
    adjustments: [
      {
        id: "a",
        kind: "deload",
        fromWeek: 2,
        toWeek: 2,
        startDate: "2026-10-19",
        endDate: "2026-10-25",
        mode: "rules",
        rules: { setsDelta: -1 },
      },
    ],
  });
  assert.equal(resolveTrainingWeek(rules, 2)[0].exercises[0].sets.length, 2);
  assert.equal(resolveTrainingWeek(rules, 3)[0].exercises[0].sets.length, 3);

  const manualSessions = [session("manual", [])];
  const manual = plan({
    adjustments: [
      {
        id: "a",
        kind: "intro",
        fromWeek: 2,
        toWeek: 3,
        startDate: "2026-10-19",
        endDate: "2026-11-01",
        mode: "manual",
        manual: { 2: manualSessions },
      },
    ],
  });
  assert.equal(resolveTrainingWeek(manual, 2)[0].id, "manual");
  assert.equal(resolveTrainingWeek(manual, 3)[0].id, "s1");
  assert.equal(resolveTrainingWeek(manual, 1)[0].id, "s1");
});

test("setTrainingWeek writes into a manual adjustment instead of overrides", () => {
  const original = plan({
    adjustments: [
      {
        id: "a",
        kind: "deload",
        fromWeek: 2,
        toWeek: 3,
        startDate: "2026-10-19",
        endDate: "2026-11-01",
        mode: "manual",
        manual: {},
      },
    ],
  });
  const next = setTrainingWeek(original, 2, [session("edited", [])]);
  assert.equal(next.adjustments[0].manual["2"][0].id, "edited");
  assert.deepEqual(next.overrides, original.overrides);
  assert.equal(next.adjustments[0].manual["3"], undefined);

  const outside = setTrainingWeek(original, 4, [session("outside", [])]);
  assert.equal(outside.overrides["4"][0].id, "outside");
  assert.deepEqual(outside.adjustments, original.adjustments);
});

test("snapRangeToPlanWeeks covers whole Mon–Sun plan weeks", () => {
  const snapped = snapRangeToPlanWeeks(plan(), "2026-10-14", "2026-10-20");
  assert.deepEqual(snapped, {
    startDate: "2026-10-12",
    endDate: "2026-10-25",
    fromWeek: 1,
    toWeek: 2,
  });
  const amara = createAmaraTrainingPlan("c1");
  const firstWeek = snapRangeToPlanWeeks(amara, "2026-10-13", "2026-10-18");
  assert.equal(firstWeek.startDate, "2026-10-12");
  assert.equal(firstWeek.endDate, "2026-10-18");
  assert.equal(firstWeek.fromWeek, 1);
  assert.equal(firstWeek.toWeek, 1);
});

test("validateAdjustment rejects overlaps and ranges outside the plan", () => {
  const existing = plan({
    adjustments: [
      {
        id: "a",
        kind: "deload",
        fromWeek: 2,
        toWeek: 3,
        startDate: "2026-10-19",
        endDate: "2026-11-01",
        mode: "rules",
        rules: { setsDelta: -1 },
      },
    ],
  });
  const candidate = (patch = {}) => ({
    id: "b",
    kind: "intro",
    fromWeek: 3,
    toWeek: 4,
    startDate: "2026-10-26",
    endDate: "2026-11-08",
    ...patch,
  });
  assert.match(validateAdjustment(existing, candidate()), /overlaps/i);
  assert.equal(
    validateAdjustment(
      existing,
      candidate({
        fromWeek: 4,
        toWeek: 5,
        startDate: "2026-11-02",
        endDate: "2026-11-15",
      }),
    ),
    null,
  );
  assert.match(
    validateAdjustment(
      existing,
      candidate({
        fromWeek: 1,
        toWeek: 1,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      }),
    ),
    /plan start/i,
  );
  assert.match(
    validateAdjustment(existing, candidate({ fromWeek: 4, toWeek: 3 })),
    /one or more plan weeks/i,
  );
});

test("save and remove adjustment update plan and event atomically", () => {
  const trainingPlan = plan();
  const makeState = () => ({
    clients: [
      {
        id: "c",
        timelineEvents: [],
        plans: {
          nutrition: { marker: true },
          training: {
            draft: structuredClone(trainingPlan),
            active: {
              id: "v1",
              activatedAt: "2026-10-01T00:00:00Z",
              content: structuredClone(trainingPlan),
            },
            history: [],
          },
        },
      },
    ],
  });
  const before = makeState();
  const candidate = {
    id: "adjustment-1",
    kind: "deload",
    fromWeek: 2,
    toWeek: 2,
    startDate: "2026-10-19",
    endDate: "2026-10-25",
    mode: "rules",
    rules: { setsDelta: -1, rirDelta: 2 },
    note: "Recovery week",
  };
  const saved = saveTrainingAdjustment(before, "c", candidate);
  const savedClient = saved.clients[0];
  assert.equal(savedClient.plans.training.active.id, "v1");
  assert.equal(
    savedClient.plans.training.active.activatedAt,
    "2026-10-01T00:00:00Z",
  );
  assert.equal(savedClient.plans.training.active.content.adjustments.length, 1);
  assert.equal(savedClient.plans.training.draft.adjustments.length, 1);
  assert.equal(savedClient.timelineEvents.length, 1);
  assert.equal(savedClient.timelineEvents[0].kind, "deload");
  assert.equal(savedClient.timelineEvents[0].adjustmentId, "adjustment-1");
  assert.deepEqual(
    savedClient.plans.nutrition,
    before.clients[0].plans.nutrition,
  );
  assert.equal(
    before.clients[0].plans.training.active.content.adjustments,
    undefined,
  );

  const updated = saveTrainingAdjustment(saved, "c", {
    ...candidate,
    kind: "intro",
    note: "Ease in",
  });
  assert.equal(updated.clients[0].timelineEvents.length, 1);
  assert.equal(updated.clients[0].timelineEvents[0].kind, "intro");
  assert.equal(
    updated.clients[0].plans.training.active.content.adjustments.length,
    1,
  );

  const removed = removeTrainingAdjustment(updated, "c", "adjustment-1");
  assert.deepEqual(
    removed.clients[0].plans.training,
    before.clients[0].plans.training,
  );
  assert.deepEqual(removed.clients[0].timelineEvents, []);
});

test("manual adjustments seed their weeks from the base sessions and remove exactly", () => {
  const trainingPlan = plan();
  const state = {
    clients: [
      {
        id: "c",
        timelineEvents: [],
        plans: {
          training: {
            draft: structuredClone(trainingPlan),
            active: {
              id: "v1",
              activatedAt: "2026-10-01T00:00:00Z",
              content: structuredClone(trainingPlan),
            },
            history: [],
          },
        },
      },
    ],
  };
  const saved = saveTrainingAdjustment(state, "c", {
    id: "manual-1",
    kind: "intro",
    fromWeek: 1,
    toWeek: 2,
    startDate: "2026-10-12",
    endDate: "2026-10-25",
    mode: "manual",
  });
  const adjustment =
    saved.clients[0].plans.training.active.content.adjustments[0];
  assert.deepEqual(
    adjustment.manual["1"],
    trainingPlan.overrides["1"],
    "manual copies keep the base ids",
  );
  assert.deepEqual(adjustment.manual["2"], trainingPlan.overrides["1"]);
  const removed = removeTrainingAdjustment(saved, "c", "manual-1");
  assert.deepEqual(
    removed.clients[0].plans.training,
    state.clients[0].plans.training,
  );
});

test("adapted volume drops for an Amara-like plan", () => {
  const amara = createAmaraTrainingPlan("c1");
  const base = prescribedTrainingVolume(amara, 1);
  const sessions = resolveTrainingWeek(amara, 1);
  const workingSets = sessions
    .flatMap((entry) => entry.exercises)
    .reduce(
      (total, entry) =>
        total +
        Math.max(
          1,
          entry.sets.filter((item) => !/warm[ -]?up/i.test(item.type)).length -
            1,
        ),
      0,
    );
  const adjustedPlan = {
    ...amara,
    adjustments: [
      {
        id: "deload-1",
        kind: "deload",
        fromWeek: 1,
        toWeek: 1,
        startDate: "2026-10-12",
        endDate: "2026-10-18",
        mode: "rules",
        rules: { setsDelta: -1, rirDelta: 2 },
      },
    ],
  };
  const adjusted = prescribedTrainingVolume(adjustedPlan, 1);
  assert.ok(adjusted.totalSets < base.totalSets);
  assert.equal(adjusted.totalSets, workingSets);
});

test("stored adjustments round-trip and malformed shapes are dropped", () => {
  const state = seedState();
  const amara = state.clients.find((client) => client.id === "client-007");
  const plan = amara.plans.training.active.content;
  plan.adjustments = [
    {
      id: "round-trip",
      kind: "intro",
      fromWeek: 1,
      toWeek: 1,
      startDate: "2026-10-12",
      endDate: "2026-10-18",
      mode: "rules",
      rules: { setsDelta: -1, rirDelta: 1 },
      note: "Ease in",
    },
    { id: "broken", kind: "deload", fromWeek: "two" },
    {
      id: "broken-manual",
      kind: "deload",
      fromWeek: 1,
      toWeek: 1,
      mode: "manual",
      manual: [],
    },
  ];
  amara.timelineEvents = [
    ...(amara.timelineEvents ?? []),
    {
      id: "event-intro",
      kind: "intro",
      startDate: "2026-10-12",
      endDate: "2026-10-18",
      note: "Ease in",
      adjustmentId: "round-trip",
    },
  ];
  const migrated = migrateCoachState(JSON.parse(JSON.stringify(state)));
  assert.equal(isCoachState(migrated), true);
  const cleaned = migrated.clients.find((client) => client.id === "client-007")
    .plans.training.active.content.adjustments;
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].id, "round-trip");
  const event = migrated.clients
    .find((client) => client.id === "client-007")
    .timelineEvents.find((entry) => entry.id === "event-intro");
  assert.equal(event.kind, "intro");
  assert.equal(event.adjustmentId, "round-trip");
});
