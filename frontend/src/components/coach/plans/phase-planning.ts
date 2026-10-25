export type ClientPhase = {
  id: string;
  name: string;
  /** ISO date; only the first phase's start is user-editable —
   *  `normalizePhases` rewrites later starts back-to-back. */
  startDate: string;
  durationWeeks: number;
};

export type ClientPhaseRange = ClientPhase & {
  endDate: string;
};

/** Pre-redesign shape kept for storage migration only. */
export type ClientPhasePlan = {
  startDate: string;
  phases: { id: string; name: string; durationWeeks: number }[];
};

const DAY_MS = 86_400_000;

function parseDate(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(`${value}T12:00:00Z`);
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString().slice(0, 10) === value ? time : undefined;
}

export function isValidPhaseStartDate(value: unknown): value is string {
  return typeof value === "string" && parseDate(value) !== undefined;
}

function dateString(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPhaseCore(
  value: unknown,
): value is { id: string; name: string; durationWeeks: number } {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.durationWeeks === "number" &&
    Number.isInteger(value.durationWeeks) &&
    value.durationWeeks > 0 &&
    value.durationWeeks <= 52
  );
}

export function isClientPhase(value: unknown): value is ClientPhase {
  return (
    isRecord(value) &&
    isValidPhaseStartDate(value.startDate) &&
    isPhaseCore(value)
  );
}

export function isClientPhases(value: unknown): value is ClientPhase[] {
  return Array.isArray(value) && value.every(isClientPhase);
}

/** Save gate: an empty list is a valid "no phases" save. */
export function canSavePhases(value: unknown): boolean {
  return isClientPhases(value);
}

/**
 * Chronological order plus back-to-back dates: sort by startDate, then
 * rewrite every start so each phase begins the day after the previous one
 * ends (the first phase's startDate is the anchor).
 */
export function normalizePhases(phases: ClientPhase[]): ClientPhase[] {
  const sorted = [...phases].sort((a, b) =>
    a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0,
  );
  let startTime: number | undefined;
  return sorted.map((phase) => {
    const own = parseDate(phase.startDate);
    const start = startTime ?? own;
    if (start === undefined) return phase;
    const endTime = start + phase.durationWeeks * 7 * DAY_MS - DAY_MS;
    startTime = endTime + DAY_MS;
    return { ...phase, startDate: dateString(start) };
  });
}

/** Phases with computed endDate, normalized chronological order. */
export function phaseRanges(
  phases: ClientPhase[] | undefined,
): ClientPhaseRange[] {
  if (!phases?.length) return [];
  let startTime: number | undefined;
  return normalizePhases(phases).flatMap((phase) => {
    const start = startTime ?? parseDate(phase.startDate);
    if (start === undefined) return [];
    const endTime = start + phase.durationWeeks * 7 * DAY_MS - DAY_MS;
    startTime = endTime + DAY_MS;
    return [
      { ...phase, startDate: dateString(start), endDate: dateString(endTime) },
    ];
  });
}

export function phaseForDate(
  phases: ClientPhase[] | undefined,
  date: string,
): string | undefined {
  if (parseDate(date) === undefined) return undefined;
  const range = phaseRanges(phases).find(
    (phase) => date >= phase.startDate && date <= phase.endDate,
  );
  return range?.name;
}

// ─── Legacy plan migration ──────────────────────────────────────────

export function isClientPhasePlan(value: unknown): value is ClientPhasePlan {
  return (
    isRecord(value) &&
    typeof value.startDate === "string" &&
    parseDate(value.startDate) !== undefined &&
    Array.isArray(value.phases) &&
    value.phases.every(isPhaseCore)
  );
}

/** Convert a legacy {startDate, phases[]} plan into back-to-back phases. */
export function legacyPhasePlanToPhases(plan: ClientPhasePlan): ClientPhase[] {
  let startTime = parseDate(plan.startDate) ?? 0;
  return plan.phases.map((phase) => {
    const endTime = startTime + phase.durationWeeks * 7 * DAY_MS - DAY_MS;
    const converted = { ...phase, startDate: dateString(startTime) };
    startTime = endTime + DAY_MS;
    return converted;
  });
}
