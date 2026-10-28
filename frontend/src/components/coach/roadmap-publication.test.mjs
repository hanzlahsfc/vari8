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
const configuration = {
  id: "maintenance",
  name: "Maintenance",
  nutrition: "IIFYM",
  views: ["Dashboard", "Nutrition"],
  habits: false,
  widgets: [],
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
  training: { fields: [], volume: false, breakdown: "", presentation: "" },
  questions: [],
  summaries: [],
};
const activeIifymPlan = {
  id: "iifym-plan",
  clientId: "athlete",
  name: "Maintenance targets",
  startDate: "2026-10-01",
  options: [
    {
      id: "training-day",
      label: "Training Day",
      targets: {
        style: "calories",
        calories: { kind: "fixed", value: 2200 },
        protein: { kind: "fixed", value: 140 },
      },
    },
  ],
  schedule: { mode: "manual", selectedVariantId: "training-day" },
};
const client = {
  phase: "Maintenance",
  assignment: {
    templateId: "strength",
    variantId: configuration.id,
    snapshot: {
      id: "strength",
      name: "Strength",
      description: "Assigned IIFYM setup",
      updated: "2026-10-01",
      defaultVariant: configuration.id,
      variants: [configuration],
    },
  },
  plans: {
    nutrition: {
      mealPlan: { history: [] },
      iifym: {
        active: {
          id: "active-iifym",
          content: activeIifymPlan,
          activatedAt: "2026-10-01T00:00:00.000Z",
        },
        history: [],
      },
    },
    training: { history: [] },
    goals: [],
  },
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
  assert.equal(rows[0].metrics[1].target, 2200);
  assert.equal(rows[0].metrics[2].value, null);
  assert.equal(rows[0].metrics[2].count, 0);
  assert.deepEqual(client, before);
});

test("adherence requires recorded values and an actual client target", () => {
  const variant = structuredClone(configuration);
  variant.roadmap[1].calculation = "Adherence";
  variant.roadmap[2].calculation = "Adherence";
  const rows = weeklyRoadmapRows(variant, client);
  assert.equal(rows[0].metrics[1].value, 50);
  assert.equal(rows[0].metrics[1].unit, "%");
  assert.equal(rows[1].metrics[1].value, 100);
  assert.equal(rows[0].metrics[2].value, null);
});

test("configured physical units convert actual observations and targets consistently", () => {
  const variant = structuredClone(configuration);
  variant.fields[0].unit = "lb";
  variant.fields[1].unit = "kJ";
  const rows = weeklyRoadmapRows(variant, client);
  assert.ok(Math.abs(rows[0].metrics[0].value - -0.2 * 2.20462) < 1e-10);
  assert.equal(rows[0].metrics[1].value, 2200 * 4.184);
  assert.equal(rows[0].metrics[1].target, 2200 * 4.184);
});

test("nutrition targets are absent before an active plan's start date", () => {
  const variant = structuredClone(configuration);
  variant.roadmap[1].calculation = "Adherence";
  const clientBeforePlanStart = structuredClone(client);
  clientBeforePlanStart.plans.nutrition.iifym.active.content.startDate =
    "2026-10-13";

  const rows = weeklyRoadmapRows(variant, clientBeforePlanStart);

  assert.equal(rows[0].metrics[1].target, null);
  assert.equal(rows[0].metrics[1].value, null);
  assert.equal(rows[1].metrics[1].target, null);
  assert.equal(rows[1].metrics[1].value, null);
});
