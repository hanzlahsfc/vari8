import assert from "node:assert/strict";
import { test } from "node:test";
import { isCoachState, seedState } from "../../coach/model.ts";
import {
  DEFAULT_LOG_FIELDS,
  displayWeek,
  exerciseKey,
  findLog,
  finishLog,
  nextSession,
  notDoneCount,
  previousPerformance,
  scheduledSessions,
  sessionStatus,
  startLog,
  updateSet,
  weekRange,
} from "./model.ts";

const set = (id, reps, extra = {}) => ({
  id,
  reps,
  tempo: "2-0-2",
  type: "Working",
  rest: "90 sec",
  instructions: "",
  ...extra,
});
const exercise = (id, name, sets, libraryId) => ({
  id,
  ...(libraryId ? { libraryId } : {}),
  name,
  muscle: "quadriceps",
  instructions: "",
  progression: "",
  sets,
});
const session = (id, name, exercises) => ({ id, name, exercises });

const EXERCISES_B = [
  exercise(
    "ex-b1",
    "Hack squat",
    [set("s-b1-1", 8), set("s-b1-2", 8)],
    "lib-hack-squat",
  ),
  exercise("ex-b2", "Leg curl", [set("s-b2-1", 10)], undefined),
];
const EXERCISES_A = [
  exercise("ex-a1", "Hip thrust", [set("s-a1-1", 10)], "lib-hip-thrust"),
];

const plan = {
  id: "plan-fixture",
  clientId: "client-007",
  name: "Fixture plan",
  startDate: "2026-10-13", // Tuesday
  program: "Week-based",
  weeks: 4,
  overrides: {
    1: [
      session("session-a", "A · Lower", EXERCISES_A),
      session("session-b", "B · Upper", EXERCISES_B),
      session("session-c", "C · Lower", [
        exercise("ex-c1", "Split squat", [set("s-c1-1", 8)]),
      ]),
      session("session-d", "D · Upper", [
        exercise("ex-d1", "Row", [set("s-d1-1", 10)]),
      ]),
    ],
  },
  rotation: {
    mode: "weekly",
    weekdays: {
      Monday: ["session-a"],
      Tuesday: ["session-b"],
      Thursday: ["session-c"],
      Saturday: ["session-d"],
    },
  },
};

const itemOn = (week, date) =>
  scheduledSessions(plan, week).find((s) => s.date === date);

test("scheduledSessions maps weekly weekdays onto the 7-day block and drops pre-start dates", () => {
  const week1 = scheduledSessions(plan, 1);
  assert.deepEqual(
    week1.map((s) => [s.date, s.session.id, s.weekdayLabel]),
    [
      ["2026-10-13", "session-b", "Tuesday"],
      ["2026-10-15", "session-c", "Thursday"],
      ["2026-10-17", "session-d", "Saturday"],
    ],
  );
  assert.ok(
    week1.every((s) => s.date >= plan.startDate),
    "no session before the plan start date",
  );
  const week2 = scheduledSessions(plan, 2);
  assert.deepEqual(
    week2.map((s) => [s.date, s.session.id, s.weekdayLabel]),
    [
      ["2026-10-19", "session-a", "Monday"],
      ["2026-10-20", "session-b", "Tuesday"],
      ["2026-10-22", "session-c", "Thursday"],
      ["2026-10-24", "session-d", "Saturday"],
    ],
  );
  assert.equal(week2[0].occurrenceKey, "Monday:session-a:0");
});

test("legacy rotations list sessions without dates and cycles return none", () => {
  const legacy = { ...plan, rotation: undefined };
  const items = scheduledSessions(legacy, 1);
  assert.equal(items.length, 4);
  assert.ok(
    items.every((s) => s.date === "2026-10-13" && s.weekdayLabel === ""),
  );
  const cycle = {
    ...plan,
    rotation: { mode: "cycle", sessionIds: ["session-a", null, "session-b"] },
  };
  assert.deepEqual(scheduledSessions(cycle, 1), []);
});

test("displayWeek counts Mon–Sun calendar weeks; weekRange covers them", () => {
  assert.equal(displayWeek(plan, "2026-10-13"), 1);
  assert.equal(displayWeek(plan, "2026-10-18"), 1, "Sunday ends week 1");
  assert.equal(displayWeek(plan, "2026-10-19"), 2, "Monday opens week 2");
  assert.equal(displayWeek(plan, "2026-10-22"), 2);
  assert.equal(displayWeek(plan, "2027-01-01"), 12);
  assert.equal(displayWeek(plan, "2026-10-01"), 1);
  assert.deepEqual(weekRange(plan, 1), {
    start: "2026-10-12",
    end: "2026-10-18",
  });
  assert.deepEqual(weekRange(plan, 2), {
    start: "2026-10-19",
    end: "2026-10-25",
  });
});

test("sessionStatus covers done, in-progress, today, upcoming and missed", () => {
  const items = scheduledSessions(plan, 2);
  const [monday, tuesday, thursday, saturday] = items;
  const done = finishLog(
    startLog({
      id: "log-done",
      clientId: "client-007",
      plan,
      item: monday,
      logFields: DEFAULT_LOG_FIELDS,
      loadUnit: "kg",
      now: "2026-10-19T18:00:00Z",
    }),
    "2026-10-19T19:00:00Z",
  );
  const inProgress = startLog({
    id: "log-progress",
    clientId: "client-007",
    plan,
    item: tuesday,
    logFields: DEFAULT_LOG_FIELDS,
    loadUnit: "kg",
    now: "2026-10-20T18:00:00Z",
  });
  const logs = [done, inProgress];
  const today = "2026-10-20";
  assert.equal(sessionStatus(monday, logs, today), "done");
  assert.equal(sessionStatus(tuesday, logs, today), "in-progress");
  assert.equal(sessionStatus(thursday, logs, "2026-10-22"), "today");
  assert.equal(sessionStatus(saturday, logs, today), "upcoming");
  assert.equal(
    sessionStatus(itemOn(1, "2026-10-17"), logs, today),
    "missed",
    "a past unlogged occurrence is missed",
  );
  assert.equal(nextSession(items, logs, today), tuesday);
  assert.equal(
    nextSession(
      items,
      logs.filter((l) => l.status === "finished"),
      today,
    ),
    tuesday,
    "today wins over upcoming",
  );
  assert.equal(
    nextSession(items.slice(2), logs, today),
    thursday,
    "with earlier sessions removed, the next upcoming wins",
  );
  const farFuture = nextSession(items.slice(0, 1), logs, "2026-11-01");
  assert.equal(farFuture, undefined, "no upcoming session after the week ends");
});

test("previousPerformance uses the latest finished log of the same session and exercise", () => {
  // Week-1 fixture has no Monday (pre-start), so use Tuesday (session-b) weeks 1 and 2.
  const week1Item = itemOn(1, "2026-10-13");
  const week2Item = itemOn(2, "2026-10-20");
  const finishedWeek1 = finishLog(
    updateSet(
      startLog({
        id: "log-w1",
        clientId: "client-007",
        plan,
        item: week1Item,
        logFields: DEFAULT_LOG_FIELDS,
        loadUnit: "kg",
        now: "2026-10-13T18:00:00Z",
      }),
      "ex-b1",
      "s-b1-1",
      { done: true, weight: 80, reps: 8 },
    ),
    "2026-10-13T19:00:00Z",
  );
  const inProgressWeek1 = {
    ...startLog({
      id: "log-w1-ip",
      clientId: "client-007",
      plan,
      item: week1Item,
      logFields: DEFAULT_LOG_FIELDS,
      loadUnit: "kg",
      now: "2026-10-13T17:00:00Z",
    }),
    status: "in-progress",
  };
  const week2Any = {
    ...startLog({
      id: "log-w2",
      clientId: "client-007",
      plan,
      item: week2Item,
      logFields: DEFAULT_LOG_FIELDS,
      loadUnit: "kg",
      now: "2026-10-20T18:00:00Z",
    }),
    status: "finished",
  };
  const logs = [inProgressWeek1, week2Any, finishedWeek1];
  const hit = previousPerformance(logs, {
    clientId: "client-007",
    sessionId: "session-b",
    exerciseKey: "lib-hack-squat",
    plan,
    date: "2026-10-20",
  });
  assert.ok(hit, "finds the finished week-1 log");
  assert.equal(hit.date, "2026-10-13");
  // libraryId key matches even though a later plan edition could use another id.
  assert.equal(hit.exercise.exerciseId, "ex-b1");
  assert.equal(hit.exercise.sets[0].weight, 80);
  assert.equal(
    previousPerformance(logs, {
      clientId: "client-007",
      sessionId: "session-b",
      exerciseKey: "lib-hack-squat",
      plan,
      date: "2026-10-13",
    }),
    undefined,
    "nothing before the week containing the date",
  );
  assert.equal(
    previousPerformance(logs, {
      clientId: "client-007",
      sessionId: "session-b",
      exerciseKey: "ex-c1",
      plan,
      date: "2026-10-20",
    }),
    undefined,
    "an exercise key absent from the session's logs does not match",
  );
});

test("logs with a stale stored week still match by scheduledDate", () => {
  const item = itemOn(2, "2026-10-20");
  const log = finishLog(
    {
      ...startLog({
        id: "log-stale-week",
        clientId: "client-007",
        plan,
        item,
        logFields: DEFAULT_LOG_FIELDS,
        loadUnit: "kg",
        now: "2026-10-20T18:00:00Z",
      }),
      week: 7,
    },
    "2026-10-20T19:00:00Z",
  );
  assert.equal(
    findLog([log], "plan-fixture", "2026-10-20", item.occurrenceKey)?.id,
    "log-stale-week",
    "findLog ignores the stored week and matches the scheduled date",
  );
  const future = previousPerformance([log], {
    clientId: "client-007",
    sessionId: "session-b",
    exerciseKey: "lib-hack-squat",
    plan,
    date: "2026-10-27",
  });
  assert.ok(future, "previousPerformance derives the week from the date");
  assert.equal(future.date, "2026-10-20");
});

test("startLog snapshots prescription with null values; updateSet keeps 0; finishLog; notDoneCount", () => {
  const item = itemOn(2, "2026-10-20");
  const log = startLog({
    id: "log-x",
    clientId: "client-007",
    plan,
    item,
    logFields: ["weight", "reps", "rpe"],
    loadUnit: "lb",
    now: "2026-10-20T18:00:00Z",
  });
  assert.equal(log.planId, "plan-fixture");
  assert.equal(log.occurrenceKey, item.occurrenceKey);
  assert.equal(log.sessionId, "session-b");
  assert.equal(log.scheduledDate, "2026-10-20");
  assert.equal(log.status, "in-progress");
  assert.deepEqual(log.logFields, ["weight", "reps", "rpe"]);
  assert.equal(log.loadUnit, "lb");
  assert.equal(log.exercises.length, 2);
  const first = log.exercises[0];
  assert.equal(first.exerciseKey, "lib-hack-squat");
  assert.equal(first.prescription.name, "Hack squat");
  assert.equal(first.sets.length, 2);
  for (const s of log.exercises.flatMap((e) => e.sets)) {
    assert.equal(s.done, false);
    assert.equal(s.weight, null);
    assert.equal(s.reps, null);
    assert.equal(s.note, "");
    assert.equal(s.flagged, false);
  }
  const edited = updateSet(log, "ex-b1", "s-b1-2", {
    done: true,
    weight: 0,
    reps: 0,
  });
  assert.equal(edited.exercises[0].sets[1].weight, 0, "a real 0 stays 0");
  assert.equal(edited.exercises[0].sets[1].done, true);
  assert.equal(
    edited.exercises[0].sets[0].weight,
    null,
    "other sets untouched",
  );
  assert.equal(log.exercises[0].sets[1].weight, null, "original immutable");
  assert.equal(notDoneCount(edited), 2);
  const finished = finishLog(edited, "2026-10-20T19:30:00Z");
  assert.equal(finished.status, "finished");
  assert.equal(finished.finishedAt, "2026-10-20T19:30:00Z");
});

test("findLog matches plan, scheduled date and occurrence", () => {
  const item = itemOn(2, "2026-10-20");
  const log = startLog({
    id: "log-y",
    clientId: "client-007",
    plan,
    item,
    logFields: DEFAULT_LOG_FIELDS,
    loadUnit: "kg",
    now: "2026-10-20T18:00:00Z",
  });
  assert.equal(
    findLog([log], "plan-fixture", "2026-10-20", item.occurrenceKey)?.id,
    "log-y",
  );
  assert.equal(
    findLog([log], "plan-fixture", "2026-10-21", item.occurrenceKey),
    undefined,
  );
  assert.equal(
    findLog([log], "other-plan", "2026-10-20", item.occurrenceKey),
    undefined,
  );
});

test("exerciseKey prefers the library id", () => {
  assert.equal(exerciseKey(EXERCISES_B[0]), "lib-hack-squat");
  assert.equal(exerciseKey(EXERCISES_B[1]), "ex-b2");
});

test("isCoachState accepts a stored state with trainingLogs and logging settings", () => {
  const state = seedState();
  const item = itemOn(1, "2026-10-13");
  const log = finishLog(
    startLog({
      id: "log-valid",
      clientId: "client-007",
      plan,
      item,
      logFields: DEFAULT_LOG_FIELDS,
      loadUnit: "kg",
      now: "2026-10-13T18:00:00Z",
    }),
    "2026-10-13T19:00:00Z",
  );
  const withLogs = {
    ...state,
    trainingLogs: [log],
    clients: state.clients.map((client) =>
      client.id === "client-007" && client.assignment
        ? {
            ...client,
            assignment: {
              ...client.assignment,
              snapshot: {
                ...client.assignment.snapshot,
                variants: client.assignment.snapshot.variants.map((variant) =>
                  variant.id === client.assignment.variantId
                    ? {
                        ...variant,
                        training: {
                          ...variant.training,
                          logFields: ["weight", "reps", "rpe"],
                          loadUnit: "lb",
                        },
                      }
                    : variant,
                ),
              },
            },
          }
        : client,
    ),
  };
  assert.ok(isCoachState(withLogs), "valid trainingLogs pass the guard");
  assert.ok(
    !isCoachState({ ...state, trainingLogs: [{ id: 1 }] }),
    "malformed log rows are rejected",
  );
});
