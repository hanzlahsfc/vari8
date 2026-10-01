import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Phase 3 source-data policy guard.
 *
 * The trusted `npm run import:nutrition` / `npm run import:exercise` paths are
 * the only approved ways to bring real catalog data into PostgreSQL. No full
 * copied Nutrition/Exercise catalog dump may be committed: the committed
 * catalog artifacts must be small, explicitly synthetic fixtures that cannot
 * be mistaken for a real PRGRSS export.
 */

const SPEC = join(process.cwd(), "spec");
const readJson = (relativePath: string): unknown =>
  JSON.parse(readFileSync(join(SPEC, relativePath), "utf8"));
const readText = (relativePath: string): string =>
  readFileSync(join(SPEC, relativePath), "utf8");

const SYNTHETIC = /SYNTHETIC/i;
const MAX_FIXTURE_RECORDS = 10;
const MAX_FIXTURE_CELLS = 10;

describe("source-data policy: committed catalog artifacts are synthetic fixtures", () => {
  it("foods.json is a synthetic fixture, not a copied Nutrition Database dump", () => {
    const foods = readJson("data/foods.json") as {
      sourceFile: string;
      records: { food: string }[];
    };
    expect(foods.records.length).toBeLessThanOrEqual(MAX_FIXTURE_RECORDS);
    expect(foods.sourceFile).toMatch(SYNTHETIC);
    for (const record of foods.records) {
      expect(record.food).toMatch(SYNTHETIC);
    }
  });

  it("exercises.json is a synthetic fixture, not a copied Exercise Database dump", () => {
    const exercises = readJson("data/exercises.json") as {
      sourceFile: string;
      records: { name: string }[];
    };
    expect(exercises.records.length).toBeLessThanOrEqual(MAX_FIXTURE_RECORDS);
    expect(exercises.sourceFile).toMatch(SYNTHETIC);
    for (const record of exercises.records) {
      expect(record.name).toMatch(SYNTHETIC);
    }
  });

  it("catalog sheet grids are synthetic fixtures", () => {
    for (const slug of ["nutrition-database", "exercise-database"]) {
      const artifact = readJson(`sheets/${slug}.json`) as {
        sourceFile: string;
        cells: { text: string }[];
      };
      expect(artifact.sourceFile).toMatch(SYNTHETIC);
      const nonEmpty = artifact.cells.filter((cell) => cell.text.trim() !== "");
      expect(nonEmpty.length).toBeLessThanOrEqual(MAX_FIXTURE_CELLS);
    }
  });

  it("contains none of the known real catalog records", () => {
    const committed = [
      readText("data/foods.json"),
      readText("data/exercises.json"),
      readText("sheets/nutrition-database.json"),
      readText("sheets/exercise-database.json"),
    ].join("\n");
    expect(committed).not.toMatch(/Chicken Breast/i);
    expect(committed).not.toMatch(/Lean Beef Mince/i);
    expect(committed).not.toMatch(/Bench Press/i);
  });
});
