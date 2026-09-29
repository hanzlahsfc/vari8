import { describe, expect, it } from "vitest";

import type { ExtractionCell } from "../../lib/extraction/contracts";
import { buildSheetSummary, SUMMARY_CONFIG } from "../../lib/extraction/summaries";

function cell(row: number, col: number, text: string): ExtractionCell {
  return { row, col, rowSpan: 1, colSpan: 1, class: "s1", text };
}

const CELLS: ExtractionCell[] = [
  cell(8, 3, "DATE & PHASE"),
  cell(8, 7, "BODYWEIGHT"),
  cell(3, 1, "WEEK 1"),
  cell(10, 1, "WEEK 2"),
  cell(18, 1, "Averages"),
  cell(50, 1, "Averages"),
  cell(99, 5, "Just Some Value"),
];

describe("buildSheetSummary", () => {
  const summary = buildSheetSummary("daily-tracker", "DAILY TRACKER.html", CELLS);

  it("reports counts from the cells", () => {
    expect(summary.cellCount).toBe(7);
    expect(summary.rowCount).toBe(99);
    expect(summary.colCount).toBe(7);
    expect(summary.spannedCellCount).toBe(0);
  });

  it("locates curated static labels only", () => {
    expect(summary.sections).toEqual([
      { label: "DATE & PHASE", row: 8, col: 3 },
      { label: "BODYWEIGHT", row: 8, col: 7 },
    ]);
  });

  it("detects repeated blocks by safe markers", () => {
    const averages = summary.repeatedBlocks.find((block) => block.kind === "week-block");
    expect(averages?.count).toBe(2);
    expect(averages?.firstRow).toBe(18);
    expect(averages?.lastRow).toBe(50);
    const headers = summary.repeatedBlocks.find((block) => block.kind === "week-header");
    expect(headers?.count).toBe(2);
    expect(headers?.distinctValues).toBe(2);
  });

  it("records TODO(product) uncertainty", () => {
    expect(summary.todos.some((todo) => todo.startsWith("TODO(product)"))).toBe(true);
  });

  it("never emits arbitrary cell text (privacy)", () => {
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("Just Some Value");
    const allowed = new Set(SUMMARY_CONFIG["daily-tracker"].labels);
    expect(summary.sections.every((section) => allowed.has(section.label))).toBe(true);
  });
});
