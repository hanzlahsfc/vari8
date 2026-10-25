// Store binding for the legacy sheet (card 12, review R2-N4). One function
// overlays the imported workbook cells with live store values: tracker
// metrics and NutritionLog macros on the DAILY TRACKER day rows, published
// calorie targets on DASHBOARD U11:U13, and the stamped week targets on
// TIMELINE W:Y. Everything outside the binding list keeps its imported value,
// read only.

import type { TrackerEntry } from "../../ethereal/client-tracker/model";
import type { SheetMacroValues } from "../../data/legacy-sheet";
import {
  type IsoDate,
  type MacroTriple,
  addDaysIso,
  dateText,
  dayName,
  kcalFromMacros,
  mondayOf,
  weeklyAverage,
  weeklySum,
} from "./compute";
import type { SheetCell, SheetCells } from "./imported";

/** Tracker entry keys the day-row cells bind to (tracker.ts store seam). */
export const TRACKER_CELL_KEYS = {
  weight: "weight",
  steps: "steps",
  /** Card 07 wire name `cardioMin`; the canvas tracker parameter id. */
  cardioMin: "active-minutes",
} as const;

export type SheetContext = {
  /** The client's tracker entries — the same records the tracker reads. */
  entries: TrackerEntry[];
  /** NutritionLog macro actuals by date ("yyyy-mm-dd"). */
  macros: Record<string, SheetMacroValues>;
  /** Published macro-target calories for DASHBOARD U11:U13 (read only). */
  calorieTargets: [number | null, number | null, number | null];
  /** TIMELINE W:Y stamps by week-start date, written by Update Timeline. */
  weekStamps: Record<string, [number, number, number]>;
  /**
   * TIMELINE D:F week windows projected from the block start (the client's
   * phase start — the store field behind DASHBOARD!H13).
   */
  weeks: { row: number; start: IsoDate; end: IsoDate }[];
  today: IsoDate;
};

export type BoundEdit =
  | { store: "tracker"; date: IsoDate; key: string }
  | { store: "macros"; date: IsoDate; field: keyof MacroTriple };

/**
 * Editable cells: which store record a (tab, row, col) commits to. Only the
 * DAILY TRACKER day-row cells are writable; every other cell stays imported.
 */
export function boundEditFor(
  slug: string,
  row: number,
  col: number,
  today: IsoDate,
): BoundEdit | null {
  if (slug !== "daily-tracker") return null;
  const date = dayRowDate(row, today);
  if (!date) return null;
  if (col === 8) return { store: "tracker", date, key: TRACKER_CELL_KEYS.weight };
  if (col === 23) return { store: "tracker", date, key: TRACKER_CELL_KEYS.steps };
  if (col === 24)
    return { store: "tracker", date, key: TRACKER_CELL_KEYS.cardioMin };
  if (col === 42) return { store: "macros", date, field: "protein" };
  if (col === 43) return { store: "macros", date, field: "carbohydrate" };
  if (col === 44) return { store: "macros", date, field: "fat" };
  return null;
}

/** Day-row layout of the two rendered week blocks on DAILY TRACKER. */
export const DAY_BLOCKS: { firstRow: number; weekOffset: number }[] = [
  { firstRow: 11, weekOffset: 0 }, // rows 11-17, current week
  { firstRow: 23, weekOffset: 7 }, // rows 23-29, next week
];
const SUMMARY_ROWS = [18, 30];

/** Date of a day row in the tracker blocks; null outside day rows. */
export function dayRowDate(row: number, today: IsoDate): IsoDate | null {
  const monday = mondayOf(today);
  for (const block of DAY_BLOCKS) {
    if (row >= block.firstRow && row < block.firstRow + 7)
      return addDaysIso(monday, block.weekOffset + (row - block.firstRow));
  }
  return null;
}

function entryByDate(entries: TrackerEntry[]): Map<string, TrackerEntry> {
  return new Map(entries.map((e) => [e.date, e]));
}

function numOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Overlay the bound cells onto the imported skeleton for one tab. Imported
 * cells stay untouched apart from the not-calculated marker on UDF shapes.
 */
export function bindTab(
  slug: string,
  imported: SheetCells,
  ctx: SheetContext,
): SheetCells {
  const cells: SheetCells = {};
  for (const [key, cell] of Object.entries(imported)) {
    cells[key] =
      cell.formulaWrap === "udf" ? { ...cell, notCalculated: true } : cell;
  }
  if (slug === "daily-tracker") bindDailyTracker(cells, ctx);
  if (slug === "dashboard") bindDashboard(cells, ctx);
  if (slug === "timeline") bindTimeline(cells, ctx);
  return cells;
}

function bindDailyTracker(cells: SheetCells, ctx: SheetContext): void {
  const byDate = entryByDate(ctx.entries);
  for (const block of DAY_BLOCKS) {
    const weights: (number | null)[] = [];
    const stepsList: (number | null)[] = [];
    const cardio: (number | null)[] = [];
    const kcals: (number | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const row = block.firstRow + i;
      const date = addDaysIso(
        mondayOf(ctx.today),
        block.weekOffset + i,
      );
      const entry = byDate.get(date);
      const macros: MacroTriple = ctx.macros[date] ?? {
        protein: null,
        carbohydrate: null,
        fat: null,
      };
      cells[`${row}:4`] = { kind: "text", value: dayName(date), valueSource: "computed" };
      cells[`${row}:5`] = { kind: "text", value: dateText(date), valueSource: "computed" };
      cells[`${row}:6`] = { kind: "text", value: dateText(date), valueSource: "computed" };
      const weight = numOrNull(entry?.values[TRACKER_CELL_KEYS.weight]);
      const steps = numOrNull(entry?.values[TRACKER_CELL_KEYS.steps]);
      const cardioMin = numOrNull(entry?.values[TRACKER_CELL_KEYS.cardioMin]);
      const kcal = kcalFromMacros(macros);
      weights.push(weight);
      stepsList.push(steps);
      cardio.push(cardioMin);
      kcals.push(kcal === "" ? null : Number(kcal.replace(/,/g, "")));
      const store = (v: number | null): SheetCell => ({
        kind: "number",
        value: v === null ? "" : String(v),
        valueSource: "store",
        editable: true,
      });
      cells[`${row}:8`] = store(weight);
      cells[`${row}:23`] = store(steps);
      cells[`${row}:24`] = store(cardioMin);
      cells[`${row}:42`] = store(macros.protein);
      cells[`${row}:43`] = store(macros.carbohydrate);
      cells[`${row}:44`] = store(macros.fat);
      cells[`${row}:45`] = {
        kind: "formula",
        value: kcal,
        valueSource: "computed",
        formulaText:
          '=if(RC[-3]*4.1+RC[-2]*4.1+RC[-1]*9.3=0,"STR",RC[-3]*4.1+RC[-2]*4.1+RC[-1]*9.3)',
        formulaShape: "recovered",
      };
    }
    // Block summary row (mechanism rows: 7-day average, block sum).
    const summary = SUMMARY_ROWS[DAY_BLOCKS.indexOf(block)];
    cells[`${summary}:8`] = {
      kind: "formula",
      value: weeklyAverage(weights, 1),
      valueSource: "computed",
      formulaText: '=iferror(round(AVERAGE(R[-7]C:R[-1]C),1),"STR")',
      formulaShape: "recovered",
    };
    cells[`${summary}:23`] = {
      kind: "formula",
      value: weeklyAverage(stepsList, 0),
      valueSource: "computed",
      formulaText: '=iferror(round(AVERAGE(R[-7]C:R[-1]C),0),"STR")',
      formulaShape: "recovered",
    };
    cells[`${summary}:24`] = {
      kind: "formula",
      value: weeklySum(cardio, 0),
      valueSource: "computed",
      formulaText: '=iferror(sum(R[-7]C:R[-1]C),"STR")',
      formulaShape: "recovered",
    };
    cells[`${summary}:45`] = {
      kind: "formula",
      value: weeklyAverage(kcals, 0),
      valueSource: "computed",
      formulaText: '=iferror(round(AVERAGE(R[-7]C:R[-1]C),0),"STR")',
      formulaShape: "recovered",
    };
  }
}

/** DASHBOARD U11:U13 — the published macro-target calories, read only. */
function bindDashboard(cells: SheetCells, ctx: SheetContext): void {
  ctx.calorieTargets.forEach((target, i) => {
    cells[`${11 + i}:21`] = {
      kind: "number",
      value: target === null ? "" : String(target),
      valueSource: "store",
    };
  });
}

/**
 * TIMELINE: the D:F week dates are formula cells (=DASHBOARD!H13 anchored,
 * +7 per row), so they compute from the client's block start; the W:Y stamp
 * cells fill where applyWeekTargets wrote the week (Update Timeline click).
 */
function bindTimeline(cells: SheetCells, ctx: SheetContext): void {
  for (const week of ctx.weeks) {
    const formulaText =
      week.row === 10
        ? { start: "=DASHBOARD!H13", end: "=RC[-2]+6" }
        : { start: "=R[-1]C+7", end: "=RC[-2]+6" };
    cells[`${week.row}:4`] = {
      kind: "formula",
      formulaText: formulaText.start,
      formulaShape: "recovered",
      value: dateText(week.start),
      valueSource: "computed",
    };
    cells[`${week.row}:6`] = {
      kind: "formula",
      formulaText: formulaText.end,
      formulaShape: "recovered",
      value: dateText(week.end),
      valueSource: "computed",
    };
    const stamp = ctx.weekStamps[week.start];
    if (!stamp) continue;
    stamp.forEach((value, i) => {
      cells[`${week.row}:${23 + i}`] = {
        kind: "number",
        value: String(value),
        valueSource: "store",
      };
    });
  }
}
