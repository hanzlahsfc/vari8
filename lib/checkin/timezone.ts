/**
 * CHECK-IN-RECURRENCE-I1 (decision #114) — bounded dependency-free
 * wall-clock → instant conversion via `Intl` (reviewed P3 §6 + P3-R1
 * refinements). No new dependencies.
 *
 * Owner-approved semantics (bounded first version — not a claim of
 * universal calendar convention):
 *   - local clock time is preserved across DST;
 *   - a NONEXISTENT local time (spring-forward gap) resolves to the
 *     FIRST VALID MINUTE at or after the requested time — e.g.
 *     2026-03-08 02:30 America/New_York → 03:00 (07:00Z), never
 *     shift-by-gap (03:30);
 *   - a REPEATED local time (fall-back fold) resolves to the EARLIER
 *     occurrence;
 *   - a transition that skips an ENTIRE local date (e.g. Apia skipped
 *     2011-12-30) makes the occurrence UNREPRESENTABLE — reported,
 *     never silently moved to another day.
 *
 * Algorithm:
 *   1. IANA validation via `Intl.DateTimeFormat` (RangeError → invalid).
 *   2. `t0` = the requested wall reading expressed as pseudo-UTC
 *      (`Date.UTC(date) + minutes`).
 *   3. Probe the zone's UTC offset at a bounded set of instants around
 *      `t0` (±5h covers every real transition neighborhood); each
 *      probed offset `o` yields candidate instant `t0 − o`; candidates
 *      whose rendered wall equals the request are representable —
 *      the EARLIEST wins (fold handling).
 *   4. No candidates → the requested wall lies inside a gap. Crossing
 *      detection: scan forward minute-by-minute from
 *      `t0 − off(t0) − GAP_BOUND` and return the first instant whose
 *      rendered local date equals the request AND whose rendered
 *      minute-of-day is ≥ requested. `GAP_BOUND` = 181 min covers every
 *      sub-day IANA gap in 2000–2100 (largest: Antarctica/Troll's
 *      120 min); whole-day skips exceed any sub-day window and land on
 *      a different local date → `unrepresentable`.
 *   5. ICU/tzdata variability is pinned by the golden-vector unit
 *      suite; if a vector fails after an ICU/tzdata bump, the declared
 *      narrow dependency decision applies — never a silent behavior
 *      change.
 */

export const CHECKIN_TZ_LIMITS = {
  minIsoYear: 2000,
  maxIsoYear: 2100,
  timezoneMax: 64,
  /** Largest sub-day IANA gap in range is 120 min (Antarctica/Troll);
   * 181 min gives the crossing scan headroom. Whole-day skips are not
   * gaps — they are unrepresentable. */
  gapBoundMinutes: 181,
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIanaTimeZone(zone: string): boolean {
  if (
    typeof zone !== "string" ||
    zone.length === 0 ||
    zone.length > CHECKIN_TZ_LIMITS.timezoneMax ||
    zone.trim() !== zone
  )
    return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD in the zone for an instant; null for an invalid zone. */
export function localDateInZone(instant: Date, zone: string): string | null {
  const fmt = formatterFor(zone);
  if (fmt === null) return null;
  const p = partsOf(fmt, instant);
  return `${p.year}-${p.month}-${p.day}`;
}

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return null;
  }
}

type WallParts = {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
  second: number;
};

function partsOf(fmt: Intl.DateTimeFormat, t: number | Date): WallParts {
  const out = fmt.formatToParts(t);
  const get = (type: string) => out.find((p) => p.type === type)?.value;
  return {
    year: get("year") ?? "1970",
    month: get("month") ?? "01",
    day: get("day") ?? "01",
    hour: Number(get("hour") ?? 0),
    minute: Number(get("minute") ?? 0),
    second: Number(get("second") ?? 0),
  };
}

/**
 * The wall-clock reading at instant `t`, expressed as a pseudo-UTC
 * millisecond value (what the zone's clock SHOWS, not the instant).
 * Monotone-increasing across gaps; decreases inside folds — folds are
 * handled by the offset-candidate scan, gaps by crossing detection.
 */
function wallAbs(fmt: Intl.DateTimeFormat, t: number): number {
  const p = partsOf(fmt, t);
  return Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    p.hour,
    p.minute,
    p.second,
  );
}

export type ResolveLocalInstantResult =
  | { status: "ok"; instant: Date }
  | { status: "unrepresentable" }
  | { status: "invalid" };

export function resolveLocalInstant(
  zone: string,
  localDate: string,
  minuteOfDay: number,
): ResolveLocalInstantResult {
  if (!isValidIanaTimeZone(zone)) return { status: "invalid" };
  if (typeof localDate !== "string" || !DATE_RE.test(localDate))
    return { status: "invalid" };
  const [y, m, d] = localDate.split("-").map(Number);
  if (y < CHECKIN_TZ_LIMITS.minIsoYear || y > CHECKIN_TZ_LIMITS.maxIsoYear)
    return { status: "invalid" };
  const dayStart = Date.UTC(y, m - 1, d);
  // Malformed calendar days normalize into a different date — reject.
  if (new Date(dayStart).toISOString().slice(0, 10) !== localDate)
    return { status: "invalid" };
  if (
    typeof minuteOfDay !== "number" ||
    !Number.isInteger(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay > 1439
  )
    return { status: "invalid" };

  const fmt = formatterFor(zone);
  if (fmt === null) return { status: "invalid" };
  const t0 = dayStart + minuteOfDay * 60_000;
  const requestedMinute = minuteOfDay;

  // Steps 2–3: offset candidates from probes around t0. A fold produces
  // TWO representable instants; the earliest wins (owner-approved).
  const probeOffsetsMs = [-300, -240, -180, -120, -60, 0, 60, 120].map(
    (mins) => mins * 60_000,
  );
  const offsets = new Set<number>();
  for (const shift of probeOffsetsMs)
    offsets.add(wallAbs(fmt, t0 + shift) - (t0 + shift));

  let earliest: number | null = null;
  for (const off of offsets) {
    const candidate = t0 - off;
    if (wallAbs(fmt, candidate) === t0)
      earliest = earliest === null ? candidate : Math.min(earliest, candidate);
  }
  if (earliest !== null) return { status: "ok", instant: new Date(earliest) };

  // Step 4: gap — the requested wall is unrepresentable. Scan forward
  // minute-by-minute for the first instant whose local clock reaches a
  // representable reading on the SAME calendar date at or after the
  // requested minute (crossing detection — not advance-from-result).
  const base = t0 - (wallAbs(fmt, t0) - t0); // first two-pass estimate
  const scanStart = base - CHECKIN_TZ_LIMITS.gapBoundMinutes * 60_000;
  const steps = CHECKIN_TZ_LIMITS.gapBoundMinutes * 2;
  for (let k = 0; k <= steps; k++) {
    const s = scanStart + k * 60_000;
    const wall = wallAbs(fmt, s);
    if (wall < t0) continue;
    const p = partsOf(fmt, s);
    const local = `${p.year}-${p.month}-${p.day}`;
    if (local !== localDate) {
      // The first valid reading lands on ANOTHER date — the whole day
      // was skipped (or the transition ran past it). Unrepresentable.
      if (wall > dayStart + 1439 * 60_000) return { status: "unrepresentable" };
      continue;
    }
    const wallMinute = p.hour * 60 + p.minute;
    if (wallMinute >= requestedMinute)
      return { status: "ok", instant: new Date(s) };
  }
  // Nothing representable inside the bounded window.
  return { status: "unrepresentable" };
}
