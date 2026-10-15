import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const fixture = JSON.parse(
  await readFile(
    new URL("../../../data/mock-data.json", import.meta.url),
    "utf8",
  ),
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
    await readFile(
      new URL("../../ethereal/builder/model.ts", import.meta.url),
      "utf8",
    ),
    { mode: "strip" },
  ),
);
const builderGrid = moduleUrl(
  stripTypeScriptTypes(
    await readFile(
      new URL("../../ethereal/builder/grid.ts", import.meta.url),
      "utf8",
    ),
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
).replace(
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
    await readFile(
      new URL("../../ethereal/client-tracker/model.ts", import.meta.url),
      "utf8",
    ),
    { mode: "strip" },
  ),
);
const previewSource = stripTypeScriptTypes(
  await readFile(new URL("./preview-model.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll(
    '"@/components/ethereal/client-tracker/model"',
    JSON.stringify(legacyTracker),
  )
  .replaceAll('"../model"', JSON.stringify(coachModel));
const preview = moduleUrl(previewSource);
const viewSource = stripTypeScriptTypes(
  await readFile(new URL("./view-model.ts", import.meta.url), "utf8"),
  { mode: "strip" },
).replaceAll('"./preview-model"', JSON.stringify(preview));
const view = await import(moduleUrl(viewSource));
const historySource = stripTypeScriptTypes(
  await readFile(new URL("./example-history.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll('"../model"', JSON.stringify(coachModel))
  .replaceAll('"./view-model"', JSON.stringify(moduleUrl(viewSource)))
  .replaceAll('"./preview-model"', JSON.stringify(preview));
const history = await import(moduleUrl(historySource));
const p = await import(preview);

const base = {
  parameterIds: [],
  weightUnit: "kg",
  lengthUnit: "cm",
  waterUnit: "L",
  ratingScale: "1-10",
};

test("creates deterministic, consecutive 56-day history ending on asOf", () => {
  const config = { ...base, parameterIds: ["weight", "sleep", "steps"] };
  const first = history.createExampleHistory(config, "2026-10-13");
  const second = history.createExampleHistory(config, "2026-10-13");
  assert.deepEqual(first, second);
  assert.equal(first.entries.length, 56);
  assert.equal(first.entries[0].date, "2026-08-19");
  assert.equal(first.entries.at(-1).date, "2026-10-13");
  for (const entry of first.entries) {
    assert.ok(entry.values.sleep >= 6 && entry.values.sleep <= 9);
  }
  for (let index = 1; index < first.entries.length; index += 1) {
    assert.equal(
      Date.parse(`${first.entries[index].date}T00:00:00Z`) -
        Date.parse(`${first.entries[index - 1].date}T00:00:00Z`),
      86_400_000,
    );
  }
});

test("fills each configured input type using its canonical and structured format", () => {
  const ids = [
    "weight",
    "time",
    "sleep",
    "hunger",
    "bedtime",
    "bp",
    "daily-note",
    "cardio-type",
    "pms-symptoms",
    "muscle-soreness",
    "travel-day",
    "period-start",
    "cycle-day",
  ];
  const config = { ...base, parameterIds: ids };
  const { entries, textValues } = history.createExampleHistory(
    config,
    "2026-10-13",
  );
  const values = entries.at(-1).values;
  assert.deepEqual(Object.keys(values).sort(), ["hunger", "sleep", "weight"]);
  assert.match(textValues["2026-10-13:time"], /^\d{2}:\d{2}$/);
  assert.equal(textValues["2026-10-13:bp"], "118/76");
  assert.ok(textValues["2026-10-13:daily-note"]);
  assert.ok(
    ["Walking", "Running", "Cycling", "Swimming", "Other"].includes(
      textValues["2026-10-13:cardio-type"],
    ),
  );
  const multi = JSON.parse(textValues["2026-10-13:pms-symptoms"]);
  assert.ok(multi.choices.length > 0);
  assert.ok(
    multi.choices.every((choice) =>
      p.parameters
        .find((item) => item.id === "pms-symptoms")
        .options.includes(choice),
    ),
  );
  const location = JSON.parse(textValues["2026-10-13:muscle-soreness"]);
  assert.equal(typeof location.location, "string");
  assert.ok(location.rating >= 1 && location.rating <= 10);
  const context = JSON.parse(textValues["2026-10-13:travel-day"]);
  assert.ok(["No", "Yes"].includes(context.answer));
  assert.equal(textValues["2026-10-13:period-start"], "no");
  assert.equal(textValues["2026-08-19:period-start"], "yes");
  assert.equal(textValues["2026-10-13:cycle-day"], undefined);
  assert.equal(
    view.textValueFor(
      p.parameters.find((item) => item.id === "cycle-day"),
      "2026-10-13",
      textValues,
    ),
    "28",
  );
});

test("respects custom bounds, decimals, valid configured choices, and zero", () => {
  const definitions = [
    {
      id: "custom-zero",
      label: "Zero is valid",
      categoryId: "custom",
      unit: "pts",
      kind: "number",
      summary: "average",
      decimals: 2,
      min: 0,
      max: 0,
    },
    {
      id: "custom-count",
      label: "Custom count",
      categoryId: "custom",
      unit: "items",
      kind: "number",
      summary: "average",
      decimals: 0,
      min: 2,
      max: 5,
    },
    {
      id: "custom-option",
      label: "Custom option",
      categoryId: "custom",
      unit: "",
      kind: "number",
      summary: "latest",
      decimals: 0,
      min: 0,
      max: 2,
      inputType: "choice",
      options: ["Easy", "Steady", "Hard"],
    },
  ];
  const config = {
    ...base,
    parameterIds: definitions.map((item) => item.id),
    parameterDefinitions: definitions,
    fieldOptions: { "custom-option": ["Easy", "Steady"] },
  };
  const { entries, textValues } = history.createExampleHistory(
    config,
    "2026-10-13",
  );
  for (const entry of entries) {
    assert.equal(entry.values["custom-zero"], 0);
    assert.ok(
      entry.values["custom-count"] >= 2 && entry.values["custom-count"] <= 5,
    );
    assert.equal(Number.isInteger(entry.values["custom-count"]), true);
    assert.ok(
      ["Easy", "Steady"].includes(textValues[`${entry.date}:custom-option`]),
    );
  }
});

test("uses only active fields and leaves the caller's config untouched", () => {
  const config = structuredClone({
    ...base,
    parameterIds: ["weight", "removed-field", "daily-note", "cycle-day"],
    cycleTrackingEnabled: false,
  });
  const before = structuredClone(config);
  const result = history.createExampleHistory(config, "2028-02-29");
  assert.deepEqual(config, before);
  assert.deepEqual(Object.keys(result.entries[0].values), ["weight"]);
  assert.deepEqual(
    Object.keys(result.textValues).filter((key) => key.endsWith(":cycle-day")),
    [],
  );
  assert.ok(
    Object.keys(result.textValues).every((key) => key.endsWith(":daily-note")),
  );
});

test("derives every cycle day when cycle-day is configured without period-start", () => {
  const result = history.createExampleHistory(
    {
      ...base,
      parameterIds: ["cycle-day"],
    },
    "2026-10-13",
  );
  const cycleDay = p.parameters.find((item) => item.id === "cycle-day");
  const labels = result.entries.map((entry) =>
    view.textValueFor(cycleDay, entry.date, result.textValues),
  );
  assert.equal(labels.every(Boolean), true);
  assert.equal(labels[0], "1");
  assert.equal(labels[27], "28");
  assert.equal(labels[28], "1");
  assert.equal(labels[55], "28");
  assert.equal(
    Object.keys(result.textValues).filter((key) =>
      key.endsWith(":period-start"),
    ).length,
    2,
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.values),
    Array(56).fill({}),
  );
});

test("does not fabricate a choice when the configured option list is empty", () => {
  const definition = {
    id: "custom-choice",
    label: "Custom choice",
    categoryId: "custom",
    unit: "",
    kind: "number",
    summary: "latest",
    decimals: 0,
    min: 0,
    max: 1,
    inputType: "choice",
    options: [],
  };
  const result = history.createExampleHistory(
    {
      ...base,
      parameterIds: [definition.id],
      parameterDefinitions: [definition],
    },
    "2026-10-13",
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.values),
    Array(56).fill({}),
  );
  assert.deepEqual(result.textValues, {});
});
