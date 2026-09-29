import { describe, expect, it } from "vitest";

import type { ExtractionCell } from "../../lib/extraction/contracts";
import { buildCrossSheetData, renderCrossSheetMarkdown } from "../../lib/extraction/crosssheet";

function cell(row: number, col: number, text: string): ExtractionCell {
  return { row, col, rowSpan: 1, colSpan: 1, class: "s1", text };
}

const sheets = [
  { slug: "nutrition-database", cells: [cell(4, 3, "Oats"), cell(5, 3, "Whey Protein")] },
  { slug: "mealplan", cells: [cell(10, 24, "Oats"), cell(9, 31, "NOTES"), cell(11, 5, "Jane Client Value")] },
  { slug: "showday", cells: [cell(7, 10, "NOTES"), cell(8, 1, "Jane Client Value")] },
];

const foodNames = new Set(["Oats", "Whey Protein"]);
const exerciseNames = new Set<string>();
const safeLabels = new Set(["NOTES"]);

const data = buildCrossSheetData({ sheets, foodNames, exerciseNames, safeLabels });

describe("buildCrossSheetData", () => {
  it("finds reference-data text matches with locations", () => {
    expect(data.foods.map((entry) => entry.value)).toEqual(["Oats"]);
    expect(data.foods[0].locations).toEqual([
      { slug: "mealplan", row: 10, col: 24, count: 1 },
      { slug: "nutrition-database", row: 4, col: 3, count: 1 },
    ]);
  });

  it("finds shared static labels only when in 2+ sheets", () => {
    expect(data.labels.map((entry) => entry.value)).toEqual(["NOTES"]);
    expect(data.labels[0].locations.map((l) => l.slug)).toEqual(["mealplan", "showday"]);
  });

  it("omits values that are not reference data or safe labels (privacy)", () => {
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("Jane Client Value");
    const allSafe = new Set([...foodNames, ...exerciseNames, ...safeLabels]);
    for (const entry of [...data.foods, ...data.exercises, ...data.labels]) {
      expect(allSafe.has(entry.value)).toBe(true);
    }
  });

  it("renders markdown without leaking non-safe values", () => {
    const markdown = renderCrossSheetMarkdown(data);
    expect(markdown).toContain("Oats");
    expect(markdown).not.toContain("Jane Client Value");
    expect(markdown).toContain("Client-bearing values — intentionally omitted");
  });
});
