/**
 * Issue #169 - activity targets: the pure, storage-free core. Dated version
 * rows per (client, metric) answer one question everywhere: which target
 * applies on this date. The latest row with effectiveFrom <= date wins; a
 * null-kind row is a stop, not a prescription. A same-day write is an
 * in-place replace that needs the confirm flag and bumps the revision - all
 * decided here by planActivityTargetWrite so the service stays a thin
 * transaction executor over these semantics.
 *
 * The canvas twin (components/canvas/coach/targets/model.ts) carries the same
 * semantics for the demo store; the data seam keeps wire shapes duplicated on
 * purpose - this file is the server-side source of truth.
 */

export type ActivityMetric = "steps" | "cardioMin";

export const ACTIVITY_METRICS: readonly ActivityMetric[] = [
  "steps",
  "cardioMin",
];

export type ActivityTargetKind =
  "MINIMUM" | "MAXIMUM" | "RANGE" | "FIXED" | "CARDIO";

/** One stored version row (service view). kind null => stop version. */
export type ActivityTargetRow = {
  id: string;
  metric: ActivityMetric;
  kind: ActivityTargetKind | null;
  stepMin: number | null;
  stepMax: number | null;
  sessionsPerWeek: number | null;
  minutesPerSession: number | null;
  effectiveFrom: string;
  revision: number;
};

/** The write a coach intends: a prescription shape or null for a stop. */
export type ActivityTargetWrite =
  | { kind: "MINIMUM"; stepMin: number }
  | { kind: "MAXIMUM"; stepMax: number }
  | { kind: "RANGE"; stepMin: number; stepMax: number }
  | { kind: "FIXED"; stepMin: number }
  | { kind: "CARDIO"; sessionsPerWeek: number; minutesPerSession: number }
  | null;

export type ActivityTargetWritePlan =
  | { kind: "invalid"; errors: string[] }
  | { kind: "confirmation-required" }
  | {
      kind: "insert";
      id: string;
      metric: ActivityMetric;
      effectiveFrom: string;
      targetKind: ActivityTargetKind | null;
      stepMin: number | null;
      stepMax: number | null;
      sessionsPerWeek: number | null;
      minutesPerSession: number | null;
      revision: 1;
    }
  | {
      kind: "replace";
      id: string;
      metric: ActivityMetric;
      effectiveFrom: string;
      targetKind: ActivityTargetKind | null;
      stepMin: number | null;
      stepMax: number | null;
      sessionsPerWeek: number | null;
      minutesPerSession: number | null;
      revision: number;
    };

const pad = (n: number) => String(n).padStart(2, "0");

/** Local-calendar YYYY-MM-DD for the given instant (defaults to now). */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Strict real-calendar YYYY-MM-DD check (rejects 2026-02-30 et al.). */
export function isLocalCalendarDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}

const positiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;
const positiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

export function isActivityMetric(value: unknown): value is ActivityMetric {
  return value === "steps" || value === "cardioMin";
}

/**
 * The one resolver: latest version with effectiveFrom <= date for the metric.
 * A returned row with kind null means the target is stopped from that row's
 * day onward - the caller renders "no target", never the earlier row.
 */
export function resolveActivityTarget({
  rows,
  metric,
  date,
}: {
  rows: ActivityTargetRow[];
  metric: ActivityMetric;
  date: string;
}): ActivityTargetRow | undefined {
  if (!isLocalCalendarDate(date)) return undefined;
  let best: ActivityTargetRow | undefined;
  for (const row of rows) {
    if (row.metric !== metric || row.effectiveFrom > date) continue;
    if (!best || row.effectiveFrom >= best.effectiveFrom) best = row;
  }
  return best;
}

/** Domain validation for a write: shape and bounds per kind. */
export function validateActivityTargetWrite(
  target: ActivityTargetWrite,
): string[] {
  if (target === null) return [];
  switch (target.kind) {
    case "MINIMUM":
      return positiveInt(target.stepMin)
        ? []
        : ["Steps target must be a positive whole number."];
    case "MAXIMUM":
      return positiveInt(target.stepMax)
        ? []
        : ["Steps target must be a positive whole number."];
    case "FIXED":
      return positiveInt(target.stepMin)
        ? []
        : ["Steps target must be a positive whole number."];
    case "RANGE": {
      if (!positiveInt(target.stepMin) || !positiveInt(target.stepMax))
        return ["Steps range bounds must be positive whole numbers."];
      return target.stepMin <= target.stepMax
        ? []
        : ["Steps range lower bound cannot exceed the upper bound."];
    }
    case "CARDIO": {
      const errors: string[] = [];
      if (!positiveInt(target.sessionsPerWeek))
        errors.push(
          "Cardio sessions per week must be a positive whole number.",
        );
      if (!positiveNumber(target.minutesPerSession))
        errors.push("Cardio minutes per session must be a positive number.");
      return errors;
    }
    default:
      return ["Choose a supported activity target kind."];
  }
}

/** The column payload for a write; nulls clear the unused side. */
function columnsOf(target: ActivityTargetWrite): {
  targetKind: ActivityTargetKind | null;
  stepMin: number | null;
  stepMax: number | null;
  sessionsPerWeek: number | null;
  minutesPerSession: number | null;
} {
  const empty = {
    stepMin: null,
    stepMax: null,
    sessionsPerWeek: null,
    minutesPerSession: null,
  };
  if (target === null) return { targetKind: null, ...empty };
  switch (target.kind) {
    case "MINIMUM":
      return { targetKind: "MINIMUM", ...empty, stepMin: target.stepMin };
    case "MAXIMUM":
      return { targetKind: "MAXIMUM", ...empty, stepMax: target.stepMax };
    case "FIXED":
      return { targetKind: "FIXED", ...empty, stepMin: target.stepMin };
    case "RANGE":
      return {
        targetKind: "RANGE",
        ...empty,
        stepMin: target.stepMin,
        stepMax: target.stepMax,
      };
    case "CARDIO":
      return {
        targetKind: "CARDIO",
        ...empty,
        sessionsPerWeek: target.sessionsPerWeek,
        minutesPerSession: target.minutesPerSession,
      };
  }
}

/**
 * Plan a write against the known versions. Validation runs first; then the
 * same-day rule: a row already stored for (metric, effectiveFrom) makes the
 * write an in-place replace - refused without confirmSameDay, applied as a
 * revision bump with it. Otherwise the write is a new dated version.
 */
export function planActivityTargetWrite({
  rows,
  metric,
  effectiveFrom,
  target,
  id,
  confirmSameDay = false,
}: {
  rows: ActivityTargetRow[];
  metric: ActivityMetric;
  effectiveFrom: string;
  target: ActivityTargetWrite;
  /** Id the caller minted for a new version row. */
  id: string;
  confirmSameDay?: boolean;
}): ActivityTargetWritePlan {
  const errors = validateActivityTargetWrite(target);
  if (!isLocalCalendarDate(effectiveFrom))
    errors.push("Choose a valid effective date.");
  if (typeof id !== "string" || !id.trim())
    errors.push("The target version needs an id.");
  if (errors.length) return { kind: "invalid", errors };
  const columns = columnsOf(target);
  const sameDay = rows.find(
    (row) => row.metric === metric && row.effectiveFrom === effectiveFrom,
  );
  if (sameDay) {
    if (!confirmSameDay) return { kind: "confirmation-required" };
    return {
      kind: "replace",
      id: sameDay.id,
      revision: sameDay.revision + 1,
      metric,
      effectiveFrom,
      ...columns,
    };
  }
  return { kind: "insert", id, metric, effectiveFrom, revision: 1, ...columns };
}
