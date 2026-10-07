import { describe, expect, it } from "vitest";

import {
  applyParameterEdits,
  PARAMETER_KINDS,
  ParameterError,
  type ParameterState,
  validateParameterCreate,
} from "../../lib/coaching/parameters";

/**
 * P-014 parameter definitions — pure validation/normalization contract.
 * Kind closed union + immutable; semantic vs display field split; option-ID
 * trust/tombstones; `required` never lives on a parameter; declarative
 * min/max only. No formulas or derived fields can be expressed.
 */

const baseState = (over: Partial<ParameterState> = {}): ParameterState => ({
  id: "pd_1",
  key: "p_aaa",
  kind: "MEASUREMENT",
  label: "Bodyweight",
  helpText: null,
  unit: "kg",
  ratingScheme: null,
  dataClassification: null,
  options: [],
  retiredOptionIds: [],
  validation: null,
  group: null,
  revision: 7,
  status: "ACTIVE",
  ...over,
});

describe("validateParameterCreate", () => {
  it("accepts a minimal measurement parameter", () => {
    const d = validateParameterCreate({
      kind: "MEASUREMENT",
      label: "Bodyweight",
      unit: "kg",
    });
    expect(d.kind).toBe("MEASUREMENT");
    expect(d.unit).toBe("kg");
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      validateParameterCreate({ kind: "FORMULA", label: "x" }),
    ).toThrow(ParameterError);
    expect(PARAMETER_KINDS.includes("FORMULA" as never)).toBe(false);
  });

  it("rejects kind-specific fields on the wrong kind", () => {
    expect(() =>
      validateParameterCreate({ kind: "TEXT", label: "x", unit: "kg" }),
    ).toThrow(ParameterError);
    expect(() =>
      validateParameterCreate({
        kind: "MEASUREMENT",
        label: "x",
        ratingScheme: "SCALE_1_10",
      }),
    ).toThrow(ParameterError);
    expect(() =>
      validateParameterCreate({
        kind: "RATING",
        label: "x",
        options: [{ optionId: "o1", label: "y" }],
      }),
    ).toThrow(ParameterError);
  });

  it("requires ratingScheme on RATING and rejects it elsewhere", () => {
    expect(() =>
      validateParameterCreate({ kind: "RATING", label: "Mood" }),
    ).toThrow(ParameterError);
    const d = validateParameterCreate({
      kind: "RATING",
      label: "Mood",
      ratingScheme: "SCALE_1_10",
    });
    expect(d.ratingScheme).toBe("SCALE_1_10");
  });

  it("requires non-empty options on OPTION and mints option IDs server-side", () => {
    expect(() =>
      validateParameterCreate({ kind: "OPTION", label: "x", options: [] }),
    ).toThrow(ParameterError);
    const d = validateParameterCreate({
      kind: "OPTION",
      label: "Day type",
      options: [{ label: "Training" }, { label: "Rest" }],
    });
    expect(d.options).toHaveLength(2);
    for (const o of d.options ?? []) {
      expect(o.optionId).toMatch(/^o_[0-9a-f-]{36}$/);
    }
    // Caller-supplied option IDs are never trusted on create.
    expect(() =>
      validateParameterCreate({
        kind: "OPTION",
        label: "x",
        options: [{ optionId: "caller-supplied", label: "y" }],
      }),
    ).toThrow(ParameterError);
  });

  it("rejects `required` on the reusable parameter definition", () => {
    expect(() =>
      validateParameterCreate({ kind: "TEXT", label: "x", required: true }),
    ).toThrow(ParameterError);
  });

  it("rejects formula/expression-shaped fields", () => {
    for (const extra of [
      { formula: "a+b" },
      { expression: "x*2" },
      { calculated: true },
      { derivedFrom: "p1" },
      { source: "wearable:x" },
      { pattern: "^\\d+$" },
    ]) {
      expect(() =>
        validateParameterCreate({ kind: "TEXT", label: "x", ...extra }),
      ).toThrow(ParameterError);
    }
  });

  it("accepts declarative min/max only on MEASUREMENT and bounds-checks it", () => {
    const d = validateParameterCreate({
      kind: "MEASUREMENT",
      label: "x",
      unit: "kg",
      validation: { min: 30, max: 300 },
    });
    expect(d.validation).toEqual({ min: 30, max: 300 });
    expect(() =>
      validateParameterCreate({
        kind: "MEASUREMENT",
        label: "x",
        validation: { min: 10, max: 5 },
      }),
    ).toThrow(ParameterError);
    expect(() =>
      validateParameterCreate({
        kind: "TEXT",
        label: "x",
        validation: { min: 0, max: 10 },
      }),
    ).toThrow(ParameterError);
    // Expressions or patterns inside validation are not representable.
    expect(() =>
      validateParameterCreate({
        kind: "MEASUREMENT",
        label: "x",
        validation: { pattern: "\\d+" },
      }),
    ).toThrow(ParameterError);
  });

  it("enforces label/helpText/unit/option-label limits and rejects malformed input", () => {
    expect(() => validateParameterCreate({ kind: "TEXT", label: "" })).toThrow(
      ParameterError,
    );
    expect(() =>
      validateParameterCreate({ kind: "TEXT", label: "x".repeat(121) }),
    ).toThrow(ParameterError);
    expect(() =>
      validateParameterCreate({
        kind: "TEXT",
        label: "x",
        helpText: "h".repeat(501),
      }),
    ).toThrow(ParameterError);
    expect(() => validateParameterCreate("nope")).toThrow(ParameterError);
    expect(() => validateParameterCreate({})).toThrow(ParameterError);
    expect(() =>
      validateParameterCreate({
        kind: "OPTION",
        label: "x",
        options: Array.from({ length: 65 }, (_, i) => ({ label: `o${i}` })),
      }),
    ).toThrow(ParameterError);
  });
});

describe("applyParameterEdits (revision + semantic lock)", () => {
  it("applies display edits and bumps revision", () => {
    const next = applyParameterEdits(baseState(), {
      label: "Body weight",
      helpText: "morning weigh-in",
    });
    expect(next.label).toBe("Body weight");
    expect(next.revision).toBe(8);
  });

  it("semantic edits allowed before first published reference", () => {
    const next = applyParameterEdits(baseState(), { unit: "lb" });
    expect(next.unit).toBe("lb");
  });

  it("semantic edits rejected after first published reference", () => {
    const published = baseState();
    expect(() =>
      applyParameterEdits(published, { unit: "lb" }, { published: true }),
    ).toThrow(ParameterError);
    // Display edits still allowed after publication.
    const next = applyParameterEdits(
      published,
      { label: "new label" },
      {
        published: true,
      },
    );
    expect(next.label).toBe("new label");
    expect(next.revision).toBe(8);
  });

  it("kind can never change", () => {
    expect(() =>
      applyParameterEdits(baseState(), { kind: "TEXT" } as never),
    ).toThrow(ParameterError);
  });

  it("option edits: known IDs accepted, removed IDs tombstoned, tombstones never reusable", () => {
    const state = baseState({
      kind: "OPTION",
      ratingScheme: null,
      unit: null,
      options: [
        { optionId: "o_1", label: "A" },
        { optionId: "o_2", label: "B" },
      ],
    });
    const next = applyParameterEdits(state, {
      options: [{ optionId: "o_1", label: "A2" }, { label: "C" }],
    });
    expect(next.options).toHaveLength(2);
    expect(next.options?.[0].optionId).toBe("o_1");
    expect(next.options?.[1].optionId).toMatch(/^o_[0-9a-f-]{36}$/);
    expect(next.retiredOptionIds).toEqual(["o_2"]);

    // Retired IDs are rejected on a later edit — never restored or reused.
    expect(() =>
      applyParameterEdits(next, {
        options: [{ optionId: "o_2", label: "back" }, { label: "D" }],
      }),
    ).toThrow(ParameterError);
    // Unknown caller IDs are rejected too.
    expect(() =>
      applyParameterEdits(next, {
        options: [{ optionId: "o_foreign", label: "z" }],
      }),
    ).toThrow(ParameterError);
  });
});
