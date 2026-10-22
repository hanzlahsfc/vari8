import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(
  new URL("./roadmap-preview.ts", import.meta.url),
  "utf8",
);
const domainUrl = new URL("./plans/domain.ts", import.meta.url).href;
const targetsUrl = new URL("./targets/model.ts", import.meta.url).href;
const code = stripTypeScriptTypes(source, { mode: "strip" })
  .replaceAll('"./plans/domain"', JSON.stringify(domainUrl))
  .replaceAll('"./targets/model"', JSON.stringify(targetsUrl));
const { weeklyRoadmapRows } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const client = {
  phase: "Maintenance",
  plan: { calories: 2200, protein: 140 },
  entries: [
    { date: "2026-10-06", weight: 69.8, sleep: 8, steps: 9000, calories: 2300 },
    { date: "2026-10-05", weight: 70, sleep: 7, steps: 7000, calories: 2100 },
    {
      date: "2026-10-12",
      weight: 69.5,
      sleep: 7.5,
      steps: 8000,
      calories: 2400,
    },
  ],
};
const configuration = {
  fields: [
    { id: "weight", unit: "kg" },
    { id: "calories", unit: "kcal" },
    { id: "rhr", unit: "bpm" },
  ],
  roadmap: [
    { source: "weight", calculation: "Trend", comparison: false },
    { source: "calories", calculation: "Weekly average", comparison: true },
    { source: "rhr", calculation: "Weekly average", comparison: false },
  ],
};

test("roadmap uses separate observed weeks rather than repeating a synthetic average", () => {
  const before = structuredClone(client);
  const rows = weeklyRoadmapRows(configuration, client);
  assert.deepEqual(
    rows.map((row) => [row.start, row.end]),
    [
      ["2026-10-05", "2026-10-11"],
      ["2026-10-12", "2026-10-18"],
    ],
  );
  assert.equal(rows[0].phase, "Maintenance");
  assert.ok(Math.abs(rows[0].metrics[0].value + 0.2) < 1e-10);
  assert.equal(rows[1].metrics[0].value, null);
  assert.equal(rows[0].metrics[1].value, 2200);
  assert.equal(rows[1].metrics[1].value, 2400);
  assert.equal(rows[0].metrics[1].target, null);
  assert.equal(rows[0].metrics[2].value, null);
  assert.equal(rows[0].metrics[2].count, 0);
  assert.deepEqual(client, before);
});

test("a legacy scalar summary does not invent roadmap targets", () => {
  const variant = structuredClone(configuration);
  variant.roadmap[1].calculation = "Adherence";
  variant.roadmap[2].calculation = "Adherence";
  const rows = weeklyRoadmapRows(variant, client);
  assert.equal(rows[0].metrics[1].value, null);
  assert.equal(rows[0].metrics[1].unit, "%");
  assert.equal(rows[1].metrics[1].value, null);
  assert.equal(rows[0].metrics[1].target, null);
  assert.equal(rows[0].metrics[2].value, null);
});

test("configured physical units convert actual observations and targets consistently", () => {
  const variant = structuredClone(configuration);
  variant.fields[0].unit = "lb";
  variant.fields[1].unit = "kJ";
  const rows = weeklyRoadmapRows(variant, client);
  assert.ok(Math.abs(rows[0].metrics[0].value - -0.2 * 2.20462) < 1e-10);
  assert.equal(rows[0].metrics[1].value, 2200 * 4.184);
  assert.equal(rows[0].metrics[1].target, null);
});

const planningClient = {
  phase: "Maintenance",
  plan: { calories: 2200, protein: 140 },
  entries: [],
  plans: {
    activityTargets: [
      {
        id: "cardio-oct19",
        effectiveFrom: "2026-10-19",
        metric: "cardio",
        target: { sessionsPerWeek: 3, minutesPerSession: 20 },
      },
      {
        id: "cardio-oct21",
        effectiveFrom: "2026-10-21",
        metric: "cardio",
        target: { sessionsPerWeek: 5, minutesPerSession: 20 },
      },
      {
        id: "steps-oct19",
        effectiveFrom: "2026-10-19",
        metric: "steps",
        target: { kind: "minimum", value: 8000 },
      },
      {
        id: "steps-oct21",
        effectiveFrom: "2026-10-21",
        metric: "steps",
        target: { kind: "range", min: 8000, max: 10000 },
      },
    ],
  },
};

test("selected activity planning projects dated midweek segments without actual entries", () => {
  const variant = {
    fields: [],
    roadmap: [],
    roadmapActivityTargets: ["steps", "cardio"],
  };
  const rows = weeklyRoadmapRows(variant, planningClient, {
    asOf: "2026-10-21",
  });
  assert.deepEqual(
    rows.map((row) => [row.start, row.end]),
    [["2026-10-19", "2026-10-25"]],
  );
  assert.deepEqual(rows[0].metrics, []);
  const steps = rows[0].activityTargets.find((row) => row.metric === "steps");
  assert.deepEqual(
    steps.segments.map((s) => [s.start, s.end, s.version?.id ?? null]),
    [
      ["2026-10-19", "2026-10-20", "steps-oct19"],
      ["2026-10-21", "2026-10-25", "steps-oct21"],
    ],
  );
  assert.equal(steps.segments[1].version.target.kind, "range");
  const cardio = rows[0].activityTargets.find((row) => row.metric === "cardio");
  assert.deepEqual(
    cardio.segments.map((s) => [
      s.start,
      s.end,
      s.version?.target?.sessionsPerWeek ?? null,
      s.version?.target?.minutesPerSession ?? null,
    ]),
    [
      ["2026-10-19", "2026-10-20", 3, 20],
      ["2026-10-21", "2026-10-25", 5, 20],
    ],
  );
});

test("deselected planning metrics stay absent and stops keep explicit stopped segments", () => {
  const stopped = structuredClone(planningClient);
  stopped.plans.activityTargets.push({
    id: "cardio-stop",
    effectiveFrom: "2026-10-23",
    metric: "cardio",
    target: null,
  });
  const variant = {
    fields: [],
    roadmap: [],
    roadmapActivityTargets: ["cardio"],
  };
  const rows = weeklyRoadmapRows(variant, stopped, { asOf: "2026-10-21" });
  assert.deepEqual(
    rows[0].activityTargets.map((entry) => entry.metric),
    ["cardio"],
  );
  const cardio = rows[0].activityTargets[0];
  assert.deepEqual(
    cardio.segments.map((s) => [s.start, s.end, s.version?.id ?? null]),
    [
      ["2026-10-19", "2026-10-20", "cardio-oct19"],
      ["2026-10-21", "2026-10-22", "cardio-oct21"],
      ["2026-10-23", "2026-10-25", "cardio-stop"],
    ],
  );
  assert.equal(cardio.segments[2].version.target, null);
});

test("planning unions observed, version and current weeks while unselected configs stay observed-only", () => {
  const observedOnly = weeklyRoadmapRows(configuration, client, {
    asOf: "2026-10-21",
  });
  assert.deepEqual(
    observedOnly.map((row) => row.start),
    ["2026-10-05", "2026-10-12"],
  );
  assert.deepEqual(observedOnly[0].activityTargets, []);
  const variant = {
    fields: [],
    roadmap: [],
    roadmapActivityTargets: ["steps"],
  };
  const emptyClient = { phase: "Maintenance", plan: client.plan, entries: [] };
  const rows = weeklyRoadmapRows(variant, emptyClient, { asOf: "2026-10-21" });
  assert.deepEqual(
    rows.map((row) => [row.start, row.end]),
    [["2026-10-19", "2026-10-25"]],
  );
  const steps = rows[0].activityTargets.find((row) => row.metric === "steps");
  assert.deepEqual(steps.segments, [
    { start: "2026-10-19", end: "2026-10-25", version: undefined },
  ]);
});

test("structured activity versions suppress scalar goal targets and adherence on activity fields", () => {
  const variant = structuredClone(configuration);
  variant.fields.push({ id: "steps", unit: "steps" });
  variant.roadmap.push({
    source: "steps",
    calculation: "Adherence",
    comparison: true,
  });
  const structured = {
    ...client,
    plans: {
      goals: [
        {
          id: "g1",
          fieldId: "steps",
          value: 7000,
          unit: "steps",
          date: "2026-10-01",
        },
      ],
      activityTargets: [
        {
          id: "steps-oct01",
          effectiveFrom: "2026-10-01",
          metric: "steps",
          target: { kind: "minimum", value: 8000 },
        },
      ],
    },
  };
  const structuredMetric = weeklyRoadmapRows(variant, structured)[0].metrics.at(
    -1,
  );
  assert.equal(structuredMetric.target, null);
  assert.equal(structuredMetric.value, null);
  const legacy = {
    ...client,
    plans: {
      goals: [
        {
          id: "g1",
          fieldId: "steps",
          value: 7000,
          unit: "steps",
          date: "2026-10-01",
        },
      ],
    },
  };
  const legacyMetric = weeklyRoadmapRows(variant, legacy)[0].metrics.at(-1);
  assert.equal(legacyMetric.target, 7000);
  assert.ok(legacyMetric.value > 0);
});
