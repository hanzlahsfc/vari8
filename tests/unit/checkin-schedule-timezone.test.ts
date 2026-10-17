// CHECK-IN-RECURRENCE-I1 — bounded Intl timezone conversion unit suite.
// RED-first contract (reviewed P3 + P3-R1 refinements): IANA validation,
// local-date rendering, two-pass wall→instant conversion, fold→earlier,
// gap→first-valid-minute via crossing detection (≤180 min sub-day bound),
// whole-day skips → unrepresentable, invalid inputs reject.
//
// Golden vectors pin CURRENT ICU/tzdata behavior; a tzdata bump that
// changes a pinned transition fails this suite — the declared narrow
// dependency fallback decision, never a silent behavior change.

import { describe, expect, it } from "vitest";

import {
  isValidIanaTimeZone,
  localDateInZone,
  resolveLocalInstant,
} from "../../lib/checkin/timezone";

// ── IANA validation ────────────────────────────────────────────────────

describe("CHECK-IN-RECURRENCE-I1 — isValidIanaTimeZone", () => {
  it("accepts real zones incl. fractional-offset + polar zones", () => {
    for (const zone of [
      "America/New_York",
      "Europe/London",
      "Australia/Lord_Howe",
      "Pacific/Chatham",
      "Antarctica/Troll",
      "Pacific/Apia",
      "Asia/Kathmandu",
      "UTC",
    ])
      expect(isValidIanaTimeZone(zone)).toBe(true);
  });

  it("rejects unknown zones, empty, and non-zone strings", () => {
    for (const zone of [
      "Not/AZone",
      "",
      "   ",
      "UTC+02:00", // fixed-offset string is not an IANA name
      "GMT+1",
      "nyc",
      "../../etc",
      "x".repeat(200),
    ])
      expect(isValidIanaTimeZone(zone)).toBe(false);
  });
});

// ── Rule-local calendar date ───────────────────────────────────────────

describe("CHECK-IN-RECURRENCE-I1 — localDateInZone", () => {
  const instant = new Date("2026-10-16T12:00:00Z");

  it("renders the zone-local calendar date, not UTC", () => {
    expect(localDateInZone(instant, "UTC")).toBe("2026-10-16");
    expect(localDateInZone(instant, "Pacific/Auckland")).toBe("2026-10-17");
    expect(localDateInZone(instant, "America/Los_Angeles")).toBe("2026-10-16");
  });

  it("returns null for an invalid zone", () => {
    expect(localDateInZone(instant, "Not/AZone")).toBeNull();
  });
});

// ── Normal conversion ──────────────────────────────────────────────────

describe("CHECK-IN-RECURRENCE-I1 — resolveLocalInstant normal cases", () => {
  it("maps a plain local time to the correct instant (US, EU, southern)", () => {
    expect(
      resolveLocalInstant("America/New_York", "2026-06-07", 9 * 60),
    ).toEqual({ status: "ok", instant: new Date("2026-06-07T13:00:00Z") });
    expect(
      resolveLocalInstant("Europe/London", "2026-01-15", 18 * 60 + 30),
    ).toEqual({ status: "ok", instant: new Date("2026-01-15T18:30:00Z") });
    // Southern-hemisphere summer: Sydney in DST (UTC+11).
    expect(
      resolveLocalInstant("Australia/Sydney", "2026-01-15", 7 * 60),
    ).toEqual({ status: "ok", instant: new Date("2026-01-14T20:00:00Z") });
  });

  it("handles non-hour and 45-minute offsets", () => {
    // Chatham standard offset UTC+12:45.
    expect(
      resolveLocalInstant("Pacific/Chatham", "2026-06-01", 10 * 60),
    ).toEqual({ status: "ok", instant: new Date("2026-05-31T21:15:00Z") });
    // Kathmandu UTC+5:45 (no DST).
    expect(resolveLocalInstant("Asia/Kathmandu", "2026-06-01", 9 * 60)).toEqual(
      { status: "ok", instant: new Date("2026-06-01T03:15:00Z") },
    );
  });

  it("works at both bounds of the supported range", () => {
    expect(resolveLocalInstant("UTC", "2000-01-01", 0)).toEqual({
      status: "ok",
      instant: new Date("2000-01-01T00:00:00Z"),
    });
    expect(resolveLocalInstant("UTC", "2100-12-31", 23 * 60 + 59)).toEqual({
      status: "ok",
      instant: new Date("2100-12-31T23:59:00Z"),
    });
  });
});

// ── Fold (repeated local time) → earlier occurrence ───────────────────

describe("CHECK-IN-RECURRENCE-I1 — fold chooses the earlier instant", () => {
  it("US fall-back: 2026-11-01 01:30 New York → 05:30Z (EDT, not EST)", () => {
    expect(resolveLocalInstant("America/New_York", "2026-11-01", 90)).toEqual({
      status: "ok",
      instant: new Date("2026-11-01T05:30:00Z"),
    });
  });

  it("EU fall-back: 2026-10-25 01:30 London → 00:30Z (BST, earlier)", () => {
    // 01:30 occurs twice: 00:30Z under BST (+1) and 01:30Z under GMT;
    // the fold rule picks the EARLIER instant.
    expect(resolveLocalInstant("Europe/London", "2026-10-25", 90)).toEqual({
      status: "ok",
      instant: new Date("2026-10-25T00:30:00Z"),
    });
  });
});

// ── Gap (nonexistent local time) → first valid minute ──────────────────

describe("CHECK-IN-RECURRENCE-I1 — gap → first valid minute (crossing detection)", () => {
  it("US spring-forward: 2026-03-08 02:30 New York → 03:00 local (07:00Z)", () => {
    // Reviewer-corrected example: 2026-03-08 is a SUNDAY. First valid
    // minute is 03:00 — never shift-by-gap (03:30).
    const r = resolveLocalInstant("America/New_York", "2026-03-08", 150);
    expect(r).toEqual({
      status: "ok",
      instant: new Date("2026-03-08T07:00:00Z"),
    });
  });

  it("first VALID MINUTE: 02:59 also resolves to 03:00, not 03:59", () => {
    expect(resolveLocalInstant("America/New_York", "2026-03-08", 179)).toEqual({
      status: "ok",
      instant: new Date("2026-03-08T07:00:00Z"),
    });
  });

  it("Lord Howe 30-minute gap: 2026-10-04 02:15 → 02:30 local", () => {
    // Lord Howe jumps 02:00→02:30 (+10:30 → +11:00).
    expect(
      resolveLocalInstant("Australia/Lord_Howe", "2026-10-04", 135),
    ).toEqual({ status: "ok", instant: new Date("2026-10-03T15:30:00Z") });
  });

  it("Chatham 45-minute-offset gap: 2026-09-27 02:45 → 03:45 local", () => {
    // Chatham's spring gap is 02:00→03:45 (+12:45 → +13:45, a 105-min
    // sub-day gap): requested 02:45 resolves to the first valid minute
    // 03:45 local = 14:00Z (verified against real Intl).
    expect(resolveLocalInstant("Pacific/Chatham", "2026-09-27", 165)).toEqual({
      status: "ok",
      instant: new Date("2026-09-26T14:00:00Z"),
    });
  });

  it("Troll 2-hour gap: 2007-03-25 01:30 → 03:00 local (crossing, not 03:30)", () => {
    // P3-R1 P3-2: naive advance-from-two-pass yields 03:30 (shift-by-gap);
    // crossing detection MUST find 03:00.
    expect(resolveLocalInstant("Antarctica/Troll", "2007-03-25", 90)).toEqual({
      status: "ok",
      instant: new Date("2007-03-25T01:00:00Z"),
    });
    expect(resolveLocalInstant("Antarctica/Troll", "2007-03-25", 150)).toEqual({
      status: "ok",
      instant: new Date("2007-03-25T01:00:00Z"),
    });
  });
});

// ── Whole-day skips → unrepresentable ─────────────────────────────────

describe("CHECK-IN-RECURRENCE-I1 — whole-day skips are unrepresentable", () => {
  it("Apia skipped 2011-12-30 entirely → unrepresentable", () => {
    expect(resolveLocalInstant("Pacific/Apia", "2011-12-30", 9 * 60)).toEqual({
      status: "unrepresentable",
    });
    expect(resolveLocalInstant("Pacific/Apia", "2011-12-30", 0)).toEqual({
      status: "unrepresentable",
    });
  });
});

// ── Rejection ──────────────────────────────────────────────────────────

describe("CHECK-IN-RECURRENCE-I1 — deterministic rejection", () => {
  it("invalid zones reject", () => {
    expect(resolveLocalInstant("Not/AZone", "2026-06-01", 540)).toEqual({
      status: "invalid",
    });
  });

  it("malformed dates, impossible dates, out-of-range years reject", () => {
    for (const d of [
      "2026-13-01",
      "2026-02-30",
      "not-a-date",
      "26-06-01",
      "2026-6-1",
      "",
      "1999-12-31",
      "2101-01-01",
    ])
      expect(resolveLocalInstant("America/New_York", d, 540)).toEqual({
        status: "invalid",
      });
  });

  it("out-of-range minutes reject", () => {
    for (const m of [-1, 1440, 1.5, Number.NaN, 99999])
      expect(resolveLocalInstant("America/New_York", "2026-06-01", m)).toEqual({
        status: "invalid",
      });
  });
});
