import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const fixture = JSON.parse(
  await readFile(new URL("../../../data/mock-data.json", import.meta.url), "utf8"),
);
const legacyClientSource = await readFile(
  new URL("../../ethereal/clients/model.ts", import.meta.url),
  "utf8",
);
const legacyClients = await import(
  moduleUrl(
    stripTypeScriptTypes(
      legacyClientSource.replace(
        /import \{[\s\S]*?\} from "@\/lib\/coaching-data";/,
        `const seedClients = ${JSON.stringify(fixture.clients)}; const clientProfile = ${JSON.stringify(fixture.clientProfile)};`,
      ),
      { mode: "strip" },
    ),
  )
);
const builderModel = moduleUrl(
  stripTypeScriptTypes(
    await readFile(new URL("../../ethereal/builder/model.ts", import.meta.url), "utf8"),
    { mode: "strip" },
  ),
);
const builderGrid = moduleUrl(
  stripTypeScriptTypes(
    await readFile(new URL("../../ethereal/builder/grid.ts", import.meta.url), "utf8"),
    { mode: "strip" },
  ),
);
const schemaSource = stripTypeScriptTypes(
  await readFile(new URL("../builder/schema.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll('"./model"', JSON.stringify(builderModel))
  .replaceAll('"./grid"', JSON.stringify(builderGrid));
const schema = moduleUrl(schemaSource);
const coachModelSource = (
  await readFile(new URL("../model.ts", import.meta.url), "utf8")
)
  .replace(
    /import \{[^}]*\} from "\.\.\/ethereal\/clients\/model";/,
    `const createInitialClients = () => (${JSON.stringify(legacyClients.createInitialClients())});`,
  );
const coachModel = moduleUrl(
  stripTypeScriptTypes(coachModelSource, { mode: "strip" }).replaceAll(
    '"./builder/schema"',
    JSON.stringify(schema),
  ),
);
const legacyTracker = moduleUrl(
  stripTypeScriptTypes(
    await readFile(new URL("../../ethereal/client-tracker/model.ts", import.meta.url), "utf8"),
    { mode: "strip" },
  ),
);
const previewSource = stripTypeScriptTypes(
  await readFile(new URL("./preview-model.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll('"@/components/ethereal/client-tracker/model"', JSON.stringify(legacyTracker))
  .replaceAll('"../model"', JSON.stringify(coachModel));
const previewModel = moduleUrl(previewSource);
const viewSource = stripTypeScriptTypes(
  await readFile(new URL("./view-model.ts", import.meta.url), "utf8"),
  { mode: "strip" },
).replaceAll('"./preview-model"', JSON.stringify(previewModel));
const view = await import(moduleUrl(viewSource));
const p = await import(previewModel);
const config = (overrides = {}) => ({
  parameterIds: [],
  weightUnit: "kg",
  lengthUnit: "cm",
  waterUnit: "L",
  ratingScale: "1-10",
  ...overrides,
});

test("UTC week navigation remains Monday-first across year, leap day, and DST boundaries", () => {
  assert.equal(view.mondayOf("2026-10-18"), "2026-10-12");
  assert.deepEqual(view.weekDates("2026-12-31"), [
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31",
    "2027-01-01", "2027-01-02", "2027-01-03",
  ]);
  assert.deepEqual(view.weekDates("2028-02-29"), [
    "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02",
    "2028-03-03", "2028-03-04", "2028-03-05",
  ]);
  assert.equal(view.addDays("2026-10-24", 1), "2026-10-25");
});

test("configured custom definitions retain their metadata and group order without fixed IDs", () => {
  const customOne = {
    id: "hydration-custom",
    label: "Hydration target",
    categoryId: "recovery",
    unit: "cups",
    kind: "number",
    summary: "total",
    decimals: 0,
    min: 0,
    max: 40,
  };
  const customTwo = {
    id: "gut-symptom-custom",
    label: "Gut symptoms",
    categoryId: "nutrition",
    unit: "",
    kind: "number",
    summary: "latest",
    decimals: 0,
    min: 0,
    max: 5,
    inputType: "choice",
    options: ["None", "Mild", "Strong"],
  };
  const cfg = config({
    parameterIds: ["hydration-custom", "weight", "gut-symptom-custom"],
    parameterDefinitions: [customOne, customTwo],
  });
  const groups = view.metricGroups(cfg, {
    "hydration-custom": "Daily basics",
    weight: "Measurements",
    "gut-symptom-custom": "Daily basics",
  });
  assert.deepEqual(groups.map((group) => group.label), ["Daily basics", "Measurements"]);
  assert.deepEqual(groups[0].parameters.map((parameter) => parameter.id), [
    "hydration-custom", "gut-symptom-custom",
  ]);
  assert.deepEqual(groups[0].parameters[0], customOne);
  assert.deepEqual(groups[0].parameters[1].options, ["None", "Mild", "Strong"]);
});

test("disabled cycle fields are removed while ordinary and custom health fields remain", () => {
  const customHealth = {
    id: "custom-health-score",
    label: "Recovery score",
    categoryId: "health",
    unit: "pts",
    kind: "number",
    summary: "average",
    decimals: 0,
    min: 0,
    max: 100,
  };
  const groups = view.metricGroups(config({
    parameterIds: ["period-start", "cycle-day", "weight", "custom-health-score"],
    cycleTrackingEnabled: false,
    parameterDefinitions: [customHealth],
  }));
  assert.deepEqual(groups.flatMap((group) => group.parameters.map((item) => item.id)), [
    "weight", "custom-health-score",
  ]);
});

test("pinned daily summaries preserve configured order and ignore removed and duplicate IDs", () => {
  const groups = view.metricGroups(config({ parameterIds: ["weight", "steps", "sleep"] }));
  const summaries = view.summaryParameters(groups, config({
    summaryParameterIds: ["steps", "removed-field", "weight", "steps", "sleep", "calories", "water"],
  }));
  assert.deepEqual(summaries.map((parameter) => parameter.id), [
    "steps", "weight", "sleep",
  ]);
});

test("zero is recorded, missing values are not, and numeric weekly summaries average observed values", () => {
  const steps = p.parameters.find((parameter) => parameter.id === "steps");
  const data = {
    config: config(),
    entries: [
      { date: "2026-10-12", values: { steps: 0 } },
      { date: "2026-10-13", values: { steps: 6000 } },
    ],
    textValues: {},
  };
  assert.equal(view.hasValue(steps, "2026-10-12", data), true);
  assert.equal(view.valueLabel(steps, "2026-10-12", data), p.formatValue(steps, 0, data.config));
  assert.equal(view.hasValue(steps, "2026-10-14", data), false);
  assert.deepEqual(view.weeklySummary(steps, ["2026-10-12", "2026-10-13", "2026-10-14"], data), {
    label: "Average",
    value: "3,000",
  });
  const empty = { ...data, entries: [] };
  assert.deepEqual(view.weeklySummary(steps, ["2026-10-12"], empty), {
    label: "Average", value: "—",
  });
});

test("weekly numeric aggregation follows each parameter's configured summary metadata", () => {
  const dates = ["2026-10-12", "2026-10-13", "2026-10-14"];
  const definitions = [
    {
      id: "custom-total",
      label: "Total cups",
      categoryId: "custom",
      unit: "cups",
      kind: "number",
      summary: "total",
      decimals: 0,
      min: 0,
      max: 100,
    },
    {
      id: "custom-latest",
      label: "Latest reading",
      categoryId: "custom",
      unit: "pts",
      kind: "number",
      summary: "latest",
      decimals: 0,
      min: 0,
      max: 100,
    },
    {
      id: "custom-average",
      label: "Average reading",
      categoryId: "custom",
      unit: "pts",
      kind: "number",
      summary: "average",
      decimals: 0,
      min: 0,
      max: 100,
    },
    {
      id: "custom-rating-distribution",
      label: "Readiness rating",
      categoryId: "custom",
      unit: "rating",
      kind: "rating",
      summary: "distribution",
      decimals: 0,
      min: 1,
      max: 10,
    },
  ];
  const cfg = config({
    parameterIds: definitions.map((parameter) => parameter.id),
    parameterDefinitions: definitions,
  });
  const data = {
    config: cfg,
    entries: [
      { date: dates[0], values: { "custom-total": 2, "custom-latest": 10, "custom-average": 0, "custom-rating-distribution": 2 } },
      { date: dates[1], values: { "custom-total": 3, "custom-latest": 20, "custom-average": null, "custom-rating-distribution": 2 } },
      { date: dates[2], values: { "custom-total": null, "custom-latest": 30, "custom-average": 6, "custom-rating-distribution": 9 } },
    ],
    textValues: {},
  };
  const [total, latest, average, distribution] = definitions;
  assert.deepEqual(view.weeklySummary(total, dates, data), { label: "Total", value: "5" });
  assert.deepEqual(view.weeklySummary(latest, dates, data), { label: "Latest", value: "30 pts" });
  assert.deepEqual(view.weeklySummary(average, dates, data), { label: "Average", value: "3" });
  assert.deepEqual(view.weeklySummary(distribution, dates, data), {
    label: "Most frequent", value: "2 / 10 · 2×",
  });
});

test("binary choices summarize recorded yes/no answers and other structured text stays unsummarized", () => {
  const illness = {
    id: "custom-symptom-present",
    label: "Symptom present",
    categoryId: "health",
    unit: "",
    kind: "number",
    summary: "latest",
    decimals: 0,
    min: 0,
    max: 1,
    inputType: "choice",
    options: ["No", "Yes"],
  };
  const note = p.parameters.find((parameter) => parameter.id === "daily-note");
  const days = ["2026-10-12", "2026-10-13", "2026-10-14"];
  const data = {
    config: config({
      parameterIds: [illness.id],
      parameterDefinitions: [illness],
      fieldOptions: { [illness.id]: ["No", "Yes"] },
    }),
    entries: [],
    textValues: {
      "2026-10-12:custom-symptom-present": "No",
      "2026-10-13:custom-symptom-present": "Yes",
      "2026-10-12:daily-note": "Slept poorly",
    },
  };
  assert.deepEqual(view.weeklySummary(illness, days, data), {
    label: "Completed / recorded", value: "1 / 2",
  });
  assert.deepEqual(view.weeklySummary(note, days, data), {
    label: "Summary", value: "—",
  });
});

test("cycle day derives from the latest period start on or before the selected date", () => {
  const cycleDay = p.parameters.find((parameter) => parameter.id === "cycle-day");
  const textValues = {
    "2026-10-02:period-start": "Yes",
    "2026-10-05:period-start": "No",
    "2026-10-08:period-start": "yes",
    "2026-10-20:period-start": "Yes",
  };
  assert.equal(view.textValueFor(cycleDay, "2026-10-07", textValues), "6");
  assert.equal(view.textValueFor(cycleDay, "2026-10-08", textValues), "1");
  assert.equal(view.textValueFor(cycleDay, "2026-10-19", textValues), "12");
  assert.equal(view.textValueFor(cycleDay, "2026-10-01", textValues), undefined);
  assert.equal(view.textSummary(cycleDay, "6", config()), "Day 6");
});

test("structured text summaries format configured time, choices, context, and malformed values safely", () => {
  const time = p.parameters.find((parameter) => parameter.id === "time");
  const choices = p.parameters.find((parameter) => parameter.id === "pms-symptoms");
  const context = p.parameters.find((parameter) => parameter.id === "illness");
  assert.equal(view.textSummary(time, "19:05", config({ fieldUnits: { time: "12-hour" } })), "7:05 PM");
  assert.equal(view.textSummary(choices, JSON.stringify({ choices: ["Cramps", "Fatigue"], note: "Mild" }), config()), "Cramps, Fatigue · Mild");
  assert.equal(view.textSummary(context, JSON.stringify({ answer: "Yes", context: "Headache" }), config()), "Yes · Headache");
  assert.equal(view.textSummary(choices, "legacy free text", config()), "legacy free text");
});

test("custom field units affect labels while generic custom values remain unconverted", () => {
  const custom = {
    id: "hydration-custom",
    label: "Hydration target",
    categoryId: "recovery",
    unit: "cups",
    kind: "number",
    summary: "average",
    decimals: 1,
    min: 0,
    max: 100,
  };
  const cfg = config({
    parameterIds: [custom.id],
    fieldUnits: { [custom.id]: "mugs" },
    parameterDefinitions: [custom],
  });
  const groups = view.metricGroups(cfg);
  const parameter = groups[0].parameters[0];
  const data = {
    config: cfg,
    entries: [{ date: "2026-10-13", values: { [custom.id]: 2.5 } }],
    textValues: {},
  };
  assert.equal(p.configuredUnit(parameter, cfg), "mugs");
  assert.equal(view.valueLabel(parameter, "2026-10-13", data), "2.5 mugs");
  assert.deepEqual(view.weeklySummary(parameter, ["2026-10-13"], data), {
    label: "Average", value: "2.5",
  });
});
