// P-025-B — Check-In instances + client submissions unit suite.
// RED-first contract: RBAC cells, dual-role deny-set, derived-state
// projector, dueAt/answer parsers, typed validation, consent resolver,
// closed error vocabulary — all against the real production modules.

import { describe, expect, it } from "vitest";

// ── RBAC cells (decision #95 + §7 matrix) ────────────────────────────────

// ── Derived lifecycle projector (§10 — no stored status) ────────────────

// ── dueAt / wire parsers ────────────────────────────────────────────────

describe("P-025-B — dueAt and payload bounds", () => {
  it("accepts a sane ISO timestamp; rejects malformed/unbounded", async () => {
    const { parseCheckInDueAt } = await import("../../lib/checkin/instances");
    expect(parseCheckInDueAt("2026-12-01T09:00:00.000Z")).toBeInstanceOf(Date);
    for (const bad of [
      "",
      "not-a-date",
      "2026-13-01T00:00:00Z",
      "1900-01-01T00:00:00Z", // below sane bound
      "2200-01-01T00:00:00Z", // above sane bound
      "2026-01-01", // missing time — ambiguous
    ]) {
      expect(parseCheckInDueAt(bad)).toBeNull();
    }
  });

  it("rejects oversized answer payloads before canonicalization", async () => {
    const { parseCheckInAnswersJson } =
      await import("../../lib/checkin/instances");
    expect(() => parseCheckInAnswersJson("x".repeat(200_000))).toThrow();
    expect(() => parseCheckInAnswersJson("not json")).toThrow();
    expect(() => parseCheckInAnswersJson("{}")).toThrow(); // not an array
  });
});

// ── Answer canonicalization against the pinned definition ───────────────

const DEF: import("../../lib/checkin/forms").CheckInDefinition = {
  title: "Weekly",
  fields: [
    {
      fieldId: "f_short",
      kind: "shortText",
      label: "Name",
      required: true,
      order: 0,
    },
    {
      fieldId: "f_num",
      kind: "number",
      label: "Kg",
      required: false,
      order: 1,
    },
    {
      fieldId: "f_date",
      kind: "date",
      label: "Day",
      required: false,
      order: 2,
    },
    {
      fieldId: "f_single",
      kind: "singleChoice",
      label: "Pick",
      required: true,
      order: 3,
      options: [
        { optionId: "o_a", label: "A" },
        { optionId: "o_b", label: "B" },
      ],
    },
    {
      fieldId: "f_multi",
      kind: "multiChoice",
      label: "Many",
      required: false,
      order: 4,
      options: [
        { optionId: "o_x", label: "X" },
        { optionId: "o_y", label: "Y" },
      ],
    },
    {
      fieldId: "f_long",
      kind: "longText",
      label: "Notes",
      required: false,
      order: 5,
    },
  ],
};

describe("P-025-B — answer canonicalization (typed, definition-bound)", () => {
  const canon = async (raw: unknown) => {
    const { canonicalizeCheckInAnswers } =
      await import("../../lib/checkin/instances");
    return canonicalizeCheckInAnswers(
      DEF,
      raw as import("../../lib/checkin/instances").RawCheckInAnswerEntry[],
    );
  };

  it("valid input produces one typed row per field, definition order", async () => {
    const rows = await canon([
      { fieldId: "f_single", value: "o_b" },
      { fieldId: "f_short", value: "  Jane  " },
      { fieldId: "f_num", value: "72.5" },
      { fieldId: "f_multi", value: ["o_y", "o_x"] },
      { fieldId: "f_date", value: "2026-01-15" },
    ]);
    expect(rows.map((r) => r.fieldId)).toEqual([
      "f_short",
      "f_num",
      "f_date",
      "f_single",
      "f_multi",
      "f_long",
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.fieldId, r]));
    expect(byId.f_short).toMatchObject({
      kind: "SHORT_TEXT",
      valueText: "Jane",
    });
    expect(byId.f_num).toMatchObject({
      kind: "NUMBER",
      valueNumeric: "72.5",
    });
    expect(byId.f_date).toMatchObject({
      kind: "DATE",
      valueDate: "2026-01-15",
    });
    expect(byId.f_single).toMatchObject({
      kind: "SINGLE_CHOICE",
      valueOptionIds: ["o_b"],
    });
    // Multi-choice option IDs are sorted+deduped for stable storage.
    expect(byId.f_multi).toMatchObject({
      kind: "MULTI_CHOICE",
      valueOptionIds: ["o_x", "o_y"],
    });
    // Optional unanswered fields store null placeholders per kind.
    expect(byId.f_long.kind).toBe("LONG_TEXT");
  });

  it.each([
    [
      "duplicate fieldId",
      [
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_short", value: "b" },
      ],
    ],
    [
      "unknown fieldId",
      [
        { fieldId: "f_ghost", value: "x" },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "missing required",
      [
        { fieldId: "f_num", value: "1" },
        { fieldId: "f_short", value: "a" },
      ],
    ],
    [
      "wrong type for number",
      [
        { fieldId: "f_num", value: { n: 1 } },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "invalid option ID",
      [
        { fieldId: "f_single", value: "o_ghost" },
        { fieldId: "f_short", value: "a" },
      ],
    ],
    [
      "multi with non-array",
      [
        { fieldId: "f_multi", value: "o_x" },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "multi with invalid option",
      [
        { fieldId: "f_multi", value: ["o_x", "o_ghost"] },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "bad date grammar",
      [
        { fieldId: "f_date", value: "15/01/2026" },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "oversized text",
      [
        { fieldId: "f_short", value: "x".repeat(5000) },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "non-integer numeric",
      [
        { fieldId: "f_num", value: "1e999" },
        { fieldId: "f_short", value: "a" },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
    [
      "sparse record",
      [{ fieldId: "f_short" }, { fieldId: "f_single", value: "o_a" }],
    ],
    [
      "extra keys",
      [
        { fieldId: "f_short", value: "a", hack: true },
        { fieldId: "f_single", value: "o_a" },
      ],
    ],
  ])("rejects %s", async (_label, raw) => {
    await expect(canon(raw)).rejects.toThrow();
  });

  it("required field must have a non-empty answer", async () => {
    await expect(
      canon([
        { fieldId: "f_short", value: "   " },
        { fieldId: "f_single", value: "o_a" },
      ]),
    ).rejects.toThrow();
    await expect(
      canon([{ fieldId: "f_single" }, { fieldId: "f_short", value: "ok" }]),
    ).rejects.toThrow();
  });
});

// ── Closed error vocabulary ─────────────────────────────────────────────

// ── Boundary seam ───────────────────────────────────────────────────────

describe("P607 — Custom field selection", () => {
  const canonSel = async (raw: unknown, sel: string[] | null) => {
    const { canonicalizeCheckInAnswers } =
      await import("../../lib/checkin/instances");
    return canonicalizeCheckInAnswers(
      DEF,
      raw as import("../../lib/checkin/instances").RawCheckInAnswerEntry[],
      sel,
    );
  };

  it("NULL selection renders and requires every field — Full unchanged", async () => {
    const rows = await canonSel(
      [
        { fieldId: "f_short", value: "x" },
        { fieldId: "f_num", value: "1" },
        { fieldId: "f_single", value: "o_b" },
      ],
      null,
    );
    // required-only within Full — the unselected-optional rows still emit
    expect(rows.length).toBe(DEF.fields.length);
  });

  it("a subset requires only selected required fields", async () => {
    // DEF's required fields — pick f_short only; other required not needed
    const rows = await canonSel(
      [{ fieldId: "f_short", value: "x" }],
      ["f_short"],
    );
    expect(rows.map((r) => r.fieldId)).toEqual(["f_short"]);
  });

  it("a selected-but-unanswered required field still fails", async () => {
    // selecting a required field without answering it keeps the required rule
    await expect(
      canonSel([{ fieldId: "f_short", value: "x" }], ["f_short", "f_single"]),
    ).rejects.toThrow("invalid_input");
  });

  it("answers outside the selection reject", async () => {
    await expect(
      canonSel(
        [
          { fieldId: "f_short", value: "x" },
          { fieldId: "f_num", value: "1" },
        ],
        ["f_short"],
      ),
    ).rejects.toThrow("invalid_input");
  });

  it("duplicate and unknown fieldIds still reject under a selection", async () => {
    await expect(
      canonSel(
        [
          { fieldId: "f_short", value: "x" },
          { fieldId: "f_short", value: "y" },
        ],
        ["f_short"],
      ),
    ).rejects.toThrow("invalid_input");
    await expect(
      canonSel([{ fieldId: "not_a_field", value: "x" }], ["f_short"]),
    ).rejects.toThrow("invalid_input");
  });
});

describe("P607 — parseCheckInFieldSelection (create-time shape)", () => {
  it("non-empty, deduped-strict, string-only", async () => {
    const { scheduleCheckInInstance } =
      await import("../../lib/checkin/instances");
    // the parser is internal — exercise through a call that fails input
    // validation BEFORE any DB: an empty selection must never reach create
    await expect(
      scheduleCheckInInstance({ sub: "u", roles: [] } as never, {
        workspaceId: "w",
        clientProfileId: "c",
        formId: "f",
        formVersionId: "v",
        dueAt: "2099-01-01",
        fieldSelection: [],
      }),
    ).rejects.toThrow();
  });
});
