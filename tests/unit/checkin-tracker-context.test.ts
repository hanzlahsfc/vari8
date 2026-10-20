import { describe, expect, it } from "vitest";

import { parseDeclaredDate } from "../../lib/daily-entry/service";

/**
 * P-025-D6 — DailyEntry tracker-context contract (decision #103 + the
 * binding D6 engineering contract): strict authorization-scope
 * reconciliation and the exact declared-date contract.
 */

describe("declared-date contract (shared parser)", () => {
  it("accepts canonical YYYY-MM-DD within bounds", () => {
    expect(parseDeclaredDate("2024-06-15")).toBe("2024-06-15");
  });

  it("rejects non-canonical grammar", () => {
    for (const bad of [
      "6/15/2024",
      "2024-6-5",
      "2024/06/15",
      "yesterday",
      "",
      "2024-06-15T10:00:00Z",
      "not-a-date",
    ])
      expect(() => parseDeclaredDate(bad)).toThrow();
  });

  it("rejects impossible calendar dates", () => {
    for (const bad of ["2024-02-30", "2024-13-01", "2024-00-10"])
      expect(() => parseDeclaredDate(bad)).toThrow();
  });

  it("rejects the lower bound", () => {
    expect(() => parseDeclaredDate("1969-12-31")).toThrow();
  });

  it("rejects beyond the upper bound (server UTC +1 day)", () => {
    const far = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    expect(() => parseDeclaredDate(far)).toThrow();
  });
});
