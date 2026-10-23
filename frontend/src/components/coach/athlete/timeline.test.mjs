import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attentionItems,
  bodyweightSummary,
  currentPhase,
  eventsOnDate,
  nutritionForDate,
  timelineInWindow,
  timelineSegment,
  timelineWindow,
  validateTimelineEvent,
  weeksOut,
  weekTrainingSummary,
} from "./timeline.ts";

const TODAY = "2026-10-22"; // Thursday

const session = { id: "s1", name: "Lower A", exercises: [] };
const trainingPlan = {
  id: "tp",
  clientId: "c1",
  name: "Program",
  startDate: "2026-10-12", // Monday
  program: "Week-based",
  weeks: 8,
  overrides: { 1: [session] },
  rotation: {
    mode: "weekly",
    weekdays: { Monday: ["s1"], Wednesday: ["s1"], Friday: ["s1"] },
  },
};

const mealPlan = {
  id: "mp",
  clientId: "c1",
  name: "Meal plan",
  startDate: "2026-10-01",
  variants: [
    { id: "train", label: "Training day", meals: [] },
    { id: "rest", label: "Rest day", meals: [] },
    { id: "refeed", label: "Refeed day", meals: [] },
  ],
  activeVariantId: "train",
  schedule: {
    mode: "weekly",
    days: {
      1: "train",
      2: "train",
      3: "train",
      4: "train",
      5: "train",
      6: "rest",
      7: "rest",
    },
  },
  archivedPlans: [],
  reusableMeals: [],
};

const client = {
  id: "c1",
  assignment: {
    templateId: "t",
    variantId: "v",
    snapshot: {
      id: "t",
      name: "Template",
      description: "",
      updated: "2026-10-01",
      defaultVariant: "v",
      variants: [
        {
          id: "v",
          name: "Variant",
          nutrition: "Meal plan",
          views: ["Dashboard"],
          habits: false,
          widgets: [],
          questions: [],
          fields: [],
        },
      ],
    },
  },
  plans: {
    nutrition: {
      mealPlan: {
        active: {
          id: "ver-1",
          content: mealPlan,
          activatedAt: "2026-10-01T08:00:00Z",
        },
        history: [],
      },
      iifym: { history: [] },
    },
    training: {
      active: {
        id: "ver-1",
        content: trainingPlan,
        activatedAt: "2026-10-12T08:00:00Z",
      },
      history: [],
    },
    goals: [],
    activityTargets: [],
  },
  timelineEvents: [
    {
      id: "ev-refeed",
      kind: "refeed",
      startDate: "2026-10-24",
      endDate: "2026-10-24",
      note: "Higher carbs",
      nutritionOverride: { source: "mealPlan", optionId: "refeed" },
    },
    {
      id: "ev-deload",
      kind: "deload",
      startDate: "2026-11-02",
      endDate: "2026-11-08",
      note: "Recovery week",
    },
  ],
  phasePlan: {
    startDate: "2026-10-12",
    phases: [
      { id: "p1", name: "Contest prep", durationWeeks: 6 },
      { id: "p2", name: "Peak week", durationWeeks: 1 },
    ],
  },
  contestDate: "2026-11-29",
  entries: [
    { date: "2026-10-09", weight: 72.4, sleep: 7, steps: 8000, calories: 2000 },
    { date: "2026-10-12", weight: 72.2, sleep: 7, steps: 8000, calories: 2000 },
    { date: "2026-10-14", weight: 72.0, sleep: 7, steps: 8000, calories: 2000 },
    { date: "2026-10-16", weight: 72.0, sleep: 7, steps: 8000, calories: 2000 },
    { date: "2026-10-18", weight: 71.9, sleep: 7, steps: 8000, calories: 2000 },
    { date: "2026-10-20", weight: 71.8, sleep: 7, steps: 8000, calories: 2000 },
    { date: "2026-10-21", weight: 71.8, sleep: 7, steps: 8000, calories: 2000 },
  ],
};

const logs = [
  {
    id: "l-done",
    clientId: "c1",
    planId: "tp",
    week: 1,
    occurrenceKey: "Monday:s1:0",
    sessionId: "s1",
    sessionName: "Lower A",
    scheduledDate: "2026-10-12",
    logFields: ["weight", "reps", "note"],
    loadUnit: "kg",
    exercises: [
      {
        exerciseId: "e1",
        exerciseKey: "e1",
        prescription: { id: "e1", name: "Back squat", sets: [] },
        sets: [
          {
            setId: "a",
            done: true,
            weight: 80,
            reps: 5,
            rpe: null,
            rir: null,
            note: "Right knee pinch",
            flagged: true,
          },
          {
            setId: "b",
            done: true,
            weight: 80,
            reps: 5,
            rpe: null,
            rir: null,
            note: "",
            flagged: false,
          },
        ],
      },
    ],
    status: "finished",
    startedAt: "2026-10-12T07:00:00Z",
    finishedAt: "2026-10-12T08:00:00Z",
  },
  {
    id: "l-open",
    clientId: "c1",
    planId: "tp",
    week: 2,
    occurrenceKey: "Wednesday:s1:0",
    sessionId: "s1",
    sessionName: "Lower A",
    scheduledDate: "2026-10-21",
    logFields: ["weight", "reps", "note"],
    loadUnit: "kg",
    exercises: [
      {
        exerciseId: "e1",
        exerciseKey: "e1",
        prescription: { id: "e1", name: "Back squat", sets: [] },
        sets: [
          {
            setId: "a",
            done: true,
            weight: 80,
            reps: 5,
            rpe: null,
            rir: null,
            note: "",
            flagged: false,
          },
          {
            setId: "b",
            done: false,
            weight: null,
            reps: null,
            rpe: null,
            rir: null,
            note: "",
            flagged: false,
          },
        ],
      },
    ],
    status: "in-progress",
    startedAt: "2026-10-21T07:00:00Z",
  },
];

const state = {
  submissions: [
    {
      id: "sub-1",
      clientId: "c1",
      date: "2026-10-20",
      answers: [],
      note: "",
      // no coach response → awaiting feedback
    },
    {
      id: "sub-2",
      clientId: "c1",
      date: "2026-10-13",
      answers: [],
      note: "",
      response: { text: "Looks good", date: "2026-10-14", changes: [] },
    },
  ],
  trainingLogs: logs,
};

test("validateTimelineEvent accepts a valid refeed", () => {
  const event = {
    id: "new",
    kind: "refeed",
    startDate: "2026-10-31",
    endDate: "2026-11-01",
    note: "",
    nutritionOverride: { source: "mealPlan", optionId: "refeed" },
  };
  assert.equal(validateTimelineEvent(client, event), null);
});

test("validateTimelineEvent rejects end before start", () => {
  const event = {
    id: "new",
    kind: "deload",
    startDate: "2026-11-05",
    endDate: "2026-11-03",
    note: "",
  };
  assert.match(validateTimelineEvent(client, event), /end/i);
});

test("validateTimelineEvent rejects a refeed longer than 3 days", () => {
  const event = {
    id: "new",
    kind: "refeed",
    startDate: "2026-10-30",
    endDate: "2026-11-03",
    note: "",
  };
  assert.match(validateTimelineEvent(client, event), /3/);
});

test("validateTimelineEvent rejects overlapping same-kind events", () => {
  const event = {
    id: "new",
    kind: "refeed",
    startDate: "2026-10-24",
    endDate: "2026-10-25",
    note: "",
  };
  assert.match(validateTimelineEvent(client, event), /overlap/i);
  // Different kind may share the date.
  assert.equal(
    validateTimelineEvent(client, { ...event, kind: "diet-break" }),
    null,
  );
  // Editing the event itself does not collide with itself.
  assert.equal(
    validateTimelineEvent(client, client.timelineEvents[0], {
      ignoreId: "ev-refeed",
    }),
    null,
  );
});

test("validateTimelineEvent rejects an override option missing from the plan", () => {
  const event = {
    id: "new",
    kind: "diet-break",
    startDate: "2026-11-20",
    endDate: "2026-11-21",
    note: "",
    nutritionOverride: { source: "mealPlan", optionId: "missing" },
  };
  assert.match(validateTimelineEvent(client, event), /option|plan/i);
  // Deload carries no override.
  assert.equal(
    validateTimelineEvent(client, {
      ...event,
      kind: "deload",
      nutritionOverride: { source: "mealPlan", optionId: "missing" },
    }),
    null,
  );
});

test("eventsOnDate returns covering events only", () => {
  assert.deepEqual(
    eventsOnDate(client.timelineEvents, "2026-10-24").map((e) => e.id),
    ["ev-refeed"],
  );
  assert.deepEqual(
    eventsOnDate(client.timelineEvents, "2026-11-04").map((e) => e.id),
    ["ev-deload"],
  );
  assert.equal(eventsOnDate(client.timelineEvents, "2026-10-25").length, 0);
});

test("nutritionForDate returns the scheduled option on regular days", () => {
  // Friday 2026-10-23 → "train"
  const resolved = nutritionForDate(client, "2026-10-23");
  assert.equal(resolved.optionId, "train");
  assert.equal(resolved.label, "Training day");
  assert.equal(resolved.source, "mealPlan");
  assert.equal(resolved.event, undefined);
  // Saturday 2026-10-24 would be "rest" without the override.
  const overridden = nutritionForDate(client, "2026-10-24");
  assert.equal(overridden.optionId, "refeed");
  assert.equal(overridden.label, "Refeed day");
  assert.equal(overridden.event?.id, "ev-refeed");
});

test("nutritionForDate ignores deload events and wrong-source overrides", () => {
  const withDeload = nutritionForDate(client, "2026-11-03");
  assert.equal(withDeload.optionId, "train");
  assert.equal(withDeload.event, undefined);
  const iifymOnly = {
    ...client,
    timelineEvents: [
      {
        id: "ev-x",
        kind: "refeed",
        startDate: "2026-10-24",
        endDate: "2026-10-24",
        note: "",
        nutritionOverride: { source: "iifym", optionId: "opt" },
      },
    ],
  };
  assert.equal(nutritionForDate(iifymOnly, "2026-10-24").optionId, "rest");
});

test("weeksOut counts calendar weeks until the contest", () => {
  assert.equal(weeksOut("2026-11-29", TODAY), 6);
  assert.equal(weeksOut("2026-10-22", TODAY), 0);
  assert.equal(weeksOut(undefined, TODAY), undefined);
});

test("currentPhase returns the phase and week within it", () => {
  const phase = currentPhase(client.phasePlan, TODAY);
  assert.equal(phase.name, "Contest prep");
  assert.equal(phase.week, 2);
  assert.equal(phase.weeks, 6);
  assert.equal(currentPhase(client.phasePlan, "2027-02-01"), undefined);
});

test("attentionItems surfaces check-ins, flagged notes, missed and open sessions", () => {
  const items = attentionItems(state, client, TODAY);
  const kinds = items.map((item) => item.kind);
  assert.ok(kinds.includes("check-in"));
  assert.ok(kinds.includes("flagged-note"));
  assert.ok(kinds.includes("missed-session"));
  assert.ok(kinds.includes("in-progress"));
  const flagged = items.find((item) => item.kind === "flagged-note");
  assert.match(flagged.label, /Back squat/i);
  assert.match(flagged.detail, /knee pinch/i);
  const missed = items.find((item) => item.kind === "missed-session");
  assert.equal(missed.date, "2026-10-19");
  const unfinished = items.find((item) => item.kind === "in-progress");
  assert.equal(unfinished.label, "Unfinished session");
  assert.equal(unfinished.detail, "Started Wed 21 Oct · 1 of 2 sets");
});

test("attentionItems only lists unfinished sessions scheduled before today", () => {
  // On the day the session was started, it is a normal "today" session —
  // it only becomes attention-worthy once the scheduled date has passed.
  const sameDay = attentionItems(state, client, "2026-10-21");
  assert.equal(
    sameDay.some((item) => item.kind === "in-progress"),
    false,
  );
  const nextDay = attentionItems(state, client, "2026-10-22");
  assert.equal(
    nextDay.some(
      (item) => item.kind === "in-progress" && item.date === "2026-10-21",
    ),
    true,
  );
});

test("weekTrainingSummary counts the current week", () => {
  const summary = weekTrainingSummary(state, client, TODAY);
  assert.equal(summary.scheduled, 3);
  assert.equal(summary.done, 0);
  assert.equal(summary.inProgress, 1);
  assert.equal(summary.flagged, 1);
});

test("bodyweightSummary computes latest, averages and sparkline points", () => {
  const summary = bodyweightSummary(client, TODAY);
  assert.equal(summary.latest.value, 71.8);
  assert.ok(Math.abs(summary.avg7 - 71.875) < 0.01);
  // Prior 7-day window (Oct 9–15): (72.4 + 72.2 + 72.0) / 3 = 72.2
  assert.ok(Math.abs(summary.delta - (71.875 - 72.2)) < 0.01);
  assert.equal(summary.points.length, 7);
  assert.equal(summary.points.at(-1).date, "2026-10-21");
});

const RANGES = [
  { name: "Contest prep", startDate: "2026-09-11", endDate: "2026-12-18" },
  { name: "Peak week", startDate: "2026-12-19", endDate: "2026-12-25" },
  { name: "Post-show", startDate: "2026-12-26", endDate: "2027-01-22" },
];

test("timelineWindow: near term is 4 weeks back to 8 ahead, clipped to the plan", () => {
  const window = timelineWindow(TODAY, RANGES, false);
  assert.equal(window.start, "2026-09-24"); // today − 28 days
  assert.equal(window.end, "2026-12-17"); // today + 56 days (< plan end)
  assert.ok(window.start <= TODAY && window.end >= TODAY);
});

test("timelineWindow: near term clamps to the plan bounds", () => {
  // Plan starts after "4 weeks back" → window starts at the plan start.
  const early = timelineWindow(
    "2026-09-15",
    [{ name: "Base", startDate: "2026-09-11", endDate: "2026-10-09" }],
    false,
  );
  assert.equal(early.start, "2026-09-11");
  assert.equal(early.end, "2026-10-09"); // plan ends before today + 56
});

test("timelineWindow: full plan spans the whole phase plan", () => {
  const full = timelineWindow(TODAY, RANGES, true);
  assert.equal(full.start, "2026-09-11");
  assert.equal(full.end, "2027-01-22");
});

test("timelineWindow: no phase plan falls back around today", () => {
  const near = timelineWindow(TODAY, [], false);
  assert.equal(near.start, "2026-09-24");
  assert.equal(near.end, "2026-12-17");
  const full = timelineWindow(TODAY, [], true);
  // Fallback anchors to the current week (Monday 2026-10-19) plus 16 weeks.
  assert.equal(full.start, "2026-10-19");
  assert.equal(full.end, "2027-02-07");
});

test("timelineInWindow excludes ranges fully outside the window", () => {
  const window = timelineWindow(TODAY, RANGES, false);
  assert.equal(timelineInWindow(window, "2026-09-11", "2026-12-18"), true);
  assert.equal(timelineInWindow(window, "2026-12-19", "2026-12-25"), false);
  assert.equal(timelineInWindow(window, "2026-10-24", "2026-10-24"), true);
  assert.equal(timelineInWindow(window, "2026-08-01", "2026-08-20"), false);
});

test("timelineSegment clips to the window and returns left/width percents", () => {
  const window = timelineWindow(TODAY, RANGES, false); // 2026-09-24 → 2026-12-17, 84 days
  // Segment exceeding both edges: left 0, spans the whole window + 1 day.
  const whole = timelineSegment(window, "2026-09-11", "2026-12-18");
  assert.ok(whole);
  assert.equal(whole.left, 0);
  assert.ok(Math.abs(whole.width - (85 / 84) * 100) < 0.001);
  // Single-day event mid-window.
  const day = timelineSegment(window, "2026-10-22", "2026-10-22");
  assert.ok(day);
  assert.ok(Math.abs(day.left - (28 / 84) * 100) < 0.001);
  assert.ok(Math.abs(day.width - (1 / 84) * 100) < 0.001);
  // Fully outside → undefined.
  assert.equal(timelineSegment(window, "2026-12-19", "2026-12-25"), undefined);
});
