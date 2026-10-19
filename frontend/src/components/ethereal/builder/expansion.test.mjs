import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
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

test("sleep settings change the instance summary, period and display unit", () => {
  const average = render("TL11", {
    summary: "average",
    period: "7d",
    unit: "h",
  });
  const latest = render("TL11", {
    summary: "latest",
    period: "today",
    unit: "h",
  });
  const minutes = render("TL11", {
    summary: "latest",
    period: "today",
    unit: "min",
  });
  assert.match(average, /7\.3/);
  assert.match(latest, /7\.8/);
  assert.match(minutes, /468/);
  assert.notEqual(average, latest);
});

test("single-nutrient comparison follows the active option and keeps missing distinct", () => {
  const fat = render("BN19", {
    option: "single",
    fields: ["fat"],
    period: "today",
  });
  assert.match(fat, /60 g/);
  assert.match(fat, /55/);
  const restDay = { ...initialRecords, activeNutritionOption: "NTD" };
  const rest = render(
    "BN19",
    { option: "single", fields: ["fat"], period: "today" },
    restDay,
  );
  assert.match(rest, /60/);
  assert.match(rest, /68 g/);
  const missing = structuredClone(initialRecords);
  delete missing.macroIntake.find(
    (row) => row.date === missing.client.asOf && row.option === "TD",
  ).fat;
  assert.match(
    render(
      "BN19",
      { option: "single", fields: ["fat"], period: "today" },
      missing,
    ),
    /Not logged/,
  );
  const zero = structuredClone(initialRecords);
  zero.macroIntake.find(
    (row) => row.date === zero.client.asOf && row.option === "TD",
  ).protein = 0;
  assert.match(
    render("BN19", { option: "single", fields: ["protein"] }, zero),
    />0\s*g</,
  );
  const actualOnly = render("BN19", {
    option: "single",
    period: "today",
    fields: ["protein"],
    summary: "actual",
    target: true,
  });
  assert.match(actualOnly, />88 g</);
  assert.doesNotMatch(
    actualOnly,
    /fixed target|Fixed 130|No applicable target/,
  );
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

test("phase progress presents phase, week and published context without a percentage headline", () => {
  const progress = render("CU10");
  assert.match(progress, /Strength foundation/);
  assert.match(progress, /Week 6 of 9/);
  assert.match(progress, /aria-valuemax="62" aria-valuenow="36"/);
  assert.match(progress, /dateTime="2026-11-01">Nov 1/);
  assert.match(progress, /Current focus/);
  assert.doesNotMatch(progress, /% elapsed|days left/);
  const records = structuredClone(initialRecords);
  records.publishedMilestones.forEach((item) => {
    item.published = false;
  });
  assert.match(render("CU10", {}, records), /No published milestones/);
});
