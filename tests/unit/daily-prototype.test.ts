import { describe, expect, it } from "vitest";

import {
  DAILY_FIELDS,
  isDailyPrototypeEnabled,
  validateDailyEntry,
} from "../../lib/daily-prototype";

describe("validateDailyEntry", () => {
  const base = Object.fromEntries(DAILY_FIELDS.map((field) => [field.key, ""]));

  it("requires only the date (week-view key)", () => {
    expect(validateDailyEntry({ ...base })).toEqual([
      { field: "date", message: "Date is required to add a prototype entry" },
    ]);
    expect(validateDailyEntry({ ...base, date: "2026-01-05" })).toEqual([]);
  });

  it("enforces the source-confirmed biofeedback 1-10 range", () => {
    expect(
      validateDailyEntry({ ...base, date: "2026-01-05", desireToTrain: "11" }),
    ).toContainEqual({
      field: "desireToTrain",
      message: "Desire to train must be 1-10",
    });
    expect(
      validateDailyEntry({ ...base, date: "2026-01-05", desireToTrain: "5" }),
    ).toEqual([]);
  });

  it("enforces the day-label enum", () => {
    expect(
      validateDailyEntry({ ...base, date: "2026-01-05", dayLabel: "HUGE" }),
    ).toContainEqual({
      field: "dayLabel",
      message: "Day label must be one of HIGH/MEDIUM/LOW",
    });
  });

  it("does not invent constraints for other fields", () => {
    // steps has no source range; a non-numeric value is not rejected here.
    expect(
      validateDailyEntry({ ...base, date: "2026-01-05", steps: "abc" }),
    ).toEqual([]);
  });
});

describe("isDailyPrototypeEnabled", () => {
  it("is enabled only by the explicit dev flag", () => {
    expect(isDailyPrototypeEnabled("1")).toBe(true);
    expect(isDailyPrototypeEnabled(undefined)).toBe(false);
    expect(isDailyPrototypeEnabled("")).toBe(false);
    expect(isDailyPrototypeEnabled("true")).toBe(false);
    expect(isDailyPrototypeEnabled("0")).toBe(false);
  });
});
