import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

// Compile the local TS/TSX modules in this test process; no extra test dependency.
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
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { WidgetContent } = require("./widget-content.tsx");
const {
  defaultSettings,
  initialRecords,
  upgradeSampleHistory,
} = require("./model.ts");
function render(kind, settings = {}) {
  return renderToStaticMarkup(
    React.createElement(WidgetContent, {
      widget: {
        id: kind,
        kind,
        settings: { ...defaultSettings(kind), ...settings },
      },
      records: initialRecords,
      width: 512,
      height: 384,
      clientPreview: false,
      onRecordsChange: () => {},
      onDetail: () => {},
      onPeriodChange: () => {},
    }),
  );
}
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
test("all line-chart families expose per-instance ranges and year changes data coverage", () => {
  const labels = {
    week: "Week",
    month: "Month",
    "6month": "6 months",
    year: "Year",
  };
  for (const kind of ["BN01", "BN08", "BN21", "TL28", "CU09", "BN19"]) {
    assert.match(render(kind), /class="[^"]*\bdw-chart-range\b[^"]*"/, kind);
    for (const period of ["week", "month", "6month", "year"]) {
      const html = render(kind, { period });
      assert.match(
        html,
        new RegExp(
          `class="[^"]*\\bdw-chart-range\\b[^"]*"[^>]*><span>${labels[period]}</span>`,
        ),
        kind + period,
      );
      assert.match(
        html,
        new RegExp(`<input id="[^"]*-hidden-input"[^>]*\\bvalue="${period}"`),
        kind + period,
      );
    }
  }
  const week = render("BN01", { period: "week" }),
    year = render("BN01", { period: "year" });
  assert.notEqual(week, year);
  assert.match(year, /2025|Oct 7/);
});
test("daily macros share one format and history supports both graphs for every nutrient", () => {
  const circles = render("BN15", { option: "circles" });
  assert.equal((circles.match(/class="nc-fixed-ring"/g) || []).length, 3);
  assert.match(circles, /190–230 ?g/);
  assert.match(circles, /60 g/);
  const lines = render("BN15", { option: "lines" });
  assert.equal((lines.match(/class="nc-mark nc-mark-/g) || []).length, 3);
  assert.doesNotMatch(lines, /class="nc-fixed-ring"/);
  assert.doesNotMatch(lines, /data-ring-reading="true"/);
  assert.match(lines, /88 g/);
  assert.match(lines, /142 g/);
  assert.match(lines, /60 g/);
  for (const field of ["calories", "carbs", "protein", "fat"]) {
    for (const option of ["line", "stacked"]) {
      const html = render("BN19", { fields: [field], option, period: "month" });
      assert.match(html, new RegExp(`data-mode="${option}"`));
      assert.match(html, /Oct 6|2026-10-06/);
      assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    }
  }
});
test("steps include the source-record target while missing stays distinct from zero", () => {
  const html = render("TL06");
  assert.match(html, /8,000/);
  assert.match(html, /pc-target/);
  assert.match(html, /<title>Oct 3, 2026 · 0 steps<\/title>/);
});
