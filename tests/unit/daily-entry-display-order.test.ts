import { describe, expect, it } from "vitest";

import {
  renderRevisionDisplayRows,
  type StoredValue,
} from "../../lib/daily-entry/service";
import type { SnapshotParam } from "../../lib/daily-entry/validate";

/**
 * PR-SV5 ordering contract: `renderRevisionDisplayRows` returns rows in
 * the immutable template version's item order regardless of the stored
 * row order (DB row order is arbitrary). Parameters outside the
 * snapshot, non-GENERAL_HEALTH params, and params the revision never
 * recorded follow the established drop/omit behavior — this test
 * documents the existing contract, it does not invent semantics.
 */

const snap = (
  parameterId: string,
  kind: string,
  opts: Partial<SnapshotParam> = {},
): SnapshotParam => ({
  parameterId,
  parameterKey: `k_${parameterId}`,
  kind,
  required: false,
  unit: kind === "MEASUREMENT" ? "kg" : null,
  ratingScheme: null,
  options: [],
  validation: null,
  dataClassification: "GENERAL_HEALTH",
  snapshotRevision: 1,
  sectionId: "sec_main",
  itemId: `itm_${parameterId}`,
  ...opts,
});

const val = (
  parameterId: string,
  kind: string,
  v: Partial<StoredValue> = {},
): StoredValue => ({
  parameterId,
  kind,
  valueNumeric: null,
  valueRating: null,
  valueOptionId: null,
  valueText: null,
  ...v,
});

// Immutable version definition for label/unit resolution — parameters
// keyed by parameterId, as the published template stores them.
const def = {
  parameters: {
    p_weight: {
      key: "k_p_weight",
      kind: "MEASUREMENT",
      label: "Weight",
      unit: "kg",
    },
    p_note: { key: "k_p_note", kind: "TEXT", label: "Note" },
    p_mood: { key: "k_p_mood", kind: "RATING", label: "Mood" },
  },
} as never;

const snapshot: SnapshotParam[] = [
  snap("p_weight", "MEASUREMENT"),
  snap("p_note", "TEXT"),
  snap("p_mood", "RATING"),
];

describe("renderRevisionDisplayRows — stable template-item ordering (PR-SV5)", () => {
  it("shuffled stored rows render in snapshot order", () => {
    // DB order is arbitrary — deliberately reversed input.
    const rows = renderRevisionDisplayRows(
      [
        val("p_mood", "RATING", { valueRating: 4 }),
        val("p_note", "TEXT", { valueText: "slept well" }),
        val("p_weight", "MEASUREMENT", { valueNumeric: "80" }),
      ],
      snapshot,
      def,
    );
    expect(rows.map((r) => [r.parameterKey, r.display])).toEqual([
      ["k_p_weight", "80"],
      ["k_p_note", "slept well"],
      ["k_p_mood", "4"],
    ]);
  });

  it("a middle rotation still renders in snapshot order", () => {
    const rows = renderRevisionDisplayRows(
      [
        val("p_note", "TEXT", { valueText: "n" }),
        val("p_mood", "RATING", { valueRating: 2 }),
        val("p_weight", "MEASUREMENT", { valueNumeric: "81" }),
      ],
      snapshot,
      def,
    );
    expect(rows.map((r) => r.parameterKey)).toEqual([
      "k_p_weight",
      "k_p_note",
      "k_p_mood",
    ]);
  });

  it("a param absent from the stored rows keeps its position out — order holds for the present rows", () => {
    // No recorded mood: only weight + note render, still snapshot order.
    const rows = renderRevisionDisplayRows(
      [
        val("p_note", "TEXT", { valueText: "n" }),
        val("p_weight", "MEASUREMENT", { valueNumeric: "80" }),
      ],
      snapshot,
      def,
    );
    expect(rows.map((r) => r.parameterKey)).toEqual(["k_p_weight", "k_p_note"]);
  });

  it("a stored row for a param retired from the snapshot is dropped, not appended", () => {
    const rows = renderRevisionDisplayRows(
      [
        val("p_retired", "MEASUREMENT", { valueNumeric: "999" }),
        val("p_weight", "MEASUREMENT", { valueNumeric: "80" }),
      ],
      snapshot,
      def,
    );
    expect(rows.map((r) => r.parameterKey)).toEqual(["k_p_weight"]);
  });

  it("a non-GENERAL_HEALTH row is dropped regardless of order position", () => {
    const sensitive = [
      ...snapshot,
      snap("p_secret", "TEXT", { dataClassification: "IDENTIFIABILITY" }),
    ];
    const rows = renderRevisionDisplayRows(
      [
        val("p_secret", "TEXT", { valueText: "hidden" }),
        val("p_weight", "MEASUREMENT", { valueNumeric: "80" }),
      ],
      sensitive,
      def,
    );
    expect(rows.map((r) => r.parameterKey)).toEqual(["k_p_weight"]);
  });
});
