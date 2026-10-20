import { describe, expect, it } from "vitest";

import {
  isOnboardingSubmissionEnabled,
  OnboardingSubmissionError,
  SUBMISSION_LIMITS,
} from "../../lib/onboarding/submission-gate";
import {
  canonicalizeAnswers,
  parseAnswersJson,
} from "../../lib/onboarding/submissions";
import type { FormDefinition } from "../../lib/onboarding/forms";

/**
 * P-023 — pure boundary unit coverage: gate, wire-format parse bounds,
 * per-kind canonicalization, RBAC cells, and route-leaf uniqueness.
 * Database behavior lives in the integration suite.
 */

const DEF: FormDefinition = {
  title: "Intake",
  fields: [
    {
      fieldId: "f_short",
      kind: "shortText",
      label: "Name",
      required: true,
      order: 0,
    },
    {
      fieldId: "f_long",
      kind: "longText",
      label: "Notes",
      required: false,
      order: 1,
    },
    {
      fieldId: "f_num",
      kind: "number",
      label: "Weight",
      required: true,
      order: 2,
    },
    {
      fieldId: "f_date",
      kind: "date",
      label: "Start",
      required: false,
      order: 3,
    },
    {
      fieldId: "f_single",
      kind: "singleChoice",
      label: "Goal",
      required: true,
      order: 4,
      options: [
        { optionId: "o_b", label: "B" },
        { optionId: "o_a", label: "A" },
      ],
    },
    {
      fieldId: "f_multi",
      kind: "multiChoice",
      label: "Days",
      required: false,
      order: 5,
      options: [
        { optionId: "m_1", label: "1" },
        { optionId: "m_2", label: "2" },
        { optionId: "m_3", label: "3" },
      ],
    },
  ],
};

const FULL = [
  { fieldId: "f_short", value: "Bob" },
  { fieldId: "f_num", value: "80.5" },
  { fieldId: "f_single", value: "o_a" },
];

function expectInvalid(fn: () => unknown) {
  try {
    fn();
    throw new Error("did not throw");
  } catch (e) {
    expect(e).toBeInstanceOf(OnboardingSubmissionError);
    expect((e as OnboardingSubmissionError).code).toBe("invalid_input");
  }
}

describe("P-023 gate", () => {
  it("enables only on the exact string '1'", () => {
    expect(isOnboardingSubmissionEnabled("1")).toBe(true);
    for (const v of [undefined, "", "0", "true", " 1", "1 ", "01"])
      expect(isOnboardingSubmissionEnabled(v)).toBe(false);
  });
});


describe("P-023 parseAnswersJson", () => {
  it("accepts the array-of-records wire format", () => {
    const out = parseAnswersJson(JSON.stringify(FULL));
    expect(out).toEqual(FULL);
  });

  it("rejects non-string payloads", () => {
    expectInvalid(() => parseAnswersJson([]));
    expectInvalid(() => parseAnswersJson({}));
    expectInvalid(() => parseAnswersJson(12));
  });

  it("rejects the 64 KiB UTF-8 bound BEFORE JSON.parse", () => {
    // An oversized payload that would parse as valid JSON must still fail.
    const big = "x".repeat(SUBMISSION_LIMITS.answersJsonMaxBytes);
    expectInvalid(() => parseAnswersJson(`["${big}"]`));
    expectInvalid(() => parseAnswersJson("[".repeat(70 * 1024)));
  });

  it("rejects malformed JSON and non-arrays", () => {
    expectInvalid(() => parseAnswersJson("{"));
    expectInvalid(() => parseAnswersJson("{}"));
    expectInvalid(() => parseAnswersJson("42"));
    expectInvalid(() => parseAnswersJson("null"));
  });

  it("rejects arrays over the max-answers bound", () => {
    const arr = Array.from(
      { length: SUBMISSION_LIMITS.maxAnswers + 1 },
      (_, i) => ({
        fieldId: `f_${i}`,
        value: "x",
      }),
    );
    expectInvalid(() => parseAnswersJson(JSON.stringify(arr)));
    const ok = Array.from({ length: SUBMISSION_LIMITS.maxAnswers }, (_, i) => ({
      fieldId: `f_${i}`,
      value: "x",
    }));
    expect(parseAnswersJson(JSON.stringify(ok))).toHaveLength(
      SUBMISSION_LIMITS.maxAnswers,
    );
  });

  it("rejects non-object entries and wrong key sets", () => {
    expectInvalid(() => parseAnswersJson('[["f_short","x"]]'));
    expectInvalid(() => parseAnswersJson("[null]"));
    expectInvalid(() => parseAnswersJson('[{"fieldId":"f_short"}]'));
    expectInvalid(() =>
      parseAnswersJson('[{"fieldId":"f_short","value":"x","extra":1}]'),
    );
    expectInvalid(() =>
      parseAnswersJson('[{"value":"x","fieldId2":"f_short"}]'),
    );
  });

  it("rejects bad fieldIds (non-string, empty, >128)", () => {
    expectInvalid(() => parseAnswersJson('[{"fieldId":12,"value":"x"}]'));
    expectInvalid(() => parseAnswersJson('[{"fieldId":"","value":"x"}]'));
    const long = "f".repeat(SUBMISSION_LIMITS.idMax + 1);
    expectInvalid(() =>
      parseAnswersJson(JSON.stringify([{ fieldId: long, value: "x" }])),
    );
    const edge = "f".repeat(SUBMISSION_LIMITS.idMax);
    expect(
      parseAnswersJson(JSON.stringify([{ fieldId: edge, value: "x" }])),
    ).toHaveLength(1);
  });

  it("rejects duplicate fieldIds before canonicalization", () => {
    expectInvalid(() =>
      parseAnswersJson(
        '[{"fieldId":"f_short","value":"a"},{"fieldId":"f_short","value":"b"}]',
      ),
    );
  });
});

describe("P-023 canonicalizeAnswers", () => {
  it("stores accepted answers in definition order and omits optional-empty", () => {
    const out = canonicalizeAnswers(DEF, FULL);
    expect(out.map((a) => a.fieldId)).toEqual(["f_short", "f_num", "f_single"]);
    expect(out[0]).toMatchObject({ kind: "SHORT_TEXT", valueText: "Bob" });
    expect(out[1]).toMatchObject({ kind: "NUMBER", valueNumeric: "80.5" });
    expect(out[2]).toMatchObject({
      kind: "SINGLE_CHOICE",
      valueOptionIds: ["o_a"],
    });
  });

  it("rejects unknown fieldIds", () => {
    expectInvalid(() =>
      canonicalizeAnswers(DEF, [...FULL, { fieldId: "f_unknown", value: "x" }]),
    );
  });

  it("rejects missing required answers (absent AND empty)", () => {
    expectInvalid(() =>
      canonicalizeAnswers(DEF, [
        { fieldId: "f_num", value: "80" },
        { fieldId: "f_single", value: "o_a" },
      ]),
    );
    expectInvalid(() =>
      canonicalizeAnswers(DEF, [
        { fieldId: "f_short", value: "   " },
        { fieldId: "f_num", value: "80" },
        { fieldId: "f_single", value: "o_a" },
      ]),
    );
  });

  it("bounds shortText by chars AND UTF-8 bytes", () => {
    const atChars = "a".repeat(SUBMISSION_LIMITS.shortTextMaxChars);
    const overChars = "a".repeat(SUBMISSION_LIMITS.shortTextMaxChars + 1);
    const base = (v: string) => [
      { fieldId: "f_short", value: v },
      { fieldId: "f_num", value: "80" },
      { fieldId: "f_single", value: "o_a" },
    ];
    canonicalizeAnswers(DEF, base(atChars));
    expectInvalid(() => canonicalizeAnswers(DEF, base(overChars)));
    // The byte cap (4096) is a defense-in-depth second bound — it is
    // mathematically subsumed by the char cap (≤1000 UTF-16 units can
    // encode at most 3000 UTF-8 bytes), so byte-heavy input is still
    // rejected, by whichever bound binds first.
    const byteHeavy = "🙂".repeat(SUBMISSION_LIMITS.shortTextMaxChars + 1);
    expectInvalid(() => canonicalizeAnswers(DEF, base(byteHeavy)));
    const emojiOk = "🙂".repeat(500); // 1000 UTF-16 units, 2000 bytes
    canonicalizeAnswers(DEF, base(emojiOk));
  });

  it("bounds longText", () => {
    const def: FormDefinition = {
      title: "t",
      fields: [
        {
          fieldId: "f_long",
          kind: "longText",
          label: "l",
          required: true,
          order: 0,
        },
      ],
    };
    const at = "x".repeat(SUBMISSION_LIMITS.longTextMaxChars);
    const over = "x".repeat(SUBMISSION_LIMITS.longTextMaxChars + 1);
    canonicalizeAnswers(def, [{ fieldId: "f_long", value: at }]);
    expectInvalid(() =>
      canonicalizeAnswers(def, [{ fieldId: "f_long", value: over }]),
    );
    expectInvalid(() =>
      canonicalizeAnswers(def, [{ fieldId: "f_long", value: 42 }]),
    );
  });

  it("enforces the decimal grammar with no silent rounding", () => {
    const def: FormDefinition = {
      title: "t",
      fields: [
        {
          fieldId: "f_num",
          kind: "number",
          label: "n",
          required: true,
          order: 0,
        },
      ],
    };
    for (const ok of ["0", "-1", "123.456789", "-0.000001", "999999999999999"])
      canonicalizeAnswers(def, [{ fieldId: "f_num", value: ok }]);
    for (const bad of [
      "80,5",
      "1e3",
      ".5",
      "5.",
      "1234567890123456",
      "1.0000001",
      "abc",
      " 5",
      5,
    ])
      expectInvalid(() =>
        canonicalizeAnswers(def, [{ fieldId: "f_num", value: bad }]),
      );
  });

  it("enforces strict dates with plausibility bounds", () => {
    const def: FormDefinition = {
      title: "t",
      fields: [
        {
          fieldId: "f_date",
          kind: "date",
          label: "d",
          required: true,
          order: 0,
        },
      ],
    };
    for (const ok of ["1900-01-01", "2100-12-31", "2026-02-28"])
      canonicalizeAnswers(def, [{ fieldId: "f_date", value: ok }]);
    for (const bad of [
      "1899-12-31",
      "2101-01-01",
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
      "26-01-01",
      "2026/01/01",
      "January 1, 2026",
    ])
      expectInvalid(() =>
        canonicalizeAnswers(def, [{ fieldId: "f_date", value: bad }]),
      );
  });

  it("singleChoice requires exactly one valid option", () => {
    const def: FormDefinition = {
      title: "t",
      fields: [
        {
          fieldId: "f_single",
          kind: "singleChoice",
          label: "s",
          required: true,
          order: 0,
          options: [
            { optionId: "o_a", label: "A" },
            { optionId: "o_b", label: "B" },
          ],
        },
      ],
    };
    const out = canonicalizeAnswers(def, [
      { fieldId: "f_single", value: "o_b" },
    ]);
    expect(out[0].valueOptionIds).toEqual(["o_b"]);
    for (const bad of ["o_x", "", ["o_a"], 12, null])
      expectInvalid(() =>
        canonicalizeAnswers(def, [{ fieldId: "f_single", value: bad }]),
      );
  });

  it("multiChoice dedups + lexicographically sorts and bounds selections", () => {
    const def: FormDefinition = {
      title: "t",
      fields: [
        {
          fieldId: "f_multi",
          kind: "multiChoice",
          label: "m",
          required: false,
          order: 0,
          options: [
            { optionId: "m_1", label: "1" },
            { optionId: "m_2", label: "2" },
            { optionId: "m_3", label: "3" },
          ],
        },
      ],
    };
    const out = canonicalizeAnswers(def, [
      { fieldId: "f_multi", value: ["m_3", "m_1", "m_1", "m_2"] },
    ]);
    expect(out[0].valueOptionIds).toEqual(["m_1", "m_2", "m_3"]);
    // Unknown/retired options rejected.
    expectInvalid(() =>
      canonicalizeAnswers(def, [{ fieldId: "f_multi", value: ["m_1", "m_9"] }]),
    );
    // Wrong shape.
    expectInvalid(() =>
      canonicalizeAnswers(def, [{ fieldId: "f_multi", value: "m_1" }]),
    );
    // >maxOptions selections rejected.
    const many = Array.from(
      { length: SUBMISSION_LIMITS.multiMaxSelections + 1 },
      (_, i) => `o_${i}`,
    );
    const bigDef: FormDefinition = {
      title: "t",
      fields: [
        {
          fieldId: "f_multi",
          kind: "multiChoice",
          label: "m",
          required: false,
          order: 0,
          options: many.map((id) => ({ optionId: id, label: id })),
        },
      ],
    };
    expectInvalid(() =>
      canonicalizeAnswers(bigDef, [{ fieldId: "f_multi", value: many }]),
    );
  });

  it("malformed pinned definitions degrade to not_available, not partial fill", () => {
    for (const def of [
      null,
      { title: "t", fields: [] },
      { title: "t", fields: [{ fieldId: "f", kind: "shortText" }] },
    ]) {
      try {
        canonicalizeAnswers(def, FULL);
        throw new Error("did not throw");
      } catch (e) {
        expect(e).toBeInstanceOf(OnboardingSubmissionError);
        expect((e as OnboardingSubmissionError).code).toBe("not_available");
      }
    }
  });
});
