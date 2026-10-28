// CATALOGUE-LABEL-ENTRY (#186) — deterministic validation-boundary tests.

import { describe, expect, it } from "vitest";

import {
  LabelEntryError,
  nutrientUnits,
  parseLabelEntry,
} from "../../lib/nutrition/label-entry";

const PHOTO = "a".repeat(64);
const BASE = {
  name: "Skyr Islandsky Blueberry",
  brand: "Fruvita",
  barcode: "3017620422003",
  provenance: {
    labelPhotoSha256: PHOTO,
    licence: "label photo © manufacturer, factual data no licence",
    capturedFrom: "package label",
  },
};
const macros = (over: object = {}) => ({
  code: "protein",
  value: 11,
  unit: "g",
  basis: "per 100 g" as const,
  ...over,
});

describe("parseLabelEntry", () => {
  it("accepts a complete label record with provenance", () => {
    const r = parseLabelEntry({
      ...BASE,
      variant: { kind: "flavour", label: "blueberry" },
      servingSizeG: 150,
      nutrients: [
        macros(),
        macros({ code: "fat", value: 0.2 }),
        macros({ code: "carbs", value: 4.5 }),
        macros({ code: "sugar", value: 0 }), // real zero kept
      ],
    });
    expect(r.name).toBe("Skyr Islandsky Blueberry");
    expect(r.variant).toEqual({ kind: "flavour", label: "blueberry" });
    expect(r.servingSizeG).toBe(150);
    expect(r.nutrients.find((n) => n.code === "sugar")?.value).toBe(0);
    expect(r.nutrients.map((n) => n.code)).toEqual([
      "protein",
      "fats",
      "carbs",
      "sugar",
    ]);
    expect(r.provenance.labelPhotoSha256).toBe(PHOTO);
    expect(r.provenance.capturedBy).toBe("manual-label-entry");
  });

  it("preserves missing values as null — never a fabricated 0", () => {
    const r = parseLabelEntry({
      ...BASE,
      nutrients: [macros(), macros({ code: "fibre", value: null })],
    });
    expect(r.nutrients.find((n) => n.code === "fibre")?.value).toBeNull();
  });

  it.each([
    ["negative", { value: -1 }],
    ["non-finite", { value: Number.NaN }],
    ["unsupported unit", { unit: "oz" }],
    ["invalid basis", { basis: "per portion" }],
    ["missing code", { code: "" }],
    ["protein in kcal", { unit: "kcal" }],
    ["unknown nutrient code", { code: "unicornium" }],
    ["unknown code in g", { code: "unknown-x", unit: "g" }],
    ["calories in g", { code: "calories", unit: "g" }],
    ["fats in kcal", { code: "fats", unit: "kcal" }],
  ])("rejects %s measurement", (_label, over) => {
    expect(() =>
      parseLabelEntry({ ...BASE, nutrients: [macros(over)] }),
    ).toThrow(LabelEntryError);
  });

  it("per-serving basis requires a declared servingSizeG", () => {
    expect(() =>
      parseLabelEntry({
        ...BASE,
        nutrients: [macros({ basis: "per serving" })],
      }),
    ).toThrowError(/servingSizeG/);
    const r = parseLabelEntry({
      ...BASE,
      servingSizeG: 150,
      nutrients: [macros({ basis: "per serving", value: 16.5 })],
    });
    expect(r.nutrients[0].value).toBe(16.5);
  });

  it.each([
    ["missing photo hash", { labelPhotoSha256: "not-hex" }],
    ["missing licence", { licence: "" }],
    ["missing capturedFrom", { capturedFrom: "" }],
  ])("rejects %s provenance", (_label, prov) => {
    expect(() =>
      parseLabelEntry({
        ...BASE,
        nutrients: [macros()],
        provenance: { ...BASE.provenance, ...prov },
      }),
    ).toThrow(LabelEntryError);
  });

  it("rejects non-object input and non-digit barcode", () => {
    expect(() => parseLabelEntry(null)).toThrow(LabelEntryError);
    expect(() =>
      parseLabelEntry({ ...BASE, barcode: "abc", nutrients: [macros()] }),
    ).toThrow(LabelEntryError);
  });

  it("barcode is optional; supplied values must satisfy GTIN checksums", () => {
    // absent → null, no validation
    const noBarcode = { ...BASE };
    delete (noBarcode as Record<string, unknown>).barcode;
    expect(
      parseLabelEntry({ ...noBarcode, nutrients: [macros()] }).barcode,
    ).toBeNull();
    // valid GTINs across lengths
    for (const b of [
      "3017620422003",
      "30176249",
      "301762042230",
      "03017620422003",
    ])
      expect(
        parseLabelEntry({ ...BASE, barcode: b, nutrients: [macros()] }).barcode,
      ).toBe(b);
    // invalid checksum / wrong length / non-string refuse
    for (const b of ["3017620422004", "3017620422", 12345678, "1"]) {
      expect(() =>
        parseLabelEntry({
          ...BASE,
          barcode: b as unknown as string,
          nutrients: [macros()],
        }),
      ).toThrow(LabelEntryError);
    }
  });

  it("valid nutrient/unit pairs accept; incompatible pairs refuse", () => {
    expect(nutrientUnits("protein")).toEqual(["g"]);
    expect(nutrientUnits("calories")).toEqual(["kcal"]);
    expect(nutrientUnits("energy")).toEqual(["kJ", "kcal"]); // unit-resolved alias
    expect(nutrientUnits("vitamin_a")).toEqual(["µg", "ug"]);
    expect(() =>
      parseLabelEntry({ ...BASE, nutrients: [macros({ unit: "kcal" })] }),
    ).toThrow(LabelEntryError); // protein in kcal — the review's case
    const r = parseLabelEntry({
      ...BASE,
      nutrients: [
        macros({ code: "energy", unit: "kcal" }),
        macros({ code: "energy-kj", unit: "kJ" }),
      ],
    });
    expect(r.nutrients).toHaveLength(2);
  });
});
