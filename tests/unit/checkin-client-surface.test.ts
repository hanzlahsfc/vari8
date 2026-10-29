// w2-c6 - client check-in surface helpers: schedule status chips, per-pose
// VISUAL media mapping, tracker-summary rows from the own daily-entries
// surface, and submitted-answer display values.

import { describe, expect, it } from "vitest";

import {
  checkInScheduleLabel,
  checkInScheduleStatus,
  mediaIdsForPoses,
  posesForVisualField,
  submittedAnswerDisplay,
  summaryRowsFromSurface,
} from "../../components/canvas/data/checkins";

describe("checkInScheduleStatus", () => {
  it("marks a past-due scheduled instance overdue", () => {
    expect(checkInScheduleStatus({ state: "SCHEDULED", late: true })).toBe(
      "overdue",
    );
  });
  it("keeps a cancelled instance cancelled even when late flags exist", () => {
    expect(checkInScheduleStatus({ state: "CANCELLED", late: false })).toBe(
      "cancelled",
    );
  });
  it("treats submitted and reviewed as submitted for the client", () => {
    expect(checkInScheduleStatus({ state: "SUBMITTED", late: true })).toBe(
      "submitted",
    );
    expect(checkInScheduleStatus({ state: "REVIEWED", late: false })).toBe(
      "submitted",
    );
  });
  it("labels every chip state", () => {
    expect(checkInScheduleLabel("overdue")).toBe("Overdue");
    expect(checkInScheduleLabel("scheduled")).toBe("Scheduled");
    expect(checkInScheduleLabel("submitted")).toBe("Submitted");
    expect(checkInScheduleLabel("cancelled")).toBe("Cancelled");
  });
});

describe("posesForVisualField", () => {
  const defaults = ["Front", "Side", "Back", "FDB", "BDB"];
  it("uses the wire option labels when the definition carries poses", () => {
    expect(
      posesForVisualField(
        {
          options: [
            { optionId: "o1", label: "Front relaxed" },
            { optionId: "o2", label: "Side relaxed" },
          ],
        },
        defaults,
      ),
    ).toEqual(["Front relaxed", "Side relaxed"]);
  });
  it("falls back to the five default poses without options", () => {
    expect(posesForVisualField({}, defaults)).toEqual(defaults);
    expect(posesForVisualField({ options: [] }, defaults)).toEqual(defaults);
  });
});

describe("mediaIdsForPoses", () => {
  it("maps filled slots to mediaIds in pose order", () => {
    expect(
      mediaIdsForPoses(["Front", "Side", "Back"], {
        Front: "m1",
        Side: "m2",
        Back: "m3",
      }),
    ).toEqual(["m1", "m2", "m3"]);
  });
  it("keeps pose order when a middle slot is empty", () => {
    expect(
      mediaIdsForPoses(["Front", "Side", "Back"], {
        Front: "m1",
        Back: "m3",
      }),
    ).toEqual(["m1", "m3"]);
  });
  it("returns an empty array with no uploads", () => {
    expect(mediaIdsForPoses(["Front"], {})).toEqual([]);
  });
});

describe("summaryRowsFromSurface", () => {
  it("returns logged values for the exact entry date", () => {
    const rows = summaryRowsFromSurface(
      {
        state: "ready",
        sections: [
          {
            items: [{ label: "Weight", current: "82.4", unit: "kg" }],
          },
        ],
        history: [
          {
            entryDate: "2026-10-20",
            values: [{ label: "Morning weight", display: "82.4 kg" }],
          },
        ],
      },
      "2026-10-20",
    );
    expect(rows).toEqual([{ label: "Morning weight", value: "82.4 kg" }]);
  });
  it("falls back to current item values when the date has no log", () => {
    const rows = summaryRowsFromSurface(
      {
        state: "ready",
        sections: [
          {
            items: [
              { label: "Weight", current: "82.4", unit: "kg" },
              { label: "Sleep", current: " ", unit: null },
            ],
          },
        ],
        history: [],
      },
      "2026-10-21",
    );
    expect(rows).toEqual([{ label: "Weight", value: "82.4 kg" }]);
  });
  it("is empty on non-ready surfaces", () => {
    expect(
      summaryRowsFromSurface({ state: "consent_missing" }, "2026-10-20"),
    ).toEqual([]);
    expect(summaryRowsFromSurface({ state: "unavailable" }, "x")).toEqual([]);
  });
});

describe("submittedAnswerDisplay", () => {
  const field = (
    kind: string,
    options?: { optionId: string; label: string }[],
  ) => ({
    kind,
    options,
  });
  const answer = (
    over: Partial<Parameters<typeof submittedAnswerDisplay>[1]>,
  ) => ({
    valueText: null,
    valueNumeric: null,
    valueDate: null,
    valueOptionIds: null,
    valueRating: null,
    mediaIds: [],
    ...over,
  });
  it("counts photos on visual answers", () => {
    expect(
      submittedAnswerDisplay(field("visual"), answer({ mediaIds: ["a", "b"] })),
    ).toBe("2 photos");
    expect(
      submittedAnswerDisplay(field("visual"), answer({ mediaIds: ["a"] })),
    ).toBe("1 photo");
  });
  it("resolves option labels for choice answers", () => {
    expect(
      submittedAnswerDisplay(
        field("multiChoice", [{ optionId: "o1", label: "Good" }]),
        answer({ valueOptionIds: ["o1"] }),
      ),
    ).toBe("Good");
  });
  it("shows ratings and text verbatim", () => {
    expect(
      submittedAnswerDisplay(field("rating"), answer({ valueRating: 8 })),
    ).toBe("8");
    expect(
      submittedAnswerDisplay(field("longText"), answer({ valueText: "Great" })),
    ).toBe("Great");
  });
  it("returns null for an unanswered field", () => {
    expect(submittedAnswerDisplay(field("longText"), answer({}))).toBeNull();
  });
});
