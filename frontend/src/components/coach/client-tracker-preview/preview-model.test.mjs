import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const legacy = moduleUrl(
  stripTypeScriptTypes(
    await readFile(
      new URL("../../ethereal/client-tracker/model.ts", import.meta.url),
      "utf8",
    ),
    { mode: "strip" },
  ),
);
const coachModel = moduleUrl(`
  const parameter = (id, name, group, units, sample, inputType) => ({ id, name, group, units, sample, calculations: [], inputType });
  export const PARAMETERS = [
    parameter("weight", "Bodyweight", "Weight basics", ["kg", "lb"], 64.2),
    parameter("calories", "Energy intake", "Nutrition", ["kcal", "kJ"], 2180),
    parameter("stress", "Stress", "Recovery", ["1–10", "1–5", "Word labels"], 4),
  ];
  export const ALL_PARAMETERS = PARAMETERS;
  export const allParameters = () => [...PARAMETERS];
  export const getParameter = (id) => PARAMETERS.find((item) => item.id === id);
`);
const source = stripTypeScriptTypes(
  await readFile(new URL("./preview-model.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll(
    '"@/components/ethereal/client-tracker/model"',
    JSON.stringify(legacy),
  )
  .replaceAll('"../model"', JSON.stringify(coachModel));
const m = await import(moduleUrl(source));
const config = {
  parameterIds: ["weight", "calories", "stress"],
  weightUnit: "kg",
  lengthUnit: "cm",
  waterUnit: "L",
  ratingScale: "1-10",
  energyUnit: "kJ",
  ratingScales: { stress: "1-5", energy: "words" },
};
const calorie = m.parameters.find((parameter) => parameter.id === "calories");
const weight = m.parameters.find((parameter) => parameter.id === "weight");
const stress = m.parameters.find((parameter) => parameter.id === "stress");

test("calorie readings, headers, means, trends and edits all use the selected energy unit", () => {
  const entries = [
    { date: "2026-10-05", values: { calories: 2100 } },
    { date: "2026-10-06", values: { calories: 2300 } },
  ];
  const previous = [{ date: "2026-09-29", values: { calories: 2000 } }];
  assert.ok(
    Math.abs(m.displayedValue(calorie, 2200, config) - 2200 * 4.184) < 1e-9,
  );
  assert.equal(m.configuredUnit(calorie, config), "kJ");
  assert.equal(m.formatValue(calorie, 2200, config), "9,205 kJ");
  assert.ok(
    Math.abs(m.weeklyAverage(calorie, entries, config) - 2200 * 4.184) < 1e-9,
  );
  assert.ok(
    Math.abs(
      m.weeklyDifference(calorie, entries, previous, config) - 200 * 4.184,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      m.previousReadingDifference(calorie, "2026-10-06", entries, config) -
        200 * 4.184,
    ) < 1e-9,
  );
  assert.equal(m.canonicalEnergyValue(2200 * 4.184, config), 2200);
  const kcal = { ...config, energyUnit: "kcal" };
  assert.equal(m.displayedValue(calorie, 2200, kcal), 2200);
  assert.equal(m.configuredUnit(calorie, kcal), "kcal");
});

test("per-field ratings do not inherit another field's word-label setting", () => {
  assert.equal(m.fieldTrackerConfig(stress, config).ratingScale, "1-5");
  assert.equal(m.configuredUnit(stress, config), "1–5");
  assert.equal(m.formatValue(stress, 10, config), "5 / 5");
  assert.equal(
    m.formatValue(stress, 10, { ...config, ratingScales: { stress: "words" } }),
    "High",
  );
  assert.equal(config.ratingScale, "1-10");
});

test("existing weight conversions remain delegated to the original tracker helpers", () => {
  const pounds = { ...config, weightUnit: "lb" };
  const values = [
    { date: "2026-10-05", values: { weight: 70 } },
    { date: "2026-10-06", values: { weight: 69 } },
  ];
  assert.ok(
    Math.abs(m.displayedValue(weight, 70, pounds) - 70 * 2.20462) < 0.001,
  );
  assert.ok(
    Math.abs(m.weeklyAverage(weight, values, pounds) - 69.5 * 2.20462) < 0.001,
  );
  assert.equal(m.weeklyAverage(weight, [], pounds), null);
});

test("timeline parameter defaults sum steps and cardio, average ratings", () => {
  assert.equal(
    m.defaultTimelineAggregation({
      id: "steps",
      units: ["steps"],
      sample: 0,
      calculations: [],
      name: "Steps",
      group: "Movement",
    }),
    "sum",
  );
  assert.equal(
    m.defaultTimelineAggregation({
      id: "cardio-duration",
      units: ["minutes"],
      sample: 0,
      calculations: [],
      name: "Cardio",
      group: "Movement",
    }),
    "sum",
  );
  assert.equal(
    m.defaultTimelineAggregation({
      id: "stress",
      units: ["1–10"],
      sample: 0,
      calculations: [],
      name: "Stress",
      group: "Recovery",
    }),
    "avg",
  );
  assert.equal(
    m.defaultTimelineAggregation({
      id: "custom-1",
      units: ["kg"],
      sample: 0,
      calculations: [],
      name: "Volume",
      group: "Body",
      custom: true,
      summary: "sum",
    }),
    "sum",
  );
  assert.equal(
    m.defaultTimelineAggregation({
      id: "custom-2",
      units: [],
      sample: 0,
      calculations: [],
      name: "Note",
      group: "Body",
      custom: true,
      summary: "none",
    }),
    "last",
  );
});
