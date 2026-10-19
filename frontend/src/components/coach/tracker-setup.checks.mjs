import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const fixture = JSON.parse(
  await readFile(new URL("../../data/mock-data.json", import.meta.url), "utf8"),
);
const legacySource = await readFile(
  new URL("../ethereal/clients/model.ts", import.meta.url),
  "utf8",
);
const legacyExecutable = stripTypeScriptTypes(
  legacySource.replace(
    /import \{[\s\S]*?\} from "@\/lib\/coaching-data";/,
    `const seedClients = ${JSON.stringify(fixture.clients)}; const clientProfile = ${JSON.stringify(fixture.clientProfile)};`,
  ),
  { mode: "strip" },
);
const legacy = await import(
  `data:text/javascript;base64,${Buffer.from(legacyExecutable).toString("base64")}`
);
const asModule = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const builderModel = asModule(
  stripTypeScriptTypes(
    await readFile(
      new URL("../ethereal/builder/model.ts", import.meta.url),
      "utf8",
    ),
    { mode: "strip" },
  ),
);
const builderGrid = asModule(
  stripTypeScriptTypes(
    await readFile(
      new URL("../ethereal/builder/grid.ts", import.meta.url),
      "utf8",
    ),
    { mode: "strip" },
  ),
);
const schemaSource = stripTypeScriptTypes(
  await readFile(new URL("./builder/schema.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll('"./model"', JSON.stringify(builderModel))
  .replaceAll('"./grid"', JSON.stringify(builderGrid));
const source = await readFile(new URL("./model.ts", import.meta.url), "utf8");
const shimmed = source.replace(
  /import \{[^}]*\} from "..\/ethereal\/clients\/model";/,
  `const createInitialClients = () => (${JSON.stringify(legacy.createInitialClients())});`,
);
const executable = stripTypeScriptTypes(shimmed, { mode: "strip" }).replaceAll(
  '"./builder/schema"',
  JSON.stringify(asModule(schemaSource)),
);
const m = await import(asModule(executable));
const overviewSource = stripTypeScriptTypes(
  await readFile(new URL("./tracker-setup.ts", import.meta.url), "utf8"),
  { mode: "strip" },
).replaceAll('"./model"', JSON.stringify(asModule(executable)));
const { trackerOverviewIds } = await import(asModule(overviewSource));
const configuration = () =>
  structuredClone(m.seedState().templates[0].variants[0]);

test("daily overview preserves legacy summaries without changing check-in configuration", () => {
  const config = configuration();
  config.fields = [
    { id: "weight", unit: "kg" },
    { id: "sleep", unit: "hours" },
    { id: "steps", unit: "steps" },
  ];
  config.summaries = ["sleep", "habits", "weight", "sleep"];
  const before = structuredClone(config);
  assert.deepEqual(trackerOverviewIds(config), ["sleep", "weight"]);
  assert.deepEqual(config, before);
  config.summaries = [];
  assert.deepEqual(trackerOverviewIds(config), ["weight", "sleep", "steps"]);
});

test("overview settings survive persistence and isolated assignment snapshots", () => {
  const state = m.seedState();
  state.templates[0].variants[0].trackerHighlights = ["steps", "calories"];
  assert.equal(m.isCoachState(state), true);
  const stored = JSON.parse(JSON.stringify(state));
  assert.equal(m.isCoachState(stored), true);
  assert.deepEqual(stored.templates[0].variants[0].trackerHighlights, [
    "steps",
    "calories",
  ]);
  const assigned = m.assignTemplate(
    state,
    state.clients[0].id,
    state.templates[0],
    state.templates[0].variants[0].id,
  );
  state.templates[0].variants[0].trackerHighlights.reverse();
  assert.deepEqual(
    assigned.clients[0].assignment.snapshot.variants[0].trackerHighlights,
    ["steps", "calories"],
  );
  for (const invalid of [null, "weight", [3], {}]) {
    stored.templates[0].variants[0].trackerHighlights = invalid;
    assert.equal(m.isCoachState(stored), false);
  }
});
