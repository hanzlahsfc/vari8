import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { extractExercises, extractFoods } from "../../lib/extraction/databases";
import type { ExerciseExtraction, FoodExtraction } from "../../lib/extraction/databases";
import { DEFAULT_SHEETS_SOURCE_DIR } from "../../lib/extraction/source";

const SOURCE_EXISTS = existsSync(DEFAULT_SHEETS_SOURCE_DIR);
let foods: FoodExtraction;
let exercises: ExerciseExtraction;

beforeAll(() => {
  foods = extractFoods(readFileSync(join(DEFAULT_SHEETS_SOURCE_DIR, "Nutrition Database.html"), "utf8"));
  exercises = extractExercises(
    readFileSync(join(DEFAULT_SHEETS_SOURCE_DIR, "Exercise Database.html"), "utf8"),
  );
}, 120_000);

describe.skipIf(!SOURCE_EXISTS)("real database extraction", () => {
  it("extracts the expected row counts", () => {
    expect(foods.records).toHaveLength(599);
    expect(exercises.records).toHaveLength(546);
    expect(foods.skippedNumberedRows).toBe(60);
  });

  it("resolves headers and keeps source order / traceability", () => {
    expect(foods.headerRow).toBe(2);
    expect(exercises.headerRow).toBe(2);
    expect(foods.missingHeaders).toEqual([]);
    expect(exercises.missingHeaders).toEqual([]);
    for (const list of [foods.records, exercises.records]) {
      const rows = list.map((r) => r.sourceRow);
      expect(rows.every((row) => row >= 4)).toBe(true);
      expect([...rows].sort((a, b) => a - b)).toEqual(rows);
    }
  });

  it("has non-empty identity fields and preserved empties", () => {
    expect(foods.records.every((r) => /^\d+$/.test(r.no) && r.food !== "")).toBe(true);
    expect(exercises.records.every((r) => /^\d+$/.test(r.id) && r.name !== "")).toBe(true);
    // empty fields stay empty strings, never fabricated
    expect(foods.records.some((r) => r.category === "")).toBe(true);
    expect(exercises.records.some((r) => r.additionalTargets === "")).toBe(true);
  });

  it("normalizes comma decimals additively without altering source text", () => {
    const comma = foods.records.find((r) => /^\d+,\d+$/.test(r.fats));
    if (comma) {
      expect(comma.fats).toContain(",");
      expect(comma.normalized?.fats).toBe(Number(comma.fats.replace(",", ".")));
    }
    const dot = foods.records.find((r) => /^\d+\.\d+$/.test(r.fats));
    if (dot) expect(dot.normalized?.fats).toBe(Number(dot.fats));
  });

  it("contains no emails or client identifiers (privacy guard)", () => {
    const values = [
      ...foods.records.flatMap((r) => Object.values(r)),
      ...exercises.records.flatMap((r) => Object.values(r)),
    ].filter((v): v is string => typeof v === "string");
    expect(values.some((v) => v.includes("@"))).toBe(false);
  });

  it("is deterministic", () => {
    const html = readFileSync(join(DEFAULT_SHEETS_SOURCE_DIR, "Nutrition Database.html"), "utf8");
    expect(JSON.stringify(extractFoods(html))).toBe(JSON.stringify(extractFoods(html)));
  });
});
