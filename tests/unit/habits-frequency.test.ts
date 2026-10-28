/**
 * PR-M7 — canvas frequency text ↔ ISO weekday mask, plus the card's
 * date guard: weekday/mask resolution must not drift when the process
 * timezone is Europe/Vienna across a Sunday→Monday week boundary
 * (declared dates are UTC-pinned; a regression to local-time accessors
 * flips these literals).
 */
import { afterEach, describe, expect, it } from "vitest";

import { maskCoversDate, weekdayBit } from "../../lib/habits/date";
import {
  DAILY_WEEKDAY_MASK,
  WEEKDAYS_MASK,
  WEEKENDS_MASK,
  frequencyToWeekdayMask,
  spreadMask,
  weekdayMaskToFrequency,
} from "../../lib/habits/frequency";

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("weekdayMaskToFrequency — canvas labels", () => {
  it("maps the canvas vocabulary literally", () => {
    expect(weekdayMaskToFrequency(127)).toBe("Daily");
    expect(weekdayMaskToFrequency(31)).toBe("Weekdays");
    expect(weekdayMaskToFrequency(96)).toBe("Weekends");
    expect(weekdayMaskToFrequency(21)).toBe("3× per week"); // Mon+Wed+Fri
    expect(weekdayMaskToFrequency(64)).toBe("1× per week"); // Sunday only
    expect(weekdayMaskToFrequency(126)).toBe("6× per week");
  });

  it("returns null for the archive mask and out-of-range input", () => {
    expect(weekdayMaskToFrequency(0)).toBeNull();
    expect(weekdayMaskToFrequency(128)).toBeNull();
    expect(weekdayMaskToFrequency(-1)).toBeNull();
    expect(weekdayMaskToFrequency(1.5)).toBeNull();
  });
});

describe("frequencyToWeekdayMask — canvas phrases", () => {
  it("parses the advertised editor vocabulary", () => {
    expect(frequencyToWeekdayMask("Daily")).toBe(DAILY_WEEKDAY_MASK);
    expect(frequencyToWeekdayMask("every day")).toBe(DAILY_WEEKDAY_MASK);
    expect(frequencyToWeekdayMask("weekdays")).toBe(WEEKDAYS_MASK);
    expect(frequencyToWeekdayMask("weekends")).toBe(WEEKENDS_MASK);
    expect(frequencyToWeekdayMask("3× per week")).toBe(21); // Mon+Wed+Fri
    expect(frequencyToWeekdayMask("3x per week")).toBe(21);
    expect(frequencyToWeekdayMask("2× per week")).toBe(9); // Mon+Thu
    expect(frequencyToWeekdayMask("weekly")).toBe(1); // canonical: Monday
  });

  it("round-trips the canonical spreads", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const mask = spreadMask(n);
      expect(mask).not.toBeNull();
      const label = weekdayMaskToFrequency(mask as number);
      expect(frequencyToWeekdayMask(label as string)).toBe(mask);
    }
  });

  it("rejects anything outside the closed vocabulary", () => {
    for (const bad of [
      "",
      "   ",
      "sometimes",
      "0× per week",
      "8× per week",
      "3× per month",
      "mon, wed, fri",
      "x".repeat(65),
      42,
      null,
      undefined,
      {},
    ])
      expect(frequencyToWeekdayMask(bad)).toBeNull();
  });
});

describe("date guard — week boundary under Europe/Vienna", () => {
  it("Sunday/Monday keep their ISO bits and mask coverage when TZ shifts", () => {
    process.env.TZ = "Europe/Vienna";
    // 2026-10-18 is a Sunday, 2026-10-19 the following Monday. Vienna is
    // UTC+2 then UTC+1 across these dates' nights — the classic drift
    // window for local-time weekday math.
    expect(weekdayBit("2026-10-18")).toBe(64); // Sunday
    expect(weekdayBit("2026-10-19")).toBe(1); // Monday

    const monOnly = 1;
    const sunOnly = 64;
    expect(maskCoversDate(monOnly, "2026-10-19")).toBe(true);
    expect(maskCoversDate(monOnly, "2026-10-18")).toBe(false);
    expect(maskCoversDate(sunOnly, "2026-10-18")).toBe(true);
    expect(maskCoversDate(sunOnly, "2026-10-19")).toBe(false);
  });
});
