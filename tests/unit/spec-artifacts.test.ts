import { describe, expect, it } from "vitest";

import { toSparseGrid } from "../../lib/catalog";
import {
  getExercises,
  getFoods,
  getSheetArtifact,
  getSheetSummary,
  listSheets,
} from "../../lib/spec-artifacts";

// These read the committed artifacts. The catalog fixtures are synthetic
// placeholders (real catalog data is imported into PostgreSQL via
// `npm run import:nutrition`; see tests/unit/source-data-policy.test.ts).
describe("committed reference artifacts", () => {
  it("exposes the committed synthetic food fixture count and fields", () => {
    const foods = getFoods();
    expect(foods.count).toBe(3);
    expect(foods.records).toHaveLength(3);
    expect(foods.sourceFile).toMatch(/SYNTHETIC/);
    expect(foods.records[0]).toHaveProperty("food");
    expect(foods.records[0]).toHaveProperty("sourceRow");
  });

  it("exposes the committed synthetic exercise fixture count", () => {
    const exercises = getExercises();
    expect(exercises.count).toBe(2);
    expect(exercises.records).toHaveLength(2);
    expect(exercises.sourceFile).toMatch(/SYNTHETIC/);
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
