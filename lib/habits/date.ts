/**
 * HABITS-I1 declared-date contract (decision 110): habit schedule
 * boundaries and log dates are plain calendar DATEs — stored as
 * `@db.Date`, serialized as `YYYY-MM-DD`, displayed without timezone
 * conversion. The server-UTC calendar is authoritative; viewer offsets
 * never shift a declared date.
 *
 * Creation may start today or later — no backdated enrollment. Edits to
 * existing habits take effect at server-UTC tomorrow, computed by the
 * service, never caller-supplied.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Reviewed engineering bound: server-UTC today + 5 calendar years. */
export const HABIT_HORIZON_YEARS = 5;
/**
 * ISO weekday bitmask: Monday = bit 0 … Sunday = bit 6. `0` is reserved
 * for archive boundary rows and is never accepted from a caller.
 */
export const WEEKDAY_MASK_MIN = 1;
export const WEEKDAY_MASK_MAX = 127;
export const ARCHIVE_WEEKDAY_MASK = 0;

function toParts(date: string): [number, number, number] | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function partsToDate(parts: [number, number, number]): string {
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Round-trip check: rejects 2025-02-30 etc. via component drift.
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    return "";
  return dt.toISOString().slice(0, 10);
}

/** Server-UTC calendar date — the authoritative "today". */
export function serverTodayUtc(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

/** Declared-date arithmetic pinned to UTC (no DST/offset drift). */
export function shiftDateUtc(date: string, days: number): string {
  const parts = toParts(date);
  if (!parts) return date;
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function horizonUpperBound(today: string): string {
  const [ty, tm, td] = toParts(today) as [number, number, number];
  // Leap normalization: Date.UTC(y+5, 1, 29) lands on Mar-01 in a
  // leap-deficient year — deterministic, no silent day shift.
  return new Date(Date.UTC(ty + HABIT_HORIZON_YEARS, tm - 1, td))
    .toISOString()
    .slice(0, 10);
}

function strictDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const parts = toParts(input);
  if (!parts) return null;
  const canonical = partsToDate(parts);
  return canonical || null;
}

/**
 * Creation start date: strictly `[today, today+5y]`. Past input is
 * rejected — no backdated enrollment. `opts.today` is injectable for
 * deterministic tests (server-UTC by default).
 */
export function parseHabitStartDate(
  input: unknown,
  opts: { today?: string } = {},
): string | null {
  const canonical = strictDate(input);
  if (!canonical) return null;
  const today = opts.today ?? serverTodayUtc();
  if (canonical < today) return null;
  if (canonical > horizonUpperBound(today)) return null;
  return canonical;
}

/**
 * Optional end date: `null` clears; otherwise `[startDate, today+5y]`.
 */
export function parseHabitEndDate(
  input: unknown,
  opts: { startDate: string; today?: string },
): string | null {
  if (input === null || input === undefined) return null;
  const canonical = strictDate(input);
  if (!canonical) return null;
  const today = opts.today ?? serverTodayUtc();
  if (canonical < opts.startDate) return null;
  if (canonical > horizonUpperBound(today)) return null;
  return canonical;
}

/**
 * Caller-facing weekday mask: integers 1..127. Zero is rejected — only
 * the archive path writes a zero boundary.
 */
export function parseWeekdayMask(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isInteger(input)) return null;
  if (input < WEEKDAY_MASK_MIN || input > WEEKDAY_MASK_MAX) return null;
  return input;
}

/** ISO weekday bit for a declared date (Mon=1 … Sun=64). */
export function weekdayBit(date: string): number {
  const parts = toParts(date);
  if (!parts) return 0;
  const [y, m, d] = parts;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sun=0
  const iso = dow === 0 ? 6 : dow - 1;
  return 1 << iso;
}

/** Whether the schedule mask covers a declared date's weekday. */
export function maskCoversDate(mask: number, date: string): boolean {
  return (mask & weekdayBit(date)) !== 0;
}

/** The HABIT widget period set frozen by DASHBOARD-I1 (config-schema). */
const PERIOD_DAYS: Record<string, number> = {
  today: 1,
  "7d": 7,
  "14d": 14,
  "4w": 28,
  "6w": 42,
  "8w": 56,
  "12w": 84,
};

export function habitPeriodDays(period: string): number | null {
  return PERIOD_DAYS[period] ?? null;
}

/** Timezone-independent display — identical output for every viewer. */
export function formatHabitDate(date: string): string {
  const parts = toParts(date);
  if (!parts) return date;
  const [y, m, d] = parts;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
