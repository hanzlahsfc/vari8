import assert from "node:assert/strict";
import { test } from "node:test";
import { isCoachState, seedState } from "./model.ts";
import {
  adoptTrainingLogDemo,
  TRAINING_LOG_DEMO_REVISION,
} from "./training-log-demo.ts";

const TODAY = "2026-10-22";
const CLIENT_ID = "client-007";

// seedState() applies the demo already; strip the flag and the seeded logs so
// the adoption path can be exercised directly.
function baseWithoutDemo() {
  const seeded = seedState();
  return {
    ...seeded,
    demoSeeds: {
      amaraTraining: 1,
      clientAppDemo: 1,
    },
    trainingLogs: (seeded.trainingLogs ?? []).filter(
      (log) => log.clientId !== CLIENT_ID,
    ),
  };
}

const logsFor = (state) =>
  (state.trainingLogs ?? []).filter((log) => log.clientId === CLIENT_ID);

test("adoptTrainingLogDemo seeds Amara's history and sets the flag", () => {
  const applied = adoptTrainingLogDemo(baseWithoutDemo(), TODAY);
  assert.equal(applied.demoSeeds?.trainingLogDemo, TRAINING_LOG_DEMO_REVISION);
  const logs = logsFor(applied);
  const byDate = Object.fromEntries(
    logs.map((log) => [log.scheduledDate, log]),
  );
  for (const date of ["2026-10-13", "2026-10-15", "2026-10-17", "2026-10-19"]) {
    assert.equal(byDate[date]?.status, "finished", `${date} finished`);
    assert.ok(byDate[date].finishedAt, `${date} has finishedAt`);
  }
  assert.equal(byDate["2026-10-20"]?.status, "in-progress");
  assert.equal(
    byDate["2026-10-20"]?.finishedAt,
    undefined,
    "the resumable session is unfinished",
  );
  assert.equal(byDate["2026-10-22"], undefined, "today gets no log");
  // The resumable log only has its first two exercises logged.
  const resume = byDate["2026-10-20"];
  const logged = resume.exercises.filter((e) => e.sets.some((s) => s.done));
  assert.equal(logged.length, 2, "two exercises partially logged");
  // Every finished log has all sets done and reps inside the prescription.
  for (const log of logs.filter((l) => l.status === "finished")) {
    for (const exercise of log.exercises) {
      assert.ok(
        exercise.sets.every((s) => s.done),
        `${log.scheduledDate} ${exercise.exerciseKey} all sets done`,
      );
      for (const [i, s] of exercise.sets.entries()) {
        const prescribed = exercise.prescription.sets[i];
        assert.ok(
          s.reps >= prescribed.reps &&
            s.reps <= (prescribed.repsMax ?? prescribed.reps),
          `${log.scheduledDate} set ${i} reps ${s.reps} inside ${prescribed.reps}–${prescribed.repsMax ?? prescribed.reps}`,
        );
      }
    }
  }
  // One flagged note exists on a lower-body finished session.
  const flagged = logs.flatMap((log) =>
    log.exercises.flatMap((exercise) => exercise.sets.filter((s) => s.flagged)),
  );
  assert.equal(flagged.length, 1);
  assert.match(flagged[0].note, /knee/i);
  assert.ok(isCoachState(applied), "result passes the storage guard");
});

test("loads rise 2.5 kg per week for the same exercise", () => {
  const applied = adoptTrainingLogDemo(baseWithoutDemo(), TODAY);
  const byDate = Object.fromEntries(
    logsFor(applied).map((log) => [log.scheduledDate, log]),
  );
  // amara-upper-a runs Tue week 1 (Oct 13) and Tue week 2 (Oct 20).
  const week1 = byDate["2026-10-13"].exercises[0].sets[0].weight;
  const week2 = byDate["2026-10-20"].exercises[0].sets[0].weight;
  assert.equal(week2 - week1, 2.5);
});

test("second call is a no-op and other clients are untouched", () => {
  const applied = adoptTrainingLogDemo(baseWithoutDemo(), TODAY);
  assert.deepEqual(adoptTrainingLogDemo(applied, "2026-10-23"), applied);
  const base = baseWithoutDemo();
  assert.deepEqual(
    applied.clients.filter((c) => c.id !== CLIENT_ID),
    base.clients.filter((c) => c.id !== CLIENT_ID),
  );
  assert.deepEqual(
    (applied.trainingLogs ?? []).filter((l) => l.clientId !== CLIENT_ID),
    base.trainingLogs ?? [],
  );
});

test("existing logs are preserved; nothing is added when she already has some", () => {
  const base = baseWithoutDemo();
  const existing = {
    id: "owner-log",
    clientId: CLIENT_ID,
    planId: "p",
    week: 1,
    occurrenceKey: "Tuesday:amara-upper-a:0",
    sessionId: "amara-upper-a",
    sessionName: "Upper A",
    scheduledDate: "2026-10-13",
    logFields: ["weight", "reps", "note"],
    loadUnit: "kg",
    exercises: [],
    status: "finished",
    startedAt: "2026-10-13T18:00:00",
    finishedAt: "2026-10-13T19:00:00",
  };
  const withLog = { ...base, trainingLogs: [existing] };
  const applied = adoptTrainingLogDemo(withLog, TODAY);
  assert.deepEqual(applied.trainingLogs, [existing]);
  assert.equal(applied.demoSeeds?.trainingLogDemo, 1);
});

test("missing client or no applicable plan returns state unchanged", () => {
  const base = baseWithoutDemo();
  const absent = {
    ...base,
    clients: base.clients.filter((c) => c.id !== CLIENT_ID),
  };
  assert.deepEqual(adoptTrainingLogDemo(absent, TODAY), absent);
});
