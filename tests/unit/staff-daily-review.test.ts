import { describe, expect, it } from "vitest";

import {
  parseStaffEntryCursor,
  STAFF_ENTRY_PAGE_SIZE,
} from "../../lib/daily-entry/service";

/**
 * P-022 — staff DailyEntry review pure helpers. The list cursor is a strict
 * declared-date keyset bound (`YYYY-MM-DD` only); anything else is rejected
 * before it reaches the query so malformed/foreign input fails closed.
 */
describe("P-022 staff entry cursor", () => {
  it("accepts a strict declared date", () => {
    expect(parseStaffEntryCursor("2026-10-09")).toBe("2026-10-09");
    expect(parseStaffEntryCursor("1999-01-31")).toBe("1999-01-31");
  });

  it("rejects malformed shapes", () => {
    for (const bad of [
      "",
      "2026-1-9",
      "2026/10/09",
      "2026-10-9x",
      " 2026-10-09",
      "2026-10-09 ",
      "2026-13-01",
      "2026-02-30",
      "abcd-ef-gh",
      "a".repeat(65),
      null,
      undefined,
      20261009,
      ["2026-10-09"],
      { d: "2026-10-09" },
    ] as const) {
      expect(parseStaffEntryCursor(bad)).toBeNull();
    }
  });

  it("keeps the page size bounded", () => {
    expect(STAFF_ENTRY_PAGE_SIZE).toBeGreaterThan(0);
    expect(STAFF_ENTRY_PAGE_SIZE).toBeLessThanOrEqual(25);
  });
});
