import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  activitySegments,
  addLocalDays,
  formatActivityTarget,
  isActivityTargetVersion,
  isLocalCalendarDate,
  localToday,
  mondayOf,
  resolveActivityTarget,
  validateActivityChange,
  writeActivityTarget,
} from "./model.ts";

const v = (id, effectiveFrom, metric, target) => ({
  id,
  effectiveFrom,
  metric,
  target,
});

test("four steps kinds format correctly and cardio keeps its weekly pair", () => {
  assert.equal(
    formatActivityTarget(
      v("a", "2026-10-21", "steps", { kind: "minimum", value: 8000 }),
    ),
    "Minimum 8,000 steps/day",
  );
  assert.equal(
    formatActivityTarget(
      v("a", "2026-10-21", "steps", { kind: "maximum", value: 10000 }),
    ),
    "Maximum 10,000 steps/day",
  );
  assert.equal(
    formatActivityTarget(
      v("a", "2026-10-21", "steps", { kind: "fixed", value: 9000 }),
    ),
    "Fixed 9,000 steps/day",
  );
  assert.equal(
    formatActivityTarget(
      v("a", "2026-10-21", "steps", { kind: "range", min: 8000, max: 10000 }),
    ),
    "8,000-10,000 steps/day",
  );
  assert.equal(
    formatActivityTarget(
      v("a", "2026-10-21", "cardio", {
        sessionsPerWeek: 5,
        minutesPerSession: 20,
      }),
    ),
    "5 x 20 min/week",
  );
  assert.equal(
    formatActivityTarget(
      v("a", "2026-10-21", "cardio", {
        sessionsPerWeek: 10,
        minutesPerSession: 12.5,
      }),
    ),
    "10 x 12.5 min/week",
  );
  assert.equal(
    formatActivityTarget(
      v("a", "2026-10-21", "cardio", {
        sessionsPerWeek: 5,
        minutesPerSession: 12.34567,
      }),
    ),
    "5 x 12.34567 min/week",
  );
  assert.equal(
    formatActivityTarget(
      v("a", "2026-10-21", "cardio", {
        sessionsPerWeek: 5,
        minutesPerSession: 0.00001,
      }),
    ),
    "5 x 0.00001 min/week",
  );
  assert.equal(formatActivityTarget(undefined), "No target prescribed");
  assert.equal(
    formatActivityTarget(v("a", "2026-10-21", "steps", null)),
    "No target prescribed",
  );
});

test("validation rejects malformed values while keeping whole/fractional rules", () => {
  const steps = (target) => validateActivityChange({ metric: "steps", target });
  assert.deepEqual(steps({ kind: "minimum", value: 8000 }), []);
  assert.deepEqual(steps({ kind: "maximum", value: 10000 }), []);
  assert.deepEqual(steps({ kind: "fixed", value: 9000 }), []);
  assert.deepEqual(steps({ kind: "range", min: 8000, max: 10000 }), []);
  assert.deepEqual(steps(null), []);
  for (const bad of [
    { kind: "minimum", value: 0 },
    { kind: "maximum", value: -5 },
    { kind: "fixed", value: 8.5 },
    { kind: "fixed", value: Number.POSITIVE_INFINITY },
    { kind: "range", min: 10000, max: 8000 },
    { kind: "range", min: 8000 },
    { kind: "range", min: 8000, max: Number.NaN },
    { kind: "diagonal", value: 5000 },
  ])
    assert.ok(steps(bad).length > 0, JSON.stringify(bad));
  const cardio = (target) =>
    validateActivityChange({ metric: "cardio", target });
  assert.deepEqual(cardio({ sessionsPerWeek: 5, minutesPerSession: 20 }), []);
  assert.deepEqual(
    cardio({ sessionsPerWeek: 10, minutesPerSession: 12.5 }),
    [],
  );
  assert.deepEqual(cardio(null), []);
  for (const bad of [
    { sessionsPerWeek: 5.5, minutesPerSession: 20 },
    { sessionsPerWeek: 0, minutesPerSession: 20 },
    { sessionsPerWeek: 5, minutesPerSession: 0 },
    { sessionsPerWeek: 5, minutesPerSession: -10 },
    { sessionsPerWeek: 5, minutesPerSession: Number.POSITIVE_INFINITY },
    { sessionsPerWeek: 5 },
  ])
    assert.ok(cardio(bad).length > 0, JSON.stringify(bad));
  assert.ok(
    validateActivityChange({ metric: "weird", target: null }).length > 0,
  );
});

test("a midweek change resolves by effective date while earlier days keep the old prescription", () => {
  const versions = [
    v("cardio-1", "2026-10-19", "cardio", {
      sessionsPerWeek: 3,
      minutesPerSession: 20,
    }),
    v("cardio-2", "2026-10-21", "cardio", {
      sessionsPerWeek: 5,
      minutesPerSession: 20,
    }),
  ];
  const at = (date) =>
    resolveActivityTarget({ versions, metric: "cardio", date });
  assert.equal(at("2026-10-18"), undefined);
  assert.equal(at("2026-10-19").id, "cardio-1");
  assert.equal(at("2026-10-20").id, "cardio-1");
  assert.equal(at("2026-10-21").id, "cardio-2");
  assert.equal(at("2026-10-25").id, "cardio-2");
  assert.equal(at("2026-12-31").id, "cardio-2");
});

test("weekly segments split on the change day and keep a leading no-target segment", () => {
  const versions = [
    v("cardio-1", "2026-10-19", "cardio", {
      sessionsPerWeek: 3,
      minutesPerSession: 20,
    }),
    v("cardio-2", "2026-10-21", "cardio", {
      sessionsPerWeek: 5,
      minutesPerSession: 20,
    }),
  ];
  const segments = activitySegments({
    versions,
    metric: "cardio",
    start: "2026-10-19",
    end: "2026-10-25",
  });
  assert.deepEqual(
    segments.map((s) => [s.start, s.end, s.version?.id]),
    [
      ["2026-10-19", "2026-10-20", "cardio-1"],
      ["2026-10-21", "2026-10-25", "cardio-2"],
    ],
  );
  assert.deepEqual(segments[0].version.target, {
    sessionsPerWeek: 3,
    minutesPerSession: 20,
  });
  const withGap = activitySegments({
    versions,
    metric: "cardio",
    start: "2026-10-18",
    end: "2026-10-19",
  });
  assert.deepEqual(
    withGap.map((s) => [s.start, s.end, s.version?.id ?? "none"]),
    [
      ["2026-10-18", "2026-10-18", "none"],
      ["2026-10-19", "2026-10-19", "cardio-1"],
    ],
  );
});

test("a stop wins from its date onward without reviving earlier targets or mutating inputs", () => {
  const versions = [
    v("steps-1", "2026-10-19", "steps", { kind: "minimum", value: 8000 }),
    v("steps-2", "2026-10-21", "steps", {
      kind: "range",
      min: 8000,
      max: 10000,
    }),
    v("steps-stop", "2026-10-23", "steps", null),
  ];
  const before = structuredClone(versions);
  const segments = activitySegments({
    versions,
    metric: "steps",
    start: "2026-10-19",
    end: "2026-10-25",
  });
  assert.deepEqual(
    segments.map((s) => [s.start, s.end, s.version?.id]),
    [
      ["2026-10-19", "2026-10-20", "steps-1"],
      ["2026-10-21", "2026-10-22", "steps-2"],
      ["2026-10-23", "2026-10-25", "steps-stop"],
    ],
  );
  assert.equal(
    resolveActivityTarget({ versions, metric: "steps", date: "2026-10-24" })
      .target,
    null,
  );
  assert.equal(
    resolveActivityTarget({ versions, metric: "steps", date: "2026-10-22" }).id,
    "steps-2",
  );
  assert.deepEqual(versions, before);
});

test("unsorted versions resolve by date and the last same-date entry wins", () => {
  const versions = [
    v("later", "2026-10-21", "steps", { kind: "minimum", value: 9000 }),
    v("earlier", "2026-10-19", "steps", { kind: "minimum", value: 8000 }),
  ];
  assert.equal(
    resolveActivityTarget({ versions, metric: "steps", date: "2026-10-20" }).id,
    "earlier",
  );
  assert.equal(
    resolveActivityTarget({ versions, metric: "steps", date: "2026-10-21" }).id,
    "later",
  );
  const tie = [
    v("first", "2026-10-21", "steps", { kind: "minimum", value: 8000 }),
    v("second", "2026-10-21", "steps", { kind: "minimum", value: 9000 }),
  ];
  assert.equal(
    resolveActivityTarget({
      versions: tie,
      metric: "steps",
      date: "2026-10-21",
    }).id,
    "second",
  );
});

test("same-day writes require confirmation and confirmed writes append without mutating inputs", () => {
  const versions = [
    v("steps-1", "2026-10-21", "steps", { kind: "minimum", value: 8000 }),
  ];
  const before = structuredClone(versions);
  const change = {
    metric: "steps",
    target: { kind: "range", min: 9000, max: 11000 },
  };
  const blocked = writeActivityTarget({
    versions,
    change,
    effectiveFrom: "2026-10-21",
    id: "steps-2",
  });
  assert.deepEqual(blocked, { kind: "confirmation-required" });
  assert.deepEqual(versions, before);
  const saved = writeActivityTarget({
    versions,
    change,
    effectiveFrom: "2026-10-21",
    id: "steps-2",
    confirmSameDay: true,
  });
  assert.equal(saved.kind, "saved");
  assert.equal(saved.versions.length, 2);
  assert.equal(saved.versions[1].id, "steps-2");
  assert.equal(
    resolveActivityTarget({
      versions: saved.versions,
      metric: "steps",
      date: "2026-10-21",
    }).id,
    "steps-2",
  );
  assert.deepEqual(versions, before);
  const fresh = writeActivityTarget({
    versions,
    change,
    effectiveFrom: "2026-10-22",
    id: "steps-3",
  });
  assert.equal(fresh.kind, "saved");
  const otherMetric = writeActivityTarget({
    versions,
    change: {
      metric: "cardio",
      target: { sessionsPerWeek: 3, minutesPerSession: 20 },
    },
    effectiveFrom: "2026-10-21",
    id: "cardio-1",
  });
  assert.equal(otherMetric.kind, "saved");
  const invalid = writeActivityTarget({
    versions,
    change: { metric: "steps", target: { kind: "fixed", value: 0 } },
    effectiveFrom: "2026-10-21",
    id: "bad",
  });
  assert.equal(invalid.kind, "invalid");
  const badDate = writeActivityTarget({
    versions,
    change,
    effectiveFrom: "2026-13-40",
    id: "x",
  });
  assert.equal(badDate.kind, "invalid");
});

test("localToday returns the local calendar day for the process timezone", () => {
  const moduleUrl = new URL("./model.ts", import.meta.url).href;
  for (const [tz, instant, expected] of [
    ["Pacific/Kiritimati", "2026-10-20T10:30:00Z", "2026-10-21"],
    ["Pacific/Honolulu", "2026-10-21T08:30:00Z", "2026-10-20"],
  ]) {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { localToday } from ${JSON.stringify(moduleUrl)};process.stdout.write(localToday(new Date(${JSON.stringify(instant)})));`,
      ],
      { env: { ...process.env, TZ: tz }, encoding: "utf8" },
    );
    assert.equal(output, expected, `${tz} at ${instant}`);
  }
});

test("saving before or after midnight uses the commit-time local date, not the draft-open date", () => {
  const draftOpened = localToday(new Date(2026, 9, 21, 23, 59));
  const change = {
    metric: "cardio",
    target: { sessionsPerWeek: 5, minutesPerSession: 20 },
  };
  const commitBefore = writeActivityTarget({
    versions: [],
    change,
    effectiveFrom: localToday(new Date(2026, 9, 21, 23, 59)),
    id: "late",
  });
  const commitAfter = writeActivityTarget({
    versions: [],
    change,
    effectiveFrom: localToday(new Date(2026, 9, 22, 0, 1)),
    id: "early",
  });
  assert.equal(commitBefore.versions[0].effectiveFrom, draftOpened);
  assert.equal(commitAfter.versions[0].effectiveFrom, "2026-10-22");
  assert.notEqual(commitAfter.versions[0].effectiveFrom, draftOpened);
});

test("saved-state guard accepts only well-formed dated versions", () => {
  assert.equal(
    isActivityTargetVersion(
      v("a", "2026-10-21", "steps", { kind: "range", min: 8000, max: 10000 }),
    ),
    true,
  );
  assert.equal(
    isActivityTargetVersion(
      v("a", "2026-10-21", "cardio", {
        sessionsPerWeek: 5,
        minutesPerSession: 20,
      }),
    ),
    true,
  );
  assert.equal(
    isActivityTargetVersion(v("a", "2026-10-21", "steps", null)),
    true,
  );
  for (const bad of [
    null,
    "x",
    [],
    {},
    v("", "2026-10-21", "steps", null),
    v("a", "21-10-2026", "steps", null),
    v("a", "2026-02-30", "steps", null),
    v("a", "2026-10-21", "sleep", null),
    v("a", "2026-10-21", "steps", { kind: "range", min: 9000, max: 8000 }),
    v("a", "2026-10-21", "steps", { kind: "fixed", value: 9.5 }),
    v("a", "2026-10-21", "steps", { kind: "minimum", value: 0 }),
    v("a", "2026-10-21", "cardio", {
      sessionsPerWeek: 5.5,
      minutesPerSession: 20,
    }),
    v("a", "2026-10-21", "cardio", {
      sessionsPerWeek: 5,
      minutesPerSession: 0,
    }),
    v("a", "2026-10-21", "cardio", {
      sessionsPerWeek: "5",
      minutesPerSession: 20,
    }),
    { id: "a", effectiveFrom: "2026-10-21", metric: "cardio" },
  ])
    assert.equal(isActivityTargetVersion(bad), false, JSON.stringify(bad));
});

test("calendar arithmetic stays Monday-first and DST-safe", () => {
  assert.equal(addLocalDays("2026-10-25", 1), "2026-10-26");
  assert.equal(addLocalDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addLocalDays("2028-02-28", 1), "2028-02-29");
  assert.equal(mondayOf("2026-10-21"), "2026-10-19");
  assert.equal(mondayOf("2026-10-25"), "2026-10-19");
  assert.equal(mondayOf("2026-10-19"), "2026-10-19");
  assert.equal(isLocalCalendarDate("2026-10-21"), true);
  assert.equal(isLocalCalendarDate("2026-02-30"), false);
  assert.equal(isLocalCalendarDate("21-10-2026"), false);
});
