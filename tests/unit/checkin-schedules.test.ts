// CHECK-IN-RECURRENCE-I1 — pure schedule-rule parsing/enumeration unit
// suite. RED-first contract: weekday/minute/date validators, the exact
// inclusive 56-day horizon (up to NINE weekly occurrences — P3-R1 P3-1),
// start/end inclusivity, and past-instant exclusion shape.

import { describe, expect, it } from "vitest";

import {
  CHECKIN_SCHEDULE_HORIZON_DAYS,
  enumerateRuleOccurrenceDates,
  parseCheckInScheduleLocalDate,
  parseCheckInScheduleLocalTimeMinutes,
  parseCheckInScheduleWeekday,
} from "../../lib/checkin/schedules";

// ── Field validators ───────────────────────────────────────────────────

describe("CHECK-IN-RECURRENCE-I1 — field validators", () => {
  it("weekday accepts the closed enum only", () => {
    for (const w of [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ])
      expect(parseCheckInScheduleWeekday(w)).toBe(w);
    for (const w of [
      "monday",
      "Friday",
      "WEEKDAY",
      "",
      3,
      null,
      undefined,
      {},
    ])
      expect(parseCheckInScheduleWeekday(w)).toBeNull();
  });

  it("localTimeMinutes accepts 0..1439 integers only", () => {
    expect(parseCheckInScheduleLocalTimeMinutes(0)).toBe(0);
    expect(parseCheckInScheduleLocalTimeMinutes(1439)).toBe(1439);
    expect(parseCheckInScheduleLocalTimeMinutes(570)).toBe(570);
    for (const m of [-1, 1440, 1.5, Number.NaN, "09:30", null, {}])
      expect(parseCheckInScheduleLocalTimeMinutes(m)).toBeNull();
  });

  it("local dates must be real YYYY-MM-DD calendar days in 2000–2100", () => {
    expect(parseCheckInScheduleLocalDate("2026-10-16")).toBe("2026-10-16");
    expect(parseCheckInScheduleLocalDate("2000-02-29")).toBe("2000-02-29");
    for (const d of [
      "2026-02-30",
      "2026-13-01",
      "16-10-2026",
      "2026-10-16T00:00:00Z",
      "",
      "1999-12-31",
      "2101-01-01",
      null,
      7,
    ])
      expect(parseCheckInScheduleLocalDate(d)).toBeNull();
  });
});

// ── Occurrence enumeration — exact inclusive horizon ──────────────────

describe("CHECK-IN-RECURRENCE-I1 — enumerateRuleOccurrenceDates", () => {
  it("enumerates weekly dates from startDate through T+56 INCLUSIVE", () => {
    // Friday rule, start = T → T, T+7 … T+56 = exactly 9 occurrences.
    const dates = enumerateRuleOccurrenceDates({
      weekday: "FRIDAY",
      startDate: "2026-10-16", // a Friday
      endDate: null,
      todayLocal: "2026-10-16",
    });
    expect(dates).toEqual([
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
      "2026-11-27",
      "2026-12-04",
      "2026-12-11",
    ]);
    expect(dates).toHaveLength(9);
    expect(CHECKIN_SCHEDULE_HORIZON_DAYS).toBe(56);
  });

  it("never emits dates before the rule-local today (no backfill)", () => {
    const dates = enumerateRuleOccurrenceDates({
      weekday: "MONDAY",
      startDate: "2026-09-01", // past
      endDate: null,
      todayLocal: "2026-10-16", // Friday — this week's Monday already gone
    });
    expect(dates[0]).toBe("2026-10-19");
    expect(dates.every((d) => d >= "2026-10-16")).toBe(true);
  });

  it("an inclusive endDate trims the tail", () => {
    const dates = enumerateRuleOccurrenceDates({
      weekday: "FRIDAY",
      startDate: "2026-10-16",
      endDate: "2026-11-13",
      todayLocal: "2026-10-16",
    });
    expect(dates).toEqual([
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
      "2026-11-06",
      "2026-11-13",
    ]);
  });

  it("startDate before the next weekday defers to the first matching day", () => {
    const dates = enumerateRuleOccurrenceDates({
      weekday: "MONDAY",
      startDate: "2026-10-16", // Friday
      endDate: null,
      todayLocal: "2026-10-01",
    });
    expect(dates[0]).toBe("2026-10-19"); // first MONDAY ≥ start
  });

  it("endDate before start yields nothing; fully-expired rule yields nothing", () => {
    expect(
      enumerateRuleOccurrenceDates({
        weekday: "FRIDAY",
        startDate: "2026-10-16",
        endDate: "2026-10-10",
        todayLocal: "2026-10-01",
      }),
    ).toEqual([]);
    expect(
      enumerateRuleOccurrenceDates({
        weekday: "FRIDAY",
        startDate: "2026-08-01",
        endDate: "2026-09-01",
        todayLocal: "2026-10-16",
      }),
    ).toEqual([]);
  });
});
