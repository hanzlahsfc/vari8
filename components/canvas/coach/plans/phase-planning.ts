export type ClientPhase = {
  id: string;
  name: string;
  durationWeeks: number;
};

export type ClientPhasePlan = {
  startDate: string;
  phases: ClientPhase[];
};

export type ClientPhaseRange = ClientPhase & {
  startDate: string;
  endDate: string;
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

export function isClientPhasePlan(value: unknown): value is ClientPhasePlan {
  if (!isRecord(value)) return false;
  return (
    typeof value.startDate === "string" &&
    parseDate(value.startDate) !== undefined &&
    Array.isArray(value.phases) &&
    value.phases.every(
      (phase) =>
        isRecord(phase) &&
        typeof phase.id === "string" &&
        phase.id.length > 0 &&
        typeof phase.name === "string" &&
        phase.name.trim().length > 0 &&
        typeof phase.durationWeeks === "number" &&
        Number.isInteger(phase.durationWeeks) &&
        phase.durationWeeks > 0 &&
        phase.durationWeeks <= 52,
    )
  );
}

export function canSaveClientPhasePlan(value: unknown): boolean {
  return (
    (isRecord(value) &&
      Array.isArray(value.phases) &&
      value.phases.length === 0) ||
    isClientPhasePlan(value)
  );
}

export function phasePlanRanges(
  plan: ClientPhasePlan | undefined,
): ClientPhaseRange[] {
  if (!plan || !isClientPhasePlan(plan)) return [];
  const initialTime = parseDate(plan.startDate);
  if (initialTime === undefined) return [];
  let startTime = initialTime;
  return plan.phases.map((phase) => {
    const endTime = startTime + phase.durationWeeks * 7 * DAY_MS - DAY_MS;
    const range = {
      ...phase,
      startDate: dateString(startTime),
      endDate: dateString(endTime),
    };
    startTime = endTime + DAY_MS;
    return range;
  });
}

export function phaseForDate(
  plan: ClientPhasePlan | undefined,
  date: string,
): string | undefined {
  const time = parseDate(date);
  if (time === undefined) return undefined;
  const range = phasePlanRanges(plan).find(
    (phase) => date >= phase.startDate && date <= phase.endDate,
  );
  return range?.name;
}
