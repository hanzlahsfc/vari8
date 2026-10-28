/**
 * PR-M7 — canvas habit frequency text ↔ ISO weekday mask.
 *
 * The canvas stores a free-text frequency per habit ("Daily", "weekdays",
 * "3× per week" — the coach editor's own placeholder,
 * `frontend/src/components/coach/plans/setup-ui.tsx`). The database stores
 * the effective-dated `habit_schedules.weekdays` bitmask (Mon=bit0 …
 * Sun=bit6) and has no frequency text column (D34). These helpers are the
 * only translation between the two:
 *
 * - `weekdayMaskToFrequency` derives the display label from the mask.
 * - `frequencyToWeekdayMask` parses canvas-style phrases back to a mask.
 *
 * The canvas text cannot carry WHICH days a partial week uses, so a
 * "N× per week" phrase maps to a canonical evenly-spaced spread
 * (`spreadMask`). Day identity is scheduler truth only; the label is a
 * count, identical to what the canvas itself can express.
 */

/** ISO weekday mask for all seven days — the canvas "Daily". */
export const DAILY_WEEKDAY_MASK = 127;
/** Monday..Friday — the canvas "weekdays". */
export const WEEKDAYS_MASK = 0b0011111; // 31
/** Saturday + Sunday — the canvas "weekends". */
export const WEEKENDS_MASK = 0b1100000; // 96

const FREQUENCY_TEXT_MAX = 64;

function popcount(mask: number): number {
  let n = 0;
  let m = mask;
  while (m > 0) {
    n += m & 1;
    m >>= 1;
  }
  return n;
}

/**
 * Canonical evenly-spaced spread for "N× per week": `floor(i*7/n)` ISO
 * day indices. 1→Mon, 2→Mon+Thu, 3→Mon+Wed+Fri, 4→Mon+Tue+Thu+Sat,
 * 5→Mon..Fri, 6→every day but Sunday, 7→Daily.
 */
export function spreadMask(daysPerWeek: number): number | null {
  if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7)
    return null;
  let mask = 0;
  for (let i = 0; i < daysPerWeek; i++)
    mask |= 1 << Math.floor((i * 7) / daysPerWeek);
  return mask;
}

/**
 * Mask → canvas label. Returns null for masks outside 1..127 (0 is the
 * archive boundary and has no frequency).
 */
export function weekdayMaskToFrequency(mask: number): string | null {
  if (!Number.isInteger(mask) || mask < 1 || mask > 127) return null;
  if (mask === DAILY_WEEKDAY_MASK) return "Daily";
  if (mask === WEEKDAYS_MASK) return "Weekdays";
  if (mask === WEEKENDS_MASK) return "Weekends";
  return `${popcount(mask)}× per week`;
}

const TIMES_PER_WEEK_RE = /^(\d)\s*[×x]\s*(?:per\s+week|a\s+week|weekly)$/;

/**
 * Canvas frequency phrase → weekday mask. Case-insensitive; accepts the
 * vocabulary the coach editor advertises ("Daily", "weekdays", "N× per
 * week") plus the plain "N times per week"/"N per week" spellings.
 * Returns null for anything else — callers reject it as invalid input
 * rather than guess a schedule.
 */
export function frequencyToWeekdayMask(input: unknown): number | null {
  if (typeof input !== "string") return null;
  const text = input.trim().toLowerCase();
  if (text.length === 0 || text.length > FREQUENCY_TEXT_MAX) return null;

  if (text === "daily" || text === "every day" || text === "everyday")
    return DAILY_WEEKDAY_MASK;
  if (text === "weekdays" || text === "weekday" || text === "mon-fri")
    return WEEKDAYS_MASK;
  if (text === "weekends" || text === "weekend" || text === "sat-sun")
    return WEEKENDS_MASK;
  if (text === "weekly" || text === "once a week" || text === "once per week")
    return spreadMask(1);

  const times = TIMES_PER_WEEK_RE.exec(text);
  if (times) return spreadMask(Number(times[1]));

  const plain = /^(\d)\s*(?:times?\s+)?(?:per|a)\s*week$/.exec(text);
  if (plain) return spreadMask(Number(plain[1]));

  return null;
}
