import { describe, expect, it } from "vitest";

import { parseDeclaredDate } from "../../lib/daily-entry/service";
import { reconcileTrackerContextScopes } from "../../lib/checkin/tracker-context";

/**
 * P-025-D6 — DailyEntry tracker-context contract (decision #103 + the
 * binding D6 engineering contract): strict authorization-scope
 * reconciliation and the exact declared-date contract.
 */

describe("reconcileTrackerContextScopes", () => {
  it.each([
    ["workspace", "workspace", "workspace"],
    ["workspace", "assigned", "assigned"],
    ["assigned", "workspace", "assigned"],
    ["assigned", "assigned", "assigned"],
    ["assigned", "own", "denied"],
    ["own", "assigned", "denied"],
    ["own", "own", "denied"],
    ["workspace", "own", "denied"],
    ["denied", "workspace", "denied"],
    ["workspace", "denied", "denied"],
    ["assigned", "denied", "denied"],
    ["denied", "denied", "denied"],
    [null, "workspace", "denied"],
    ["workspace", null, "denied"],
    [undefined, "assigned", "denied"],
    ["platform", "workspace", "denied"],
    ["bogus", "bogus", "denied"],
  ] as const)("checkin=%s daily=%s → %s", (chk, daily, expected) => {
    expect(reconcileTrackerContextScopes(chk as never, daily as never)).toBe(
      expected,
    );
  });

  it("never widens assigned to workspace", () => {
    expect(reconcileTrackerContextScopes("assigned", "assigned")).toBe(
      "assigned",
    );
    expect(reconcileTrackerContextScopes("workspace", "assigned")).toBe(
      "assigned",
    );
  });
});

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
