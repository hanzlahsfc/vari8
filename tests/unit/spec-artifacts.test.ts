import { describe, expect, it } from "vitest";

import { toSparseGrid } from "../../lib/catalog";
import {
  getExercises,
  getFoods,
  getSheetArtifact,
  getSheetSummary,
  listSheets,
} from "../../lib/spec-artifacts";

// These read the committed artifacts (reproducible without the external source).
describe("committed reference artifacts", () => {
  it("exposes the committed food count and fields", () => {
    const foods = getFoods();
    expect(foods.count).toBe(599);
    expect(foods.records).toHaveLength(599);
    expect(foods.records[0]).toHaveProperty("food");
    expect(foods.records[0]).toHaveProperty("sourceRow");
  });

  it("exposes the committed exercise count", () => {
    const exercises = getExercises();
    expect(exercises.count).toBe(546);
    expect(exercises.records).toHaveLength(546);
  });

  it("lists the 11 sheets in source order with original names", () => {
    const sheets = listSheets();
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "DAILY TRACKER",
      "DASHBOARD",
      "TIMELINE",
      "MEALPLAN",
      "SUPPLEMENTATION",
      "MENSES",
      "TRAINING",
      "PEAKING",
      "SHOWDAY",
      "Exercise Database",
      "Nutrition Database",
    ]);
  });
});

describe("committed sheet artifacts", () => {
  it("summarises safe section labels", () => {
    const summary = getSheetSummary("daily-tracker");
    expect(summary.sections.some((section) => section.label === "BODYWEIGHT")).toBe(true);
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
