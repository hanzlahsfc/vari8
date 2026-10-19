import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("./model.ts", import.meta.url), "utf8");
const fixture = JSON.parse(
  await readFile(
    new URL("../../../data/mock-data.json", import.meta.url),
    "utf8",
  ),
);
const importBlock =
  /import \{\s*type Client,\s*clientProfile,\s*clients as seedClients,\s*\} from "@\/lib\/coaching-data";/;
assert.match(
  source,
  importBlock,
  "coaching-data import shape changed; update this test shim",
);
const fixtureShim = `const seedClients = ${JSON.stringify(fixture.clients)};\nconst clientProfile = ${JSON.stringify(fixture.clientProfile)};`;
const executableSource = stripTypeScriptTypes(
  source.replace(importBlock, fixtureShim),
  { mode: "strip" },
);
const model = await import(
  `data:text/javascript;base64,${Buffer.from(executableSource).toString("base64")}`
);

test("each client collection is a deep independent copy of the fixtures", () => {
  const first = model.createInitialClients();
  first[0].internalNotes[0].text = "Changed in this view";
  first[0].clientTasks[0].title = "Changed task";
  first[0].weightTrend[0].kg = -1;

  const second = model.createInitialClients();
  assert.notEqual(first[0], second[0]);
  assert.notEqual(first[0].internalNotes, second[0].internalNotes);
  assert.equal(
    second[0].internalNotes[0].text,
    "Review split-squat setup before increasing load.",
  );
  assert.equal(second[0].clientTasks[0].title, "Upload training log");
  assert.equal(second[0].weightTrend[0].kg, 72.5);
});

test("overdue task totals match each client's actual task statuses", () => {
  for (const client of model.createInitialClients()) {
    assert.equal(
      client.overdueTaskCount,
      client.clientTasks.filter((task) => task.status === "overdue").length,
      client.name,
    );
  }
});
