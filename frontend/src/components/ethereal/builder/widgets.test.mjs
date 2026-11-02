import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Compile the local TS/TSX modules in this test process; no extra test dependency.
const require = createRequire(import.meta.url);
// Resolve the app's "@/…" (src/…) specifiers for the CJS-compiled modules.
const srcRoot = fileURLToPath(new URL("../../../", import.meta.url));
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (specifier, ...args) {
  return originalResolve.call(
    this,
    specifier.startsWith("@/") ? srcRoot + specifier.slice(2) : specifier,
    ...args,
  );
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
const {
  catalogue,
  defaultSettings,
  initialRecords,
  summaryOptions,
  upgradeHabitFixture,
} = require("./model.ts");
const { WidgetContent, DetailContent } = require("./widget-content.tsx");
const { ProgressWidgetContent } = require("./progress-content.tsx");
const { widgetDetailKey } = require("./widget-geometry.ts");
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

test("every widget's title opens its corresponding local source record detail", () => {
  const expected = {
    BN21: /75\.8|Waist/,
    BN01: /68\.4|Bodyweight/,
    BN08: /weekly|Weekly/,
    BN15: /Training day nutrition/,
    BN19: /Calories|calories/,
    TL26: /Deadlift/,
    TL28: /62\.5|Deadlift/,
    TL06: /steps/,
    TL11: /Sleep|sleep/,
    TL14: /Low|High/,
    TL21: /Outdoor walk/,
    TL22: /Water before coffee|water/,
    CU01: /Strength foundation/,
    CU02: /Bodyweight|bodyweight/,
    CU03: /progress photos/,
    CU04: /Oct|October/,
    CU06: /Great consistency/,
    CU09: /Bodyweight|bodyweight/,
    CU10: /Nov|November/,
    CU16: /Bodyweight history/,
  };
  for (const entry of catalogue) {
    const widget = {
      id: entry.id,
      kind: entry.id,
      settings: defaultSettings(entry.id),
    };
    const detail = widgetDetailKey(widget);
    if (!detail) continue; // detail-less widgets (e.g. CU17/CU18) have no detail view
    const output = renderToStaticMarkup(
      React.createElement(DetailContent, {
        detail,
        records: initialRecords,
        onRecordsChange: () => {},
        onDetail: () => {},
      }),
    );
    assert.match(output, expected[entry.id], entry.id);
    assert.doesNotMatch(output, /NaN|undefined|Infinity/, entry.id);
  }
});

test("all catalogue entries render all five measured content states", () => {
  assert.equal(catalogue.length, 22);
  assert.deepEqual(
    new Set(catalogue.map((entry) => entry.category)),
    new Set([
      "Data/Progress",
      "Nutrition",
      "Training",
      "Activity",
      "Recovery",
      "Habits",
      "Coaching",
      "Roadmap",
      "Shortcuts",
    ]),
  );
  for (const entry of catalogue)
    for (const size of entry.sizes) {
      const output = render(entry.id, size);
      assert.match(
        output,
        new RegExp(`data-layout="${size}"`),
        `${entry.id} ${size}`,
      );
      assert.ok(
        output.replace(/<[^>]*>/g, "").trim().length > 10,
        `${entry.id} ${size} contains sample content`,
      );
      assert.doesNotMatch(
        output,
        /NaN|undefined|Infinity/,
        `${entry.id} ${size} contains valid values`,
      );
    }
});

test("unassigned and empty fixture sources render missing states without fabricated values", () => {
  const empty = structuredClone(initialRecords);
  for (const key of Object.keys(empty))
    if (Array.isArray(empty[key])) empty[key] = [];
  delete empty.coachingPlan;
  delete empty.publishedWeeklyFocus;
  for (const entry of catalogue) {
    for (const size of entry.sizes) {
      const output = render(entry.id, size, {}, empty);
      assert.doesNotMatch(
        output,
        /NaN|undefined|Infinity|67\.8 kg|88 g|58%/,
        `${entry.id} ${size}`,
      );
      assert.ok(
        output.replace(/<[^>]*>/g, "").trim().length,
        `${entry.id} ${size}`,
      );
    }
  }
});

test("instance periods filter data without changing another instance", () => {
  const daily = render("BN21", "Regular", {
    source: "steps",
    summary: "total",
    period: "today",
    unit: "steps",
  });
  const week = render("BN21", "Regular", {
    source: "steps",
    summary: "total",
    period: "7d",
    unit: "steps",
  });
  assert.match(daily, /4,860/);
  assert.match(week, /39,956/);
  assert.notEqual(daily, week);
  assert.equal(
    render("BN21", "Regular", {
      source: "steps",
      summary: "total",
      period: "7d",
      unit: "steps",
    }),
    week,
  );
});

test("custom dimensions preserve source meaning, setting, and eligible units", () => {
  for (const size of Object.keys(dimensions)) {
    const output = render("BN21", size, {
      title: "Arbitrary heading",
      source: "waist",
      summary: "latest",
      period: "30d",
      unit: "steps",
    });
    assert.match(output, /75\.8/, `${size} retains the selected waist value`);
    assert.match(output, /<small>cm<\/small>/, `${size} uses the source unit`);
    assert.doesNotMatch(output, /75\.8\s*(?:<[^>]+>)*steps/);
    assert.match(output, /data-kind="BN21"/);
  }
});

test("habit consistency preserves source statuses in its summary, strip, and calendar", () => {
  for (const size of Object.keys(dimensions)) {
    const output = render("TL22", size, {
      fields: ["water"],
      period: "6w",
      summary: "scheduled-statuses",
      unit: "%",
    });
    assert.match(
      output,
      output.includes('class="cc-contribution"')
        ? /Past .* · .*Oct 6/
        : /Aug 26–Oct 6/,
      size,
    );
    if (
      output.includes('class="cc-contribution') ||
      output.includes('class="cc-calendar"')
    ) {
      assert.deepEqual(
        contributionTotals(output),
        {
          dates: 42,
          done: 23,
          skipped: 6,
          missing: 13,
        },
        size,
      );
    } else {
      assert.match(output.replace(/<[^>]*>/g, ""), /23\s*\/\s*42\s*done/, size);
      assert.match(output, /6 skipped/, size);
      assert.match(output, /13 not logged/, size);
      assert.match(output, /1 selected habit/, size);
      if (size === "Compact")
        assert.doesNotMatch(output, /\+\d+ more selected/);
    }
  }
});

test("habit consistency matches the 3×2 summary and 4×2/4×3 strip layouts", () => {
  const settings = {
    fields: ["water"],
    period: "6w",
    summary: "scheduled-statuses",
  };
  const summary = render("TL22", [288, 144], settings);
  assert.match(summary.replace(/<[^>]*>/g, ""), /23\s*\/\s*42\s*done/);
  assert.match(summary, /6 skipped/);
  assert.match(summary, /13 not logged/);
  assert.doesNotMatch(summary, /class="cc-contribution/);

  const twoRows = render("TL22", [336, 144], settings);
  assert.match(twoRows, /class="cc-contribution"/);
  assert.doesNotMatch(twoRows, /class="cc-contribution-label"/);
  assert.deepEqual(contributionTotals(twoRows), {
    dates: 42,
    done: 23,
    skipped: 6,
    missing: 13,
  });

  const threeRows = render("TL22", [336, 224], settings);
  assert.match(threeRows, /class="cc-contribution-label">Past /);
  assert.equal(
    (threeRows.match(/class="cc-contribution-label"/g) || []).length,
    1,
  );
  assert.deepEqual(contributionTotals(threeRows), {
    dates: 42,
    done: 23,
    skipped: 6,
    missing: 13,
  });
});

test("weekly focus, selected measures, and phase progress use dated source facts", () => {
  const focus = render("CU01", "Expanded", {
    summary: "focus",
    fields: ["focus", "successCue"],
    period: "current-week",
  });
  assert.match(focus, /Week 6 focus/);
  assert.match(focus, /Oct 5–Oct 11/);
  assert.match(
    focus,
    /Keep lower-body training steady while making each rep controlled/,
  );
  assert.match(focus, /Success cue/);
  const phase = render("CU01", "Tall", {
    summary: "phase-focus",
    fields: ["phase"],
    period: "current-week",
  });
  assert.match(phase, /Current phase/);
  assert.match(phase, /Strength foundation/);
  assert.match(phase, /Aug 31–Nov 1/);
  assert.doesNotMatch(phase, /Keep lower-body training steady/);

  const week = render("CU02", "Expanded", {
    fields: ["bodyweight", "steps", "protein"],
    period: "current-week",
  });
  assert.match(week, /Week 6/);
  assert.match(week, /Oct 5–Oct 11/);
  assert.match(week, /67\.8 kg/);
  assert.match(week, /6,993 steps/);
  assert.match(week, /112 g/);
  assert.doesNotMatch(week, /\d+\/\d+ days observed/);
  assert.match(week, /Target 130 g/);

  const milestone = render("CU10", "Compact", {
    summary: "days-remaining",
    fields: ["strength-foundation-end"],
    period: "current-phase",
  });
  assert.match(milestone, /Strength foundation/);
  assert.match(milestone, /Week 6 of 9/);
  assert.doesNotMatch(milestone, /% elapsed|days left/);
  const elapsed = render("CU10", "Expanded", { summary: "phase-progress" });
  assert.match(elapsed, /aria-valuemax="62" aria-valuenow="36"/);
  assert.match(elapsed, /Current focus/);
  assert.match(elapsed, /dateTime="2026-11-01">Nov 1/);
  assert.match(elapsed, /Published milestones/);
});

test("missing observations remain distinct from recorded zero", () => {
  const output = renderToStaticMarkup(
    React.createElement(DetailContent, {
      detail: "steps",
      records: initialRecords,
      clientPreview: true,
      onRecordsChange: () => {},
    }),
  );
  assert.match(output, /Not logged/);
  assert.match(output, /0 steps/);
});

test("shared habit updates reach duplicate renderings and do not erase assignments", () => {
  const records = structuredClone(initialRecords);
  const asOf = records.client.asOf;
  const habit = records.habits.find(
    (item) =>
      item.scheduledDates.includes(asOf) &&
      !item.completions.some(
        (log) => log.date === asOf && log.status === "done",
      ),
  );
  assert.ok(habit);
  const before = render("TL21", "Tall", {}, records);
  habit.completions = [
    ...habit.completions.filter((log) => log.date !== asOf),
    { date: asOf, status: "done" },
  ];
  const after = render("TL21", "Tall", {}, records);
  assert.notEqual(before, after);
  assert.equal(after, render("TL21", "Tall", {}, records));
  assert.equal(records.habits.length, initialRecords.habits.length);
});

test("habit completion controls mutate data only in client preview", () => {
  const preview = render(
    "TL21",
    "Tall",
    { fields: ["water"] },
    initialRecords,
    true,
  );
  const authoring = render(
    "TL21",
    "Tall",
    { fields: ["water"] },
    initialRecords,
    false,
  );
  assert.match(
    preview,
    /class="cc-habit-toggle[^"]*"[^>]*aria-label="Mark done Water before coffee"/,
  );
  assert.doesNotMatch(authoring, /class="cc-habit-toggle/);
  assert.match(authoring, /Water before coffee/);
  assert.match(authoring, /Not logged/);
});

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

test("nutrition preserves missing amounts and fixed, range and minimum targets", () => {
  const partial = structuredClone(initialRecords);
  for (const entry of partial.macroIntake)
    if (entry.date === partial.client.asOf) delete entry.fat;
  const output = render(
    "BN15",
    "Tall",
    {
      period: "today",
      source: "nutrition:active",
    },
    partial,
  );
  assert.match(output, /Not logged/);
  assert.match(output, /130/);
  assert.match(output, /190/);
  assert.match(output, /230/);
  assert.match(output, /55/);
  const records = { ...partial, activeNutritionOption: "NTD" };
  const updated = render(
    "BN15",
    "Tall",
    { period: "today", source: "nutrition:active" },
    records,
  );
  assert.notEqual(output, updated);
  assert.match(updated, /Not logged/);
});

test("metric summaries remain eligible and presentation titles retain source units", () => {
  assert.deepEqual(summaryOptions("BN21", "waist"), ["latest", "average"]);
  assert.ok(summaryOptions("BN21", "steps").includes("total"));
  assert.match(
    render("BN21", "Compact", {
      title: "Arbitrary heading",
      source: "waist",
      unit: "steps",
    }),
    /75\.8 <small>cm<\/small>/,
  );
  assert.match(
    render("BN21", "Compact", { source: "disabled-field" }),
    /Source unavailable/,
  );
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

test("tall workout cards pair applicable prescriptions with the next scheduled session", () => {
  const tall = render("TL26", "Tall", {
    summary: "current",
    fields: ["exercise", "sets", "reps", "coach instructions"],
  });
  assert.match(tall, /Current/);
  assert.match(tall, /Next/);
  assert.match(tall, /Leave two reps in reserve/);
  assert.match(tall, /Upper strength/);
  assert.match(tall, /Oct 8/);
});

test("workout sizes keep one compact prescription and match expanded logbook evidence", () => {
  const compact = render("TL26", "Compact");
  assert.match(compact, /Lower strength/);
  assert.match(compact, /Oct 6/);
  assert.match(compact, /Deadlift/);
  assert.match(compact, /4 sets · 4–5 reps/);
  const expanded = render("TL26", "Expanded");
  assert.match(expanded, /Latest logged · Deadlift/);
  assert.match(expanded, /62\.5 kg · 4 × 4/);
});

test("step cards use dated columns and retain recorded zero values", () => {
  const wide = render("TL06", "Wide", { period: "7d" });
  assert.match(wide, /class="pc-plot is-bars"/);
  assert.match(
    wide,
    /role="slider"[^>]*aria-label="Daily steps: inspect dated entries/,
  );
  assert.match(wide, /<title>Oct 3, 2026 · 0 steps<\/title>/);
  assert.match(wide, /Oct 1, 2026 · Not logged/);
  assert.match(wide, /0 steps/);
  assert.doesNotMatch(wide, /<polyline/);
});

test("smooth plots use dated x positions, bridge display gaps and retain missing observations", () => {
  const plot = render("BN01", "Wide", { period: "30d" });
  const svg = plot.match(
    /<svg[^>]*aria-label="Bodyweight history dated observations in kg"[^>]*>/,
  )?.[0];
  assert.ok(svg);
  const bodyWidth = Number(plot.match(/data-body-width="(\d+)"/)?.[1]);
  const [, viewWidth, viewHeight] =
    svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) ?? [];
  assert.equal(Number(viewWidth), bodyWidth);
  assert.equal(Number(viewHeight), Number(svg.match(/height="([\d.]+)"/)?.[1]));
  assert.match(plot, /Sep 16 Not logged/);
  assert.match(plot, /Sep 28 Not logged/);
  assert.doesNotMatch(plot, /<circle/);
  const line = plot.match(/class="pc-line pc-smooth-line" d="([^"]+)"/)?.[1];
  assert.ok(line);
  const chunks = line.split(" C");
  const xPositions = chunks.map((chunk, index) => {
    const numbers = (index === 0 ? chunk.slice(1) : chunk)
      .trim()
      .split(/\s+/)
      .map(Number);
    return numbers[index === 0 ? 0 : 4];
  });
  const dated = initialRecords.bodyweight.filter(
    (row) => row.date >= "2026-09-07" && row.value !== null,
  );
  const stamps = dated.map((row) => Date.parse(`${row.date}T12:00:00`));
  const start = stamps[0],
    duration = stamps.at(-1) - start;
  const left = Math.min(58, Math.max(38, bodyWidth * 0.2)),
    right = 10;
  assert.equal(xPositions.length, dated.length);
  for (let index = 0; index < stamps.length; index++) {
    const expected =
      left + ((stamps[index] - start) / duration) * (bodyWidth - left - right);
    assert.ok(Math.abs(xPositions[index] - expected) < 0.06);
  }
  const stepped = render("TL06", "Wide", { period: "7d" });
  assert.match(stepped, /<title>Oct 3, 2026 · 0 steps<\/title>/);
  const compact = render("BN01", "Compact");
  assert.match(compact, /Latest/);
  assert.match(compact, /Oct 6/);
});

test("nutrition compares one selected day with explicit logged and target values", () => {
  const expanded = render("BN15", "Expanded", {
    period: "30d",
    source: "nutrition:active",
  });
  assert.match(expanded, /Training day/);
  assert.doesNotMatch(expanded, /<strong>Rest day<\/strong>/);
  assert.match(expanded, /Target(?:s from)? Oct 1/);
  assert.match(expanded, /Fixed 130 g/);
  assert.match(expanded, /190–230 g/);
  assert.match(expanded, /At least 55 g/);
  assert.match(expanded, /Protein<\/strong><span>88 g/);
  assert.match(expanded, /Fat<\/strong><span>60 g/);
  assert.equal(
    (expanded.match(/class="nc-macro(?: [^"]*)?"/g) ?? []).length,
    3,
  );
  assert.equal((expanded.match(/class="nc-fixed-ring"/g) ?? []).length, 3);
  assert.match(expanded, /190–230 ?g/);
  const compact = render("BN15", "Compact", { source: "nutrition:active" });
  assert.match(compact, /Oct 6/);
  assert.match(compact, /130 ?g/);
  assert.match(compact, /Protein/);
  const historicalRecords = {
    ...initialRecords,
    client: { ...initialRecords.client, asOf: "2026-09-30" },
  };
  const historical = render(
    "BN15",
    "Wide",
    { period: "30d", source: "nutrition:TD" },
    historicalRecords,
  );
  assert.match(historical, /Fixed 125 g/);
  assert.match(historical, /185–220 g/);
  assert.match(historical, /Target(?:s from)? Sep 1/);
  assert.doesNotMatch(historical, /Fixed 130 g/);
  const hiddenTargets = render("BN15", "Wide", { target: false });
  assert.doesNotMatch(hiddenTargets, /Fixed|At least|Range|Targets from/);
  assert.match(hiddenTargets, /88 g/);
  const regular = render("BN15", "Regular", { source: "nutrition:active" });
  assert.equal((regular.match(/class="nc-macro(?: [^"]*)?"/g) ?? []).length, 3);
  assert.match(regular, /Target(?:s from)? Oct 1/);
});

test("recovery scales, drafts, due windows, and published feedback retain their semantics", () => {
  const recovery = render("TL14", "Expanded", {
    fields: ["stress", "readiness"],
    summary: "distribution",
  });
  assert.match(recovery, /Low \/ Moderate \/ High/);
  assert.match(recovery, /Low \/ Okay \/ Ready/);
  assert.doesNotMatch(recovery, /Energy outside training/);
  const regularRecovery = render("TL14", "Regular", { fields: ["energy"] });
  assert.match(
    regularRecovery,
    /Energy outside training response scale: Low \/ Steady \/ High/,
  );
  assert.match(regularRecovery, /High · Oct 6/);
  assert.doesNotMatch(regularRecovery, /class="pc-data-row"/);
  const compactRecovery = render("TL14", "Compact", { fields: ["energy"] });
  assert.match(compactRecovery, /Low \/ Steady \/ High/);
  assert.match(compactRecovery, /Oct 6/);
  const scheduled = render("CU04", "Tall", { summary: "schedule" });
  assert.match(scheduled, /Next check-in/);
  assert.match(scheduled, /Oct 9/);
  assert.match(scheduled, /Draft saved/);
  assert.match(scheduled, /Submitted/);
  assert.match(scheduled, /Oct 5/);
  assert.doesNotMatch(scheduled, /Latest submission[\s\S]*Oct 9/);
  const submission = render("CU04", "Tall", { summary: "submission" });
  assert.match(submission, /Latest submission/);
  assert.match(submission, /Submitted/);
  assert.match(submission, /Next check-in/);
  assert.match(submission, /Draft saved/);
  assert.match(
    render("CU03", "Compact", { period: "today" }),
    /No client tasks due/,
  );
  assert.match(
    render("CU03", "Tall", { summary: "completed", period: "30d" }),
    /Confirm next week/,
  );
  assert.match(
    render("CU03", "Expanded", { summary: "open", period: "30d" }),
    /1 completed in this window/,
  );
  assert.match(
    render("CU06", "Wide", { summary: "unread" }),
    /Great consistency/,
  );
  const feedback = render("CU06", "Wide", { summary: "unread" });
  assert.match(feedback, /Recovery notes/);
  assert.match(feedback, /adjusted the next block and added a recovery note/);
  assert.match(
    render(
      "CU06",
      "Wide",
      { summary: "unread" },
      {
        ...initialRecords,
        feedback: initialRecords.feedback.map((item) => ({
          ...item,
          read: true,
        })),
      },
    ),
    /No unread published feedback/,
  );
  const futureFeedback = structuredClone(initialRecords);
  futureFeedback.feedback.push({
    id: "future-feedback",
    sentAt: "2026-10-10",
    excerpt: "Future coach note",
    read: false,
    video: false,
    links: [],
  });
  const filtered = render(
    "CU06",
    "Expanded",
    { summary: "latest" },
    futureFeedback,
  );
  assert.match(filtered, /Great consistency/);
  assert.doesNotMatch(filtered, /Future coach note/);
});

test("client task completion updates the shared assigned task record", () => {
  const propsFor = (records, onRecordsChange) => ({
    widget: {
      id: "task-card",
      kind: "CU03",
      settings: { ...defaultSettings("CU03"), summary: "both", period: "30d" },
    },
    records,
    width: 512,
    height: 384,
    bodyWidth: 478,
    bodyHeight: 314,
    clientPreview: true,
    onRecordsChange,
    onDetail: () => {},
  });
  function find(node, predicate) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = find(child, predicate);
        if (found) return found;
      }
      return undefined;
    }
    if (!React.isValidElement(node)) return undefined;
    let expanded = node;
    while (
      React.isValidElement(expanded) &&
      typeof expanded.type === "function"
    )
      expanded = expanded.type(expanded.props);
    if (!React.isValidElement(expanded)) return undefined;
    if (predicate(expanded)) return expanded;
    return find(expanded.props.children, predicate);
  }
  const before = structuredClone(initialRecords);
  let updated;
  const tree = ProgressWidgetContent(
    propsFor(before, (records) => (updated = records)),
  );
  const button = find(
    tree,
    (element) =>
      element.type === "button" &&
      element.props["aria-label"] ===
        "Complete Add front and side progress photos",
  );
  assert.ok(button, "the assigned open task has an actionable client control");
  button.props.onClick();
  assert.ok(updated);
  assert.equal(
    updated.tasks.find((task) => task.id === "photos").completed,
    true,
  );
  assert.equal(
    before.tasks.find((task) => task.id === "photos").completed,
    false,
  );
  const duplicate = renderToStaticMarkup(
    React.createElement(
      ProgressWidgetContent,
      propsFor(updated, () => {}),
    ),
  );
  assert.match(duplicate, /Add front and side progress photos[\s\S]*Completed/);
  assert.equal(updated.tasks.length, before.tasks.length);
});

test("scheduled habit fields and custom link labels preserve source identity", () => {
  assert.match(
    render("TL21", "Tall", {
      fields: ["water"],
      labels: { water: "A glass to begin" },
    }),
    /A glass to begin/,
  );
  assert.doesNotMatch(
    render("TL21", "Tall", { fields: ["water"] }),
    /Evening mobility/,
  );
  assert.match(
    render("CU16", "Regular", {
      fields: ["Training"],
      labels: { Training: "Your plan" },
    }),
    /Your plan/,
  );
  assert.match(render("CU16", "Tall"), /Latest reading · Oct/);
  assert.match(render("CU16", "Tall"), /Next workout · Oct/);
  assert.match(render("CU16", "Expanded"), /Next check-in · Oct/);
  assert.match(render("CU16", "Tall"), /Latest reading/);
  assert.match(render("CU16", "Expanded"), /Next check-in/);
  assert.match(
    render(
      "TL21",
      "Tall",
      {},
      {
        ...initialRecords,
        habits: initialRecords.habits.map((item) => ({
          ...item,
          scheduledDates: [],
        })),
      },
    ),
    /No selected habits scheduled today/,
  );
});
