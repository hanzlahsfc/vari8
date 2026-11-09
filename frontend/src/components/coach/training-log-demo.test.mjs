import assert from "node:assert/strict";
import { test } from "node:test";
import { adoptAthleteDataDemo } from "./athlete-data-demo.ts";
import { adoptAthleteProfileDemo } from "./athlete-profile-demo.ts";
import { adoptClientAppDemo } from "./client-app-demo.ts";
import { isCoachState, seedState } from "./model.ts";
import { adoptAmaraTrainingExample } from "./plans/training/amara-example.ts";
import {
  adoptTrainingLogDemo,
  TRAINING_LOG_DEMO_REVISION,
} from "./training-log-demo.ts";

const TODAY = "2026-11-02";
const CLIENT_ID = "client-007";

// seedState() applies the demo already; strip the flag and the seeded logs so
// the adoption path can be exercised directly.
function baseWithoutDemo() {
  const seeded = seedState(TODAY);
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

test("adoptTrainingLogDemo seeds the previous week and today, and sets the flag", () => {
  const applied = adoptTrainingLogDemo(baseWithoutDemo(), TODAY);
  assert.equal(applied.demoSeeds?.trainingLogDemo, TRAINING_LOG_DEMO_REVISION);
  const logs = logsFor(applied);
  const byDate = Object.fromEntries(
    logs.map((log) => [log.scheduledDate, log]),
  );
  for (const date of ["2026-10-26", "2026-10-27", "2026-10-29", "2026-10-31"]) {
    assert.equal(byDate[date]?.status, "finished", `${date} finished`);
    assert.ok(byDate[date].finishedAt, `${date} has finishedAt`);
  }
  assert.equal(byDate[TODAY]?.status, "finished");
  assert.equal(byDate[TODAY]?.sessionId, "amara-lower-a");
  assert.ok(byDate[TODAY]?.finishedAt, "today is complete, not resumable");
  for (const date of [
    "2026-11-03",
    "2026-11-04",
    "2026-11-05",
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
  ])
    assert.equal(byDate[date], undefined, `${date} gets no log`);

  // Every finished log has all sets done, reps inside the prescription and
  // RIR recorded (Amara's template uses RIR).
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
        assert.ok(s.rir != null, `${log.scheduledDate} set ${i} has RIR`);
        assert.ok(s.weight != null, `${log.scheduledDate} set ${i} has weight`);
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
  // amara-upper-a runs Tue week 2 (Oct 20) and Tue week 3 (Oct 27).
  const week2 = byDate["2026-10-20"].exercises[0].sets[0].weight;
  const week3 = byDate["2026-10-27"].exercises[0].sets[0].weight;
  assert.equal(week3 - week2, 2.5);
});

test("second call is a no-op and other clients are untouched", () => {
  const applied = adoptTrainingLogDemo(baseWithoutDemo(), TODAY);
  assert.deepEqual(adoptTrainingLogDemo(applied, "2026-11-03"), applied);
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

test("a new revision replaces the demo client's old logs and keeps other clients' logs", () => {
  const base = baseWithoutDemo();
  const stale = {
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
  const other = { ...stale, id: "other-log", clientId: "client-001" };
  const applied = adoptTrainingLogDemo(
    { ...base, trainingLogs: [stale, other] },
    TODAY,
  );
  assert.ok(!applied.trainingLogs.some((log) => log.id === "owner-log"));
  assert.ok(applied.trainingLogs.some((log) => log.id === "other-log"));
  assert.ok(logsFor(applied).length > 0, "fresh demo logs are generated");
  assert.equal(applied.demoSeeds?.trainingLogDemo, TRAINING_LOG_DEMO_REVISION);
});

test("an old browser save with retired demo exercises loads only the current plan's exercises", () => {
  const fresh = seedState(TODAY);
  const current = new Set();
  const collect = (node, out) => {
    if (Array.isArray(node)) for (const n of node) collect(n, out);
    else if (node && typeof node === "object") {
      if (Array.isArray(node.sets) && typeof node.name === "string")
        out.add(node.libraryId ?? `name:${node.name}`);
      for (const v of Object.values(node)) collect(v, out);
    }
    return out;
  };
  const freshAmara = fresh.clients.find((c) => c.id === CLIENT_ID);
  collect(freshAmara.plans.training, current);
  // Simulate an old save: every Amara plan exercise is a retired sample entry,
  // logs reference it too, and the demo flags carry the previous revisions.
  const old = structuredClone(fresh);
  const oldAmara = old.clients.find((c) => c.id === CLIENT_ID);
  const retire = (node) => {
    if (Array.isArray(node)) node.forEach(retire);
    else if (node && typeof node === "object") {
      if (Array.isArray(node.sets) && typeof node.name === "string") {
        node.name = "Hip thrust";
        node.libraryId = "lib-hip-thrust";
        delete node.primaryTarget;
      }
      if (node.prescription && typeof node.prescription.name === "string") {
        node.prescription.name = "Hip thrust";
        node.prescription.libraryId = "lib-hip-thrust";
      }
      Object.values(node).forEach(retire);
    }
  };
  retire(oldAmara.plans.training);
  retire(old.trainingLogs);
  old.demoSeeds = {
    ...old.demoSeeds,
    amaraTraining: 1,
    trainingLogDemo: 1,
    athleteDataDemo: 1,
  };
  const loaded = adoptTrainingLogDemo(
    adoptAthleteDataDemo(
      adoptAthleteProfileDemo(
        adoptClientAppDemo(adoptAmaraTrainingExample(old), TODAY),
        TODAY,
      ),
      TODAY,
    ),
    TODAY,
  );
  assert.equal(isCoachState(loaded), true);
  const amara = loaded.clients.find((c) => c.id === CLIENT_ID);
  const seen = collect(amara.plans.training, new Set());
  assert.ok(!seen.has("lib-hip-thrust"), "no retired exercise in the plan");
  for (const id of seen)
    assert.ok(current.has(id), `${id} is a current exercise`);
  const logNames = new Set(
    logsFor(loaded).flatMap((log) =>
      log.exercises.map((e) => e.prescription.name),
    ),
  );
  assert.ok(logNames.size > 0);
  assert.ok(!logNames.has("Hip thrust"), "no retired exercise in the logs");
});

test("missing client or no applicable plan returns state unchanged", () => {
  const base = baseWithoutDemo();
  const absent = {
    ...base,
    clients: base.clients.filter((c) => c.id !== CLIENT_ID),
  };
  assert.deepEqual(adoptTrainingLogDemo(absent, TODAY), absent);
});
