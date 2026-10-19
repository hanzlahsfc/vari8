import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

// Compile the local TS/TSX modules in this test process; no extra test dependency.
const require = createRequire(import.meta.url);
const ts = require("typescript");
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const result = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    });
    module._compile(result.outputText, filename);
  };
}
require.extensions[".css"] = () => {};
const { initialRecords, upgradeSampleHistory } = require("./model.ts");
test("denser histories retain gaps, zero and latest values without replacing edited sources", () => {
  assert.ok(initialRecords.bodyweight.length > 70);
  assert.equal(initialRecords.bodyweight.at(-1).value, 67.8);
  assert.equal(
    initialRecords.bodyweight.find((row) => row.date === "2026-09-16").value,
    null,
  );
  assert.equal(
    initialRecords.steps.find((row) => row.date === "2026-10-03").value,
    0,
  );
  const changed = {
    ...initialRecords,
    sampleHistoryVersion: undefined,
    bodyweight: [{ date: "2026-10-06", value: 99, unit: "kg" }],
    steps: [],
    macroIntake: [],
  };
  const upgraded = upgradeSampleHistory(changed);
  assert.deepEqual(upgraded.bodyweight.at(-1), changed.bodyweight.at(-1));
  assert.deepEqual(upgraded.steps, []);
  assert.deepEqual(upgraded.macroIntake, []);
});
