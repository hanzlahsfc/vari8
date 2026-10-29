import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

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
const { defaultSettings, initialRecords } = require("./model.ts");
const { CoachingWidgetContent } = require("./coaching-content.tsx");

function render(
  kind,
  size,
  bodyWidth,
  bodyHeight,
  settings = {},
  records = initialRecords,
  columnSpan,
) {
  return renderToStaticMarkup(
    React.createElement(CoachingWidgetContent, {
      widget: {
        id: `coaching-${kind}`,
        kind,
        settings: { ...defaultSettings(kind), size, ...settings },
      },
      records,
      width: bodyWidth + 34,
      height: bodyHeight + 70,
      columnSpan,
      bodyWidth,
      bodyHeight,
      clientPreview: false,
      onRecordsChange: () => {},
      onDetail: () => {},
    }),
  );
}

test("phase progress remains readable at all five widget sizes", () => {
  const sizes = [
    ["Compact", 214, 74],
    ["Regular", 302, 154],
    ["Wide", 478, 154],
    ["Tall", 214, 314],
    ["Expanded", 478, 394],
  ];
  for (const [size, width, height] of sizes) {
    const markup = render("CU10", size, width, height);
    assert.match(markup, /Strength foundation/, size);
    assert.match(markup, /role="progressbar"/, size);
    assert.match(markup, /Week 6 of 9/, size);
    assert.doesNotMatch(markup, /Current phase progress/);
    assert.doesNotMatch(markup, /\d+% elapsed/);
  }
});

test("expanded phase details use published facts and cap milestones", () => {
  const records = structuredClone(initialRecords);
  records.coachingPlan.currentPhase.name =
    "Strength foundation with a long phase name";
  records.publishedMilestones = Array.from({ length: 5 }, (_, index) => ({
    id: `phase-goal-${index}`,
    label: `Phase milestone ${index + 1}`,
    date: `2026-10-${String(index + 10).padStart(2, "0")}`,
    kind: "goal",
    published: true,
    phaseId: records.coachingPlan.currentPhase.id,
  }));
  const markup = render("CU10", "Expanded", 478, 394, {}, records);
  assert.match(markup, /Aug 31/);
  assert.match(markup, /Nov 1/);
  assert.match(markup, /Current focus/);
  assert.match(markup, /Keep lower-body training steady/);
  assert.match(markup, /Phase milestone 1/);
  assert.match(markup, /Phase milestone 3/);
  assert.doesNotMatch(markup, /Phase milestone 4/);
});

test("week glance uses all selected metrics and adds published context when it fits", () => {
  const compact = render("CU02", "Compact", 214, 74);
  assert.match(compact, /Bodyweight average/);
  assert.doesNotMatch(compact, /Weekly focus/);

  const regular = render("CU02", "Regular", 302, 154);
  assert.match(regular, /Daily steps average/);
  assert.match(regular, /Protein logged average/);
  assert.match(regular, /vs last week/);

  const tall = render("CU02", "Tall", 214, 314);
  assert.match(tall, /Keep lower-body training steady/);
  assert.match(tall, /two reps in reserve/);
  assert.doesNotMatch(tall, /\d+\/\d+ days observed/);

  const compactWide = render("CU02", "Compact", 482, 84);
  assert.match(compactWide, /Bodyweight average/);
  assert.match(compactWide, /Daily steps average/);
  assert.match(compactWide, /Protein logged average/);
});

test("check-in status focuses on scheduled dates and client submissions", () => {
  const markup = render("CU04", "Expanded", 478, 394);
  assert.match(markup, /Next check-in/);
  assert.match(markup, /Latest submission/);
  assert.doesNotMatch(markup, /Latest coach response/);
  const compact = render("CU04", "Compact", 218, 84);
  assert.match(compact, /Oct 5 · Submitted/);
  assert.match(compact, /cc-latest-submission/);
});

test("habit summaries keep short cards useful without a single-row tease", () => {
  const today = render("TL21", "Regular", 218, 154);
  assert.match(today, /Outdoor walk/);
  assert.match(today, /Water before coffee/);
  assert.doesNotMatch(today, /more scheduled/);

  const consistency = render("TL22", "Regular", 302, 154);
  assert.match(consistency, /cc-contribution/);
  assert.match(consistency, /cc-consistency is-summary/);
  assert.doesNotMatch(consistency, /cc-consistency-rows/);
});

test("phase milestone card includes focus and the published milestone at four rows", () => {
  const markup = render("CU10", "Tall", 302, 234);
  assert.match(markup, /Current focus/);
  assert.match(markup, /Strength foundation complete/);
});

test("habit consistency keeps a centered compact summary and uses a Monday-aligned weekly graph when wide", () => {
  const compact = render("TL22", "Compact", 214, 74, { period: "7d" });
  assert.match(compact, /class="cc-consistency-mini-graph"/);
  assert.match(compact, /cc-consistency is-compact is-summary/);
  assert.doesNotMatch(compact, /cc-contribution/);
  assert.doesNotMatch(compact, /class="cc-calendar"/);

  const wideShort = render("TL22", "Wide", 478, 74, { period: "7d" });
  assert.match(wideShort, /cc-contribution/);
  assert.doesNotMatch(wideShort, /cc-contribution-label/);
  assert.doesNotMatch(wideShort, /cc-consistency-summary/);
  assert.equal(
    (wideShort.match(/class="cc-contribution-cell/g) ?? []).length,
    301,
  );
  assert.match(wideShort, /--cc-contribution-columns:43/);
  assert.match(
    wideShort,
    /aria-label="Tuesday, October 6: 1 done, 0 skipped, 2 not logged"/,
  );
  assert.match(wideShort, /title="Oct 6 · 1 done, 0 skipped, 2 not logged"/);

  const medium = render("TL22", "Regular", 302, 154, { period: "7d" });
  assert.match(medium, /--cc-contribution-columns:20/);
  assert.match(medium, /cc-contribution-label">Past 20 weeks/);
  assert.match(medium, /Daily habit contributions/);

  const mediumWide = render("TL22", "Wide", 478, 154, { period: "7d" });
  assert.match(mediumWide, /--cc-contribution-columns:32/);
  assert.match(mediumWide, /cc-contribution-label">Past 32 weeks/);
  assert.doesNotMatch(mediumWide, /cc-consistency-summary/);

  const year = render("TL22", "Wide", 478, 74, {
    period: "7d",
    historyPeriod: "1y",
  });
  assert.equal((year.match(/class="cc-contribution-cell/g) ?? []).length, 364);
  assert.match(year, /--cc-contribution-columns:52/);

  const narrowYear = render("TL22", "Wide", 302, 74, {
    period: "7d",
    historyPeriod: "1y",
  });
  assert.equal(
    (narrowYear.match(/class="cc-contribution-cell/g) ?? []).length,
    266,
  );
  assert.match(narrowYear, /--cc-contribution-columns:38/);
  assert.match(narrowYear, /--cc-contribution-size:5px/);
  assert.doesNotMatch(narrowYear, /cc-contribution-label/);
  assert.match(
    narrowYear,
    /title="The requested year history needs a wider card; showing 38 weeks\."/,
  );

  const labeledNarrowYear = render("TL22", "Wide", 302, 154, {
    period: "7d",
    historyPeriod: "1y",
  });
  assert.match(labeledNarrowYear, /Past 38 weeks/);
  assert.match(labeledNarrowYear, /needs a wider card/);

  const expandedWide = render("TL22", "Expanded", 478, 314, { period: "7d" });
  assert.equal(
    (expandedWide.match(/class="cc-contribution-cell/g) ?? []).length,
    224,
  );
  assert.match(
    expandedWide,
    /class="cc-consistency-rows cc-strip-habit-totals"/,
  );
  assert.match(expandedWide, /Outdoor walk/);
  assert.match(expandedWide, /Selected habits · Sep 9–Oct 6/);
  assert.match(
    expandedWide,
    /Selected habit totals for summary period Sep 9–Oct 6/,
  );
  assert.doesNotMatch(
    expandedWide,
    /Coverage unavailable|logged days|days observed/i,
  );

  const expanded = render("TL22", "Tall", 214, 314, { period: "7d" });
  assert.match(expanded, /class="cc-calendar"/);
  assert.match(expanded, /Scheduled habit contribution calendar/);
  assert.match(expanded, /Sep 9–Oct 6/);

  const css = readFileSync(
    new URL("./coaching-content.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /grid-template-rows:\s*repeat\(7, var\(--cc-contribution-size/,
  );
  assert.match(css, /grid-auto-flow:\s*column/);
  assert.match(css, /\.cc-contribution-cell\s*\{[^}]*border:\s*0;/s);
});

test("compact canvas span keeps summary; four columns show an unlabeled weekly graph", () => {
  const threeColumns = render(
    "TL22",
    "Compact",
    400,
    86,
    { period: "4w" },
    initialRecords,
    3,
  );
  assert.match(threeColumns, /class="cc-consistency-mini-graph"/);
  assert.match(threeColumns, /cc-consistency is-compact is-summary/);
  assert.doesNotMatch(threeColumns, /cc-contribution/);

  const fourColumns = render(
    "TL22",
    "Compact",
    400,
    86,
    { period: "4w" },
    initialRecords,
    4,
  );
  assert.match(fourColumns, /cc-contribution/);
  assert.doesNotMatch(fourColumns, /cc-contribution-label/);
  assert.equal(
    (fourColumns.match(/class="cc-contribution-cell/g) ?? []).length,
    231,
  );
});

test("Today's habits contribution presentation keeps its six-week calendar", () => {
  const markup = render("TL21", "Tall", 214, 314, {
    option: "contributions",
    period: "6w",
    fields: ["water"],
  });
  assert.match(markup, /class="cc-calendar"/);
  assert.match(markup, /Aug 26–Oct 6/);
});

test("Today's habits contribution graph uses its selected history window", () => {
  const markup = render("TL21", "Wide", 478, 154, {
    option: "contributions",
    period: "today",
    fields: ["water"],
  });
  assert.equal(
    (markup.match(/class="cc-contribution-cell/g) ?? []).length,
    224,
  );
  assert.match(markup, /Past 32 weeks/);
  assert.match(markup, /Daily habit contributions/);
});

test("check-in date emblem has no rounded rectangle", () => {
  const markup = render("CU04", "Tall", 214, 314);
  assert.match(markup, /cc-calendar-emblem/);
  const css = readFileSync(
    new URL("./coaching-content.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.cc-calendar-emblem\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/s,
  );
});

test("habit and task completion marks match the Foundation checkbox", () => {
  const css = readFileSync(
    new URL("./coaching-content.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.cc-habit-toggle::before,\s*\.cc-task-read-state::before\s*\{[^}]*width:\s*17px;[^}]*height:\s*17px;[^}]*border-radius:\s*4px;/s,
  );
});
