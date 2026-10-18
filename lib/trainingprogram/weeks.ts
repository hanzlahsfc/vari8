/**
 * TRAINING-I1A (PROMPT 244 — P8 §4–§5 + P9 §3 contract) — week-calendar
 * and governing-version math.
 *
 * Immutable week anchor (P9 §3.1): `anchorTz(P)` = the program's seq-1
 * version `effectiveTimezone`, immutable once first-published. Every
 * week boundary, label, ceiling, sample, and baseline uses the anchor —
 * the mutable `confirmedTimezone` resolves ONLY new publication
 * instants and "today" for bounds (P9 §3.2). Dates are tz-naive local
 * calendar dates; instants decide all eligibility (P8 §4.1).
 */

import { resolveLocalInstant } from "../checkin/timezone";
import { TRAINING_LIMITS } from "./limits";
import { TrainingError } from "./payload";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Strict YYYY-MM-DD → epoch-ms at UTC midnight (calendar math only). */
export function parseLocalDate(raw: string): number {
  if (!DATE_RE.test(raw)) throw new TrainingError("invalid_input");
  const [y, m, d] = raw.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    throw new TrainingError("invalid_input");
  return t;
}

export function formatLocalDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(localDate: string, days: number): string {
  return formatLocalDate(parseLocalDate(localDate) + days * DAY_MS);
}

/**
 * Local calendar date of `instant` in `zone` (IANA). Uses Intl — one
 * conversion point for the ceiling, bounds, and week labels (P7 §6:
 * "one localDate call").
 */
export function localDateOf(instant: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  // en-CA yields YYYY-MM-DD directly.
  return parts;
}

/** Index of the week containing `localDate` (1-based; ≤0 before start). */
export function weekIndex(startDate: string, localDate: string): number {
  return (
    Math.floor(
      (parseLocalDate(localDate) - parseLocalDate(startDate)) / (7 * DAY_MS),
    ) + 1
  );
}

/**
 * Anchor-zone instant for a local-midnight boundary (A1 §3.4): a
 * skipped local date folds FORWARD to the next representable local
 * midnight within a bounded search; week NUMBERING is unchanged — only
 * the boundary instant is approximated. Unresolvable within the bound
 * or an invalid zone → internal error outcome (A2 §4.4), never a
 * fabricated availability failure.
 */
export function boundaryInstant(zone: string, localDate: string): Date {
  const base = parseLocalDate(localDate);
  for (let i = 0; i <= TRAINING_LIMITS.boundaryFoldMaxDays; i++) {
    const candidate = formatLocalDate(base + i * DAY_MS);
    const r = resolveLocalInstant(zone, candidate, 0);
    if (r.status === "ok") return r.instant;
    if (r.status === "invalid") throw new TrainingError("internal_error");
  }
  throw new TrainingError("internal_error");
}

export function weekStartInstant(
  anchorTz: string,
  startDate: string,
  week: number,
): Date {
  return boundaryInstant(anchorTz, addDays(startDate, 7 * (week - 1)));
}

/** Exclusive end = the next week's start boundary (weekCount → +1). */
export function weekEndInstant(
  anchorTz: string,
  startDate: string,
  week: number,
): Date {
  return boundaryInstant(anchorTz, addDays(startDate, 7 * week));
}

/**
 * Ceiling convention (P7 §6 — count of locked weeks, now anchored):
 * `whollyPast` under the ANCHOR calendar; `lockedWeekHighWater` is a
 * retained defensive floor only (P9 §3.4).
 */
export function whollyPastWeeks(
  anchorTz: string,
  startDate: string,
  weekCount: number,
  now: Date,
): number {
  const idx = weekIndex(startDate, localDateOf(now, anchorTz));
  return Math.min(weekCount, Math.max(0, idx - 1));
}

export function ceiling(
  anchorTz: string,
  startDate: string,
  weekCount: number,
  highWater: number,
  now: Date,
): number {
  return Math.max(
    highWater,
    whollyPastWeeks(anchorTz, startDate, weekCount, now),
  );
}

// ── Governing-version selection (P8 §5.1, instant-only) ────────────────

export type VersionInstant = {
  id: string;
  versionSeq: number;
  effectiveDate: string;
  effectiveTimezone: string;
  activationInstant: Date;
  publishedAt: Date;
};

/**
 * `gvAt(P, t, cutoff)`: greatest-seq version with activation ≤ t and
 * activation < cutoff — the ONE eligibility function (P8 §5.1). Strict
 * predicates; no epsilon arithmetic (P9 P3-1).
 */
export function gvAt<T extends VersionInstant>(
  versions: readonly T[],
  t: Date,
  cutoffInstant: Date | null,
): T | null {
  const cutoff = cutoffInstant ?? null;
  let best: T | null = null;
  for (const v of versions) {
    if (v.activationInstant.getTime() > t.getTime()) continue;
    if (cutoff !== null && v.activationInstant.getTime() >= cutoff.getTime())
      continue;
    if (best === null || v.versionSeq > best.versionSeq) best = v;
  }
  return best;
}

/**
 * `gvBefore(P, x, cutoff)`: greatest-seq version with activation
 * STRICTLY before x — used for wholly-past weeks (last governing
 * version) and the publish-time baseline (P9 §3.3).
 */
export function gvBefore<T extends VersionInstant>(
  versions: readonly T[],
  x: Date,
  cutoffInstant: Date | null,
): T | null {
  const cutoff = cutoffInstant ?? null;
  let best: T | null = null;
  for (const v of versions) {
    if (v.activationInstant.getTime() >= x.getTime()) continue;
    if (cutoff !== null && v.activationInstant.getTime() >= cutoff.getTime())
      continue;
    if (best === null || v.versionSeq > best.versionSeq) best = v;
  }
  return best;
}

/**
 * `versionForWeek(P, W, t)` (P8 §5.2): wholly-past → last version
 * governing at week end (capped by cutoff); current → gvAt(t); future →
 * version governing at week start (scheduled, never presented as
 * current). null → unestablished week — no invented history.
 */
export function versionForWeek<T extends VersionInstant>(
  versions: readonly T[],
  anchorTz: string,
  startDate: string,
  week: number,
  t: Date,
  cutoffInstant: Date | null,
): { version: T | null; state: "past" | "current" | "scheduled" } {
  const start = weekStartInstant(anchorTz, startDate, week);
  const end = weekEndInstant(anchorTz, startDate, week);
  if (t.getTime() < start.getTime())
    return {
      version: gvAt(versions, start, cutoffInstant),
      state: "scheduled",
    };
  if (t.getTime() < end.getTime())
    return { version: gvAt(versions, t, cutoffInstant), state: "current" };
  return {
    version: gvBefore(versions, end, cutoffInstant),
    state: "past",
  };
}

/**
 * Governed span of a version (P8 §5.2 direct access): null when the
 * version is shadowed (a later seq activated at/before its own instant)
 * or activates at/after the successor takeover — it never governed.
 */
export function governedSpan(
  versions: readonly VersionInstant[],
  v: VersionInstant,
  cutoffInstant: Date | null,
): { from: Date; to: Date } | null {
  const shadowed = versions.some(
    (w) =>
      w.versionSeq > v.versionSeq &&
      w.activationInstant.getTime() <= v.activationInstant.getTime(),
  );
  if (shadowed) return null;
  if (
    cutoffInstant !== null &&
    v.activationInstant.getTime() >= cutoffInstant.getTime()
  )
    return null;
  let to = cutoffInstant ?? null;
  for (const w of versions) {
    if (
      w.versionSeq > v.versionSeq &&
      w.activationInstant.getTime() > v.activationInstant.getTime() &&
      (to === null || w.activationInstant.getTime() < to.getTime())
    )
      to = w.activationInstant;
  }
  return { from: v.activationInstant, to: to ?? new Date(8640000000000000) };
}

export function isShadowed(
  versions: readonly VersionInstant[],
  v: VersionInstant,
): boolean {
  return versions.some(
    (w) =>
      w.versionSeq > v.versionSeq &&
      w.activationInstant.getTime() <= v.activationInstant.getTime(),
  );
}

/**
 * Mixed-week marker (P8 §5.4): the earliest non-shadowed version
 * activating strictly inside week W — "Updated [date]" once effective,
 * "Updates from [date]" while scheduled. A first publication is never a
 * revision (no marker when nothing governed at week start).
 */
export function weekMarker(
  versions: readonly VersionInstant[],
  anchorTz: string,
  startDate: string,
  week: number,
  t: Date,
): { label: "updated" | "updates"; effectiveDate: string } | null {
  const start = weekStartInstant(anchorTz, startDate, week);
  const end = weekEndInstant(anchorTz, startDate, week);
  const base = gvAt(versions, start, null);
  const candidates = versions
    .filter(
      (v) =>
        v.activationInstant.getTime() > start.getTime() &&
        v.activationInstant.getTime() < end.getTime() &&
        !isShadowed(versions, v) &&
        (base === null || v.versionSeq !== base.versionSeq),
    )
    .sort(
      (a, b) => a.activationInstant.getTime() - b.activationInstant.getTime(),
    );
  if (base === null || candidates.length === 0) return null;
  const m = candidates[0];
  return {
    label: m.activationInstant.getTime() <= t.getTime() ? "updated" : "updates",
    effectiveDate: m.effectiveDate,
  };
}
