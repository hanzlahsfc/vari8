// Focused checks for the legacy sheets model. Structure assertions compare
// against the R3b findings directly; cell assertions walk the fixture.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SHEET_FIXTURE } from "./fixture.ts";
import {
  FORMULA_SHAPE_BADGE,
  freezeSplit,
  LEGACY_SHEET_BANNER,
  moveSelection,
  nameBoxJump,
  SYNTHETIC_VALUE_BADGE,
  UDF_SHAPE_BADGE,
  WORKBOOK,
} from "./model.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("workbook tabs", () => {
  it("carries all 11 tabs in the committed order", () => {
    assert.deepEqual(
      WORKBOOK.map((tab) => tab.name),
      [
        "DASHBOARD",
        "DAILY TRACKER",
        "TIMELINE",
        "MEALPLAN",
        "SUPPLEMENTATION",
        "MENSES",
        "TRAINING",
        "PEAKING",
        "SHOWDAY",
        "Exercise Database",
        "Nutrition Database",
      ],
    );
  });

  it("freezes exactly the five R3b bands and no others", () => {
    const frozen = WORKBOOK.filter((tab) => tab.freezePanes !== null);
    assert.deepEqual(
      frozen.map((tab) => [tab.name, tab.freezePanes]),
      [
        ["DAILY TRACKER", "G8"],
        ["TIMELINE", "A10"],
        ["TRAINING", "P1"],
        ["Exercise Database", "A3"],
        ["Nutrition Database", "A3"],
      ],
    );
    const unfrozen = WORKBOOK.filter((tab) => tab.freezePanes === null);
    assert.equal(unfrozen.length, 6);
    assert.deepEqual(
      frozen.map((tab) => freezeSplit(tab)),
      [
        { rows: 7, cols: 6 },
        { rows: 9, cols: 0 },
        { rows: 0, cols: 15 },
        { rows: 2, cols: 0 },
        { rows: 2, cols: 0 },
      ],
    );
  });

  it("carries hidden rows as ranges, including the DASHBOARD 455", () => {
    const dashboard = WORKBOOK[0];
    assert.deepEqual(dashboard.hiddenRows, [[46, 500]]);
    const daily = WORKBOOK[1];
    assert.deepEqual(daily.hiddenRows, [[1, 1]]);
    assert.ok(
      WORKBOOK.every((tab) =>
        tab.hiddenRows.every(
          (range) =>
            Array.isArray(range) && range.length === 2 && range[0] <= range[1],
        ),
      ),
    );
  });
});

describe("formula cells", () => {
  it("marks every formula cell as recovered shape and synthetic value", () => {
    let count = 0;
    for (const [slug, cells] of Object.entries(SHEET_FIXTURE)) {
      for (const [key, cell] of Object.entries(cells)) {
        if (cell.kind !== "formula") continue;
        count += 1;
        assert.equal(
          cell.formulaShape,
          "recovered",
          `${slug} ${key} missing formulaShape`,
        );
        assert.equal(
          cell.valueSource,
          "synthetic",
          `${slug} ${key} missing valueSource`,
        );
        assert.ok(
          typeof cell.formulaText === "string" && cell.formulaText.length > 0,
          `${slug} ${key} missing formulaText`,
        );
      }
    }
    assert.ok(count > 50, `expected formula cells, found ${count}`);
  });

  it("marks non-formula values synthetic as well", () => {
    for (const [slug, cells] of Object.entries(SHEET_FIXTURE)) {
      for (const [key, cell] of Object.entries(cells)) {
        if (cell.value === undefined || cell.value === "") continue;
        assert.equal(
          cell.valueSource,
          "synthetic",
          `${slug} ${key} missing valueSource`,
        );
      }
    }
  });

  it("carries the provenance badge strings verbatim", () => {
    assert.equal(
      FORMULA_SHAPE_BADGE,
      "Formula text from the team export, string literals withheld",
    );
    assert.equal(UDF_SHAPE_BADGE, "Google only formula, not evaluated");
    assert.equal(SYNTHETIC_VALUE_BADGE, "Synthetic value");
  });
});

describe("banner", () => {
  it("renders the required banner text verbatim in the dialog", () => {
    assert.equal(
      LEGACY_SHEET_BANNER,
      "Demo emulation of PRGRSS 2.0. Tab order, frozen bands, column widths, row heights, hidden rows and columns, merged regions, number formats, conditional formatting kinds and formula shapes are read from the team workbook structure. All cell values and the dropdown item lists are synthetic. Formula string literals are withheld.",
    );
    const source = readFileSync(join(here, "dialog.tsx"), "utf8");
    assert.match(source, /\{LEGACY_SHEET_BANNER\}/);
  });
});

describe("merge skip and name box", () => {
  const tracker = WORKBOOK.find((tab) => tab.slug === "daily-tracker");

  it("skips merged regions on arrow moves", () => {
    const above = { r1: 7, c1: 2, r2: 7, c2: 2 };
    const merge = moveSelection(tracker, above, "down");
    assert.deepEqual(merge, { r1: 8, c1: 2, r2: 18, c2: 2 });
    const past = moveSelection(tracker, merge, "down");
    assert.deepEqual(past, { r1: 19, c1: 2, r2: 19, c2: 2 });
  });

  it("skips merges horizontally too", () => {
    const left = { r1: 8, c1: 1, r2: 8, c2: 1 };
    const merge = moveSelection(tracker, left, "right");
    assert.deepEqual(merge, { r1: 8, c1: 2, r2: 18, c2: 2 });
    const past = moveSelection(tracker, merge, "right");
    assert.deepEqual(past, { r1: 8, c1: 3, r2: 8, c2: 6 });
    const next = moveSelection(tracker, past, "right");
    assert.deepEqual(next, { r1: 8, c1: 7, r2: 18, c2: 7 });
  });

  it("jumps to B8 and B8:F12 through the name box", () => {
    assert.deepEqual(nameBoxJump(tracker, "B8"), {
      r1: 8,
      c1: 2,
      r2: 18,
      c2: 2,
    });
    assert.deepEqual(nameBoxJump(tracker, "B8:F12"), {
      r1: 8,
      c1: 2,
      r2: 18,
      c2: 6,
    });
  });

  it("rejects name-box input that is not a cell or range", () => {
    assert.equal(nameBoxJump(tracker, "not a cell"), null);
    assert.equal(nameBoxJump(tracker, "8B"), null);
  });
});
