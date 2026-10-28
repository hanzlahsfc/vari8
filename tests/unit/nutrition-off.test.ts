// CATALOGUE-OFF (#185) — deterministic lookup-boundary tests.
// Injected fetch: no live network dependency in the unit suite.

import { describe, expect, it } from "vitest";

import {
  isValidBarcode,
  lookupOffProduct,
  OFF_ATTRIBUTION,
  type OffFetch,
} from "../../lib/nutrition/off";

const fetchOf = (status: number, body: unknown): OffFetch => {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
};

const FROZEN_PIZZA = {
  status: 1,
  code: "3017620422003",
  product: {
    product_name: "Pizza Margherita",
    brands: "Doe Foods, Example Co",
    quantity: "350 g",
    nutriments: {
      "energy-kj_100g": 1025,
      "energy-kcal_100g": 245,
      proteins_100g: 11.4,
      carbohydrates_100g: 30.2,
      fat_100g: 8.3,
      sugars_100g: 0, // a REAL zero — must stay 0
      proteins_unit: "g",
      carbohydrates_unit: "g",
      fat_unit: "g",
      sugars_unit: "g",
      "energy-kj_unit": "kJ",
      "energy-kcal_unit": "kcal",
      sodium_100g: 0.0012,
      sodium_unit: "g",
      // bogus entries that must be dropped, never guessed
      salt_100g: "not-a-number",
      mystery_100g: { nested: true },
      fiber_100g: null,
      fiber_unit: "g",
    },
  },
};

describe("lookupOffProduct", () => {
  it("returns a normalized product with verbatim values and provenance", async () => {
    const r = await lookupOffProduct("3017620422003", {
      fetchImpl: fetchOf(200, FROZEN_PIZZA),
    });
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    const p = r.product;
    expect(p.barcode).toBe("3017620422003");
    expect(p.name).toBe("Pizza Margherita");
    expect(p.brands).toEqual(["Doe Foods", "Example Co"]);
    expect(p.nutrients.find((n) => n.code === "proteins")?.value).toBe(11.4);
    expect(p.nutrients.find((n) => n.code === "proteins")?.unit).toBe("g");
    // real zero preserved, not treated as missing
    expect(p.nutrients.find((n) => n.code === "sugars")?.value).toBe(0);
    // provenance carries the required ODbL attribution
    expect(p.provenance.attribution).toBe(OFF_ATTRIBUTION);
    expect(p.provenance.licence).toBe("ODbL-1.0");
    expect(p.provenance.productUrl).toContain("3017620422003");
  });

  it("drops malformed/untrusted nutrient fields instead of guessing", async () => {
    const r = await lookupOffProduct("3017620422003", {
      fetchImpl: fetchOf(200, FROZEN_PIZZA),
    });
    if (r.status !== "found") throw new Error("expected found");
    const codes = r.product.nutrients.map((n) => n.code);
    expect(codes).not.toContain("salt"); // string, not a number
    expect(codes).not.toContain("mystery"); // object value
    expect(codes).not.toContain("fiber"); // null value
  });

  it("status 0 → not_found, not an error", async () => {
    const r = await lookupOffProduct("0000000000000", {
      fetchImpl: fetchOf(200, { status: 0 }),
    });
    expect(r).toEqual({ status: "not_found", barcode: "0000000000000" });
  });

  it.each([
    ["letters", "abc"],
    ["too short", "123"],
    ["empty", ""],
    ["with dashes", "3017-620422"],
  ])("invalid barcode %s refuses before any fetch", async (_label, code) => {
    let called = false;
    await expect(
      lookupOffProduct(code, {
        fetchImpl: async () => {
          called = true;
          return { ok: true, status: 200, json: async () => ({}) };
        },
      }),
    ).rejects.toMatchObject({ code: "invalid_barcode" });
    expect(called).toBe(false);
  });

  it("HTTP errors, 429 and malformed JSON fail explicitly", async () => {
    await expect(
      lookupOffProduct("3017620422003", { fetchImpl: fetchOf(500, {}) }),
    ).rejects.toMatchObject({ code: "upstream_error" });
    await expect(
      lookupOffProduct("3017620422003", { fetchImpl: fetchOf(429, {}) }),
    ).rejects.toMatchObject({ code: "rate_limited" });
    await expect(
      lookupOffProduct("3017620422003", {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("bad json");
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "malformed_response" });
    await expect(
      lookupOffProduct("3017620422003", {
        fetchImpl: fetchOf(200, "a string body"),
      }),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });

  it("timeout is reported, not swallowed", async () => {
    // a real fetch rejects on abort — the mock honors the signal
    await expect(
      lookupOffProduct("3017620422003", {
        timeoutMs: 5,
        fetchImpl: (_url, init) =>
          new Promise((_res, rej) =>
            init.signal?.addEventListener("abort", () => {
              const e = new Error("aborted");
              e.name = "AbortError";
              rej(e);
            }),
          ),
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("response identity + normalization (#509)", () => {
  const B = "3017620422003";
  it("a mismatched response code refuses — never relabels", async () => {
    const d = structuredClone(FROZEN_PIZZA);
    d.code = "5901234123457";
    await expect(
      lookupOffProduct(B, { fetchImpl: fetchOf(200, d) }),
    ).rejects.toMatchObject({ code: "code_mismatch" });
  });
  it("a missing or malformed response code refuses", async () => {
    const d = structuredClone(FROZEN_PIZZA) as Record<string, unknown>;
    delete d.code;
    await expect(
      lookupOffProduct(B, { fetchImpl: fetchOf(200, d) }),
    ).rejects.toMatchObject({ code: "code_mismatch" });
    await expect(
      lookupOffProduct(B, {
        fetchImpl: fetchOf(200, { status: 2, code: B, product: {} }),
      }),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });
  it("negative measurements and missing units are dropped, zero kept", async () => {
    const d = structuredClone(FROZEN_PIZZA);
    (d.product as { nutriments: Record<string, unknown> }).nutriments = {
      proteins_100g: -1,
      proteins_unit: "g",
      fat_100g: 8.3,
      fat_unit: "g",
      sugars_100g: 0,
      sugars_unit: "g",
      sodium_100g: 0.5, // no unit → dropped
      "energy-kcal_100g": 245,
      "energy-kcal_unit": "kcal",
      bogus_100g: 10,
      bogus_unit: "furlongs", // unsupported unit → dropped
    };
    const r = await lookupOffProduct(B, { fetchImpl: fetchOf(200, d) });
    if (r.status !== "found") throw new Error("expected found");
    const by = Object.fromEntries(r.product.nutrients.map((n) => [n.code, n]));
    expect(by.proteins).toBeUndefined();
    expect(by.sodium).toBeUndefined(); // missing unit → no "g" guess
    expect(by.bogus).toBeUndefined(); // unsupported unit
    expect(by.sugars?.value).toBe(0); // real zero preserved
    expect(by.fat?.value).toBe(8.3);
  });
});

describe("barcode validation + provenance boundary", () => {
  it.each([
    ["3017620422003", true],
    ["5901234123457", true],
    ["30176249", true], // valid EAN-8
    ["3017620422", false],
    ["abc", false],
    ["", false],
    ["1", false],
    ["30176204220034", false], // 14 digits, bad check digit
  ])("isValidBarcode(%s) === %s", (code, ok) => {
    expect(isValidBarcode(code)).toBe(ok);
  });
});
