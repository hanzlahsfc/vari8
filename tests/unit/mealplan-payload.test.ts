// MEAL-PLAN-I1 (PROMPT 211) + PR-M5 — meal-plan draft/version payload
// strictness on the canvas shape: exact key sets at EVERY nesting level
// (root, variants[], dailyTarget/targets, meals[], portions[], swaps[],
// schedule modes, cycle steps), optional-vs-zero fidelity (#36),
// per-field fixed/range/minimum target kinds with style exclusivity,
// finite ≤1-decimal bounds, count/byte limits, dangling-reference
// rejection, and the publish floor — with zero computed nutrition
// behavior (totals live in lib/nutrition/math.ts).

import { describe, expect, it } from "vitest";

import {
  MealPlanError,
  normalizeMealPlanPayload,
} from "../../lib/mealplan/payload";

const meal = (over: Record<string, unknown> = {}) => ({
  id: "meal_b1",
  label: "Breakfast",
  time: "08:00",
  frequency: "Daily",
  portions: [
    {
      foodId: "food-057",
      quantity: 50,
      swaps: [{ foodId: "food-058", quantity: 50, note: "GF" }],
    },
  ],
  ...over,
});

const variant = (over: Record<string, unknown> = {}) => ({
  id: "v_td",
  label: "Training day",
  meals: [meal()],
  ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  name: "Nutrition plan",
  startDate: "2026-10-19",
  activeVariantId: "v_td",
  schedule: { mode: "manual", selectedVariantId: "v_td" },
  variants: [variant()],
  ...over,
});

describe("payload — happy path normalization", () => {
  it("accepts a well-formed draft and keeps declared ids and order", () => {
    const out = normalizeMealPlanPayload(
      payload({
        variants: [
          variant({
            meals: [
              meal({ id: "meal_2", label: "Second" }),
              meal({ id: "meal_1", label: "First" }),
            ],
          }),
        ],
      }),
      { forPublish: false },
    );
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0]?.meals.map((m) => m.label)).toEqual([
      "Second",
      "First",
    ]);
    expect(out.variants[0]?.meals.map((m) => m.id)).toEqual([
      "meal_2",
      "meal_1",
    ]);
  });

  it("mints ids for variants and meals without one; keeps declared", () => {
    const out = normalizeMealPlanPayload(
      payload({
        activeVariantId: "v_ntd",
        schedule: { mode: "manual", selectedVariantId: "v_ntd" },
        variants: [
          variant({ id: undefined, meals: [meal({ id: undefined })] }),
          variant({ id: "v_ntd", label: "Rest day" }),
        ],
      }),
      { forPublish: false },
    );
    expect(out.variants[0]?.id).toMatch(/^[a-z0-9_-]{1,64}$/i);
    expect(out.variants[0]?.meals[0]?.id).toMatch(/^[a-z0-9_-]{1,64}$/i);
    expect(out.variants[1]?.id).toBe("v_ntd");
  });

  it("preserves entered zero verbatim and omits absent/null values (#36)", () => {
    const out = normalizeMealPlanPayload(
      payload({
        variants: [
          variant({
            dailyTarget: undefined,
            meals: [
              meal({
                frequency: null,
                target: null,
                portions: [{ foodId: "food-057", quantity: 0, swaps: null }],
              }),
            ],
          }),
        ],
      }),
      { forPublish: false },
    );
    const v = out.variants[0];
    const m = v?.meals[0];
    expect(m?.portions[0]?.quantity).toBe(0);
    expect(m && "frequency" in m).toBe(false);
    expect(m && "target" in m).toBe(false);
    expect(m?.portions[0] && "swaps" in m.portions[0]).toBe(false);
    expect(v && "dailyTarget" in v).toBe(false);
  });
});

describe("payload — unknown-key rejection at every level", () => {
  it("rejects extra keys everywhere", () => {
    const bad = [
      payload({ extra: 1 }),
      payload({ variants: [variant({ extra: 1 })] }),
      payload({
        variants: [
          variant({
            dailyTarget: {
              style: "calories",
              calories: { kind: "fixed", value: 2400 },
              bogus: 1,
            },
          }),
        ],
      }),
      payload({
        variants: [
          variant({
            dailyTarget: {
              style: "calories",
              calories: { kind: "fixed", value: 2400, sneaky: 2 },
            },
          }),
        ],
      }),
      payload({ variants: [variant({ meals: [meal({ extra: 1 })] })] }),
      payload({
        variants: [
          variant({
            meals: [
              meal({ portions: [{ foodId: "f", quantity: 1, bogus: 1 }] }),
            ],
          }),
        ],
      }),
      payload({
        variants: [
          variant({
            meals: [
              meal({
                portions: [
                  {
                    foodId: "f",
                    quantity: 1,
                    swaps: [{ foodId: "s", quantity: 1, bogus: 1 }],
                  },
                ],
              }),
            ],
          }),
        ],
      }),
      payload({
        schedule: { mode: "manual", selectedVariantId: "v_td", x: 1 },
      }),
      payload({
        schedule: {
          mode: "cycle",
          anchorDate: "2026-10-19",
          steps: [{ variantId: "v_td", days: 3, x: 1 }],
        },
      }),
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

describe("payload — numeric bounds and precision", () => {
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
          payload({
            variants: [
              variant({
                meals: [meal({ portions: [{ foodId: "f1", quantity: v }] })],
              }),
            ],
          }),
          { forPublish: false },
        ),
      ).toThrowError(MealPlanError);
  });

  it("accepts boundary values 0, 99999.9, and one-decimal values", () => {
    for (const v of [0, 99999.9, 2400.5, 30.5]) {
      const out = normalizeMealPlanPayload(
        payload({
          variants: [
            variant({
              meals: [meal({ portions: [{ foodId: "f1", quantity: v }] })],
            }),
          ],
        }),
        { forPublish: false },
      );
      expect(out.variants[0]?.meals[0]?.portions[0]?.quantity).toBe(v);
    }
  });
});

describe("payload — per-field target kinds", () => {
  it("accepts fixed/range/minimum per field with style exclusivity", () => {
    const out = normalizeMealPlanPayload(
      payload({
        variants: [
          variant({
            dailyTarget: {
              style: "macros",
              protein: { kind: "minimum", value: 160 },
              carbs: { kind: "range", min: 200, max: 280 },
              fat: { kind: "fixed", value: 70 },
            },
          }),
        ],
      }),
      { forPublish: false },
    );
    expect(out.variants[0]?.dailyTarget).toEqual({
      style: "macros",
      protein: { kind: "minimum", value: 160 },
      carbs: { kind: "range", min: 200, max: 280 },
      fat: { kind: "fixed", value: 70 },
    });
  });

  it("rejects a calories field under macros style and vice versa", () => {
    for (const t of [
      { style: "macros", calories: { kind: "fixed", value: 2400 } },
      { style: "calories", protein: { kind: "fixed", value: 180 } },
    ])
      expect(() =>
        normalizeMealPlanPayload(
          payload({ variants: [variant({ dailyTarget: t })] }),
          { forPublish: false },
        ),
      ).toThrowError(MealPlanError);
  });

  it("rejects a targets block with no goal", () => {
    expect(() =>
      normalizeMealPlanPayload(
        payload({ variants: [variant({ dailyTarget: { style: "macros" } })] }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
  });

  it("rejects range min>=max, missing keys, and malformed kinds", () => {
    for (const t of [
      { style: "macros", protein: { kind: "range", min: 260, max: 200 } },
      { style: "macros", protein: { kind: "range", min: 200, max: 200 } },
      { style: "macros", protein: { kind: "range", min: 200 } },
      { style: "macros", protein: { kind: "fixed", value: -5 } },
      { style: "macros", protein: { kind: "bogus", value: 5 } },
      { style: "macros", protein: "180" },
      { style: "AUTO", protein: { kind: "fixed", value: 5 } },
      { protein: { kind: "fixed", value: 5 } },
    ])
      expect(() =>
        normalizeMealPlanPayload(
          payload({ variants: [variant({ dailyTarget: t })] }),
          { forPublish: false },
        ),
      ).toThrowError(MealPlanError);
  });

  it("per-meal targets normalize the same way", () => {
    const out = normalizeMealPlanPayload(
      payload({
        variants: [
          variant({
            meals: [
              meal({
                target: {
                  style: "calories",
                  calories: { kind: "fixed", value: 600 },
                },
              }),
            ],
          }),
        ],
      }),
      { forPublish: false },
    );
    expect(out.variants[0]?.meals[0]?.target).toEqual({
      style: "calories",
      calories: { kind: "fixed", value: 600 },
    });
  });
});

describe("payload — schedule", () => {
  it("accepts manual, weekly and cycle schedules", () => {
    for (const schedule of [
      { mode: "manual", selectedVariantId: "v_td" },
      { mode: "weekly", days: { "1": "v_td", "7": "v_td" } },
      {
        mode: "cycle",
        anchorDate: "2026-10-19",
        steps: [
          { variantId: "v_td", days: 3 },
          { variantId: "v_td", days: 2 },
        ],
      },
    ]) {
      const out = normalizeMealPlanPayload(payload({ schedule }), {
        forPublish: false,
      });
      expect(out.schedule).toEqual(schedule);
    }
  });

  it("accepts a flexible schedule and rejects extra keys on it", () => {
    const out = normalizeMealPlanPayload(
      payload({ schedule: { mode: "flexible" } }),
      { forPublish: false },
    );
    expect(out.schedule).toEqual({ mode: "flexible" });
    expect(() =>
      normalizeMealPlanPayload(
        payload({ schedule: { mode: "flexible", days: { "1": "v_td" } } }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
  });

  it("rejects dangling variant references everywhere", () => {
    for (const input of [
      payload({ activeVariantId: "v_ghost" }),
      payload({ schedule: { mode: "manual", selectedVariantId: "v_ghost" } }),
      payload({ schedule: { mode: "weekly", days: { "1": "v_ghost" } } }),
      payload({
        schedule: {
          mode: "cycle",
          anchorDate: "2026-10-19",
          steps: [{ variantId: "v_ghost", days: 3 }],
        },
      }),
    ])
      expect(() =>
        normalizeMealPlanPayload(input, { forPublish: false }),
      ).toThrowError(MealPlanError);
  });

  it("rejects malformed weekly keys, cycle anchors and step bounds", () => {
    for (const schedule of [
      { mode: "weekly", days: { "0": "v_td" } },
      { mode: "weekly", days: { "8": "v_td" } },
      { mode: "weekly", days: "monday" },
      { mode: "cycle", anchorDate: "19/10/2026", steps: [] },
      { mode: "cycle", anchorDate: "2026-02-30", steps: [] },
      {
        mode: "cycle",
        anchorDate: "2026-10-19",
        steps: [{ variantId: "v_td", days: 0 }],
      },
      {
        mode: "cycle",
        anchorDate: "2026-10-19",
        steps: [{ variantId: "v_td", days: 29 }],
      },
      {
        mode: "cycle",
        anchorDate: "2026-10-19",
        steps: [{ variantId: "v_td", days: 1.5 }],
      },
      { mode: "daily" },
      { mode: "manual" },
    ])
      expect(() =>
        normalizeMealPlanPayload(payload({ schedule }), { forPublish: false }),
      ).toThrowError(MealPlanError);
    // Cycle total beyond 365 days.
    expect(() =>
      normalizeMealPlanPayload(
        payload({
          schedule: {
            mode: "cycle",
            anchorDate: "2026-10-19",
            steps: Array.from({ length: 14 }, () => ({
              variantId: "v_td",
              days: 28,
            })),
          },
        }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
  });
});

describe("payload — counts, strings, and byte limits", () => {
  it("enforces variant, meal, portion and swap count bounds", () => {
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
                meal({ id: `m_${i}`, label: `M${i}` }),
              ),
            }),
          ],
        }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
    expect(() =>
      normalizeMealPlanPayload(
        payload({
          variants: [
            variant({
              meals: [
                meal({
                  portions: Array.from({ length: 51 }, () => ({
                    foodId: "f",
                    quantity: 1,
                  })),
                }),
              ],
            }),
          ],
        }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
    expect(() =>
      normalizeMealPlanPayload(
        payload({
          variants: [
            variant({
              meals: [
                meal({
                  portions: [
                    {
                      foodId: "f",
                      quantity: 1,
                      swaps: Array.from({ length: 11 }, () => ({
                        foodId: "s",
                        quantity: 1,
                      })),
                    },
                  ],
                }),
              ],
            }),
          ],
        }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
  });

  it("rejects oversized strings, bad dates, duplicate labels/ids", () => {
    for (const input of [
      payload({ name: "x".repeat(121) }),
      payload({ startDate: "19/10/2026" }),
      payload({ startDate: "2026-13-01" }),
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
      payload({ variants: [variant({ meals: [meal({ label: "" })] })] }),
      payload({ variants: [variant({ meals: [meal({ time: "" })] })] }),
      payload({
        variants: [
          variant({ meals: [meal(), meal({ id: "meal_b1", label: "Dup" })] }),
        ],
      }),
      payload({
        variants: [
          variant({
            meals: [meal({ portions: [{ foodId: " ", quantity: 1 }] })],
          }),
        ],
      }),
      payload({
        variants: [
          variant({
            meals: [
              meal({
                portions: [
                  {
                    foodId: "f",
                    quantity: 1,
                    swaps: [
                      { foodId: "s", quantity: 1, note: "x".repeat(501) },
                    ],
                  },
                ],
              }),
            ],
          }),
        ],
      }),
    ])
      expect(() =>
        normalizeMealPlanPayload(input, { forPublish: false }),
      ).toThrowError(MealPlanError);
    // A blank optional string is omitted, not zeroed and not an error.
    const out = normalizeMealPlanPayload(payload({ name: " " }), {
      forPublish: false,
    });
    expect("name" in out).toBe(false);
  });

  it("rejects normalized payloads over the byte cap", () => {
    expect(() =>
      normalizeMealPlanPayload(
        payload({
          variants: [variant({ meals: [meal({ label: "x".repeat(65_000) })] })],
        }),
        { forPublish: false },
      ),
    ).toThrowError(MealPlanError);
  });
});

describe("payload — publish floor", () => {
  it("requires name, startDate, active variant and schedule", () => {
    for (const input of [
      payload({ name: undefined }),
      payload({ startDate: undefined }),
      payload({ activeVariantId: undefined }),
      payload({ schedule: undefined }),
    ])
      expect(() =>
        normalizeMealPlanPayload(input, { forPublish: true }),
      ).toThrowError(MealPlanError);
  });

  it("requires each meal to carry a positive portion and HH:MM time", () => {
    for (const input of [
      payload({ variants: [variant({ meals: [] })] }),
      payload({ variants: [variant({ meals: [meal({ portions: [] })] })] }),
      payload({
        variants: [
          variant({
            meals: [meal({ portions: [{ foodId: "f", quantity: 0 }] })],
          }),
        ],
      }),
      payload({ variants: [variant({ meals: [meal({ time: "8am" })] })] }),
    ])
      expect(() =>
        normalizeMealPlanPayload(input, { forPublish: true }),
      ).toThrowError(MealPlanError);
    // Incomplete states stay saveable as drafts.
    for (const input of [
      payload({ variants: [variant({ meals: [meal({ portions: [] })] })] }),
      payload({ schedule: { mode: "weekly", days: { "1": "v_td" } } }),
      payload({
        schedule: { mode: "cycle", anchorDate: "2026-10-19", steps: [] },
      }),
    ])
      expect(
        normalizeMealPlanPayload(input, { forPublish: false }).variants.length,
      ).toBe(1);
    // …but publish rejects them.
    for (const input of [
      payload({ schedule: { mode: "weekly", days: { "1": "v_td" } } }),
      payload({
        schedule: { mode: "cycle", anchorDate: "2026-10-19", steps: [] },
      }),
    ])
      expect(() =>
        normalizeMealPlanPayload(input, { forPublish: true }),
      ).toThrowError(MealPlanError);
  });
});
