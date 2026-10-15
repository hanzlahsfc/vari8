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
const clientsSource = await readFile(
  new URL("../../ethereal/clients/model.ts", import.meta.url),
  "utf8",
);
const clients = await import(
  moduleUrl(
    stripTypeScriptTypes(
      clientsSource.replace(
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
  `const createInitialClients = () => (${JSON.stringify(clients.createInitialClients())});`,
);
const coachModel = moduleUrl(
  stripTypeScriptTypes(coachModelSource, { mode: "strip" }).replaceAll(
    '"./builder/schema"',
    JSON.stringify(schema),
  ),
);
const trackerModel = moduleUrl(
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
    JSON.stringify(trackerModel),
  )
  .replaceAll('"../model"', JSON.stringify(coachModel));
const preview = moduleUrl(previewSource);
const viewSource = stripTypeScriptTypes(
  await readFile(new URL("./view-model.ts", import.meta.url), "utf8"),
  { mode: "strip" },
).replaceAll('"./preview-model"', JSON.stringify(preview));
const view = moduleUrl(viewSource);
const historySource = stripTypeScriptTypes(
  await readFile(new URL("./example-history.ts", import.meta.url), "utf8"),
  { mode: "strip" },
)
  .replaceAll('"../model"', JSON.stringify(coachModel))
  .replaceAll('"./view-model"', JSON.stringify(view))
  .replaceAll('"./preview-model"', JSON.stringify(preview));
const history = await import(moduleUrl(historySource));
const adapterSource = stripTypeScriptTypes(
  await readFile(new URL("./example-client.ts", import.meta.url), "utf8"),
  { mode: "strip" },
).replaceAll('"./example-history"', JSON.stringify(moduleUrl(historySource)));
const adapter = await import(moduleUrl(adapterSource));

test("projects the canonical 56-day history into a cloned dashboard client", () => {
  const client = {
    id: "sample-client",
    name: "Sample Client",
    entries: [
      {
        date: "2026-10-13",
        weight: 71.9,
        sleep: 7,
        steps: 8000,
        calories: 2200,
      },
    ],
    assignment: { id: "assignment" },
    schedules: [{ id: "schedule" }],
    plan: { calories: 2200 },
    habits: [{ id: "habit" }],
  };
  const config = {
    parameterIds: ["sleep", "weight"],
    weightUnit: "kg",
    lengthUnit: "cm",
    waterUnit: "L",
    ratingScale: "1-10",
  };
  const originalEntries = structuredClone(client.entries);
  const expectedIds = ["sleep", "weight", "steps", "calories"];
  const expected = history.createExampleHistory(
    { ...config, parameterIds: expectedIds },
    "2026-10-13",
  );
  const result = adapter.createExampleClient(client, config, "2026-10-13");

  assert.notEqual(result, client);
  assert.notEqual(result.entries, client.entries);
  assert.equal(result.entries.length, 56);
  assert.equal(result.entries[0].date, "2026-08-19");
  assert.equal(result.entries.at(-1).date, "2026-10-13");
  for (const [index, entry] of result.entries.entries()) {
    const values = expected.entries[index].values;
    assert.deepEqual(
      [entry.weight, entry.sleep, entry.steps, entry.calories],
      [values.weight, values.sleep, values.steps, values.calories],
    );
  }
  assert.equal(result.assignment, client.assignment);
  assert.equal(result.schedules, client.schedules);
  assert.equal(result.plan, client.plan);
  assert.equal(result.habits, client.habits);
  assert.deepEqual(client.entries, originalEntries);
  assert.deepEqual(config.parameterIds, ["sleep", "weight"]);
});
