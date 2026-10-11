import { describe, expect, it } from "vitest";

import { groupDailyHistoryByWeek } from "../../lib/daily-entry/week-groups";

const H = (entryDate: string, n = 0) => ({
  entryDate,
  declaredAt: "2026-10-10T09:00:00.000Z",
  revisionCount: 1,
  values: [
    {
      parameterKey: `p${n}`,
      label: `Param ${n}`,
      unit: null as string | null,
      display: "80.0",
    },
  ],
});

describe("groupDailyHistoryByWeek — declared-date grouping, no tz shifts", () => {
  it("groups by Monday-start week on the declared date (UTC-naive)", () => {
    const groups = groupDailyHistoryByWeek([
      H("2026-10-12"), // Monday → week key 10-12
      H("2026-10-14"), // Wednesday → same week
      H("2026-10-11"), // Sunday → previous week (10-05)
      H("2026-10-05"), // Monday → week 10-05
    ]);
    expect(groups.map((g) => g.weekStart)).toEqual([
      "2026-10-12",
      "2026-10-05",
    ]);
    expect(groups[0].entries.map((e) => e.entryDate)).toEqual([
      "2026-10-12",
      "2026-10-14",
    ]);
    expect(groups[1].entries.map((e) => e.entryDate)).toEqual([
      "2026-10-11",
      "2026-10-05",
    ]);
  });

  it("does not shift dates across year/month boundaries", () => {
    const groups = groupDailyHistoryByWeek([
      H("2027-01-03"), // Sunday → week of 2026-12-28
      H("2026-12-28"), // Monday
      H("2027-01-04"), // Monday of next week
    ]);
    expect(groups.map((g) => g.weekStart)).toEqual([
      "2027-01-04",
      "2026-12-28",
    ]);
  });

  it("leaves an empty history empty and never invents entries", () => {
    expect(groupDailyHistoryByWeek([])).toEqual([]);
  });

  it("each group carries an accessible human label", () => {
    const [g] = groupDailyHistoryByWeek([H("2026-10-12"), H("2026-10-13")]);
    expect(g.label).toMatch(/12/);
    expect(g.label).toMatch(/Oct/);
  });
});
