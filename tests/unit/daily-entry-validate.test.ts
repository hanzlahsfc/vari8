import { describe, expect, it } from "vitest";

import {
  resolveDailyEntryValues,
  validateDailyEntryValues,
  type SnapshotParam,
} from "../../lib/daily-entry/validate";

/**
 * P-021 snapshot-driven value validation (P-021-R2 §8, #74).
 * Pure logic — validation runs against the immutable pinned version
 * snapshot, never against live parameter rows.
 */

const SNAPSHOT: SnapshotParam[] = [
  {
    parameterId: "pd_weight",
    parameterKey: "p_weight",
    kind: "MEASUREMENT",
    required: true,
    unit: "kg",
    ratingScheme: null,
    decimals: null,
    summary: null,
    options: [],
    validation: { min: 0, max: 500 },
    dataClassification: "GENERAL_HEALTH",
    snapshotRevision: 1,
    sectionId: "sec_body",
    itemId: "itm_w",
  },
  {
    parameterId: "pd_mood",
    parameterKey: "p_mood",
    kind: "RATING",
    required: false,
    unit: null,
    ratingScheme: "SCALE_1_10",
    decimals: null,
    summary: null,
    options: [],
    validation: null,
    dataClassification: "GENERAL_HEALTH",
    snapshotRevision: 1,
    sectionId: "sec_bio",
    itemId: "itm_m",
  },
  {
    parameterId: "pd_label",
    parameterKey: "p_label",
    kind: "OPTION",
    required: false,
    unit: null,
    ratingScheme: null,
    decimals: null,
    summary: null,
    options: [
      { optionId: "opt_high", label: "HIGH" },
      { optionId: "opt_medium", label: "MEDIUM" },
      { optionId: "opt_low", label: "LOW" },
    ],
    validation: null,
    dataClassification: "GENERAL_HEALTH",
    snapshotRevision: 1,
    sectionId: "sec_nutrition",
    itemId: "itm_l",
  },
  {
    parameterId: "pd_note",
    parameterKey: "p_note",
    kind: "TEXT",
    required: false,
    unit: null,
    ratingScheme: null,
    decimals: null,
    summary: null,
    options: [],
    validation: null,
    dataClassification: "GENERAL_HEALTH",
    snapshotRevision: 1,
    sectionId: "sec_notes",
    itemId: "itm_n",
  },
];

// Ordered render list = snapshot order; browser supplies positional ordinals.
const ORDINALS = SNAPSHOT.map((p) => p.parameterId);

describe("resolveDailyEntryValues — ordinal binding", () => {
  it("maps ordinals to snapshot parameters", () => {
    const resolved = resolveDailyEntryValues(
      [
        { ordinal: 0, raw: "75,5" },
        { ordinal: 1, raw: "7" },
      ],
      ORDINALS,
      SNAPSHOT,
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.values.get("pd_weight")?.raw).toBe("75,5");
      expect(resolved.values.get("pd_mood")?.raw).toBe("7");
    }
  });

  it.each([
    [
      "duplicate ordinal",
      [
        { ordinal: 0, raw: "1" },
        { ordinal: 0, raw: "2" },
      ],
    ],
    ["out-of-range ordinal", [{ ordinal: 99, raw: "1" }]],
    ["negative ordinal", [{ ordinal: -1, raw: "1" }]],
    ["fractional ordinal", [{ ordinal: 0.5, raw: "1" }]],
  ])("rejects %s", (_label, values) => {
    expect(resolveDailyEntryValues(values, ORDINALS, SNAPSHOT).ok).toBe(false);
  });
});

describe("validateDailyEntryValues — per-kind rules", () => {
  it("validates a complete happy-path submission", () => {
    const result = validateDailyEntryValues(
      [
        { ordinal: 0, raw: "75,5" },
        { ordinal: 1, raw: "7" },
        { ordinal: 2, raw: "0" }, // option ordinal 0 = opt_high
        { ordinal: 3, raw: "felt good" },
      ],
      ORDINALS,
      SNAPSHOT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const w = result.values.get("pd_weight");
      expect(w).toEqual({ tag: "measurement", canonical: "75.5" });
      expect(result.values.get("pd_mood")).toEqual({
        tag: "rating",
        value: 7,
      });
      expect(result.values.get("pd_label")).toEqual({
        tag: "option",
        optionId: "opt_high",
      });
      expect(result.values.get("pd_note")).toEqual({
        tag: "text",
        value: "felt good",
      });
    }
  });

  it("rejects a missing required parameter", () => {
    const result = validateDailyEntryValues(
      [{ ordinal: 1, raw: "7" }],
      ORDINALS,
      SNAPSHOT,
    );
    expect(result.ok).toBe(false);
  });

  it.each([
    ["bad decimal", "abc"],
    ["over-range", "501"],
    ["negative under min", "-1"],
    ["over-scale fraction", "75.123456789"],
  ])("rejects MEASUREMENT %s", (_label, raw) => {
    const r = validateDailyEntryValues(
      [{ ordinal: 0, raw }],
      ORDINALS,
      SNAPSHOT,
    );
    expect(r.ok).toBe(false);
  });

  it.each([["0"], ["11"], ["7.5"], ["x"]])(
    "rejects out-of-bounds RATING %j on SCALE_1_10",
    (raw) => {
      const r = validateDailyEntryValues(
        [
          { ordinal: 0, raw: "50" },
          { ordinal: 1, raw },
        ],
        ORDINALS,
        SNAPSHOT,
      );
      expect(r.ok).toBe(false);
    },
  );

  it("rejects an out-of-range OPTION ordinal", () => {
    const r = validateDailyEntryValues(
      [
        { ordinal: 0, raw: "50" },
        { ordinal: 2, raw: "9" },
      ],
      ORDINALS,
      SNAPSHOT,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a non-integer OPTION ordinal", () => {
    const r = validateDailyEntryValues(
      [
        { ordinal: 0, raw: "50" },
        { ordinal: 2, raw: "opt_high" },
      ],
      ORDINALS,
      SNAPSHOT,
    );
    expect(r.ok).toBe(false);
  });

  it("empty raw means absent — not an error for optional params", () => {
    const r = validateDailyEntryValues(
      [
        { ordinal: 0, raw: "50" },
        { ordinal: 1, raw: "" },
        { ordinal: 3, raw: "" },
      ],
      ORDINALS,
      SNAPSHOT,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.get("pd_mood")).toEqual({ tag: "absent" });
      expect(r.values.get("pd_note")).toEqual({ tag: "absent" });
    }
  });

  it("rejects TEXT over the bound", () => {
    const r = validateDailyEntryValues(
      [
        { ordinal: 0, raw: "50" },
        { ordinal: 3, raw: "x".repeat(5001) },
      ],
      ORDINALS,
      SNAPSHOT,
    );
    expect(r.ok).toBe(false);
  });
});
