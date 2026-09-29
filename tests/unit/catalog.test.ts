import { describe, expect, it } from "vitest";

import {
  exerciseFacets,
  foodCategories,
  searchExercises,
  searchFoods,
  sheetDisplayName,
  toSparseGrid,
} from "../../lib/catalog";
import type {
  ExerciseRecord,
  ExtractionCell,
  FoodRecord,
} from "../../lib/extraction/contracts";

function food(over: Partial<FoodRecord>): FoodRecord {
  return {
    no: "1",
    food: "Food",
    amount: "100",
    unit: "g",
    calories: "100",
    protein: "1",
    carbs: "1",
    fats: "1",
    state: "Raw Weight",
    category: "PRO",
    sourceRow: 4,
    ...over,
  };
}

function exercise(over: Partial<ExerciseRecord>): ExerciseRecord {
  return {
    id: "1",
    name: "Exercise",
    muscleGroup: "Core",
    primaryTarget: "Abdominals",
    additionalTargets: "",
    equipment: "Cable",
    movementPattern: "Trunk Flexion",
    positionSetup: "Not specified",
    cues: "",
    videoLink: "",
    sourceRow: 4,
    ...over,
  };
}

const FOODS = [
  food({
    no: "1",
    food: "Oats",
    category: "CHO",
    state: "Dry Weight",
    sourceRow: 4,
  }),
  food({
    no: "2",
    food: "Chicken Breast",
    category: "PRO",
    unit: "g",
    sourceRow: 5,
  }),
  food({
    no: "3",
    food: "Olive Oil",
    category: "FAT",
    unit: "ml",
    sourceRow: 6,
  }),
];

const EXERCISES = [
  exercise({
    id: "1",
    name: "Ab Wheel Rollout",
    muscleGroup: "Core",
    equipment: "Ab Wheel",
    sourceRow: 4,
  }),
  exercise({
    id: "2",
    name: "Cable Crunch",
    muscleGroup: "Core",
    equipment: "Cable",
    movementPattern: "Trunk Flexion",
    sourceRow: 5,
  }),
  exercise({
    id: "3",
    name: "Bench Press",
    muscleGroup: "Chest",
    equipment: "Barbell",
    movementPattern: "Horizontal Press",
    sourceRow: 6,
  }),
];

describe("searchFoods", () => {
  it("preserves source order when no query is given", () => {
    expect(searchFoods(FOODS, "").map((r) => r.food)).toEqual([
      "Oats",
      "Chicken Breast",
      "Olive Oil",
    ]);
  });
  it("matches name, category, state, and unit (case-insensitive)", () => {
    expect(searchFoods(FOODS, "oats").map((r) => r.no)).toEqual(["1"]);
    expect(searchFoods(FOODS, "fat").map((r) => r.no)).toEqual(["3"]);
    expect(searchFoods(FOODS, "dry").map((r) => r.no)).toEqual(["1"]);
    expect(searchFoods(FOODS, "ml").map((r) => r.no)).toEqual(["3"]);
  });
  it("filters by category", () => {
    expect(searchFoods(FOODS, "", "PRO").map((r) => r.food)).toEqual([
      "Chicken Breast",
    ]);
  });
});

describe("foodCategories", () => {
  it("returns unique, sorted, non-empty categories", () => {
    expect(foodCategories([...FOODS, food({ category: "" })])).toEqual([
      "CHO",
      "FAT",
      "PRO",
    ]);
  });
});

describe("searchExercises", () => {
  it("filters by muscle group and equipment", () => {
    expect(
      searchExercises(EXERCISES, "", { muscleGroup: "Core" }).map(
        (r) => r.name,
      ),
    ).toEqual(["Ab Wheel Rollout", "Cable Crunch"]);
    expect(
      searchExercises(EXERCISES, "", { equipment: "Cable" }).map((r) => r.name),
    ).toEqual(["Cable Crunch"]);
  });
  it("matches query across name/target/equipment/pattern", () => {
    expect(searchExercises(EXERCISES, "press").map((r) => r.name)).toEqual([
      "Bench Press",
    ]);
    expect(searchExercises(EXERCISES, "abdominals")).toHaveLength(3);
  });
});

describe("exerciseFacets", () => {
  it("returns unique sorted facets", () => {
    expect(exerciseFacets(EXERCISES)).toEqual({
      muscleGroups: ["Chest", "Core"],
      equipment: ["Ab Wheel", "Barbell", "Cable"],
    });
  });
});

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

describe("sheetDisplayName", () => {
  it("strips the html extension", () => {
    expect(sheetDisplayName("DAILY TRACKER.html")).toBe("DAILY TRACKER");
    expect(sheetDisplayName("Exercise Database.html")).toBe(
      "Exercise Database",
    );
  });
});
