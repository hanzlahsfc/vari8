/**
 * HABITS-I1 date contract (decision 110) — strict declared `YYYY-MM-DD`
 * grammar, server-UTC today, creation `[today, today+5y]` (leap
 * normalized), endDate >= startDate bound, weekday bitmask helpers,
 * period-day mapping and timezone-independent display. RED: module does
 * not exist yet.
 */
import { describe, expect, it } from "vitest";
import {
  formatHabitDate,
  habitPeriodDays,
  maskCoversDate,
  parseHabitEndDate,
  parseHabitStartDate,
  parseWeekdayMask,
  serverTodayUtc,
  shiftDateUtc,
  weekdayBit,
} from "@/lib/habits/date";

const TODAY = "2026-10-14";

describe("parseHabitStartDate", () => {
  it("accepts today and future dates up to today+5y", () => {
    expect(parseHabitStartDate(TODAY, { today: TODAY })).toBe(TODAY);
    expect(parseHabitStartDate("2026-10-20", { today: TODAY })).toBe(
      "2026-10-20",
    );
    expect(parseHabitStartDate("2031-10-14", { today: TODAY })).toBe(
      "2031-10-14",
    );
  });
  it("rejects past dates — no backdated enrollment", () => {
    expect(parseHabitStartDate("2026-10-13", { today: TODAY })).toBeNull();
    expect(parseHabitStartDate("2020-01-01", { today: TODAY })).toBeNull();
  });
  it("rejects beyond today+5y and malformed/impossible input", () => {
    expect(parseHabitStartDate("2031-10-15", { today: TODAY })).toBeNull();
    for (const bad of [
      "2026-2-14",
      "2026/10/14",
      "2025-02-30",
      "not-a-date",
      "20261014",
      "",
      " 2026-10-14 ",
      null,
      undefined,
      20261014,
      {},
    ])
      expect(parseHabitStartDate(bad, { today: TODAY })).toBeNull();
  });
  it("leap-day today normalizes the horizon deterministically to Mar-01", () => {
    // 2028-02-29 + 5y → 2033-02-29 does not exist → 2033-03-01 upper bound.
    expect(parseHabitStartDate("2033-03-01", { today: "2028-02-29" })).toBe(
      "2033-03-01",
    );
    expect(parseHabitStartDate("2033-03-02", { today: "2028-02-29" })).toBeNull();
    expect(parseHabitStartDate("2028-02-29", { today: "2028-02-29" })).toBe(
      "2028-02-29",
    );
  });
});

describe("parseHabitEndDate", () => {
  it("accepts null (no end) and dates >= startDate within the horizon", () => {
    expect(
      parseHabitEndDate(null, { startDate: TODAY, today: TODAY }),
    ).toBeNull();
    expect(
      parseHabitEndDate("2026-10-14", { startDate: TODAY, today: TODAY }),
    ).toBe("2026-10-14");
    expect(
      parseHabitEndDate("2031-10-14", { startDate: TODAY, today: TODAY }),
    ).toBe("2031-10-14");
  });
  it("rejects end before start and beyond the horizon", () => {
    expect(
      parseHabitEndDate("2026-10-13", { startDate: TODAY, today: TODAY }),
    ).toBeNull();
    expect(
      parseHabitEndDate("2031-10-15", { startDate: TODAY, today: TODAY }),
    ).toBeNull();
    expect(
      parseHabitEndDate("nope", { startDate: TODAY, today: TODAY }),
    ).toBeNull();
  });
});

describe("parseWeekdayMask — caller zero-mask rejection", () => {
  it("accepts integers 1..127", () => {
    expect(parseWeekdayMask(1)).toBe(1);
    expect(parseWeekdayMask(127)).toBe(127);
    expect(parseWeekdayMask(65)).toBe(65);
  });
  it("rejects 0 — only the archive path may write a zero boundary", () => {
    expect(parseWeekdayMask(0)).toBeNull();
  });
  it("rejects out-of-range, non-integer and non-number input", () => {
    for (const bad of [128, -1, 1.5, NaN, "127", "0", null, undefined, {}, []])
      expect(parseWeekdayMask(bad)).toBeNull();
  });
});

describe("weekday bits (Mon=bit0 … Sun=bit6)", () => {
  it("maps known dates to ISO weekday bits", () => {
    expect(weekdayBit("2024-01-01")).toBe(1); // Monday
    expect(weekdayBit("2024-01-07")).toBe(64); // Sunday
    expect(weekdayBit("2024-02-29")).toBe(8); // Thursday
  });
  it("maskCoversDate applies the mask", () => {
    expect(maskCoversDate(0b0000001, "2024-01-01")).toBe(true);
    expect(maskCoversDate(0b0000001, "2024-01-02")).toBe(false);
    expect(maskCoversDate(0b1111111, "2024-01-07")).toBe(true);
    expect(maskCoversDate(0b0111111, "2024-01-07")).toBe(false);
  });
});

describe("shiftDateUtc + serverTodayUtc (UTC-pinned)", () => {
  it("shifts across month/year and leap boundaries", () => {
    expect(shiftDateUtc("2026-10-14", 1)).toBe("2026-10-15");
    expect(shiftDateUtc("2026-10-14", -1)).toBe("2026-10-13");
    expect(shiftDateUtc("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateUtc("2024-02-29", 366)).toBe("2025-03-01");
    expect(shiftDateUtc("2025-03-01", -1)).toBe("2025-02-28");
  });
  it("today is the server-UTC calendar date at UTC± extremes", () => {
    // The same instant expressed at UTC-12 and UTC+14 resolves to the
    // same UTC date — the server's clock never follows the viewer.
    const instant = new Date("2026-10-14T23:59:59.000Z");
    expect(serverTodayUtc(instant)).toBe("2026-10-14");
    // one millisecond later flips the UTC day
    expect(serverTodayUtc(new Date("2026-10-15T00:00:00.000Z"))).toBe(
      "2026-10-15",
    );
    // instants that are "tomorrow" in UTC+14 / "yesterday" in UTC-12
    // still resolve to the UTC date.
    expect(serverTodayUtc(new Date("2026-10-15T13:59:59+14:00"))).toBe(
      "2026-10-14",
    );
    expect(serverTodayUtc(new Date("2026-10-14T11:59:59-12:00"))).toBe(
      "2026-10-14",
    );
  });
});

describe("habitPeriodDays", () => {
  it("maps the frozen HABIT period set to day counts", () => {
    expect(habitPeriodDays("today")).toBe(1);
    expect(habitPeriodDays("7d")).toBe(7);
    expect(habitPeriodDays("14d")).toBe(14);
    expect(habitPeriodDays("4w")).toBe(28);
    expect(habitPeriodDays("6w")).toBe(42);
    expect(habitPeriodDays("8w")).toBe(56);
    expect(habitPeriodDays("12w")).toBe(84);
  });
  it("rejects unknown periods", () => {
    expect(habitPeriodDays("30d")).toBeNull();
    expect(habitPeriodDays("")).toBeNull();
    expect(habitPeriodDays("week")).toBeNull();
  });
});

describe("formatHabitDate — timezone-independent display", () => {
  it("formats the declared date pinned to UTC", () => {
    expect(formatHabitDate("2026-10-14")).toBe("Oct 14, 2026");
    expect(formatHabitDate("2024-02-29")).toBe("Feb 29, 2024");
  });
});
