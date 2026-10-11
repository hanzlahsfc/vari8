import { describe, expect, it } from "vitest";

import {
  checkInCalendarDayKey,
  checkInCalendarMonthCells,
} from "../../lib/checkin/calendar";
import {
  CALENDAR_RANGE_MAX_DAYS,
  parseCheckInCalendarRange,
} from "../../lib/checkin/instances";

/**
 * P-025-D2 — Check-In calendar (decision #104). Pure helpers: range
 * parsing (bounded instant span) and viewer-local day/month bucketing
 * — browser-timezone day placement is a DISPLAY rule only.
 */

describe("parseCheckInCalendarRange", () => {
  it("accepts a valid bounded instant range", () => {
    const r = parseCheckInCalendarRange({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-01T00:00:00.000Z",
    });
    expect(r?.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r?.to.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
  it("rejects non-instant grammar and missing sides", () => {
    expect(
      parseCheckInCalendarRange({
        from: "2026-10-01",
        to: "2026-11-01T00:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      parseCheckInCalendarRange({ from: "2026-10-01T00:00:00.000Z" }),
    ).toBeNull();
  });
  it("rejects from >= to", () => {
    expect(
      parseCheckInCalendarRange({
        from: "2026-11-01T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      parseCheckInCalendarRange({
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
  it("rejects spans beyond the bound and impossible instants", () => {
    expect(
      parseCheckInCalendarRange({
        from: "2026-01-01T00:00:00.000Z",
        to: new Date(
          Date.UTC(2026, 0, 1) + (CALENDAR_RANGE_MAX_DAYS + 1) * 86400_000,
        ).toISOString(),
      }),
    ).toBeNull();
    expect(
      parseCheckInCalendarRange({
        from: "2026-02-31T00:00:00.000Z",
        to: "2026-03-10T00:00:00.000Z",
      }),
    ).toBeNull();
  });
  it("accepts a span at exactly the bound", () => {
    const from = Date.UTC(2026, 0, 1);
    const to = from + CALENDAR_RANGE_MAX_DAYS * 86400_000;
    expect(
      parseCheckInCalendarRange({
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      }),
    ).not.toBeNull();
  });
});

describe("checkInCalendarDayKey", () => {
  // 02:30 UTC on 2026-10-11 = the previous evening in New York.
  const instant = "2026-10-11T02:30:00.000Z";
  it("buckets an instant onto the viewer-local calendar day", () => {
    expect(checkInCalendarDayKey(instant, "UTC")).toBe("2026-10-11");
    expect(checkInCalendarDayKey(instant, "America/New_York")).toBe(
      "2026-10-10",
    );
    expect(checkInCalendarDayKey(instant, "Pacific/Kiritimati")).toBe(
      "2026-10-11",
    );
  });
  it("respects DST — the same clock time lands differently across the spring transition", () => {
    // 2026-03-29 01:30 UTC: London has just sprung forward (BST starts).
    const dst = "2026-03-29T01:30:00.000Z";
    expect(checkInCalendarDayKey(dst, "Europe/London")).toBe("2026-03-29");
    expect(checkInCalendarDayKey("2026-03-29T23:30:00.000Z", "UTC")).toBe(
      "2026-03-29",
    );
  });
});

describe("checkInCalendarMonthCells", () => {
  it("returns exactly 42 Monday-start cells covering the month", () => {
    const cells = checkInCalendarMonthCells(2026, 9); // October 2026
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe("2026-09-28"); // Monday before Thu 1 Oct
    expect(cells[0].weekday).toBe(1);
    expect(cells[0].inMonth).toBe(false);
    const first = cells.find((c) => c.key === "2026-10-01");
    expect(first?.inMonth).toBe(true);
    expect(first?.weekday).toBe(4); // Thursday
    const last = cells.find((c) => c.key === "2026-10-31");
    expect(last?.inMonth).toBe(true);
    // Every weekday sequence is Mon..Sun cyclic.
    expect(cells.map((c) => c.weekday)).toEqual(
      Array.from({ length: 42 }, (_, i) => (i % 7) + 1),
    );
  });
  it("handles month boundaries at year edges", () => {
    const jan = checkInCalendarMonthCells(2027, 0);
    expect(jan[0].key.startsWith("2026-12")).toBe(true);
    const dec = checkInCalendarMonthCells(2026, 11);
    expect(dec.some((c) => c.key === "2027-01-01")).toBe(true);
  });
});
