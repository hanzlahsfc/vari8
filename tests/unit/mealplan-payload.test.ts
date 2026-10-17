// MEAL-PLAN-I1 (PROMPT 211) — meal-plan draft/version payload strictness.
// RED-first contract: exact key sets at EVERY nesting level (root,
// variants[], targets, each macro entry, meals[]), optional-vs-zero
// fidelity, fixed/range/minimum target shapes, finite ≤1-decimal bounds,
// count/byte limits, dense order renumbering, and publish-completeness —
// with zero computed nutrition behavior.

import { describe, expect, it } from "vitest";

import {
  MealPlanError,
  normalizeMealPlanPayload,
} from "../../lib/mealplan/payload";

const meal = (over: Record<string, unknown> = {}) => ({
  order: 1,
  name: "Breakfast",
  time: "08:00",
  frequency: "Every day",
  foodText: "Synthetic oats, whey, berries",
  kcal: 352,
  proteinG: 30,
  carbsG: 40,
  fatG: 8,
  ...over,
});

const variant = (over: Record<string, unknown> = {}) => ({
  id: "v_td",
  label: "Training day",
  targetMode: "FIXED",
  targets: {
    kcal: { value: 2400 },
    proteinG: { value: 180 },
    carbsG: { value: 260 },
    fatG: { value: 70 },
  },
  meals: [meal()],
  ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  variants: [variant()],
  ...over,
});

describe("MEAL-PLAN-I1 payload — happy path normalization", () => {
  it("accepts a well-formed draft and renumbers meal order densely", () => {
    const out = normalizeMealPlanPayload(
      payload({
        variants: [
          variant({
            meals: [
              meal({ order: 5, name: "Second" }),
              meal({ order: 2, name: "First" }),
            ],
          }),
        ],
      }),
      { forPublish: false },
    );
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0]?.meals.map((m) => m.name)).toEqual([
      "First",
      "Second",
    ]);
    expect(out.variants[0]?.meals.map((m) => m.order)).toEqual([1, 2]);
  });

  it("mints ids for variants without one and keeps declared unique ids", () => {
    const out = normalizeMealPlanPayload(
      payload({
        variants: [
          variant({ id: undefined }),
          variant({ id: "v_ntd", label: "Rest day" }),
        ],
      }),
      { forPublish: false },
    );
    expect(out.variants[0]?.id).toMatch(/^[a-z0-9_-]{1,64}$/i);
    expect(out.variants[1]?.id).toBe("v_ntd");
  });

  it("preserves entered zero verbatim and omits absent/null values", () => {
    const out = normalizeMealPlanPayload(
      payload({
        variants: [
          variant({
            meals: [meal({ kcal: 0, proteinG: null, carbsG: undefined })],
          }),
        ],
      }),
      { forPublish: false },
    );
    const m = out.variants[0]?.meals[0];
    expect(m?.kcal).toBe(0);
    expect(m && "proteinG" in m).toBe(false);
    expect(m && "carbsG" in m).toBe(false);
    expect(m && "fatG" in m).toBe(true);
  });

  it("keeps optional time/frequency when present and omits them when absent", () => {
    const out = normalizeMealPlanPayload(
      payload({
        variants: [
          variant({ meals: [meal({ time: undefined, frequency: null })] }),
        ],
      }),
      { forPublish: false },
    );
    const m = out.variants[0]?.meals[0];
    expect(m && "time" in m).toBe(false);
    expect(m && "frequency" in m).toBe(false);
  });
});

describe("MEAL-PLAN-I1 payload — unknown-key rejection at every level", () => {
  it("rejects extra keys at root, variant, targets, target entry, and meal", () => {
    const bad = [
      payload({ extra: 1 }),
      payload({ variants: [variant({ extra: 1 })] }),
      payload({
        variants: [variant({ targets: { kcal: { value: 1 }, bogus: null } })],
      }),
      payload({
        variants: [variant({ targets: { kcal: { value: 1, sneaky: 2 } } })],
      }),
      payload({ variants: [variant({ meals: [meal({ extra: 1 })] })] }),
      "string",
      42,
      null,
      [],
    ];
    for (const input of bad)
      expect(() =>
        normalizeMealPlanPayload(input, { forPublish: false }),
      ).toThrowError(MealPlanError);
  });
});

describe("MEAL-PLAN-I1 payload — numeric bounds and precision", () => {
  it("rejects negatives, >99999.9, non-finite, non-number, >1 decimal", () => {
    for (const v of [
      -1,
      100000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "30",
      30.05,
      0.15,
      1e6,
    ])
      expect(() =>
        normalizeMealPlanPayload(
          payload({ variants: [variant({ meals: [meal({ kcal: v })] })] }),
          { forPublish: false },
        ),
      ).toThrowError(MealPlanError);
  });

  it("accepts boundary values 0, 99999.9, and one-decimal values", () => {
    for (const v of [0, 99999.9, 2400.5, 30.5]) {
      const out = normalizeMealPlanPayload(
        payload({ variants: [variant({ meals: [meal({ kcal: v })] })] }),
        { forPublish: false },
      );
      expect(out.variants[0]?.meals[0]?.kcal).toBe(v);
    }
  });
});

describe("MEAL-PLAN-I1 payload — per-variant target modes", () => {
  it("accepts FIXED/RANGE/MINIMUM shapes and verbatim display values", () => {
    for (const [targetMode, targets] of [
      ["FIXED", { kcal: { value: 2400 } }],
      ["RANGE", { kcal: { min: 2200, max: 2600 } }],
      ["MINIMUM", { proteinG: { min: 160 } }],
    ] as const) {
      const out = normalizeMealPlanPayload(
        payload({ variants: [variant({ targetMode, targets })] }),
        { forPublish: false },
      );
      expect(out.variants[0]?.targetMode).toBe(targetMode);
      const expected: Record<string, unknown> = {
        kcal: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
      };
      for (const [k, v] of Object.entries(targets)) expected[k] = v;
      expect(out.variants[0]?.targets).toEqual(expected);
    }
  });

  it("rejects range min>=max, inverted ranges, and malformed targets", () => {
    for (const t of [
      { min: 2600, max: 2200 },
      { min: 2000, max: 2000 },
      { min: 2000, max: "x" },
      { value: -5 },
      { min: "a" },
      { max: 10 },
      { min: 1, max: 2, extra: 3 },
      "2000",
      12,
    ])
      expect(() =>
        normalizeMealPlanPayload(
          payload({
            variants: [variant({ targetMode: "RANGE", targets: { kcal: t } })],
          }),
          { forPublish: false },
        ),
      ).toThrowError(MealPlanError);
  });

  it("rejects unknown targetMode values", () => {
    expect(() =>
      normalizeMealPlanPayload(
        payload({ variants: [variant({ targetMode: "AUTO" })] }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
  });
});

describe("MEAL-PLAN-I1 payload — counts, strings, and byte limits", () => {
  it("enforces variant and meal count bounds for draft and publish", () => {
    expect(() =>
      normalizeMealPlanPayload(payload({ variants: [] }), {
        forPublish: true,
      }),
    ).toThrowError(MealPlanError);
    expect(() =>
      normalizeMealPlanPayload(
        payload({
          variants: Array.from({ length: 9 }, (_, i) =>
            variant({ id: `v_${i}`, label: `Variant ${i}` }),
          ),
        }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
    expect(() =>
      normalizeMealPlanPayload(
        payload({
          variants: [
            variant({
              meals: Array.from({ length: 25 }, (_, i) =>
                meal({ order: i + 1, name: `M${i}` }),
              ),
            }),
          ],
        }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
    // Publish requires each variant to carry at least one meal.
    expect(() =>
      normalizeMealPlanPayload(
        payload({ variants: [variant({ meals: [] })] }),
        { forPublish: true },
      ),
    ).toThrowError(MealPlanError);
  });

  it("rejects empty/oversized strings, duplicate labels, and duplicate ids", () => {
    for (const input of [
      payload({ variants: [variant({ label: "" })] }),
      payload({ variants: [variant({ label: "x".repeat(81) })] }),
      payload({
        variants: [
          variant(),
          variant({ id: "v_other", label: "Training day" }),
        ],
      }),
      payload({
        variants: [
          variant({ id: "v_dup", label: "A" }),
          variant({ id: "v_dup", label: "B" }),
        ],
      }),
      payload({ variants: [variant({ meals: [meal({ name: "" })] })] }),
      payload({ variants: [variant({ meals: [meal({ foodText: " " })] })] }),
      payload({
        variants: [variant({ meals: [meal({ foodText: "x".repeat(2001) })] })],
      }),
      payload({
        variants: [
          variant({
            meals: [meal({ order: 1 }), meal({ order: 1, name: "Dup" })],
          }),
        ],
      }),
      payload({ variants: [variant({ meals: [meal({ order: 1.5 })] })] }),
    ])
      expect(() =>
        normalizeMealPlanPayload(input, { forPublish: false }),
      ).toThrowError(MealPlanError);
  });

  it("rejects normalized payloads over the byte cap", () => {
    expect(() =>
      normalizeMealPlanPayload(
        payload({
          variants: [
            variant({ meals: [meal({ foodText: "x".repeat(65_000) })] }),
          ],
        }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
  });
});
