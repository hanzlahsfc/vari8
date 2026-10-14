/**
 * CLIENT-TASKS-I1 declared-date contract (decision 109): `dueDate` is a
 * plain calendar DATE — stored as `@db.Date`, serialized as
 * `YYYY-MM-DD`, displayed without timezone conversion.
 *
 * The bounds here are THIS contract's proposed engineering safety bound
 * (reviewed, P3 §P2-A) — not borrowed from decision #66's DailyEntry
 * `today+1` limit, which governs client-declared entries only and is
 * untouched.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOWER_BOUND = "1970-01-01";
/** Proposed safety bound: server-UTC today + 5 calendar years. */
export const TASK_DUE_HORIZON_YEARS = 5;

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

/** Server-UTC calendar date — the authoritative "today" for due-state. */
export function serverTodayUtc(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Strict declared-date parse → canonical `YYYY-MM-DD` or null.
 * `opts.today` is injectable for deterministic tests (server-UTC by default).
 * Leap normalization: `Date.UTC(y+5, m, d)` on a Feb-29 reference lands on
 * Mar-01 of the leap-deficient year — deterministic, no silent day shift.
 */
export function parseTaskDueDate(
  input: unknown,
  opts: { today?: string } = {},
): string | null {
  if (typeof input !== "string") return null;
  const parts = toParts(input);
  if (!parts) return null;
  const canonical = partsToDate(parts);
  if (!canonical) return null;
  const today = opts.today ?? serverTodayUtc();
  if (canonical < LOWER_BOUND) return null;
  const [ty, tm, td] = toParts(today) as [number, number, number];
  const upper = new Date(Date.UTC(ty + TASK_DUE_HORIZON_YEARS, tm - 1, td))
    .toISOString()
    .slice(0, 10);
  if (canonical > upper) return null;
  return canonical;
}

export type TaskDueState = "overdue" | "due-today" | "upcoming";

/** Computed display metadata only — never a stored status. */
export function taskDueState(
  dueDate: string,
  today: string = serverTodayUtc(),
): TaskDueState {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "due-today";
  return "upcoming";
}

/**
 * Timezone-independent display — stored date parts are formatted
 * directly; identical output for every viewer offset.
 */
export function formatTaskDueDate(dueDate: string): string {
  const parts = toParts(dueDate);
  if (!parts) return dueDate;
  const [y, m, d] = parts;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
