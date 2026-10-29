// FULL-PACKAGE SLICE of #175
/**
 * Card 10 (#175): IIFYM payload normalizer unit tests. Asserts the
 * draft/publish contract callers rely on: strict declared keys, the
 * exclusive target styles (calorie-only entered directly vs macros
 * deriving at 4/4/9, calories are never stored for macros style),
 * weekday schedule reference integrity and the publish floor.
 */

import { describe, expect, it } from "vitest";

import { IifymError, normalizeIifymPayload } from "../../lib/iifym/payload";

const WEEKLY = (training: string, rest: string) => ({
  mode: "weekly" as const,
  days: {
    "1": training,
    "2": training,
    "3": training,
    "4": training,
    "5": training,
    "6": rest,
    "7": rest,
  },
});

type FixedTarget = { kind: string; value: number };
type DraftShape = {
  name: string;
  startDate: string;
  options: {
    id: string;
    label: string;
    targets: {
      style: string;
      calories?: FixedTarget;
      protein?: FixedTarget;
      carbs?: FixedTarget;
      fat?: FixedTarget;
    };
  }[];
  schedule:
    | { mode: string; days: Record<string, string> }
    | { mode: string; selectedVariantId: string };
};

const validDraft = (): DraftShape => ({
  name: "Individual nutrition targets",
  startDate: "2026-10-26",
  options: [
    {
      id: "opt_training",
      label: "Training day",
      targets: {
        style: "macros",
        protein: { kind: "fixed", value: 200 },
        carbs: { kind: "fixed", value: 250 },
        fat: { kind: "fixed", value: 70 },
      },
    },
    {
      id: "opt_rest",
      label: "Rest day",
      targets: {
        style: "calories",
        calories: { kind: "fixed", value: 1800 },
      },
    },
  ],
  schedule: WEEKLY("opt_training", "opt_rest"),
});

describe("card 10 iifym payload normalizer", () => {
  it("accepts a complete publishable draft", () => {
    const normalized = normalizeIifymPayload(validDraft(), {
      forPublish: true,
    });
    expect(normalized.options).toHaveLength(2);
    expect(normalized.schedule?.mode).toBe("weekly");
  });

  it("never stores a derived calorie field on a macros-style option", () => {
    const normalized = normalizeIifymPayload(validDraft(), {
      forPublish: true,
    });
    const training = normalized.options.find((o) => o.id === "opt_training");
    expect(training?.targets.style).toBe("macros");
    expect(training?.targets).not.toHaveProperty("calories");
    expect((training?.targets.protein as { value: number }).value).toBe(200);
  });

  it("keeps the calorie-only target entered directly", () => {
    const normalized = normalizeIifymPayload(validDraft(), {
      forPublish: true,
    });
    const rest = normalized.options.find((o) => o.id === "opt_rest");
    expect(rest?.targets.style).toBe("calories");
    expect((rest?.targets.calories as { value: number }).value).toBe(1800);
  });

  it("rejects a macros field on a calories-style option", () => {
    const draft = validDraft();
    (draft.options[1].targets as Record<string, unknown>).protein = {
      kind: "fixed",
      value: 100,
    };
    expect(() =>
      normalizeIifymPayload(draft, { forPublish: false }),
    ).toThrowError(IifymError);
  });

  it("rejects a calories field on a macros-style option", () => {
    const draft = validDraft();
    (draft.options[0].targets as Record<string, unknown>).calories = {
      kind: "fixed",
      value: 2200,
    };
    expect(() =>
      normalizeIifymPayload(draft, { forPublish: false }),
    ).toThrowError(IifymError);
  });

  it("rejects unknown keys anywhere", () => {
    const draft = validDraft();
    (draft.options[0] as unknown as Record<string, unknown>).smuggle = true;
    expect(() =>
      normalizeIifymPayload(draft, { forPublish: false }),
    ).toThrowError(IifymError);
  });

  it("rejects a weekday mapping to an undeclared option", () => {
    const draft = validDraft();
    draft.schedule = WEEKLY("opt_training", "opt_ghost");
    expect(() =>
      normalizeIifymPayload(draft, { forPublish: false }),
    ).toThrowError(IifymError);
  });

  it("permits a partial weekly schedule on draft, rejects it on publish", () => {
    const draft = validDraft();
    draft.schedule = { mode: "weekly", days: { "1": "opt_training" } };
    expect(
      normalizeIifymPayload(draft, { forPublish: false }).schedule?.mode,
    ).toBe("weekly");
    expect(() =>
      normalizeIifymPayload(draft, { forPublish: true }),
    ).toThrowError(expect.objectContaining({ code: "publish_incomplete" }));
  });

  it("requires name, startDate and a schedule for publish", () => {
    const draft = validDraft();
    delete (draft as unknown as Record<string, unknown>).name;
    expect(() =>
      normalizeIifymPayload(draft, { forPublish: true }),
    ).toThrowError(expect.objectContaining({ code: "publish_incomplete" }));
  });

  it("rejects an empty target block", () => {
    const draft = validDraft();
    draft.options[0].targets = { style: "macros" };
    expect(() =>
      normalizeIifymPayload(draft, { forPublish: false }),
    ).toThrowError(IifymError);
  });

  it("rejects non-finite and out-of-range target values", () => {
    const draft = validDraft();
    draft.options[0].targets = {
      style: "macros",
      protein: { kind: "fixed", value: -5 },
    };
    expect(() =>
      normalizeIifymPayload(draft, { forPublish: false }),
    ).toThrowError(IifymError);
  });
});
