import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("./model.ts", import.meta.url), "utf8");
const executableSource = stripTypeScriptTypes(source, { mode: "strip" });
const model = await import(
  `data:text/javascript;base64,${Buffer.from(executableSource).toString("base64")}`
);

const parameter = (id) => model.parameters.find((item) => item.id === id);
const entry = (date, values) => ({ date, values });

test("weekly averages ignore missing readings and include a real zero", () => {
  const result = model.summarize(
    parameter("protein"),
    [
      entry("2026-10-05", { protein: 0 }),
      entry("2026-10-06", { protein: null }),
      entry("2026-10-07", {}),
      entry("2026-10-08", { protein: 20 }),
    ],
    model.defaultConfig,
  );

  assert.equal(result, "10 g");
  assert.equal(
    model.summarize(parameter("protein"), [], model.defaultConfig),
    "No entries",
  );
});

test("weekly averages and totals use only the week's recorded values", () => {
  const week = [
    entry("2026-10-05", { calories: 2000, steps: 1000, "active-minutes": 15 }),
    entry("2026-10-06", {
      calories: null,
      steps: 5000,
      "active-minutes": null,
    }),
    entry("2026-10-07", { calories: 2200, steps: null, "active-minutes": 25 }),
  ];

  assert.equal(
    model.summarize(parameter("calories"), week, model.defaultConfig),
    "2,100 kcal",
  );
  assert.equal(
    model.summarize(parameter("steps"), week, model.defaultConfig),
    "3,000 steps",
  );
  assert.equal(
    model.summarize(parameter("active-minutes"), week, model.defaultConfig),
    "40 min",
  );
});

test("unit preferences convert canonical weight, length, and fluid values for display", () => {
  const imperial = {
    ...model.defaultConfig,
    weightUnit: "lb",
    lengthUnit: "in",
    waterUnit: "fl oz",
  };

  assert.equal(
    model.formatValue(parameter("weight"), 70, imperial),
    "154.3 lb",
  );
  assert.equal(model.formatValue(parameter("waist"), 80, imperial), "31.5 in");
  assert.equal(
    model.formatValue(parameter("water"), 2, imperial),
    "67.6 fl oz",
  );
  assert.equal(
    model.formatValue(parameter("weight"), 70, model.defaultConfig),
    "70.0 kg",
  );
});

test("rating display and distributions follow the selected numeric scale", () => {
  const sleepQuality = parameter("sleep-quality");
  const ratings = [
    entry("2026-10-05", { "sleep-quality": 1 }),
    entry("2026-10-06", { "sleep-quality": 5.5 }),
    entry("2026-10-07", { "sleep-quality": 10 }),
  ];
  const fivePoint = { ...model.defaultConfig, ratingScale: "1-5" };

  assert.equal(model.formatValue(sleepQuality, 1, fivePoint), "1 / 5");
  assert.equal(model.formatValue(sleepQuality, 5.5, fivePoint), "3 / 5");
  assert.equal(model.formatValue(sleepQuality, 10, fivePoint), "5 / 5");
  assert.equal(
    model.summarize(sleepQuality, ratings, fivePoint),
    "Poor (1–2) 1 · Okay (3) 1 · Good (4–5) 1",
  );
});

test("word ratings retain their meaning and use a labelled distribution", () => {
  const sleepQuality = parameter("sleep-quality");
  const stress = parameter("stress");
  const words = { ...model.defaultConfig, ratingScale: "words" };
  const ratings = [
    entry("2026-10-05", { "sleep-quality": 2, stress: 2 }),
    entry("2026-10-06", { "sleep-quality": 6, stress: 6 }),
    entry("2026-10-07", { "sleep-quality": 9, stress: 9 }),
  ];

  assert.equal(model.formatValue(sleepQuality, 2, words), "Poor");
  assert.equal(model.formatValue(sleepQuality, 6, words), "Okay");
  assert.equal(model.formatValue(sleepQuality, 9, words), "Good");
  assert.equal(model.formatValue(stress, 2, words), "Low");
  assert.equal(model.formatValue(stress, 6, words), "Moderate");
  assert.equal(model.formatValue(stress, 9, words), "High");
  assert.equal(
    model.summarize(sleepQuality, ratings, words),
    "Poor 1 · Okay 1 · Good 1",
  );
  assert.equal(
    model.summarize(stress, ratings, words),
    "Low 1 · Moderate 1 · High 1",
  );
});

test("latest summaries select the most recent date regardless of input order", () => {
  const waist = parameter("waist");
  const week = [
    entry("2026-10-07", { waist: 78.5 }),
    entry("2026-10-05", { waist: 80 }),
    entry("2026-10-06", { waist: null }),
  ];

  assert.equal(model.summarize(waist, week, model.defaultConfig), "78.5 cm");
});

test("week ledger means override latest, total, and distribution preferences", () => {
  const week = [
    entry("2026-10-05", { waist: 80, "active-minutes": 0, "sleep-quality": 1 }),
    entry("2026-10-06", {
      waist: 78,
      "active-minutes": 30,
      "sleep-quality": 10,
    }),
    entry("2026-10-07", {
      waist: null,
      "active-minutes": null,
      "sleep-quality": null,
    }),
  ];
  assert.equal(
    model.weeklyAverage(parameter("waist"), week, model.defaultConfig),
    79,
  );
  assert.equal(
    model.weeklyAverage(parameter("active-minutes"), week, model.defaultConfig),
    15,
  );
  assert.equal(
    model.weeklyAverage(parameter("sleep-quality"), week, model.defaultConfig),
    5.5,
  );
  assert.equal(
    model.weeklyAverage(parameter("sleep-quality"), week, {
      ...model.defaultConfig,
      ratingScale: "1-5",
    }),
    3,
  );
  assert.equal(
    model.weeklyAverage(parameter("protein"), week, model.defaultConfig),
    null,
  );
});

test("week ledger means convert units and exclude invalid readings", () => {
  const week = [
    entry("2026-10-05", { weight: 60, protein: 0 }),
    entry("2026-10-06", { weight: 80, protein: 20 }),
    entry("2026-10-07", {
      weight: Number.NaN,
      protein: Number.POSITIVE_INFINITY,
    }),
  ];
  const result = model.weeklyAverage(parameter("weight"), week, {
    ...model.defaultConfig,
    weightUnit: "lb",
  });
  assert.ok(Math.abs(result - 70 * 2.20462) < 1e-9);
  assert.equal(
    model.weeklyAverage(parameter("protein"), week, model.defaultConfig),
    10,
  );
});

test("weekly deltas compare observed means in displayed units and omit unavailable comparisons", () => {
  const current = [
    entry("2026-10-05", { weight: 69, protein: 0 }),
    entry("2026-10-06", { weight: 71, protein: null }),
  ];
  const previous = [
    entry("2026-09-28", { weight: 71, protein: 20 }),
    entry("2026-09-29", { weight: 73, protein: null }),
  ];
  assert.equal(
    model.weeklyDifference(
      parameter("weight"),
      current,
      previous,
      model.defaultConfig,
    ),
    -2,
  );
  assert.equal(
    model.weeklyDifference(
      parameter("protein"),
      current,
      previous,
      model.defaultConfig,
    ),
    -20,
  );
  assert.equal(
    model.weeklyDifference(
      parameter("weight"),
      current,
      [],
      model.defaultConfig,
    ),
    null,
  );
  const lb = { ...model.defaultConfig, weightUnit: "lb" };
  assert.ok(
    Math.abs(
      model.weeklyDifference(parameter("weight"), current, previous, lb) -
        -2 * 2.20462,
    ) < 1e-9,
  );
});

test("weight deltas use the closest earlier recorded reading across missing days and week boundaries", () => {
  const history = [
    entry("2026-10-06", { weight: 71 }),
    entry("2026-10-01", { weight: 70 }),
    entry("2026-10-04", { weight: null }),
    entry("2026-10-05", { weight: 69.8 }),
    entry("2026-10-03", { weight: Number.NaN }),
  ];
  const difference = model.previousReadingDifference(
    parameter("weight"),
    "2026-10-05",
    history,
    model.defaultConfig,
  );
  assert.ok(Math.abs(difference - -0.2) < 1e-9);
  assert.equal(
    model.previousReadingDifference(
      parameter("weight"),
      "2026-10-01",
      history,
      model.defaultConfig,
    ),
    null,
  );
  assert.equal(
    model.previousReadingDifference(
      parameter("weight"),
      "2026-10-04",
      history,
      model.defaultConfig,
    ),
    null,
  );
});
