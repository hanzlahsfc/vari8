import { describe, expect, it } from "vitest";

import { toSparseGrid } from "../../lib/catalog";
import { getSheetArtifact, getSheetSummary } from "../../lib/spec-artifacts";

describe("committed sheet artifacts", () => {
  it("summarises safe section labels", () => {
    const summary = getSheetSummary("daily-tracker");
    expect(
      summary.sections.some((section) => section.label === "BODYWEIGHT"),
    ).toBe(true);
  });

  it("builds a sparse grid that distinguishes redacted from empty", () => {
    const grid = toSparseGrid(getSheetArtifact("daily-tracker").cells);
    expect(grid.cells.length).toBeGreaterThan(0);
    expect(grid.redactedCount).toBeGreaterThan(0);
    expect(grid.emptyOmitted).toBeGreaterThan(1000);
    expect(grid.cells.some((cell) => cell.kind === "redacted")).toBe(true);
  });

  it("keeps the MENSES phase guide and redacts client values", () => {
    const grid = toSparseGrid(getSheetArtifact("menses").cells);
    expect(grid.cells.some((cell) => cell.text === "MENSTRUAL")).toBe(true);
    expect(grid.redactedCount).toBeGreaterThan(0);
  });
});
