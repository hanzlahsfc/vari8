import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
// Map `@/` specifiers to `src/` like the app's tsconfig paths so required TS
// modules resolve identically to the bundler.
const Module = require("node:module");
const nodePath = require("node:path");
const nodeUrl = require("node:url");
const srcRoot = nodePath.resolve(
  nodePath.dirname(nodeUrl.fileURLToPath(import.meta.url)),
  "../../..",
);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (specifier, ...rest) {
  if (specifier.startsWith("@/")) {
    const base = nodePath.join(srcRoot, specifier.slice(2));
    for (const candidate of [
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.mjs`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
      base,
    ]) {
      try {
        return resolveFilename.call(this, candidate, ...rest);
      } catch {
        // Try the next candidate.
      }
    }
  }
  return resolveFilename.call(this, specifier, ...rest);
};
const ts = require("typescript");
for (const extension of [".ts", ".tsx"])
  require.extensions[extension] = (module, filename) => {
    module._compile(
      ts.transpileModule(readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: filename,
      }).outputText,
      filename,
    );
  };
require.extensions[".css"] = () => {};
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  defaultSettings,
  initialRecords,
  getRoadmapWeeks,
  upgradeAdditionalFixture,
} = require("./model.ts");
const { WidgetContent } = require("./widget-content.tsx");
function render(kind, settings = {}, records = initialRecords) {
  return renderToStaticMarkup(
    React.createElement(WidgetContent, {
      widget: {
        id: "fixture",
        kind,
        settings: { ...defaultSettings(kind), ...settings },
      },
      records,
      width: 512,
      height: 384,
      clientPreview: true,
      onRecordsChange: () => {},
      onDetail: () => {},
    }),
  );
}

test("weekly source averages include zero, count unique logged days and stay coherent", () => {
  const weeks = getRoadmapWeeks(initialRecords);
  const metric = (week, key) =>
    weeks
      .find((row) => row.week === week)
      .metrics.find((row) => row.key === key);
  assert.equal(metric(5, "steps").value, 7401);
  assert.equal(metric(6, "steps").value, 6993);
  assert.equal(metric(5, "protein").value, 131.1);
  // Mixed training/rest options and the October target change have no single weekly target.
  assert.equal(metric(5, "protein").target, undefined);
  assert.equal(metric(6, "protein").value, 112);
  assert.equal(metric(6, "protein").target.low, 130);
  assert.equal(metric(5, "steps").coverage.loggedDays, 6);
  const changed = structuredClone(initialRecords);
  changed.steps.push({ date: "2026-10-07", value: 99999, unit: "steps" });
  assert.equal(
    getRoadmapWeeks(changed)
      .find((week) => week.week === 6)
      .metrics.find((row) => row.key === "steps").value,
    6993,
  );
});

test("upgrading saved records preserves intentional empty sources and completions", () => {
  const saved = structuredClone(initialRecords);
  saved.sleep = [];
  saved.publishedMilestones = [];
  saved.activeNutritionOption = "NTD";
  saved.tasks[0].completed = true;
  const before = structuredClone(saved);
  const upgraded = upgradeAdditionalFixture(saved);
  assert.deepEqual(upgraded, before);
  assert.deepEqual(saved, before);
  delete saved.coachingPlan;
  assert.ok(upgradeAdditionalFixture(saved).coachingPlan);
  assert.deepEqual(upgradeAdditionalFixture(saved).sleep, []);
});

test("habit consistency changes when the shared schedule completion changes", () => {
  const before = render("TL22", { fields: ["water"], period: "7d" });
  const records = structuredClone(initialRecords);
  const habit = records.habits.find((row) => row.id === "water");
  habit.completions = habit.completions.filter(
    (row) => row.date !== records.client.asOf,
  );
  habit.completions.push({ date: records.client.asOf, status: "done" });
  const after = render("TL22", { fields: ["water"], period: "7d" }, records);
  assert.notEqual(before, after);
  assert.equal(render("TL22", { fields: ["water"], period: "7d" }), before);
});
