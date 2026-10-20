// PR-M8 — Check-in fields (coach note, RATING, VISUAL media answers),
// explicit T+56 generation boundary and the read-only schedule
// projection. Keep categories (D11/D14): trust-boundary validation and
// date/timezone rules a browser cannot see.

import { describe, expect, it } from "vitest";

import type { CheckInDefinition } from "../../lib/checkin/forms";

const DEF: CheckInDefinition = {
  title: "Weekly",
  fields: [
    {
      fieldId: "f_energy",
      kind: "longText",
      label: "How did you feel this week?",
      required: true,
      order: 0,
    },
    {
      fieldId: "f_rating10",
      kind: "rating",
      label: "How was your training?",
      required: true,
      order: 1,
      ratingScheme: "SCALE_1_10",
    },
    {
      fieldId: "f_rating5",
      kind: "rating",
      label: "Recovery",
      required: false,
      order: 2,
      ratingScheme: "SCALE_1_5",
    },
    {
      fieldId: "f_words",
      kind: "rating",
      label: "Week overall",
      required: false,
      order: 3,
      ratingScheme: "WORD_LABELS",
    },
    {
      fieldId: "f_visual",
      kind: "visual",
      label: "Progress visuals",
      required: false,
      order: 4,
    },
  ],
};

const canon = async (raw: unknown) => {
  const { canonicalizeCheckInAnswers } =
    await import("../../lib/checkin/instances");
  return canonicalizeCheckInAnswers(
    DEF,
    raw as import("../../lib/checkin/instances").RawCheckInAnswerEntry[],
  );
};

const ok = [
  { fieldId: "f_energy", value: "Good week" },
  { fieldId: "f_rating10", value: 8 },
];

describe("PR-M8 — RATING answer canonicalization", () => {
  it("stores an in-range integer as valueRating, nothing else", async () => {
    const rows = await canon(ok);
    const rating = rows.find((r) => r.fieldId === "f_rating10")!;
    expect(rating).toMatchObject({
      kind: "RATING",
      answered: true,
      valueRating: 8,
      valueText: null,
      valueNumeric: null,
      valueDate: null,
      valueOptionIds: null,
      mediaIds: null,
    });
  });

  it("accepts the select-string wire form too", async () => {
    const rows = await canon([
      { fieldId: "f_energy", value: "x" },
      { fieldId: "f_rating10", value: "9" },
    ]);
    expect(rows.find((r) => r.fieldId === "f_rating10")!.valueRating).toBe(9);
  });

  it.each([
    ["below range", 0],
    ["above 1-10 range", 11],
    ["fractional", 7.5],
    ["non-numeric", "strong"],
    ["empty string", ""],
    ["null", null],
  ])("rejects %s on a required 1-10 field", async (_label, value) => {
    await expect(
      canon([
        { fieldId: "f_energy", value: "x" },
        { fieldId: "f_rating10", value },
      ]),
    ).rejects.toThrow();
  });

  it("applies the 1-5 bound per scheme, not the 1-10 bound", async () => {
    const rows = await canon([...ok, { fieldId: "f_rating5", value: 5 }]);
    expect(rows.find((r) => r.fieldId === "f_rating5")!.valueRating).toBe(5);
    await expect(
      canon([...ok, { fieldId: "f_rating5", value: 6 }]),
    ).rejects.toThrow();
  });

  it("word-labels scale accepts positions 1..4 and rejects 5", async () => {
    const rows = await canon([...ok, { fieldId: "f_words", value: 4 }]);
    expect(rows.find((r) => r.fieldId === "f_words")!.valueRating).toBe(4);
    await expect(
      canon([...ok, { fieldId: "f_words", value: 5 }]),
    ).rejects.toThrow();
  });

  it("a rating field without a scheme can never canonicalize", async () => {
    const { canonicalizeCheckInAnswers } =
      await import("../../lib/checkin/instances");
    const broken: CheckInDefinition = {
      title: "T",
      fields: [
        {
          fieldId: "f_r",
          kind: "rating",
          label: "R",
          required: true,
          order: 0,
        },
      ],
    };
    expect(() =>
      canonicalizeCheckInAnswers(broken, [{ fieldId: "f_r", value: 3 }]),
    ).toThrow();
  });
});

describe("PR-M8 — VISUAL answer canonicalization", () => {
  it("stores media ids in presentation order, deduped, no value columns", async () => {
    const rows = await canon([
      ...ok,
      { fieldId: "f_visual", value: ["m_b", "m_a", "m_b"] },
    ]);
    const visual = rows.find((r) => r.fieldId === "f_visual")!;
    expect(visual).toMatchObject({
      kind: "VISUAL",
      answered: true,
      mediaIds: ["m_b", "m_a"],
      valueText: null,
      valueNumeric: null,
      valueDate: null,
      valueOptionIds: null,
      valueRating: null,
    });
  });

  it.each([
    ["non-array", "m_a"],
    ["empty string element", ["m_a", ""]],
    ["non-string element", ["m_a", 7]],
    ["oversized id", ["x".repeat(200)]],
    ["over the per-field cap", Array.from({ length: 11 }, (_, i) => `m_${i}`)],
  ])("rejects %s", async (_label, value) => {
    await expect(
      canon([...ok, { fieldId: "f_visual", value }]),
    ).rejects.toThrow();
  });

  it("an empty array is unanswered, not an error, on an optional field", async () => {
    const rows = await canon([...ok, { fieldId: "f_visual", value: [] }]);
    const visual = rows.find((r) => r.fieldId === "f_visual")!;
    expect(visual.answered).toBe(false);
    expect(visual.mediaIds).toBeNull();
  });
});

describe("PR-M8 — form definition validation for the new kinds", () => {
  const validate = async (raw: unknown, forPublish = true) => {
    const { validateCheckInDefinition } =
      await import("../../lib/checkin/forms");
    return validateCheckInDefinition(
      raw,
      { fieldIds: new Map(), optionIds: new Map() },
      { forPublish },
    );
  };
  const base = { title: "Weekly", fields: [] as unknown[] };

  it("accepts rating with a scheme and visual without one", async () => {
    const def = await validate({
      ...base,
      fields: [
        {
          kind: "rating",
          label: "How was your training?",
          required: true,
          order: 0,
          ratingScheme: "SCALE_1_10",
        },
        {
          kind: "visual",
          label: "Progress visuals",
          required: false,
          order: 1,
        },
      ],
    });
    expect(def.fields[0]).toMatchObject({
      kind: "rating",
      ratingScheme: "SCALE_1_10",
    });
    expect(def.fields[1].kind).toBe("visual");
  });

  it.each([
    [
      "rating without a scheme",
      { kind: "rating", label: "R", required: true, order: 0 },
    ],
    [
      "rating with an unknown scheme",
      {
        kind: "rating",
        label: "R",
        required: true,
        order: 0,
        ratingScheme: "1-10",
      },
    ],
    [
      "non-rating carrying a scheme",
      {
        kind: "shortText",
        label: "S",
        required: true,
        order: 0,
        ratingScheme: "SCALE_1_10",
      },
    ],
    [
      "visual carrying options",
      { kind: "visual", label: "V", required: false, order: 0, options: [] },
    ],
  ])("rejects %s", async (_label, field) => {
    await expect(validate({ ...base, fields: [field] })).rejects.toThrow();
  });
});

describe("PR-M8 — T+56 boundary and weekday rules in Europe/Vienna", () => {
  it("generates occurrences through T+56 inclusive, never past it", async () => {
    const { enumerateRuleOccurrenceDates, CHECKIN_SCHEDULE_HORIZON_DAYS } =
      await import("../../lib/checkin/schedules");
    expect(CHECKIN_SCHEDULE_HORIZON_DAYS).toBe(56);
    // 2026-10-19 is a Monday; T+56 is 2026-12-14 — also a Monday.
    const dates = enumerateRuleOccurrenceDates({
      weekday: "MONDAY",
      startDate: "2026-10-01",
      endDate: null,
      todayLocal: "2026-10-19",
    });
    expect(dates).toEqual([
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
      "2026-12-07",
      "2026-12-14",
    ]);
    // The following Monday (T+63) is beyond the horizon — absent by
    // construction; the projection covers it without a write.
    expect(dates).not.toContain("2026-12-21");
  });

  it("keeps the local clock across the Vienna fall-back transition", async () => {
    const { resolveLocalInstant } = await import("../../lib/checkin/timezone");
    // Europe/Vienna leaves DST on 2026-10-25: a 09:00 occurrence is
    // 07:00Z before the transition and 08:00Z after — the local reading
    // never moves.
    const before = resolveLocalInstant("Europe/Vienna", "2026-10-19", 540);
    const after = resolveLocalInstant("Europe/Vienna", "2026-10-26", 540);
    expect(before).toMatchObject({ status: "ok" });
    expect(after).toMatchObject({ status: "ok" });
    if (before.status === "ok")
      expect(before.instant.toISOString()).toBe("2026-10-19T07:00:00.000Z");
    if (after.status === "ok")
      expect(after.instant.toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });
});

describe("PR-M8 — read-only projection enumeration", () => {
  it("enumerates weekday dates inside an arbitrary range", async () => {
    const { enumerateRuleOccurrenceDatesInRange } =
      await import("../../lib/checkin/schedules");
    const dates = enumerateRuleOccurrenceDatesInRange({
      weekday: "MONDAY",
      startDate: "2026-10-01",
      endDate: null,
      rangeStart: "2026-12-01",
      rangeEnd: "2026-12-31",
    });
    expect(dates).toEqual([
      "2026-12-07",
      "2026-12-14",
      "2026-12-21",
      "2026-12-28",
    ]);
  });

  it("clips to startDate/endDate and rejects inverted or malformed ranges", async () => {
    const { enumerateRuleOccurrenceDatesInRange } =
      await import("../../lib/checkin/schedules");
    expect(
      enumerateRuleOccurrenceDatesInRange({
        weekday: "MONDAY",
        startDate: "2026-12-10",
        endDate: "2026-12-20",
        rangeStart: "2026-12-01",
        rangeEnd: "2026-12-31",
      }),
    ).toEqual(["2026-12-14"]);
    expect(
      enumerateRuleOccurrenceDatesInRange({
        weekday: "MONDAY",
        startDate: "2026-10-01",
        endDate: null,
        rangeStart: "2026-12-31",
        rangeEnd: "2026-12-01",
      }),
    ).toEqual([]);
  });
});
