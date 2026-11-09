import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLogbook,
  cellNotesFor,
  cellNotesList,
  diffPrescriptions,
  exerciseNotesFor,
} from "./logbook-model.ts";

const set = (reps, extra = {}) => ({
  id: `s${reps}`,
  reps,
  tempo: "3-1-1-0",
  type: "Straight sets",
  rest: "2 min",
  instructions: "",
  ...extra,
});
const ex = (id, name, sets, extra = {}) => ({
  id,
  name,
  muscle: "glutes",
  instructions: "",
  progression: "",
  sets,
  ...extra,
});
const sess = (id, name, exercises) => ({ id, name, exercises });
const lset = (w, r, extra = {}) => ({
  setId: `l${w}-${r}`,
  done: true,
  weight: w,
  reps: r,
  rpe: null,
  rir: null,
  note: "",
  flagged: false,
  ...extra,
});
const log = (sessionId, date, exerciseKey, sets) => ({
  id: `log-${date}`,
  clientId: "c1",
  planId: "tp",
  week: 1,
  occurrenceKey: `Monday:${sessionId}:0`,
  sessionId,
  sessionName: "Lower A",
  scheduledDate: date,
  logFields: ["weight", "reps", "note"],
  loadUnit: "kg",
  exercises: [
    {
      exerciseId: exerciseKey,
      exerciseKey,
      prescription: ex(exerciseKey, exerciseKey, [set(8)]),
      sets,
    },
  ],
  status: "finished",
  startedAt: `${date}T08:00:00Z`,
});

/** A weekly-rotation plan whose sessions change per week via overrides. */
const mkPlan = (overrides) => ({
  id: "tp",
  clientId: "c1",
  name: "Plan",
  startDate: "2026-10-05", // Monday of W1
  program: "Week-based",
  weeks: 8,
  overrides: Object.fromEntries(
    Object.entries(overrides).map(([k, v]) => [String(k), v]),
  ),
  rotation: {
    mode: "weekly",
    weekdays: {
      Monday: ["s1"],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: [],
    },
  },
});
const life = (active, history = []) => ({ active, history });
const V = (id, content, at) => ({ id, content, activatedAt: at });
const today = "2026-10-28"; // Wednesday of W4

test("diffPrescriptions: +1 set, reps change, tempo change", () => {
  assert.equal(
    diffPrescriptions(
      ex("a", "A", [set(8), set(8), set(8)]),
      ex("b", "A", [set(8), set(8), set(8), set(8)]),
    )[0],
    "+1 set",
  );
  assert.equal(
    diffPrescriptions(
      ex("a", "A", [set(8)]),
      ex("b", "A", [{ ...set(6), repsMax: 8 }]),
    )[0],
    "Reps 8 → 6–8",
  );
  assert.equal(
    diffPrescriptions(
      ex("a", "A", [{ ...set(8), tempo: "3-1-1-0" }]),
      ex("b", "A", [{ ...set(8), tempo: "2-1-1-0" }]),
    )[0],
    "Tempo 3-1-1-0 → 2-1-1-0",
  );
});

test("+1 set: isNew only on the added set, only in the first changed week", () => {
  const s12 = sess("s1", "Lower A", [
    ex("e1", "Hip thrust", [set(8), set(8), set(8)]),
  ]);
  const s34 = sess("s1", "Lower A", [
    ex("e1", "Hip thrust", [set(8), set(8), set(8), set(8)]),
  ]);
  const lb = buildLogbook({
    lifecycle: life(V("v1", mkPlan({ 1: [s12], 3: [s34] }), "2026-10-05")),
    logs: [],
    notes: [],
    today,
    sessionId: "s1",
  });
  const e = lb.exercises[0];
  assert.equal(e.cells[1].sets.length, 3); // W2 still 3
  assert.equal(e.cells[2].sets.length, 4); // W3 4
  assert.equal(e.cells[2].sets[3].isNew, true);
  assert.equal(e.cells[2].sets[0].isNew, false);
  assert.notEqual(e.cells[3].sets[3].isNew, true); // only first week
  assert.ok(e.cells[2].changes.some((c) => c.includes("+1 set")));
});

test("reps change is reported with the arrow", () => {
  const a = sess("s1", "L", [ex("e1", "SQ", [set(8), set(8)])]);
  const b = sess("s1", "L", [
    ex("e1", "SQ", [
      { ...set(5), repsMax: 7 },
      { ...set(5), repsMax: 7 },
    ]),
  ]);
  const lb = buildLogbook({
    lifecycle: life(V("v1", mkPlan({ 1: [a], 4: [b] }), "2026-10-05")),
    logs: [],
    notes: [],
    today,
    sessionId: "s1",
  });
  assert.ok(lb.exercises[0].cells[3].changes.some((c) => c.startsWith("Reps")));
});

test("added exercise: not-in-plan before, removed: 'Removed' only on first week", () => {
  const before = sess("s1", "L", [
    ex("e1", "A", [set(8)]),
    ex("e2", "B", [set(8)]),
  ]);
  const after = sess("s1", "L", [
    ex("e1", "A", [set(8)]),
    ex("e3", "C", [set(10)]),
  ]);
  const lb = buildLogbook({
    lifecycle: life(V("v1", mkPlan({ 1: [before], 4: [after] }), "2026-10-05")),
    logs: [],
    notes: [],
    today,
    sessionId: "s1",
  });
  const c = lb.exercises.find((x) => x.key === "e3");
  const bEx = lb.exercises.find((x) => x.key === "e2");
  assert.equal(c.cells[0].status, "not-in-plan"); // W1
  assert.equal(c.cells[3].status, "planned"); // W4 first week present
  assert.equal(c.addedInWeek, 4);
  assert.equal(bEx.cells[3].status, "removed"); // W4 removed
  assert.equal(bEx.cells[4].status, "removed"); // later weeks stay removed (rendered muted)
  assert.equal(bEx.removedInWeek, 4);
});

test("version change flagged on the week where the new version activates", () => {
  const p1 = mkPlan({ 1: [sess("s1", "L", [ex("e1", "A", [set(8)])])] });
  const p2 = mkPlan({ 1: [sess("s1", "L", [ex("e1", "A", [set(8)])])] });
  const lifecycle = {
    history: [V("v1", p1, "2026-10-05")],
    active: V("v2", p2, "2026-10-26"), // Mon of W4
  };
  const lb = buildLogbook({
    lifecycle,
    logs: [],
    notes: [],
    today,
    sessionId: "s1",
  });
  assert.equal(lb.weeks[3].versionChanged?.activatedAt, "2026-10-26");
  assert.equal(lb.weeks[2].versionChanged, undefined);
});

test("notes: 'only' shows one week; 'onwards' continues and stops after removal", () => {
  const only = {
    id: "n1",
    clientId: "c1",
    sessionId: "s1",
    exerciseKey: "e1",
    fromWeek: 2,
    untilWeek: 2,
    text: "only",
    createdAt: "2026-10-12",
  };
  const onwards = {
    id: "n2",
    clientId: "c1",
    sessionId: "s1",
    exerciseKey: "e2",
    fromWeek: 2,
    text: "onwards",
    createdAt: "2026-10-12",
  };
  const before = sess("s1", "L", [
    ex("e1", "A", [set(8)]),
    ex("e2", "B", [set(8)]),
  ]);
  const after = sess("s1", "L", [ex("e1", "A", [set(8)])]);
  const lb = buildLogbook({
    lifecycle: life(V("v1", mkPlan({ 1: [before], 5: [after] }), "2026-10-05")),
    logs: [],
    notes: [only, onwards],
    today,
    sessionId: "s1",
  });
  const e1 = lb.exercises.find((x) => x.key === "e1");
  const e2 = lb.exercises.find((x) => x.key === "e2");
  assert.equal(e1.cells[1].exerciseNotes.length, 1); // W2 'only'
  assert.equal(e1.cells[2].exerciseNotes.length, 0); // W3 gone
  assert.equal(e2.cells[2].exerciseNotes.length, 1); // onwards still shows W3
  assert.equal(e2.cells[4].status, "removed"); // W5 removed — note cell hidden
  // an "onwards" note must not attach to weeks where the exercise isn't in plan
  assert.equal(cellNotesList(e2.cells[4].cellNotes).length, 0);
  assert.equal(e2.cells[4].exerciseNotes.length, 0);
  assert.deepEqual(e2.cells[4].cellNotes, {});
  // the exercise present through the last column is never "removed"
  assert.equal(e1.removedInWeek, undefined);
});

test("max(prescribed, logged) rows", () => {
  const p = sess("s1", "L", [ex("e1", "A", [set(8), set(8)])]);
  const lg = log("s1", "2026-10-19", "e1", [
    lset(50, 8),
    lset(50, 8),
    lset(52, 7),
  ]); // 3 logged > 2 prescribed
  const lb = buildLogbook({
    lifecycle: life(V("v1", mkPlan({ 1: [p] }), "2026-10-05")),
    logs: [lg],
    notes: [],
    today,
    sessionId: "s1",
  });
  assert.equal(lb.exercises[0].cells[2].sets.length, 3);
});

test("cellNotesFor returns 'only' for its week and 'onwards' keeps applying", () => {
  const notes = [
    {
      id: "n1",
      clientId: "c1",
      sessionId: "s1",
      exerciseKey: "e1",
      setIndex: 1,
      field: "reps",
      fromWeek: 3,
      untilWeek: 3,
      text: "only",
      createdAt: "x",
    },
    {
      id: "n2",
      clientId: "c1",
      sessionId: "s1",
      exerciseKey: "e1",
      setIndex: 0,
      field: "weight",
      fromWeek: 5,
      text: "onwards",
      createdAt: "x",
    },
  ];
  assert.equal(
    cellNotesList(
      cellNotesFor(notes, {
        sessionId: "s1",
        exerciseKey: "e1",
        week: 3,
        setCount: 3,
      }),
    ).length,
    1,
  );
  assert.equal(
    cellNotesList(
      cellNotesFor(notes, {
        sessionId: "s1",
        exerciseKey: "e1",
        week: 4,
        setCount: 3,
      }),
    ).length,
    0,
  );
  assert.equal(
    cellNotesList(
      cellNotesFor(notes, {
        sessionId: "s1",
        exerciseKey: "e1",
        week: 6,
        setCount: 3,
      }),
    ).length,
    1,
  );
  // keyed by "setIndex:field"
  const m = cellNotesFor(notes, {
    sessionId: "s1",
    exerciseKey: "e1",
    week: 6,
    setCount: 3,
  });
  assert.equal(m["0:weight"][0].text, "onwards");
});

test("cellNotesFor groups notes by setIndex:field and skips sets that don't exist", () => {
  const notes = [
    {
      id: "n1",
      clientId: "c1",
      sessionId: "s1",
      exerciseKey: "e1",
      setIndex: 3,
      field: "reps",
      fromWeek: 2,
      text: "set4",
      createdAt: "x",
    },
  ];
  // a note on set index 3 (4th set) applies while ≥4 sets exist, not at 3
  assert.equal(
    cellNotesFor(notes, {
      sessionId: "s1",
      exerciseKey: "e1",
      week: 2,
      setCount: 4,
    })["3:reps"].length,
    1,
  );
  assert.deepEqual(
    cellNotesFor(notes, {
      sessionId: "s1",
      exerciseKey: "e1",
      week: 2,
      setCount: 3,
    }),
    {},
  );
  // a setIndex-less note is exercise-level → exerciseNotesFor, not a set cell
  const legacy = [
    {
      id: "n0",
      clientId: "c1",
      sessionId: "s1",
      exerciseKey: "e1",
      fromWeek: 2,
      text: "old",
      createdAt: "x",
    },
  ];
  assert.equal(
    exerciseNotesFor(legacy, { sessionId: "s1", exerciseKey: "e1", week: 2 })
      .length,
    1,
  );
  assert.deepEqual(
    cellNotesFor(legacy, {
      sessionId: "s1",
      exerciseKey: "e1",
      week: 2,
      setCount: 2,
    }),
    {},
  );
});

test("not-scheduled: a session in the template but with no occurrence that week", () => {
  // a weekly plan starting mid-week — the Monday session has no occurrence in W1
  const p = sess("s1", "Lower A", [ex("e1", "Hip thrust", [set(8), set(8)])]);
  const plan = {
    id: "tp",
    clientId: "c1",
    name: "Plan",
    startDate: "2026-10-13", // a Tuesday
    program: "Week-based",
    weeks: 8,
    overrides: { 1: [p] },
    rotation: {
      mode: "weekly",
      weekdays: {
        Monday: ["s1"],
        Tuesday: [],
        Wednesday: [],
        Thursday: [],
        Friday: [],
        Saturday: [],
        Sunday: [],
      },
    },
  };
  const lb = buildLogbook({
    lifecycle: life(V("v1", plan, "2026-10-13")),
    logs: [],
    notes: [],
    today,
    sessionId: "s1",
  });
  // W1 straddles the start: Lower A (Monday Oct 12 < Oct 13) has no occurrence
  assert.equal(lb.exercises[0].cells[0].status, "not-scheduled");
  assert.equal(lb.exercises[0].cells[0].sets.length, 0);
  // later weeks are scheduled normally
  assert.equal(lb.exercises[0].cells[1].status, "planned");
});

test("missed: a past scheduled week with no log sets the flag", () => {
  const p = sess("s1", "Lower A", [ex("e1", "Hip thrust", [set(8), set(8)])]);
  const plan = {
    id: "tp",
    clientId: "c1",
    name: "Plan",
    startDate: "2026-10-05", // Monday W1
    program: "Week-based",
    weeks: 8,
    overrides: { 1: [p] },
    rotation: {
      mode: "weekly",
      weekdays: {
        Monday: ["s1"],
        Tuesday: [],
        Wednesday: [],
        Thursday: [],
        Friday: [],
        Saturday: [],
        Sunday: [],
      },
    },
  };
  const lb = buildLogbook({
    lifecycle: life(V("v1", plan, "2026-10-05")),
    logs: [],
    notes: [],
    today,
    sessionId: "s1",
  });
  // past weeks (W1,W2) were scheduled but unlogged → missed; future (W4+) not
  assert.equal(lb.exercises[0].cells[0].missed, true);
  assert.equal(lb.exercises[0].cells[0].status, "planned");
  assert.ok(!lb.exercises[0].cells[4].missed); // W5 future
});

test("trend: up / down / equal / skips unlogged weeks / no previous", () => {
  // 3 weeks, same exercise; logs W1 (50), skip W2 (no log), W3 (55 up; set2 down)
  const p = sess("s1", "L", [ex("e1", "A", [set(8), set(8)])]);
  const l1 = log("s1", "2026-10-05", "e1", [lset(50, 8), lset(50, 8)]); // W1
  const l3 = log("s1", "2026-10-19", "e1", [lset(55, 8), lset(45, 8)]); // W3
  const lb = buildLogbook({
    lifecycle: life(V("v1", mkPlan({ 1: [p] }), "2026-10-05")),
    logs: [l1, l3],
    notes: [],
    today,
    sessionId: "s1",
  });
  const e1 = lb.exercises[0];
  const w3 = e1.cells[2];
  // W3 set1 weight 55 > last logged (W1 50, W2 skipped) → up, prev 50 @ W1
  assert.equal(w3.sets[0].trend?.weight?.dir, "up");
  assert.equal(w3.sets[0].trend?.weight?.prev, 50);
  assert.equal(w3.sets[0].trend?.weight?.prevWeek, 1);
  // W3 set2 weight 45 < 50 → down
  assert.equal(w3.sets[0].trend?.reps?.dir, undefined); // reps equal → none
  assert.equal(w3.sets[1].trend?.weight?.dir, "down");
  // W1 has no previous → no trend
  assert.equal(e1.cells[0].sets[0].trend, undefined);
  // W2 unlogged → no trend, no sets
  assert.equal(e1.cells[1].sets.length, 2); // still renders planned/missed rows
  assert.equal(e1.cells[1].sets[0].trend, undefined);
});

test("topTrend: collapsed top-set arrow vs last earlier top set", () => {
  const p = sess("s1", "L", [ex("e1", "A", [set(8)])]);
  const l1 = log("s1", "2026-10-05", "e1", [lset(50, 8)]);
  const l2 = log("s1", "2026-10-12", "e1", [lset(50, 10)]);
  const lb = buildLogbook({
    lifecycle: life(V("v1", mkPlan({ 1: [p] }), "2026-10-05")),
    logs: [l1, l2],
    notes: [],
    today,
    sessionId: "s1",
  });
  const e1 = lb.exercises[0];
  assert.equal(e1.cells[0].topTrend, undefined); // W1 no previous
  // W2 top 50×10 vs W1 50×8 → reps up
  assert.equal(e1.cells[1].topTrend?.dir, "up");
  assert.equal(e1.cells[1].topTrend?.prevWeek, 1);
});

test("diffPrescriptions: RIR and RPE targets, kind-aware", () => {
  const a = ex("a", "A", [set(8, { rir: 2, rpe: 8 })]);
  const b = ex("b", "A", [set(8, { rir: 1, rpe: 9 })]);
  // kind-gated: only the active target is reported
  assert.deepEqual(diffPrescriptions(a, b, "rir"), ["RIR 2 → 1"]);
  assert.deepEqual(diffPrescriptions(a, b, "rpe"), ["RPE 8 → 9"]);
  // no intensity → neither is reported
  assert.equal(diffPrescriptions(a, b).length, 0);
  // equal target → nothing
  assert.deepEqual(diffPrescriptions(a, a, "rir"), []);
});
