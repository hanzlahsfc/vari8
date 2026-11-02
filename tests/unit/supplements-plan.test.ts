// PR-SUPP — supplement-plan validation, ported from the approved
// FRONTEND supplements model semantics (origin/FRONTEND 51fa6a2):
// positive quantity, catalogue-compatible dose unit, the closed status
// set, safe product URLs, missing composition preserved as null — never
// zero-filled.

import { describe, expect, it } from "vitest";

import {
  MAX_SUPPLEMENT_ITEMS,
  parseSupplementItems,
  parseSupplementPlanName,
  safeProductUrl,
  SupplementValidationError,
} from "../../lib/supplements/model";

const product = {
  id: "prod_1",
  brand: "Acme",
  name: "Vitamin D3 5600 IU",
  referenceQuantity: 1,
  quantityUnit: "capsules",
  declaredAmount: 5600,
  declaredUnit: "IU",
  url: "https://shop.example.test/d3",
};

const item = {
  id: "row_1",
  product,
  quantity: 2,
  doseUnit: "capsules",
  timing: "with breakfast",
  status: "must-have",
  notes: "take daily",
};

describe("safeProductUrl", () => {
  it("accepts http/https product links and rejects the rest", () => {
    expect(safeProductUrl("https://shop.example.test/p")).toBe(
      "https://shop.example.test/p",
    );
    expect(safeProductUrl("http://shop.example.test/p")).toBe(
      "http://shop.example.test/p",
    );
    expect(safeProductUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeProductUrl("data:text/html,x")).toBeUndefined();
    // Scheme-only invalid: parses fine and has a hostname — only the
    // http(s) scheme check refuses it.
    expect(safeProductUrl("ftp://shop.example.test/x")).toBeUndefined();
    expect(
      safeProductUrl("https://user:pw@shop.example.test/p"),
    ).toBeUndefined();
    expect(safeProductUrl("not a url")).toBeUndefined();
    expect(safeProductUrl("")).toBeUndefined();
    expect(safeProductUrl(null)).toBeUndefined();
  });
});

describe("parseSupplementPlanName", () => {
  it("trims and accepts a normal name, rejects empty/oversized", () => {
    expect(parseSupplementPlanName("  Supplement plan ")).toBe(
      "Supplement plan",
    );
    expect(() => parseSupplementPlanName("")).toThrow(
      SupplementValidationError,
    );
    expect(() => parseSupplementPlanName("x".repeat(121))).toThrow(
      SupplementValidationError,
    );
    expect(() => parseSupplementPlanName(42)).toThrow(
      SupplementValidationError,
    );
  });
});

describe("parseSupplementItems", () => {
  it("accepts a valid ordered list and returns literal values", () => {
    const out = parseSupplementItems([
      item,
      { ...item, id: "row_2", status: "optional", notes: "" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].status).toBe("must-have");
    expect(out[0].quantity).toBe(2);
    expect(out[0].doseUnit).toBe("capsules");
    expect(out[0].timing).toBe("with breakfast");
    expect(out[0].product.brand).toBe("Acme");
    expect(out[0].product.declaredAmount).toBe(5600);
    expect(out[0].product.declaredUnit).toBe("IU");
    expect(out[1].status).toBe("optional");
  });

  it("accepts the full closed status set", () => {
    for (const status of ["must-have", "optional", "none"])
      expect(parseSupplementItems([{ ...item, status }])[0].status).toBe(
        status,
      );
  });

  it("accepts the same product twice and preserves the missing-composition null", () => {
    const sparse = {
      ...product,
      referenceQuantity: null,
      quantityUnit: null,
      declaredAmount: null,
      declaredUnit: null,
      url: null,
    };
    const out = parseSupplementItems([
      { ...item, product: sparse, doseUnit: "reference units", notes: "" },
      { ...item, id: "row_b", product, notes: "" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].product.declaredAmount).toBeNull();
    expect(out[0].product.referenceQuantity).toBeNull();
    expect(out[0].product.url).toBeNull();
    expect(out[0].doseUnit).toBe("reference units");
  });

  it("rejects non-positive and non-finite quantities", () => {
    for (const quantity of [0, -1, NaN, Infinity, "2"])
      expect(() => parseSupplementItems([{ ...item, quantity }])).toThrow(
        SupplementValidationError,
      );
  });

  it("rejects a dose unit that disagrees with a catalogue-known unit", () => {
    expect(() =>
      parseSupplementItems([{ ...item, doseUnit: "grams" }]),
    ).toThrow(SupplementValidationError);
    // When the catalogue knows no unit the coach-confirmed unit stands.
    const out = parseSupplementItems([
      {
        ...item,
        product: { ...product, quantityUnit: null },
        doseUnit: "sprays",
      },
    ]);
    expect(out[0].doseUnit).toBe("sprays");
  });

  it("rejects unknown and uppercase statuses", () => {
    for (const status of ["taken", "MUST_HAVE", "active", "", 1])
      expect(() => parseSupplementItems([{ ...item, status }])).toThrow(
        SupplementValidationError,
      );
  });

  it("rejects unsafe product urls but accepts a null url", () => {
    for (const url of [
      "javascript:alert(1)",
      "https://u:p@shop.example.test/x",
      42,
    ])
      expect(() =>
        parseSupplementItems([{ ...item, product: { ...product, url } }]),
      ).toThrow(SupplementValidationError);
    expect(
      parseSupplementItems([{ ...item, product: { ...product, url: null } }])[0]
        .product.url,
    ).toBeNull();
  });

  it("rejects malformed product snapshot fields", () => {
    const bad: Record<string, unknown>[] = [
      { referenceQuantity: 0 },
      { referenceQuantity: -1 },
      { declaredAmount: -0.5 },
      { brand: "" },
      { name: "" },
      { id: "" },
      { quantityUnit: 5 },
      { declaredUnit: {} },
    ];
    for (const patch of bad)
      expect(() =>
        parseSupplementItems([{ ...item, product: { ...product, ...patch } }]),
      ).toThrow(SupplementValidationError);
  });

  it("rejects missing product, non-string fields and unknown item keys", () => {
    expect(() => parseSupplementItems([{ ...item, product: null }])).toThrow(
      SupplementValidationError,
    );
    expect(() => parseSupplementItems([{ ...item, timing: 3 }])).toThrow(
      SupplementValidationError,
    );
    expect(() => parseSupplementItems([{ ...item, notes: [] }])).toThrow(
      SupplementValidationError,
    );
    expect(() => parseSupplementItems([{ ...item, taken: true }])).toThrow(
      SupplementValidationError,
    );
    expect(() => parseSupplementItems("nope")).toThrow(
      SupplementValidationError,
    );
    expect(() =>
      parseSupplementItems(new Array(MAX_SUPPLEMENT_ITEMS + 1).fill(item)),
    ).toThrow(SupplementValidationError);
  });

  it("rejects oversized timing and notes", () => {
    expect(() =>
      parseSupplementItems([{ ...item, timing: "t".repeat(201) }]),
    ).toThrow(SupplementValidationError);
    expect(() =>
      parseSupplementItems([{ ...item, notes: "n".repeat(2001) }]),
    ).toThrow(SupplementValidationError);
  });
});
