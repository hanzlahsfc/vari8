// MEAL-PLAN-I1 (PROMPT 211) — client-local-day activation unit suite.
// RED-first contract: a published version activates at the START of the
// client-local effective date — minute 0 through the reviewed
// lib/checkin/timezone.ts resolver (strict-subset reuse, no new dep):
// normal midnight, midnight-gap → first valid minute same date,
// midnight-fold → earlier instant, whole-day skip → unrepresentable
// (publish rejection, never a date shift), invalid zones/dates/bounds.
// Golden vectors pin CURRENT ICU/tzdata behavior.

import { describe, expect, it } from "vitest";

import {
  parseEffectiveDate,
  resolveMealPlanActivation,
} from "../../lib/mealplan/service";

describe("MEAL-PLAN-I1 — resolveMealPlanActivation (local midnight)", () => {
  it("ordinary midnight maps to the correct instant", () => {
    // UTC: midnight is the date itself.
    expect(resolveMealPlanActivation("UTC", "2026-06-01")).toEqual({
      status: "ok",
      instant: new Date("2026-06-01T00:00:00Z"),
    });
    // New York EDT (UTC-4): local midnight = 04:00Z.
    expect(
      resolveMealPlanActivation("America/New_York", "2026-06-01"),
    ).toEqual({ status: "ok", instant: new Date("2026-06-01T04:00:00Z") });
    // Auckland NZST (UTC+12): local midnight = previous UTC day 12:00Z.
    expect(
      resolveMealPlanActivation("Pacific/Auckland", "2026-06-01"),
    ).toEqual({ status: "ok", instant: new Date("2026-05-31T12:00:00Z") });
  });

  it("midnight-gap date resolves to the first valid minute on the SAME date", () => {
    // America/Santiago springs forward at midnight 2026-09-06: local time
    // jumps 23:59 → 01:00, so 00:00 does not exist. The honest activation
    // is the first representable minute on 2026-09-06 = 01:00 local
    // (04:00Z) — never shifted to another date, never 00:00 the next day.
    expect(
      resolveMealPlanActivation("America/Santiago", "2026-09-06"),
    ).toEqual({ status: "ok", instant: new Date("2026-09-06T04:00:00Z") });
  });

  it("midnight-fold date resolves to the EARLIER instant", () => {
    // America/Havana falls back 2026-11-01: clocks 01:00 → 00:00, so
    // 00:00 occurs twice — 04:00Z (CDT) and 05:00Z (CST). The fold rule
    // picks the earlier occurrence.
    expect(
      resolveMealPlanActivation("America/Havana", "2026-11-01"),
    ).toEqual({ status: "ok", instant: new Date("2026-11-01T04:00:00Z") });
  });

  it("whole-day-skip dates are unrepresentable — never shifted", () => {
    // Pacific/Apia skipped 2011-12-30 entirely (dateline jump).
    expect(
      resolveMealPlanActivation("Pacific/Apia", "2011-12-30"),
    ).toEqual({ status: "unrepresentable" });
  });

  it("invalid zones, malformed dates, and out-of-range years reject", () => {
    for (const [zone, date] of [
      ["Not/AZone", "2026-06-01"],
      ["UTC+02:00", "2026-06-01"],
      ["", "2026-06-01"],
      ["UTC", "2026-02-30"],
      ["UTC", "not-a-date"],
      ["UTC", "2026-6-1"],
      ["UTC", "1999-12-31"],
      ["UTC", "2101-01-01"],
    ] as const)
      expect(resolveMealPlanActivation(zone, date)).toEqual({
        status: "invalid",
      });
  });
});

describe("MEAL-PLAN-I1 — parseEffectiveDate bounds", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("accepts a valid in-range date and returns it verbatim", () => {
    expect(parseEffectiveDate("2026-11-01", now)).toBe("2026-11-01");
    // Backdating within range is allowed — precedence resolves currency.
    expect(parseEffectiveDate("2026-01-05", now)).toBe("2026-01-05");
  });

  it("rejects malformed, impossible, and out-of-range dates", () => {
    for (const d of [
      "2026-2-30",
      "2026-13-01",
      "2026-02-30",
      "20-10-2026",
      "",
      "1999-12-31",
      "2101-01-01",
      "2026-10-20T00:00:00Z",
      20261020,
      null,
    ])
      expect(() =>
        parseEffectiveDate(d as unknown, now),
      ).toThrow();
  });

  it("rejects dates more than 366 days past the server UTC date", () => {
    expect(() => parseEffectiveDate("2027-10-21", now)).toThrow();
    expect(parseEffectiveDate("2027-10-20", now)).toBe("2027-10-20");
  });
});
