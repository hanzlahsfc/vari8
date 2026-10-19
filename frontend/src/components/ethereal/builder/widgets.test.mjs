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
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  defaultSettings,
  initialRecords,
  upgradeHabitFixture,
} = require("./model.ts");
const { WidgetContent } = require("./widget-content.tsx");
const dimensions = {
  Compact: [248, 144],
  Regular: [336, 224],
  Wide: [512, 224],
  Tall: [248, 384],
  Expanded: [512, 384],
  Custom: [400, 304],
};
function render(
  kind,
  size = "Regular",
  settings = {},
  records = initialRecords,
  clientPreview = true,
) {
  const [width, height] = Array.isArray(size) ? size : dimensions[size];
  return renderToStaticMarkup(
    React.createElement(WidgetContent, {
      widget: {
        id: "test",
        kind,
        settings: { ...defaultSettings(kind), size, ...settings },
      },
      records,
      width,
      height,
      clientPreview,
      onRecordsChange: () => {},
      onDetail: () => {},
    }),
  );
}

function contributionTotals(output, from = "2026-08-26", to = "2026-10-06") {
  const totals = { dates: 0, done: 0, skipped: 0, missing: 0 };
  for (const match of output.matchAll(/<button\b[^>]*>/g)) {
    const date = match[0].match(/\bdata-date="([^"]+)"/)?.[1];
    const label = match[0].match(/\baria-label="([^"]+)"/)?.[1];
    if (!date || !label || date < from || date > to) continue;
    const values = label.match(/(\d+) done, (\d+) skipped, (\d+) not logged/);
    if (!values) continue;
    totals.dates += 1;
    totals.done += Number(values[1]);
    totals.skipped += Number(values[2]);
    totals.missing += Number(values[3]);
  }
  return totals;
}

test("habit contribution graph uses scheduled history and keeps today unlogged distinct", () => {
  const habits = structuredClone(initialRecords.habits);
  const water = habits.find((habit) => habit.id === "water");
  assert.ok(water);
  assert.ok(water.scheduledDates.length >= 42);
  assert.equal(
    water.completions.some(
      (completion) => completion.date === initialRecords.client.asOf,
    ),
    false,
  );

  const graph = render("TL21", "Tall", {
    option: "contributions",
    period: "6w",
    fields: ["water"],
  });
  assert.match(graph, /Aug 26–Oct 6/);
  assert.match(graph, /class="cc-calendar"/);
  assert.match(graph, /data-date="2026-10-06"/);
  assert.deepEqual(contributionTotals(graph), {
    dates: 42,
    done: 23,
    skipped: 6,
    missing: 13,
  });
  for (const [date, label] of [
    ["2026-08-26", "Wednesday, August 26"],
    ["2026-08-28", "Friday, August 28"],
    ["2026-08-29", "Saturday, August 29"],
  ]) {
    const status = water.completions.find(
      (entry) => entry.date === date,
    )?.status;
    assert.ok(
      graph.includes(
        `aria-label="${label}: ${status === "done" ? 1 : 0} done, ${status === "skipped" ? 1 : 0} skipped, ${status == null ? 1 : 0} not logged"`,
      ),
    );
  }
  assert.match(graph, /style="background:color-mix\(in srgb, var\(--accent\)/);
  assert.match(graph, /Shade shows share done/);
  assert.doesNotMatch(graph, /class="cc-calendar-mark/);
  const calendarCss = readFileSync(
    new URL("./coaching-content.css", import.meta.url),
    "utf8",
  );
  assert.match(calendarCss, /\.cc-calendar-cell:focus-visible\s*\{/);
  assert.match(calendarCss, /\.cc-calendar-cell\s*\{[\s\S]*?border: 0;/);
  assert.doesNotMatch(calendarCss, /\.cc-calendar-cell\.is-inspected\s*\{/);
  const regular = render("TL21", "Regular", {
    option: "contributions",
    period: "6w",
    fields: ["water"],
  });
  assert.deepEqual(contributionTotals(regular), {
    dates: 42,
    done: 23,
    skipped: 6,
    missing: 13,
  });
  assert.match(regular, /Past .* · .*Oct 6/);
  assert.doesNotMatch(regular, /class="cc-calendar"/);
  const mobility = render("TL21", "Regular", {
    option: "contributions",
    period: "6w",
    fields: ["mobility"],
  });
  assert.deepEqual(contributionTotals(mobility), {
    dates: 19,
    done: 10,
    skipped: 3,
    missing: 6,
  });
  assert.match(
    render("TL21", "Regular", {
      option: "contributions",
      period: "6w",
      fields: ["protein"],
    }),
    /skipped/,
  );
  const compact = render("TL21", "Compact", {
    option: "contributions",
    period: "6w",
    fields: ["water"],
  });
  assert.match(compact.replace(/<[^>]*>/g, ""), /23\s*\/\s*42\s*done/);
  assert.match(compact, /6 skipped/);
  assert.match(compact, /13 not logged/);
  assert.doesNotMatch(compact, /class="cc-calendar/);
});

test("habit fixture upgrades leave current and already recorded completions intact", () => {
  const records = structuredClone(initialRecords);
  const water = records.habits.find((habit) => habit.id === "water");
  assert.ok(water);
  const currentDate = records.client.asOf;
  assert.equal(
    water.completions.some((completion) => completion.date === currentDate),
    false,
  );
  const historicalDate = water.completions[0].date;
  const originalStatus = water.completions[0].status;
  const upgraded = upgradeHabitFixture(records);
  const upgradedWater = upgraded.habits.find((habit) => habit.id === "water");
  assert.ok(upgradedWater);
  assert.equal(
    upgradedWater.completions.find(
      (completion) => completion.date === historicalDate,
    )?.status,
    originalStatus,
  );
  assert.equal(
    upgradedWater.completions.some(
      (completion) => completion.date === currentDate,
    ),
    false,
  );
  assert.equal(water.completions.length, upgradedWater.completions.length);
});

test("weight conversion and named exercise metrics preserve dated observations", () => {
  assert.match(render("BN01", "Wide", { unit: "lb", period: "7d" }), /149.5/);
  const reps = render("TL28", "Tall", {
    source: "exercise:hip-thrust",
    summary: "reps",
    period: "4w",
  });
  assert.match(reps, /8 reps/);
  assert.match(reps, /Hip thrust/);
  assert.match(reps, /Oct 1/);
  assert.doesNotMatch(reps, /Deadlift/);
  const plotted = render("TL28", "Wide", {
    source: "exercise:deadlift",
    summary: "load",
    period: "8w",
    unit: "kg",
  });
  assert.match(plotted, /class="pc-plot pc-smooth-trend/);
  assert.match(plotted, /Deadlift load dated observations in kg/);
  assert.doesNotMatch(plotted, /<circle/);
  assert.match(plotted, /pc-smooth-line/);
  assert.match(plotted, /Sep 8 55 kg/);
  const daily = render("BN01", "Wide", { period: "30d", summary: "daily" });
  const weekly = render("BN01", "Wide", {
    period: "30d",
    summary: "weekly-average",
  });
  assert.notEqual(daily, weekly);
});
