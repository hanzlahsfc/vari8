// Legacy sheet computations: the workbook's measured formula shapes reduced
// to plain domain functions over stored state plus an injected `today`
// (MECHANISMS.md rows mapped in the card evidence; CALC-SPEC 03-calc). No
// formula evaluator, no script, no timer: everything below is a pure
// function called at render or on the "Update Timeline" click.

export type IsoDate = string; // "yyyy-mm-dd"
export type MacroTriple = {
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

const DAY_MS = 86_400_000;

export function parseIso(iso: IsoDate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toIso(ms: number): IsoDate {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function addDaysIso(iso: IsoDate, days: number): IsoDate {
  return toIso(parseIso(iso) + days * DAY_MS);
}

/** Monday of the week containing `iso` (sheet weeks run Monday-Sunday). */
export function mondayOf(iso: IsoDate): IsoDate {
  const dow = (new Date(parseIso(iso)).getUTCDay() + 6) % 7; // 0 = Monday
  return addDaysIso(iso, -dow);
}

const DAY_NAMES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function dayName(iso: IsoDate): string {
  return DAY_NAMES[(new Date(parseIso(iso)).getUTCDay() + 6) % 7];
}

/** Sheet display date: dd.mm.yyyy. */
export function dateText(iso: IsoDate): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function parseSheetDate(text: string): IsoDate | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "Week of dd.mm.yyyy": the tracker block header the sheet prints. */
export function weekLabelText(monday: IsoDate): string {
  return `Week of ${dateText(monday)}`;
}

/** "WEEK n" from a 1-based week index. */
export function weekNumberLabel(week: number): string {
  return `WEEK ${week}`;
}

/**
 * Future date gate (mechanism 1): blank while the row date is after the
 * injected today, else the value passes through.
 */
export function futureGate<T>(rowDate: IsoDate, today: IsoDate, value: T | ""): T | "" {
  return rowDate > today ? "" : value;
}

/** Day-of-block counter (mechanism 4): 1..7 across a week block. */
export function blockDayIndex(monday: IsoDate, date: IsoDate): number {
  return Math.round((parseIso(date) - parseIso(monday)) / DAY_MS) + 1;
}

/** 7-day block average; "" on empty; decimals default 1. */
export function weeklyAverage(values: (number | null)[], decimals = 1): string {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!present.length) return "";
  const avg = present.reduce((a, b) => a + b, 0) / present.length;
  return formatNumber(avg, decimals);
}

/** 7-day block sum; "" on empty. */
export function weeklySum(values: (number | null)[], decimals = 0): string {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!present.length) return "";
  return formatNumber(present.reduce((a, b) => a + b, 0), decimals);
}

/** Block-over-block difference; "" when either side is missing. */
export function weeklyDelta(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "";
  return formatSigned(current - previous, 1);
}

/** Target completion ratio (mechanism: target completion); "" on missing. */
export function completionRatio(actual: number | null, target: number | null): string {
  if (actual === null || target === null || target === 0) return "";
  return formatNumber(actual / target, 2);
}

/**
 * Macro-to-energy conversion: the sheet's own constants 4.1, 4.1 and 9.3
 * kcal/g (owner ruling: the app derives at 4,4,9 outside the sheet; the sheet
 * keeps its measured constants and stores none of them). Blank when all
 * three inputs are empty or sum to zero: the R1C1 guard.
 */
export function kcalFromMacros(macros: MacroTriple): string {
  const p = macros.protein ?? 0;
  const c = macros.carbohydrate ?? 0;
  const f = macros.fat ?? 0;
  const kcal = p * 4.1 + c * 4.1 + f * 9.3;
  if (kcal === 0) return "";
  return formatNumber(kcal, 0);
}

/** Block label count (mechanism): "3 lows", singular/plural; "" on zero. */
export function blockLabelCount(count: number, singular: string, plural?: string): string {
  if (count <= 0) return "";
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Count of ticked checkboxes inside a 7-day block. */
export function checkboxCount(values: (boolean | null)[]): number {
  return values.filter((v) => v === true).length;
}

/**
 * Relative day text (MENSES AD-AM): today / tomorrow / in n days / n days ago.
 */
export function relativeDayText(date: IsoDate, today: IsoDate): string {
  const diff = Math.round((parseIso(date) - parseIso(today)) / DAY_MS);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/** Countdown text (DASHBOARD S31-38): weeks+days until a date, or days since. */
export function countdownText(date: IsoDate, today: IsoDate): string {
  const diff = Math.round((parseIso(date) - parseIso(today)) / DAY_MS);
  if (diff === 0) return "today";
  if (diff < 0) return `${-diff}d since`;
  const weeks = Math.floor(diff / 7);
  const days = diff % 7;
  if (weeks === 0) return `${days}d`;
  return days === 0 ? `${weeks}w` : `${weeks}w ${days}d`;
}

/**
 * Cycle phase for a date (mechanism 6): first phase row whose window covers
 * the date. `phases` comes from the imported cycle table the caller parsed.
 */
export function cyclePhaseForDate(
  date: IsoDate,
  phases: { start: IsoDate; end: IsoDate; name: string }[],
): string {
  const hit = phases.find((p) => p.start <= date && date <= p.end);
  return hit?.name ?? "";
}

/**
 * Timeline week windows: one {row, start, end} per week row, parsed from the
 * imported TIMELINE cells (start in column D, end in column F).
 */
export function timelineWeekWindows(
  cells: Record<string, { value?: string }>,
): { row: number; start: IsoDate; end: IsoDate }[] {
  const out: { row: number; start: IsoDate; end: IsoDate }[] = [];
  for (const [key, cell] of Object.entries(cells)) {
    const [r, c] = key.split(":").map(Number);
    if (c !== 4 || !cell.value) continue;
    const start = parseSheetDate(cell.value);
    const end = cells[`${r}:6`]?.value ? parseSheetDate(cells[`${r}:6`].value!) : null;
    if (start && end) out.push({ row: r, start, end });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/** Rendered TIMELINE week rows: row 10 anchors, each next row is +7 days. */
export const TIMELINE_FIRST_WEEK_ROW = 10;
export const TIMELINE_LAST_WEEK_ROW = 30;

/**
 * The D:F week windows as the workbook computes them: row 10 reads the block
 * start (DASHBOARD!H13, a store field, the client's phase start here) and
 * every later row adds seven days; F is start plus six. Projected across the
 * rendered week rows only.
 */
export function projectWeekWindows(
  anchor: IsoDate,
  firstRow = TIMELINE_FIRST_WEEK_ROW,
  lastRow = TIMELINE_LAST_WEEK_ROW,
): { row: number; start: IsoDate; end: IsoDate }[] {
  const out: { row: number; start: IsoDate; end: IsoDate }[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    const start = addDaysIso(anchor, (row - firstRow) * 7);
    out.push({ row, start, end: addDaysIso(start, 6) });
  }
  return out;
}

/**
 * `applyWeekTargets(today)`: the app form of `updateTimelineTargets`. Finds
 * the timeline week row whose D..F window contains `today` and returns the
 * stamp to write to its W:Y cells, or null when no week covers today (the
 * script's alert path: the app returns a result instead of an alert).
 * Called from the "Update Timeline" button only; nothing runs on a timer.
 */
export function applyWeekTargets(
  today: IsoDate,
  weeks: { row: number; start: IsoDate; end: IsoDate }[],
  targets: [number | null, number | null, number | null],
): { row: number; weekStart: IsoDate; values: [number | null, number | null, number | null] } | null {
  const week = weeks.find((w) => w.start <= today && today <= w.end);
  if (!week) return null;
  return { row: week.row, weekStart: week.start, values: targets };
}

/** Food database join (MEALPLAN Z): name lookup by id over imported db rows. */
export function foodNameById(
  id: string,
  rows: Map<string, string>,
): string {
  return rows.get(id) ?? "";
}

function formatNumber(value: number, decimals: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatSigned(value: number, decimals: number): string {
  const abs = formatNumber(Math.abs(value), decimals);
  return value < 0 ? `-${abs}` : abs;
}
