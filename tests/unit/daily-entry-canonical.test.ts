import { describe, expect, it } from "vitest";

import {
  canonicalizeDecimal,
  computeDailyEntryFormToken,
  computeRevisionCanonicalHash,
  type TaggedValue,
} from "../../lib/daily-entry/canonical";
import { computeSelectionFingerprint } from "../../lib/coaching/selection-fingerprint";

/**
 * P-021 canonical-value semantics (decision #74, P-021-R3 §5–§6).
 * Pure logic only — no database, no browser.
 */

describe("canonicalizeDecimal — grammar and normalization", () => {
  it.each([
    ["1", "1"],
    ["+1", "1"],
    ["-1", "-1"],
    ["0", "0"],
    ["-0", "0"],
    ["+0", "0"],
    ["-0.0", "0"],
    ["+0.00", "0"],
    ["007", "7"],
    ["000.50", "0.5"],
    ["1.50", "1.5"],
    ["1,25", "1.25"],
    ["1.50000000", "1.5"],
    ["1.000", "1"],
    ["  12.5  ", "12.5"],
    ["-12,50000000", "-12.5"],
    ["9999999999999999999999.99999999", "9999999999999999999999.99999999"],
    ["-9999999999999999999999.99999999", "-9999999999999999999999.99999999"],
  ])("accepts %j as %j", (input, expected) => {
    expect(canonicalizeDecimal(input)).toBe(expected);
  });

  it.each([
    ["1.500000000"], // raw fraction 9 digits — trailing zeros cannot rescue it
    ["0.000000001"], // 9 fractional digits
    ["-0.000000001"],
    ["1.2.3"],
    ["1,2.3"],
    ["1,2,3"],
    ["1e3"],
    ["1E-2"],
    ["0x10"],
    ["1 000"],
    ["1,000,000"],
    ["."],
    [","],
    ["+"],
    ["-"],
    [""],
    [" "],
    ["abc"],
    ["1..5"],
    ["++1"],
    ["--1"],
    ["+-1"],
    ["1-"],
    ["10000000000000000000000"], // 10^22 — boundary, rejected
    ["-10000000000000000000000"], // -10^22 — boundary, rejected
    ["100000000000000000000000"], // >10^22
    ["-100000000000000000000000"],
    ["12345678901234567890123.5"], // 23 integer digits
    ["NaN"],
    ["Infinity"],
    ["1.5e-9"], // exponent notation rejected even though it fits
  ])("rejects %j", (input) => {
    expect(canonicalizeDecimal(input)).toBeNull();
  });
});

const PARAM = (
  parameterId: string,
  overrides: Record<string, unknown> = {},
) => ({
  parameterId,
  parameterKey: `p_${parameterId}`,
  dataClassification: "GENERAL_HEALTH",
  kind: "MEASUREMENT" as const,
  snapshotRevision: 1,
  sectionId: "sec_main",
  itemId: `itm_${parameterId}`,
  value: { tag: "absent" } as TaggedValue,
  ...overrides,
});

const MEAS = (canonical: string): TaggedValue => ({
  tag: "measurement",
  canonical,
});

describe("computeRevisionCanonicalHash", () => {
  const base = {
    pinId: "pin_1",
    templateVersionId: "ver_1",
    params: [
      PARAM("pd_a", { value: MEAS("1.5") }),
      PARAM("pd_b", { value: { tag: "rating", value: 7 } }),
    ],
  };

  it("is deterministic for identical canonical content", () => {
    expect(computeRevisionCanonicalHash(base)).toBe(
      computeRevisionCanonicalHash(structuredClone(base)),
    );
  });

  it("produces the fixed compatibility vector", () => {
    // Fixed synthetic vector — any encoding change MUST change this digest.
    const hash = computeRevisionCanonicalHash({
      pinId: "pin_test",
      templateVersionId: "ver_test",
      params: [
        {
          parameterId: "pd_weight",
          parameterKey: "p_weight",
          dataClassification: "GENERAL_HEALTH",
          kind: "MEASUREMENT",
          snapshotRevision: 2,
          sectionId: "sec_body",
          itemId: "itm_weight",
          value: { tag: "measurement", canonical: "75.5" },
        },
        {
          parameterId: "pd_label",
          parameterKey: "p_label",
          dataClassification: "GENERAL_HEALTH",
          kind: "OPTION",
          snapshotRevision: 1,
          sectionId: "sec_nutrition",
          itemId: "itm_label",
          value: { tag: "option", optionId: "opt_high" },
        },
        {
          parameterId: "pd_notes",
          parameterKey: "p_notes",
          dataClassification: "GENERAL_HEALTH",
          kind: "TEXT",
          snapshotRevision: 3,
          sectionId: "sec_notes",
          itemId: "itm_notes",
          value: { tag: "absent" },
        },
      ],
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(
      "2df3e904b800fa136fb9bfc820f9a6ede3e311dad255f3f3cebe6384dc12180e",
    );
  });

  it("distinguishes absent from present-zero", () => {
    const zero = computeRevisionCanonicalHash({
      ...base,
      params: [PARAM("pd_a", { value: MEAS("0") })],
    });
    const absent = computeRevisionCanonicalHash({
      ...base,
      params: [PARAM("pd_a", { value: { tag: "absent" } })],
    });
    expect(zero).not.toBe(absent);
  });

  it("distinguishes value types (1 vs '1')", () => {
    const num = computeRevisionCanonicalHash({
      ...base,
      params: [PARAM("pd_a", { value: MEAS("1") })],
    });
    const txt = computeRevisionCanonicalHash({
      ...base,
      params: [
        PARAM("pd_a", { kind: "TEXT", value: { tag: "text", value: "1" } }),
      ],
    });
    expect(num).not.toBe(txt);
  });

  it("binds provenance, classification, pin, and version", () => {
    const variants = [
      { pinId: "pin_2" },
      { templateVersionId: "ver_2" },
      {
        params: base.params.map((p, i) =>
          i === 0 ? { ...p, itemId: "itm_other" } : p,
        ),
      },
      {
        params: base.params.map((p, i) =>
          i === 0 ? { ...p, dataClassification: "CYCLE" } : p,
        ),
      },
      {
        params: base.params.map((p, i) =>
          i === 0 ? { ...p, snapshotRevision: 9 } : p,
        ),
      },
      { params: [...base.params].reverse() },
    ];
    const ref = computeRevisionCanonicalHash(base);
    for (const v of variants)
      expect(computeRevisionCanonicalHash({ ...base, ...v })).not.toBe(ref);
  });
});

describe("computeDailyEntryFormToken — actor-bound stale token", () => {
  const tokenBase = {
    workspaceId: "ws_1",
    clientProfileId: "cp_1",
    entryDate: "2026-10-09",
    pinId: "pin_1",
    templateVersionId: "ver_1",
    currentRevision: null as
      | { tag: "absent" }
      | { tag: "present"; revisionId: string; canonicalHash: string }
      | null,
    parameters: [
      { parameterId: "pd_a", parameterKey: "p_a", snapshotRevision: 1 },
      { parameterId: "pd_b", parameterKey: "p_b", snapshotRevision: 2 },
    ],
    ordinalFingerprint: computeSelectionFingerprint(["pd_a", "pd_b"]),
    sessionUserId: "u_1",
    workspaceMemberId: "wm_1",
  };

  it("is deterministic for identical material", () => {
    expect(computeDailyEntryFormToken(tokenBase)).toBe(
      computeDailyEntryFormToken(structuredClone(tokenBase)),
    );
  });

  it.each([
    ["workspace", { workspaceId: "ws_2" }],
    ["client", { clientProfileId: "cp_2" }],
    ["date", { entryDate: "2026-10-10" }],
    ["pin", { pinId: "pin_2" }],
    ["version", { templateVersionId: "ver_2" }],
    ["user", { sessionUserId: "u_2" }],
    ["member", { workspaceMemberId: "wm_2" }],
    [
      "revision",
      {
        currentRevision: {
          tag: "present" as const,
          revisionId: "rev_1",
          canonicalHash: "h1",
        },
      },
    ],
    [
      "parameter set",
      {
        parameters: [
          { parameterId: "pd_c", parameterKey: "p_c", snapshotRevision: 1 },
          ...tokenBase.parameters,
        ],
      },
    ],
  ])("fails to replay across changed %s", (_label, patch) => {
    expect(computeDailyEntryFormToken({ ...tokenBase, ...patch })).not.toBe(
      computeDailyEntryFormToken(tokenBase),
    );
  });

  it("encodes absent vs present current revision distinctly", () => {
    const absent = computeDailyEntryFormToken(tokenBase);
    const present = computeDailyEntryFormToken({
      ...tokenBase,
      currentRevision: { tag: "present", revisionId: "r", canonicalHash: "h" },
    });
    expect(absent).not.toBe(present);
  });
});
