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
