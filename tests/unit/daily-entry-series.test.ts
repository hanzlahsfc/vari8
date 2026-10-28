import { describe, expect, it } from "vitest";

import {
  parseDailyEntrySeriesRange,
  SERIES_MAX_SPAN_DAYS,
} from "../../lib/daily-entry/service";

/**
 * PR-SV2 — series range guard (D11/D14: date rules a browser cannot see).
 * Both ends are declared `YYYY-MM-DD` calendar dates, `from <= to`, and the
 * inclusive span is bounded so a single request cannot scan unbounded
 * history.
 */
describe("parseDailyEntrySeriesRange", () => {
  it("accepts a same-day range", () => {
    expect(parseDailyEntrySeriesRange("2026-10-05", "2026-10-05")).toEqual({
      from: "2026-10-05",
      to: "2026-10-05",
    });
  });

  it("accepts a week-long range", () => {
    expect(parseDailyEntrySeriesRange("2026-10-05", "2026-10-11")).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
    });
  });

  it("accepts a range ending in the future (read-only bound)", () => {
    const to = new Date(Date.now() + 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const from = new Date(Date.now() + 23 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(parseDailyEntrySeriesRange(from, to)).toEqual({ from, to });
  });

  it("rejects an inverted range", () => {
    expect(() =>
      parseDailyEntrySeriesRange("2026-10-11", "2026-10-05"),
    ).toThrowError(expect.objectContaining({ code: "invalid_input" }) as Error);
  });

  it("rejects malformed and impossible dates", () => {
    for (const [from, to] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-10-1", "2026-10-05"],
      ["10/05/2026", "2026-10-05"],
      ["2026-10-05", "2026-13-01"],
      ["", "2026-10-05"],
    ] as const) {
      expect(() => parseDailyEntrySeriesRange(from, to)).toThrowError(
        expect.objectContaining({ code: "invalid_input" }) as Error,
      );
    }
  });

  it("rejects a span beyond the bound but accepts the bound itself", () => {
    const from = "2025-10-01";
    // 2025-10-01 + (MAX-1) days is exactly MAX days inclusive.
    const last = new Date(
      Date.UTC(2025, 9, 1) + (SERIES_MAX_SPAN_DAYS - 1) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    expect(parseDailyEntrySeriesRange(from, last)).toEqual({ from, to: last });
    const over = new Date(
      Date.UTC(2025, 9, 1) + SERIES_MAX_SPAN_DAYS * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    expect(() => parseDailyEntrySeriesRange(from, over)).toThrowError(
      expect.objectContaining({ code: "invalid_input" }) as Error,
    );
  });
});
