import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("./roadmap-preview.ts", import.meta.url), "utf8");
const code = stripTypeScriptTypes(source, { mode: "strip" });
const { weeklyRoadmapRows } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const client = {
  phase: "Maintenance", plan: { calories: 2200, protein: 140 },
  entries: [
    { date: "2026-10-06", weight: 69.8, sleep: 8, steps: 9000, calories: 2300 },
    { date: "2026-10-05", weight: 70, sleep: 7, steps: 7000, calories: 2100 },
    { date: "2026-10-12", weight: 69.5, sleep: 7.5, steps: 8000, calories: 2400 },
  ],
};
const configuration = {
  fields: [
    { id: "weight", unit: "kg" }, { id: "calories", unit: "kcal" },
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
  assert.deepEqual(rows.map((row) => [row.start, row.end]), [
    ["2026-10-05", "2026-10-11"], ["2026-10-12", "2026-10-18"],
  ]);
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
  assert.ok(Math.abs(rows[0].metrics[0].value - (-0.2 * 2.20462)) < 1e-10);
  assert.equal(rows[0].metrics[1].value, 2200 * 4.184);
  assert.equal(rows[0].metrics[1].target, 2200 * 4.184);
});
