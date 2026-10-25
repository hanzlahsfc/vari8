// FULL-PACKAGE SLICE of #171
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@prisma/client";

vi.mock("../../components/canvas/data/http", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "../../components/canvas/data/http";
import { loadCheckInReview } from "../../components/canvas/data/checkins";
import type { Submission } from "../../components/canvas/coach/model";
import type { CheckInField } from "../../lib/checkin/forms";
import {
  type CheckInReviewPanelAnswer,
  diffCheckInSubmissions,
} from "../../lib/checkin/review-panel";

/**
 * Card 06 / R2-N2 — the change summary a browser cannot see: which answer
 * is added, removed or changed between the current submission and the
 * previous submission of the same form. Compared on raw answer values,
 * never on display strings, and labelled from the submission's own form
 * version.
 */

const WEEKLY_FIELDS: CheckInField[] = [
  {
    fieldId: "q-energy",
    kind: "longText",
    label: "How did you feel this week?",
    required: true,
    order: 0,
  },
  {
    fieldId: "q-training",
    kind: "rating",
    label: "How was your training?",
    required: true,
    order: 1,
    ratingScheme: "SCALE_1_10",
  },
  {
    fieldId: "q-note",
    kind: "longText",
    label: "Anything you would like me to know?",
    required: false,
    order: 2,
  },
];

function text(fieldId: string, valueText: string): CheckInReviewPanelAnswer {
  return {
    fieldId,
    kind: "LONG_TEXT",
    valueText,
    valueNumeric: null,
    valueDate: null,
    valueOptionIds: null,
    valueRating: null,
    mediaIds: [],
  };
}

function rating(fieldId: string, valueRating: number): CheckInReviewPanelAnswer {
  return {
    fieldId,
    kind: "RATING",
    valueText: null,
    valueNumeric: null,
    valueDate: null,
    valueOptionIds: null,
    valueRating,
    mediaIds: [],
  };
}

function numeric(fieldId: string, value: string): CheckInReviewPanelAnswer {
  return {
    fieldId,
    kind: "NUMBER",
    valueText: null,
    valueNumeric: new Prisma.Decimal(value),
    valueDate: null,
    valueOptionIds: null,
    valueRating: null,
    mediaIds: [],
  };
}

function visual(
  fieldId: string,
  mediaIds: string[],
): CheckInReviewPanelAnswer {
  return {
    fieldId,
    kind: "VISUAL",
    valueText: null,
    valueNumeric: null,
    valueDate: null,
    valueOptionIds: null,
    valueRating: null,
    mediaIds,
  };
}

function previous(over: Partial<Parameters<typeof diffCheckInSubmissions>[0]["previous"]> = {}) {
  return {
    submissionId: "sub-prev",
    submittedAt: "2026-10-12T17:00:00.000Z",
    formName: "Weekly check-in",
    fields: WEEKLY_FIELDS,
    answers: [
      text("q-energy", "A steady week."),
      rating("q-training", 8),
      text("q-note", "Knee felt unsettled."),
    ],
    ...over,
  };
}

describe("diffCheckInSubmissions (card 06 change summary)", () => {
  it("lists a changed rating with both display values", () => {
    const summary = diffCheckInSubmissions({
      current: {
        fields: WEEKLY_FIELDS,
        answers: [
          text("q-energy", "A steady week."),
          rating("q-training", 6),
          text("q-note", "Knee felt unsettled."),
        ],
      },
      previous: previous(),
    });
    expect(summary.added).toEqual([]);
    expect(summary.removed).toEqual([]);
    expect(summary.changed).toEqual([
      {
        fieldId: "q-training",
        label: "How was your training?",
        kind: "rating",
        previous: "8 / 10",
        current: "6 / 10",
      },
    ]);
    expect(summary.unchanged).toBe(2);
    expect(summary.previousSubmissionId).toBe("sub-prev");
  });

  it("lists an added answer and a removed answer", () => {
    const summary = diffCheckInSubmissions({
      current: {
        fields: WEEKLY_FIELDS,
        answers: [text("q-energy", "A steady week."), rating("q-training", 8)],
      },
      previous: previous({
        answers: [
          text("q-energy", "A steady week."),
          rating("q-training", 8),
          text("q-note", "Knee felt unsettled."),
          visual("q-visuals", ["media-1", "media-2"]),
        ],
      }),
    });
    expect(summary.changed).toEqual([]);
    // q-note answered before, blank now; q-visuals carried media before,
    // none now — both removed.
    expect(summary.removed).toEqual([
      {
        fieldId: "q-note",
        label: "Anything you would like me to know?",
        kind: "longText",
        previous: "Knee felt unsettled.",
        current: null,
      },
      {
        fieldId: "q-visuals",
        label: "q-visuals",
        kind: "VISUAL",
        previous: "2 visuals",
        current: null,
      },
    ]);
    // And the reverse direction: the note text arriving new is an add.
    const added = diffCheckInSubmissions({
      current: {
        fields: WEEKLY_FIELDS,
        answers: [
          text("q-energy", "A steady week."),
          rating("q-training", 8),
          text("q-note", "New note this week."),
        ],
      },
      previous: previous({
        answers: [text("q-energy", "A steady week."), rating("q-training", 8)],
      }),
    });
    expect(added.added).toEqual([
      {
        fieldId: "q-note",
        label: "Anything you would like me to know?",
        kind: "longText",
        previous: null,
        current: "New note this week.",
      },
    ]);
  });

  it("treats identical submissions as unchanged, with no noise", () => {
    const answers = [
      text("q-energy", "A steady week."),
      rating("q-training", 8),
      numeric("q-weight", "67.0"),
    ];
    const summary = diffCheckInSubmissions({
      current: { fields: WEEKLY_FIELDS, answers },
      previous: previous({ answers }),
    });
    expect(summary.added).toEqual([]);
    expect(summary.removed).toEqual([]);
    expect(summary.changed).toEqual([]);
    expect(summary.unchanged).toBe(3);
  });

  it("labels a renamed field with the current version, a dropped field with the previous", () => {
    const currentFields: CheckInField[] = [
      {
        fieldId: "q-energy",
        kind: "longText",
        label: "Energy this week?",
        required: true,
        order: 0,
      },
    ];
    const summary = diffCheckInSubmissions({
      current: { fields: currentFields, answers: [] },
      previous: previous(),
    });
    // All three previous answers are removed. A field still in the
    // current version carries its current label (the vocabulary the
    // coach reads today); a field that left the form keeps the label
    // it was answered under.
    expect(summary.removed.map((r) => r.fieldId)).toEqual([
      "q-energy",
      "q-training",
      "q-note",
    ]);
    expect(summary.removed[0]).toMatchObject({
      label: "Energy this week?",
      previous: "A steady week.",
    });
    expect(summary.removed[1]).toMatchObject({
      label: "How was your training?",
      previous: "8 / 10",
    });
    expect(summary.removed[2]).toMatchObject({
      label: "Anything you would like me to know?",
      previous: "Knee felt unsettled.",
    });
  });

  it("compares option sets and media lists, not row identity", () => {
    const choice = (fieldId: string, ids: string[]): CheckInReviewPanelAnswer => ({
      fieldId,
      kind: "MULTI_CHOICE",
      valueText: null,
      valueNumeric: null,
      valueDate: null,
      valueOptionIds: ids,
      valueRating: null,
      mediaIds: [],
    });
    const same = diffCheckInSubmissions({
      current: {
        fields: WEEKLY_FIELDS,
        answers: [
          choice("q-energy", ["o1", "o2"]),
          visual("q-note", ["m1", "m2"]),
        ],
      },
      previous: previous({
        answers: [
          // Same set, different stored order — not a change.
          choice("q-energy", ["o2", "o1"]),
          visual("q-note", ["m1", "m2"]),
        ],
      }),
    });
    expect(same.changed).toEqual([]);
    expect(same.unchanged).toBe(2);
    const different = diffCheckInSubmissions({
      current: {
        fields: WEEKLY_FIELDS,
        answers: [visual("q-note", ["m1", "m3"])],
      },
      previous: previous({ answers: [visual("q-note", ["m1", "m2"])] }),
    });
    expect(different.changed).toEqual([
      {
        fieldId: "q-note",
        label: "Anything you would like me to know?",
        kind: "longText",
        previous: "2 visuals",
        current: "2 visuals",
      },
    ]);
  });
});

describe("loadCheckInReview provider wire (card 06)", () => {
  const submission = {
    id: "sub-1",
    clientId: "client-1",
    date: "2026-10-19",
    eventId: "evt-1",
    type: "Full",
    answers: [],
    metrics: [],
    visuals: [],
    note: "",
    flags: [],
  } satisfies Submission;

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("hits the review route once and patches the Submission", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      submissionId: "sub-1",
      instanceId: "inst-1",
      formName: "Weekly check-in",
      versionSeq: 1,
      dueAt: "2026-10-19T07:00:00.000Z",
      submittedAt: "2026-10-19T17:00:00.000Z",
      late: true,
      reviewed: { byName: "Riley Coach", at: "2026-10-20T08:00:00.000Z" },
      canMark: false,
      canSend: true,
      feedback: [
        {
          id: "fb-1",
          sentAt: "2026-10-20T08:00:00.000Z",
          byName: "Riley Coach",
          body: "Well done.",
        },
      ],
      feedbackNextCursor: null,
      fields: [
        {
          fieldId: "q-energy",
          label: "How did you feel this week?",
          kind: "longText",
          required: true,
          display: "Good week.",
          mediaIds: [],
        },
        {
          fieldId: "q-visuals",
          label: "Progress visuals",
          kind: "visual",
          required: false,
          display: "1 visual",
          mediaIds: ["media-9"],
        },
      ],
      reviewState: "answered",
      changeSummary: null,
    });
    const result = await loadCheckInReview(
      {
        workspaceId: "ws-1",
        clientProfileId: "cp-1",
        submissionId: "sub-1",
      },
      submission,
    );
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiFetch).mock.calls[0]![0]).toBe(
      "/workspaces/ws-1/checkins/submissions/sub-1/review?clientProfileId=cp-1",
    );
    // The panel payload passes through untouched.
    expect(result.panel.reviewState).toBe("answered");
    // Visual fields never enter the answer list; their media ids feed
    // the visuals grid — the mapping loadSubmissionAnswers established.
    expect(result.submission.answers).toEqual([
      { question: "How did you feel this week?", answer: "Good week." },
    ]);
    expect(result.submission.visuals).toEqual(["media-9"]);
    expect(result.submission.response).toMatchObject({
      text: "Well done.",
      date: "2026-10-20",
    });
  });
});
