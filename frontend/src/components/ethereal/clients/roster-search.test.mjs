import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

// T3: the roster search predicate runs identically in both twins; this
// exercises the frontend copy the same way the repo vitest exercises the
// canvas copy.
const source = await readFile(
  new URL("./roster-search.ts", import.meta.url),
  "utf8",
);
const executableSource = stripTypeScriptTypes(source, { mode: "strip" });
const model = await import(
  `data:text/javascript;base64,${Buffer.from(executableSource).toString("base64")}`
);
const { matchingSearch } = model;

const client = {
  name: "Amara Osei",
  label: "Fat loss",
  phase: "Foundation",
  template: "Base Block",
};

test("matches name, label, phase, template case-insensitively", () => {
  for (const q of ["amara", "OSEI", "fat", "found", "base block"]) {
    assert.equal(matchingSearch(client, q), true, `query ${q}`);
  }
});

test("rejects a non-matching query and passes a blank one", () => {
  assert.equal(matchingSearch(client, "strength"), false);
  assert.equal(matchingSearch(client, ""), true);
  assert.equal(matchingSearch(client, "   "), true);
});
