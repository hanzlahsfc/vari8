import { describe, expect, it } from "vitest";

import { validateDailyTrackerValues } from "../../lib/daily-tracker";

describe("Phase 1.1 Daily Tracker section/field contract", () => {
  it("encodes only the two verified validations", () => {
    expect(validateDailyTrackerValues({})).toEqual([]);
    expect(validateDailyTrackerValues({ desireToTrain: "11" })).toEqual([
      { field: "desireToTrain", message: "DESIRE TO TRAIN must be 1–10" },
    ]);
    expect(validateDailyTrackerValues({ desireToTrain: "5" })).toEqual([]);
    expect(validateDailyTrackerValues({ dayLabel: "HUGE" })).toEqual([
      { field: "dayLabel", message: "DAY LABEL must be HIGH, MEDIUM or LOW" },
    ]);
    expect(validateDailyTrackerValues({ dayLabel: "LOW" })).toEqual([]);
  });

  it("does not invent requiredness or ranges for unconstrained fields", () => {
    expect(
      validateDailyTrackerValues({ steps: "not-a-number", clientNotes: "" }),
    ).toEqual([]);
  });

  it("rejects a non-numeric biofeedback value as outside the verified scale", () => {
    expect(validateDailyTrackerValues({ stress: "abc" })).toEqual([
      { field: "stress", message: "STRESS must be 1–10" },
    ]);
  });
});
