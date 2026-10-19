import { describe, expect, it } from "vitest";

import { toSparseGrid } from "../../lib/catalog";
import type { ExtractionCell } from "../../lib/extraction/contracts";

function cell(over: Partial<ExtractionCell>): ExtractionCell {
  return {
    row: 1,
    col: 1,
    rowSpan: 1,
    colSpan: 1,
    class: "s0",
    text: "",
    ...over,
  };
}

describe("toSparseGrid", () => {
  const cells: ExtractionCell[] = [
    cell({ row: 1, col: 1, text: "BODYWEIGHT" }),
    cell({
      row: 2,
      col: 1,
      text: "[REDACTED:client.daily-entry]",
      normalized: 5,
    }),
    cell({ row: 3, col: 1, text: "", checkbox: "checked" }),
    cell({ row: 4, col: 1, text: "" }), // empty -> omitted
    cell({ row: 5, col: 2, text: "merged", rowSpan: 2, colSpan: 3 }),
  ];
  const grid = toSparseGrid(cells);

  it("omits empty cells but keeps the full grid extent (incl. spans)", () => {
    expect(grid.cells).toHaveLength(4);
    expect(grid.emptyOmitted).toBe(1);
    // merged cell at row 5 spans 2 rows and 3 cols -> extent covers it
    expect(grid.rows).toBe(6);
    expect(grid.cols).toBe(4);
  });
  it("never drops checkbox state, even when text is present", () => {
    const withText = toSparseGrid([
      cell({ row: 1, col: 1, text: "note", checkbox: "unchecked" }),
    ]);
    expect(withText.cells[0]).toMatchObject({
      kind: "checkbox",
      checkbox: "unchecked",
      text: "note",
    });
  });
  it("marks redacted cells and never exposes their value", () => {
    const redacted = grid.cells.find((c) => c.row === 2);
    expect(redacted?.kind).toBe("redacted");
    expect(redacted?.text).toBe("");
    expect(grid.redactedCount).toBe(1);
  });
  it("preserves checkboxes, coordinates, and merged spans", () => {
    expect(grid.cells.find((c) => c.row === 3)).toMatchObject({
      kind: "checkbox",
      checkbox: "checked",
    });
    expect(grid.cells.find((c) => c.row === 5)).toMatchObject({
      rowSpan: 2,
      colSpan: 3,
    });
  });
});
