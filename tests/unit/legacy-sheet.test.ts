/**
 * Card 12: legacy sheet on the real store. Pure-layer tests: the domain
 * computations (mechanism table -> CALC-SPEC), the cell binding map (R2-N4),
 * and applyWeekTargets click semantics. The grid/dialog layer is covered by
 * the production-boot browser proof in the card evidence.
 */
import { describe, expect, it } from "vitest";

import {
  boundEditFor,
  bindTab,
  dayRowDate,
  TRACKER_CELL_KEYS,
  type SheetContext,
} from "@/components/canvas/client/legacy-sheet/bind";
import {
  applyWeekTargets,
  dateText,
  dayName,
  futureGate,
  kcalFromMacros,
  mondayOf,
  projectWeekWindows,
  weeklyAverage,
  weeklyDelta,
  weeklySum,
} from "@/components/canvas/client/legacy-sheet/compute";
import { IMPORTED_CELLS } from "@/components/canvas/client/legacy-sheet/imported";

const TODAY = "2026-03-04"; // Wednesday of the fixture's week 6.

const CTX: SheetContext = {
  entries: [
    {
      date: "2026-03-02",
      values: { weight: 92.9, steps: 9200, "active-minutes": 45 },
    },
    { date: "2026-03-03", values: { weight: 92.4 } },
  ],
  macros: {
    "2026-03-02": { protein: 180, carbohydrate: 220, fat: 60 },
  },
  calorieTargets: [2400, 2100, 1800],
  weekStamps: { "2026-03-02": [2400, 2100, 1800] },
  // Block anchored 2026-02-23: week rows 10..30; 2026-03-02 lands on row 11.
  weeks: projectWeekWindows("2026-02-23"),
  today: TODAY,
};

describe("computations", () => {
  it("mondayOf lands on the week monday", () => {
    expect(mondayOf("2026-03-04")).toBe("2026-03-02");
    expect(mondayOf("2026-03-08")).toBe("2026-03-02"); // Sunday same week
    expect(mondayOf("2026-03-09")).toBe("2026-03-09");
  });

  it("dateText and dayName render sheet formats", () => {
    expect(dateText("2026-03-04")).toBe("04.03.2026");
    expect(dayName("2026-03-04")).toBe("WE");
    expect(dayName("2026-03-09")).toBe("MO");
  });

  it("kcalFromMacros uses the sheet constants 4.1/4.1/9.3 and blanks on empty", () => {
    // 180*4.1 + 220*4.1 + 60*9.3 = 738 + 902 + 558 = 2198
    expect(kcalFromMacros({ protein: 180, carbohydrate: 220, fat: 60 })).toBe(
      "2,198",
    );
    expect(
      kcalFromMacros({ protein: null, carbohydrate: null, fat: null }),
    ).toBe("");
    expect(kcalFromMacros({ protein: 0, carbohydrate: 0, fat: 0 })).toBe("");
    // Missing macros stay null-safe, never coerce a missing side to energy.
    expect(kcalFromMacros({ protein: 10, carbohydrate: null, fat: null })).toBe(
      "41",
    );
  });

  it("weeklyAverage/weeklySum blank on empty and round as specified", () => {
    expect(weeklyAverage([92.9, 92.4, null], 1)).toBe("92.7");
    expect(weeklyAverage([null, null])).toBe("");
    expect(weeklySum([45, null, 30])).toBe("75");
    expect(weeklyDelta(91.7, 92.9)).toBe("-1.2");
    expect(weeklyDelta(null, 92.9)).toBe("");
  });

  it("futureGate blanks rows ahead of today", () => {
    expect(futureGate("2026-03-05", TODAY, "x")).toBe("");
    expect(futureGate("2026-03-04", TODAY, "x")).toBe("x");
  });

  it("applyWeekTargets stamps only the week row containing today", () => {
    const weeks = [
      { row: 10, start: "2026-02-23", end: "2026-03-01" },
      { row: 11, start: "2026-03-02", end: "2026-03-08" },
      { row: 12, start: "2026-03-09", end: "2026-03-15" },
    ];
    const hit = applyWeekTargets(TODAY, weeks, [2400, 2100, 1800]);
    expect(hit).toEqual({
      row: 11,
      weekStart: "2026-03-02",
      values: [2400, 2100, 1800],
    });
    expect(
      applyWeekTargets("2026-03-16", weeks, [2400, 2100, 1800]),
    ).toBeNull();
  });
});

describe("day-row layout", () => {
  it("maps rows to the two rendered week blocks", () => {
    expect(dayRowDate(11, TODAY)).toBe("2026-03-02");
    expect(dayRowDate(17, TODAY)).toBe("2026-03-08");
    expect(dayRowDate(23, TODAY)).toBe("2026-03-09");
    expect(dayRowDate(29, TODAY)).toBe("2026-03-15");
    expect(dayRowDate(18, TODAY)).toBeNull();
    expect(dayRowDate(30, TODAY)).toBeNull();
    expect(dayRowDate(10, TODAY)).toBeNull();
  });
});

describe("binding list", () => {
  it("maps day-row cells to tracker parameter keys", () => {
    expect(boundEditFor("daily-tracker", 11, 8, TODAY)).toEqual({
      store: "tracker",
      date: "2026-03-02",
      key: TRACKER_CELL_KEYS.weight,
    });
    expect(boundEditFor("daily-tracker", 12, 23, TODAY)).toMatchObject({
      store: "tracker",
      key: "steps",
    });
    expect(boundEditFor("daily-tracker", 12, 24, TODAY)).toMatchObject({
      store: "tracker",
      key: "active-minutes",
    });
    expect(boundEditFor("daily-tracker", 12, 42, TODAY)).toEqual({
      store: "macros",
      date: "2026-03-03",
      field: "protein",
    });
    expect(boundEditFor("daily-tracker", 12, 44, TODAY)).toMatchObject({
      store: "macros",
      field: "fat",
    });
    // Read-only: kcal formula, summary rows, headers, other tabs.
    expect(boundEditFor("daily-tracker", 12, 45, TODAY)).toBeNull();
    expect(boundEditFor("daily-tracker", 18, 8, TODAY)).toBeNull();
    expect(boundEditFor("dashboard", 11, 21, TODAY)).toBeNull();
    expect(boundEditFor("mealplan", 10, 10, TODAY)).toBeNull();
  });
});

describe("bindTab", () => {
  const bound = bindTab("daily-tracker", IMPORTED_CELLS["daily-tracker"], CTX);

  it("writes store values into the day cells and marks them editable", () => {
    expect(bound["11:8"]).toMatchObject({
      value: "92.9",
      valueSource: "store",
      editable: true,
    });
    expect(bound["12:8"]).toMatchObject({ value: "92.4" });
    expect(bound["11:23"]).toMatchObject({ value: "9200" });
    expect(bound["11:24"]).toMatchObject({ value: "45" });
    expect(bound["11:42"]).toMatchObject({ value: "180" });
    expect(bound["11:44"]).toMatchObject({ value: "60" });
    // Days without records stay blank but editable.
    expect(bound["13:8"]).toMatchObject({ value: "", editable: true });
  });

  it("computes dates, day names and the kcal formula per day row", () => {
    expect(bound["11:4"]?.value).toBe("MO");
    expect(bound["12:4"]?.value).toBe("TU");
    expect(bound["11:6"]?.value).toBe("02.03.2026");
    expect(bound["23:6"]?.value).toBe("09.03.2026");
    expect(bound["11:45"]).toMatchObject({
      kind: "formula",
      value: "2,198",
      valueSource: "computed",
    });
    expect(bound["12:45"]?.value).toBe(""); // no macros -> blank kcal
  });

  it("computes the week summary row from the seven days", () => {
    expect(bound["18:8"]?.value).toBe("92.7"); // avg of 92.9, 92.4
    expect(bound["18:23"]?.value).toBe("9,200"); // avg of one steps reading
    expect(bound["18:24"]?.value).toBe("45"); // cardio minutes block sum
    expect(bound["18:45"]?.value).toBe("2,198");
  });

  it("keeps imported cells untouched and marks UDF shapes not calculated", () => {
    expect(bound["8:8"]?.value).toBe("KG"); // band label survives
    const udf = bound["10:23"];
    expect(udf?.formulaWrap).toBe("udf");
    expect(udf?.notCalculated).toBe(true);
    expect(udf?.value).toBe("PREP"); // last imported value stays
  });

  it("binds DASHBOARD U11:U13 read-only to the published targets", () => {
    const dash = bindTab("dashboard", IMPORTED_CELLS.dashboard, CTX);
    expect(dash["11:21"]).toMatchObject({
      value: "2400",
      valueSource: "store",
    });
    expect(dash["12:21"]?.value).toBe("2100");
    expect(dash["13:21"]?.value).toBe("1800");
    expect(dash["11:21"]?.editable).toBeUndefined();
  });

  it("computes TIMELINE D:F from the block anchor and stamps W:Y per week", () => {
    const timeline = bindTab("timeline", IMPORTED_CELLS.timeline, CTX);
    // Row 10 = anchor week (2026-02-23), row 11 = 2026-03-02 (stamped).
    expect(timeline["10:4"]).toMatchObject({
      value: "23.02.2026",
      valueSource: "computed",
      formulaText: "=DASHBOARD!H13",
    });
    expect(timeline["10:6"]?.value).toBe("01.03.2026");
    expect(timeline["11:4"]?.value).toBe("02.03.2026");
    expect(timeline["11:6"]?.value).toBe("08.03.2026");
    expect(timeline["11:23"]?.value).toBe("2400");
    expect(timeline["11:25"]?.value).toBe("1800");
    // Only the stamped week row carries W:Y values.
    expect(timeline["12:23"]).toBeUndefined();
    expect(timeline["10:23"]).toBeUndefined();
  });

  it("leaves tabs without bindings imported and read only", () => {
    const mealplan = bindTab("mealplan", IMPORTED_CELLS.mealplan, CTX);
    for (const cell of Object.values(mealplan))
      expect(cell.editable).toBeUndefined();
  });
});
