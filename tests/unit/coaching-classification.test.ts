import { describe, expect, it } from "vitest";

import { isParameterClassificationEnabled } from "../../lib/coaching/parameter-classification-gate";
import { computeSelectionFingerprint } from "../../lib/coaching/selection-fingerprint";
import { classifyParameterFromAction } from "../../lib/coaching/parameters-boundary";
import {
  evaluateDailyEntryVersionEligibility,
  type DailyEntryEligibilityReason,
} from "../../lib/coaching/daily-entry-eligibility";

/**
 * P-020A — parameter data-classification foundation (decisions #64, #73,
 * #78 + binding correctness constraints). Pure contract coverage only: the
 * gate, the shared fingerprint helper and the snapshot-only DailyEntry
 * eligibility function. No persistence, no actor state, no runtime context.
 */

describe("parameter-classification gate", () => {
  it('enables only on the exact string "1"', () => {
    expect(isParameterClassificationEnabled("1")).toBe(true);
    for (const v of [
      undefined,
      "",
      "0",
      "true",
      "TRUE",
      "yes",
      " 1",
      "1 ",
      "2",
      "on",
    ]) {
      expect(isParameterClassificationEnabled(v)).toBe(false);
    }
  });
});

describe("classification boundary gate ordering", () => {
  it("refuses before session/input/database when the flag is off", async () => {
    const before = process.env.ENABLE_PARAMETER_CLASSIFICATION;
    delete process.env.ENABLE_PARAMETER_CLASSIFICATION;
    try {
      const r = await classifyParameterFromAction(
        { user: { id: "u1" } },
        {
          workspaceId: "ws",
          parameterIndex: 0,
          expectedRevision: 1,
          fingerprint: "x",
          classification: "GENERAL_HEALTH",
        },
        // No db — flag-off must not touch persistence.
        {},
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("not available");
    } finally {
      if (before === undefined)
        delete process.env.ENABLE_PARAMETER_CLASSIFICATION;
      else process.env.ENABLE_PARAMETER_CLASSIFICATION = before;
    }
  });
});

describe("computeSelectionFingerprint", () => {
  it("is deterministic over ordered identity lists", () => {
    const a = computeSelectionFingerprint(["p1", "p2"], ["t1"]);
    const b = computeSelectionFingerprint(["p1", "p2"], ["t1"]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when membership or ordering changes", () => {
    const base = computeSelectionFingerprint(["p1", "p2"]);
    expect(computeSelectionFingerprint(["p2", "p1"])).not.toBe(base);
    expect(computeSelectionFingerprint(["p1", "p2", "p3"])).not.toBe(base);
    expect(computeSelectionFingerprint(["p1"])).not.toBe(base);
  });
});

// ── Snapshot fixtures ───────────────────────────────────────────────────────

function snapshotParam(over: Record<string, unknown> = {}) {
  return {
    key: "p_00000000-0000-0000-0000-000000000001",
    kind: "MEASUREMENT",
    label: "Weight",
    helpText: null,
    unit: "kg",
    ratingScheme: null,
    options: [],
    validation: null,
    group: null,
    revision: 1,
    ...over,
  };
}

function versionDefinition(over: {
  items?: Array<Record<string, unknown>>;
  parameters?: Record<string, unknown>;
  title?: string;
}) {
  return {
    title: over.title ?? "Tracker",
    sections: [
      {
        sectionId: "sec_1",
        label: "Morning",
        order: 0,
        items: over.items ?? [
          {
            itemId: "itm_1",
            parameterId: "param_1",
            parameterKey: "p_00000000-0000-0000-0000-000000000001",
            required: false,
            order: 0,
          },
        ],
      },
    ],
    parameters: over.parameters ?? {
      param_1: snapshotParam({ dataClassification: "GENERAL_HEALTH" }),
    },
  };
}

function codes(result: {
  reasonCodes: DailyEntryEligibilityReason[];
}): string[] {
  return result.reasonCodes;
}

describe("evaluateDailyEntryVersionEligibility", () => {
  it("accepts a GENERAL_HEALTH MEASUREMENT definition", () => {
    const r = evaluateDailyEntryVersionEligibility(versionDefinition({}));
    expect(r.eligible).toBe(true);
    expect(r.reasonCodes).toEqual([]);
  });

  it("accepts RATING SCALE_1_10, SCALE_1_5, OPTION and TEXT parameters", () => {
    const def = versionDefinition({
      items: [
        {
          itemId: "a",
          parameterId: "p1",
          parameterKey: "k1",
          required: false,
          order: 0,
        },
        {
          itemId: "b",
          parameterId: "p2",
          parameterKey: "k2",
          required: true,
          order: 1,
        },
        {
          itemId: "c",
          parameterId: "p3",
          parameterKey: "k3",
          required: false,
          order: 2,
        },
        {
          itemId: "d",
          parameterId: "p4",
          parameterKey: "k4",
          required: false,
          order: 3,
        },
      ],
      parameters: {
        p1: snapshotParam({
          key: "k1",
          kind: "RATING",
          ratingScheme: "SCALE_1_10",
          unit: null,
          dataClassification: "GENERAL_HEALTH",
        }),
        p2: snapshotParam({
          key: "k2",
          kind: "RATING",
          ratingScheme: "SCALE_1_5",
          unit: null,
          dataClassification: "GENERAL_HEALTH",
        }),
        p3: snapshotParam({
          key: "k3",
          kind: "OPTION",
          unit: null,
          options: [{ optionId: "o1", label: "A" }],
          dataClassification: "GENERAL_HEALTH",
        }),
        p4: snapshotParam({
          key: "k4",
          kind: "TEXT",
          unit: null,
          dataClassification: "GENERAL_HEALTH",
        }),
      },
    });
    expect(evaluateDailyEntryVersionEligibility(def).eligible).toBe(true);
  });

  it("rejects a legacy snapshot whose classification field is absent", () => {
    const def = versionDefinition({});
    // Legacy shape: parameters map entries predate the field entirely.
    (def.parameters as Record<string, unknown>).param_1 = snapshotParam();
    const r = evaluateDailyEntryVersionEligibility(def);
    expect(r.eligible).toBe(false);
    expect(codes(r)).toContain("missing_classification");
  });

  it("rejects explicit NULL classification", () => {
    const def = versionDefinition({
      parameters: {
        param_1: snapshotParam({ dataClassification: null }),
      },
    });
    const r = evaluateDailyEntryVersionEligibility(def);
    expect(r.eligible).toBe(false);
    expect(codes(r)).toContain("missing_classification");
  });

  it("rejects malformed classification values", () => {
    const def = versionDefinition({
      parameters: {
        param_1: snapshotParam({ dataClassification: "GENERAL" }),
      },
    });
    const r = evaluateDailyEntryVersionEligibility(def);
    expect(r.eligible).toBe(false);
    expect(codes(r)).toContain("malformed_classification");
  });

  it.each(["CYCLE", "BLOODWORK", "PED_HRT"])(
    "rejects specialist classification %s",
    (cls) => {
      const def = versionDefinition({
        parameters: {
          param_1: snapshotParam({ dataClassification: cls }),
        },
      });
      const r = evaluateDailyEntryVersionEligibility(def);
      expect(r.eligible).toBe(false);
      expect(codes(r)).toContain("specialist_classification");
    },
  );

  it.each(["TIME", "DURATION"])("rejects unsupported kind %s", (kind) => {
    const def = versionDefinition({
      parameters: {
        param_1: snapshotParam({ kind, dataClassification: "GENERAL_HEALTH" }),
      },
    });
    const r = evaluateDailyEntryVersionEligibility(def);
    expect(r.eligible).toBe(false);
    expect(codes(r)).toContain("unsupported_kind");
  });

  it("rejects RATING with WORD_LABELS", () => {
    const def = versionDefinition({
      parameters: {
        param_1: snapshotParam({
          kind: "RATING",
          ratingScheme: "WORD_LABELS",
          unit: null,
          dataClassification: "GENERAL_HEALTH",
        }),
      },
    });
    const r = evaluateDailyEntryVersionEligibility(def);
    expect(r.eligible).toBe(false);
    expect(codes(r)).toContain("unsupported_rating_scheme");
  });

  it("rejects duplicate parameter references (#64)", () => {
    const def = versionDefinition({
      items: [
        {
          itemId: "a",
          parameterId: "param_1",
          parameterKey: "p_00000000-0000-0000-0000-000000000001",
          required: false,
          order: 0,
        },
        {
          itemId: "b",
          parameterId: "param_1",
          parameterKey: "p_00000000-0000-0000-0000-000000000001",
          required: false,
          order: 1,
        },
      ],
    });
    const r = evaluateDailyEntryVersionEligibility(def);
    expect(r.eligible).toBe(false);
    expect(codes(r)).toContain("duplicate_parameter");
  });

  it("rejects malformed definitions and items referencing unknown parameters", () => {
    expect(evaluateDailyEntryVersionEligibility(null).eligible).toBe(false);
    expect(evaluateDailyEntryVersionEligibility({}).eligible).toBe(false);
    expect(
      evaluateDailyEntryVersionEligibility(
        versionDefinition({ parameters: {} }),
      ).eligible,
    ).toBe(false);
    const wrongKey = versionDefinition({
      parameters: {
        param_1: snapshotParam({
          key: "p_different",
          dataClassification: "GENERAL_HEALTH",
        }),
      },
    });
    const r = evaluateDailyEntryVersionEligibility(wrongKey);
    expect(r.eligible).toBe(false);
    expect(codes(r)).toContain("metadata_incoherent");
  });

  it("returns deterministically ordered reason codes", () => {
    const def = versionDefinition({
      items: [
        {
          itemId: "a",
          parameterId: "param_1",
          parameterKey: "p_00000000-0000-0000-0000-000000000001",
          required: false,
          order: 0,
        },
        {
          itemId: "b",
          parameterId: "param_1",
          parameterKey: "p_00000000-0000-0000-0000-000000000001",
          required: false,
          order: 1,
        },
      ],
      parameters: {
        param_1: snapshotParam({ dataClassification: "CYCLE", kind: "TIME" }),
      },
    });
    const r1 = evaluateDailyEntryVersionEligibility(def);
    const r2 = evaluateDailyEntryVersionEligibility(
      JSON.parse(JSON.stringify(def)),
    );
    expect(r1.reasonCodes).toEqual(r2.reasonCodes);
    // Explicit rank ordering: structural reasons precede parameter reasons.
    expect(r1.reasonCodes).toEqual(
      [...r1.reasonCodes].sort(
        (a, b) =>
          [
            "snapshot_malformed",
            "duplicate_parameter",
            "metadata_incoherent",
            "missing_classification",
            "malformed_classification",
            "specialist_classification",
            "unsupported_kind",
            "unsupported_rating_scheme",
          ].indexOf(a) -
          [
            "snapshot_malformed",
            "duplicate_parameter",
            "metadata_incoherent",
            "missing_classification",
            "malformed_classification",
            "specialist_classification",
            "unsupported_kind",
            "unsupported_rating_scheme",
          ].indexOf(b),
      ),
    );
  });
});
