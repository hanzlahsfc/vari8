import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
for (const extension of [".ts", ".tsx"]) {
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
}
require.extensions[".css"] = () => {};
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { SmoothTrend } = require("./smooth-trend.tsx");

function render(props) {
  return renderToStaticMarkup(React.createElement(SmoothTrend, props));
}

test("bridges unlogged dates, exposes them to inspection, and keeps markers hover-only", () => {
  const markup = render({
    rows: [
      { date: "2026-10-01", value: 70 },
      { date: "2026-10-02", value: null },
      { date: "2026-10-03", value: 72 },
    ],
    unit: "kg",
    width: 320,
    height: 88,
    label: "Bodyweight",
  });

  const path = markup.match(/class="pc-line pc-smooth-line" d="([^"]+)"/)?.[1];
  assert.ok(path, "trend path is rendered");
  assert.match(path, /C/, "observed points use a smooth curve");
  assert.equal(
    (path.match(/M/g) ?? []).length,
    1,
    "a missing date does not break the displayed path",
  );
  assert.doesNotMatch(path, /NaN|Infinity|undefined/);
  assert.match(
    markup,
    /not logged/i,
    "the missing entry remains explicit in accessible chart text",
  );
  assert.match(markup, /role="slider"[^>]*tabindex="0"/);
  assert.match(markup, /Left and Right arrows/);
  assert.doesNotMatch(
    markup,
    /pc-smooth-active-point/,
    "no observation marker is permanently visible",
  );
});

test("renders a dated target range when every intake entry is missing", () => {
  const markup = render({
    rows: [],
    targetBandRows: [
      { date: "2026-10-01", low: 90, high: 120 },
      { date: "2026-10-02", low: 95, high: 125 },
      { date: "2026-10-03", low: 92, high: 122 },
    ],
    targetLabel: "Goal range",
    unit: "g",
    width: 360,
    height: 96,
    label: "Protein intake",
  });

  assert.match(markup, /pc-smooth-target-band/);
  assert.match(markup, /not logged/i);
  assert.doesNotMatch(markup, /pc-plot-empty|NaN|Infinity|undefined/);
});

test("target bands close with a valid line into the lower edge", () => {
  const markup = renderToStaticMarkup(
    React.createElement(SmoothTrend, {
      rows: [
        { date: "2026-10-01", value: 180 },
        { date: "2026-10-02", value: 200 },
      ],
      targetBandRows: [
        { date: "2026-10-01", low: 190, high: 230 },
        { date: "2026-10-02", low: 190, high: 230 },
      ],
      unit: "g",
      width: 480,
      height: 160,
      label: "Carbs",
    }),
  );
  const path = markup.match(/class="pc-smooth-target-band" d="([^"]+)"/);
  assert.ok(path, "range needs a visible band");
  assert.match(path[1], / L[\d.]+ [\d.]+ /);
  assert.doesNotMatch(path[1], /LC/);
});
