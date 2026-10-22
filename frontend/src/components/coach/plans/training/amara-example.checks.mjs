import assert from "node:assert/strict";
import { isCoachState, seedState } from "../../model.ts";
import { validateIndividualPlan } from "../domain.ts";
import { resolveTrainingWeek } from "../types.ts";
import {
  AMARA_EXAMPLE_CLIENT_ID,
  adoptAmaraTrainingExample,
} from "./amara-example.ts";

const initial = seedState();
assert.equal(isCoachState(initial), true);
const amara = initial.clients.find(
  (client) => client.id === AMARA_EXAMPLE_CLIENT_ID,
);
assert.ok(amara);
const plan = amara.plans.training.draft;
assert.equal(plan.name, "Amara · Bikini training example");
assert.deepEqual(validateIndividualPlan("training", plan), []);
const sessions = resolveTrainingWeek(plan, 1);
assert.equal(sessions.length, 4);
assert.deepEqual(plan.rotation.weekdays.Monday, [sessions[0].id]);
assert.deepEqual(plan.rotation.weekdays.Tuesday, [sessions[1].id]);
assert.deepEqual(plan.rotation.weekdays.Thursday, [sessions[2].id]);
assert.deepEqual(plan.rotation.weekdays.Saturday, [sessions[3].id]);
assert.equal(
  sessions.reduce((sum, session) => sum + session.exercises.length, 0),
  21,
);
assert.ok(
  sessions.every((session) =>
    session.exercises.every((exercise) => exercise.sets.length > 0),
  ),
);
assert.ok(
  sessions
    .flatMap((session) => session.exercises)
    .some((exercise) => exercise.muscle === "glutes"),
);
assert.ok(
  sessions
    .flatMap((session) => session.exercises)
    .some((exercise) => exercise.muscle === "shoulders"),
);

const legacy = structuredClone(initial);
delete legacy.demoSeeds;
const target = legacy.clients.find(
  (client) => client.id === AMARA_EXAMPLE_CLIENT_ID,
);
target.name = "Renamed demo client";
target.plans.training.draft.name = "Old draft to replace once";
target.plans.training.active = {
  id: "amara-active-preserved",
  activatedAt: "2026-10-01T00:00:00.000Z",
  content: structuredClone(target.plans.training.draft),
};
target.plans.training.history = [
  {
    id: "amara-history-preserved",
    activatedAt: "2026-09-01T00:00:00.000Z",
    content: structuredClone(target.plans.training.draft),
  },
];
const siblingBefore = structuredClone(
  legacy.clients.find((client) => client.id !== AMARA_EXAMPLE_CLIENT_ID),
);
const adopted = adoptAmaraTrainingExample(legacy);
const adoptedAmara = adopted.clients.find(
  (client) => client.id === AMARA_EXAMPLE_CLIENT_ID,
);
assert.equal(
  adoptedAmara.plans.training.draft.name,
  "Amara · Bikini training example",
);
assert.equal(adoptedAmara.plans.training.active.id, "amara-active-preserved");
assert.equal(
  adoptedAmara.plans.training.history[0].id,
  "amara-history-preserved",
);
assert.deepEqual(
  adopted.clients.find((client) => client.id === siblingBefore.id),
  siblingBefore,
);
assert.equal(adopted.demoSeeds.amaraTraining, 1);
const editedAfterAdoption = JSON.parse(JSON.stringify(adopted));
editedAfterAdoption.clients.find(
  (client) => client.id === AMARA_EXAMPLE_CLIENT_ID,
).plans.training.draft.name = "Coach edit after adoption";
assert.equal(
  adoptAmaraTrainingExample(editedAfterAdoption).clients.find(
    (client) => client.id === AMARA_EXAMPLE_CLIENT_ID,
  ).plans.training.draft.name,
  "Coach edit after adoption",
);

const absent = structuredClone(initial);
delete absent.demoSeeds;
absent.clients = absent.clients.filter(
  (client) => client.id !== AMARA_EXAMPLE_CLIENT_ID,
);
const absentCount = absent.clients.length;
assert.equal(adoptAmaraTrainingExample(absent), absent);
assert.equal(absent.clients.length, absentCount);
assert.equal(absent.demoSeeds, undefined);

console.log(
  "Amara example checks passed: valid four-session plan, weekly schedule, focus muscles, full set rows, lifecycle preservation, sibling preservation, and reload idempotence.",
);
