import { describe, expect, it } from "vitest";

import { extractNutritionSource } from "../../lib/nutrition/source";

const HEADERS = [
  "NO.",
  "FOOD",
  "AMOUNT",
  "UNIT",
  "CALORIES (kcal)",
  "PROTEIN (g)",
  "CARBS (g)",
  "FATS (g)",
  "COOKED/RAW/DRY",
  "CAT",
];

function row(cells: string[], tag = "td"): string {
  return `<tr>${cells.map((text) => `<${tag}>${text}</${tag}>`).join("")}</tr>`;
}

function dataRow(values: Partial<Record<number, string>>): string {
  const cells = Array.from({ length: 11 }, (_, i) => values[i + 1] ?? "");
  return row(cells);
}

function html(dataRows: string[]): string {
  return `<html><body><table class="waffle"><tbody>
    ${row(["", ...HEADERS.map(() => "")], "th")}
    ${dataRow({ 2: "NO.", 3: "FOOD", 4: "AMOUNT", 5: "UNIT", 6: "CALORIES (kcal)", 7: "PROTEIN (g)", 8: "CARBS (g)", 9: "FATS (g)", 10: "COOKED/RAW/DRY", 11: "CAT" })}
    ${dataRows.join("\n")}
  </tbody></table></body></html>`;
}

const META = {
  sourceName: "Nutrition Database.html",
  sourceFingerprint: "fp-test-1",
};

describe("extractNutritionSource", () => {
  it("maps the real header set and classifies every candidate row explicitly", () => {
    const source = extractNutritionSource(
      html([
        dataRow({
          2: "1",
          3: "Chicken Breast (Cooked)",
          4: "100",
          5: "g",
          6: "145",
          7: "32",
          8: "0",
          9: "1.9",
          10: "Cooked Weight",
          11: "PRO",
        }),
        dataRow({ 2: "2" }),
        dataRow({ 2: "x", 3: "Weird row" }),
        dataRow({ 2: "3", 3: "Bad Calories", 6: "abc" }),
        dataRow({ 2: "1", 3: "Duplicate No" }),
        dataRow({
          2: "4",
          3: "Salmon (Raw)",
          4: "100",
          5: "g",
          6: "179",
          7: "22.1",
          8: "0",
          9: "10.1",
          10: "Raw Weight",
          11: "PRO",
        }),
        dataRow({ 2: "Footer note only" }),
        dataRow({}),
      ]),
      META,
    );

    expect(source.headerRow).toBe(1);
    expect(source.columns).toMatchObject({
      no: 2,
      food: 3,
      amount: 4,
      unit: 5,
      calories: 6,
      protein: 7,
      carbs: 8,
      fats: 9,
      state: 10,
      category: 11,
    });

    expect(source.accepted.map((r) => r.sourceNo)).toEqual([1, 4]);
    expect(source.rejected).toEqual([
      { sourceRow: 3, sourceNo: 2, reasonCode: "missing_food" },
      { sourceRow: 4, sourceNo: null, reasonCode: "invalid_source_number" },
      {
        sourceRow: 5,
        sourceNo: 3,
        reasonCode: "invalid_numeric",
        reasonField: "calories",
      },
      { sourceRow: 8, sourceNo: null, reasonCode: "non_data_row" },
    ]);
    expect(source.duplicates).toEqual([
      { sourceRow: 6, sourceNo: 1, reasonCode: "duplicate_source_number" },
    ]);

    expect(source.ignoredEmptyRowCount).toBe(1);
    expect(source.sourceRowCount).toBe(
      source.accepted.length +
        source.rejected.length +
        source.duplicates.length,
    );
    expect(source.scannedRowCount).toBe(
      source.sourceRowCount + source.ignoredEmptyRowCount,
    );
  });

  it("parses numeric source values and preserves descriptors verbatim", () => {
    const source = extractNutritionSource(
      html([
        dataRow({
          2: "1",
          3: "Fists of rice",
          4: "1",
          5: "fists",
          6: "204",
          7: "4.2",
          8: "44.1",
          9: "0.4",
          10: "Dry Weight",
          11: "CHO",
        }),
        dataRow({ 2: "2", 3: "Mystery", 4: "" }),
      ]),
      META,
    );
    const first = source.accepted[0];
    expect(first).toMatchObject({
      sourceNo: 1,
      name: "Fists of rice",
      amount: 1,
      unit: "fists",
      calories: 204,
      protein: 4.2,
      carbs: 44.1,
      fats: 0.4,
      state: "Dry Weight",
      category: "CHO",
    });
    // Empty macro cells stay null (never 0); empty descriptors stay null.
    expect(source.accepted[1]).toMatchObject({
      sourceNo: 2,
      amount: null,
      unit: null,
      calories: null,
      protein: null,
      carbs: null,
      fats: null,
      state: null,
      category: null,
    });
  });

  it("computes a stable content fingerprint that changes with content", () => {
    const build = (name: string) =>
      extractNutritionSource(
        html([dataRow({ 2: "1", 3: name, 4: "100", 5: "g", 6: "145" })]),
        META,
      ).accepted[0].rowFingerprint;
    const a = build("Chicken");
    const b = build("Chicken");
    const c = build("Beef");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when a required header is missing", () => {
    const bad = `<table class="waffle"><tbody>
      ${dataRow({ 2: "NO.", 4: "AMOUNT" })}
      ${dataRow({ 2: "1", 3: "No food header" })}
    </tbody></table>`;
    expect(() => extractNutritionSource(bad, META)).toThrow(/header/i);
  });
});
