export type ActivityMetric = "steps" | "cardio";
export type StepsTarget =
  | { kind: "minimum"; value: number }
  | { kind: "maximum"; value: number }
  | { kind: "fixed"; value: number }
  | { kind: "range"; min: number; max: number };
export type CardioTarget = {
  sessionsPerWeek: number;
  minutesPerSession: number;
};
export type ActivityChange =
  | { metric: "steps"; target: StepsTarget | null }
  | { metric: "cardio"; target: CardioTarget | null };
export type ActivityTargetVersion = {
  id: string;
  effectiveFrom: string;
} & ActivityChange;
export type ActivitySegment = {
  start: string;
  end: string;
  version: ActivityTargetVersion | undefined;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isLocalCalendarDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}

// Noon-UTC arithmetic keeps day stepping stable across DST transitions.
export function addLocalDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  return addLocalDays(
    date,
    -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7),
  );
}

const positiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;
const positiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const isStepsTarget = (v: unknown): v is StepsTarget =>
  record(v) &&
  (v.kind === "minimum" || v.kind === "maximum" || v.kind === "fixed"
    ? positiveInt(v.value)
    : v.kind === "range" &&
      positiveInt(v.min) &&
      positiveInt(v.max) &&
      v.min <= v.max);
const isCardioTarget = (v: unknown): v is CardioTarget =>
  record(v) &&
  positiveInt(v.sessionsPerWeek) &&
  positiveNumber(v.minutesPerSession);

export function isActivityTargetVersion(
  value: unknown,
): value is ActivityTargetVersion {
  if (!record(value)) return false;
  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (
    typeof value.effectiveFrom !== "string" ||
    !isLocalCalendarDate(value.effectiveFrom)
  )
    return false;
  if (value.metric !== "steps" && value.metric !== "cardio") return false;
  if (value.target === null) return true;
  return value.metric === "steps"
    ? isStepsTarget(value.target)
    : isCardioTarget(value.target);
}

export function resolveActivityTarget({
  versions,
  metric,
  date,
}: {
  versions: ActivityTargetVersion[];
  metric: ActivityMetric;
  date: string;
}): ActivityTargetVersion | undefined {
  let best: ActivityTargetVersion | undefined;
  for (const version of versions) {
    if (version.metric !== metric || version.effectiveFrom > date) continue;
    if (!best || version.effectiveFrom >= best.effectiveFrom) best = version;
  }
  return best;
}

export function activitySegments({
  versions,
  metric,
  start,
  end,
}: {
  versions: ActivityTargetVersion[];
  metric: ActivityMetric;
  start: string;
  end: string;
}): ActivitySegment[] {
  if (!isLocalCalendarDate(start) || !isLocalCalendarDate(end) || start > end)
    return [];
  const segments: ActivitySegment[] = [];
  for (let day = start; day <= end; day = addLocalDays(day, 1)) {
    const version = resolveActivityTarget({ versions, metric, date: day });
    const last = segments.at(-1);
    if (last && last.version?.id === version?.id) last.end = day;
    else segments.push({ start: day, end: day, version });
  }
  return segments;
}

const grouped = new Intl.NumberFormat("en-US");

export function formatActivityTarget(
  version: ActivityTargetVersion | undefined,
): string {
  if (!version || version.target === null) return "No target prescribed";
  if (version.metric === "steps") {
    const t = version.target;
    switch (t.kind) {
      case "minimum":
        return `Minimum ${grouped.format(t.value)} steps/day`;
      case "maximum":
        return `Maximum ${grouped.format(t.value)} steps/day`;
      case "fixed":
        return `Fixed ${grouped.format(t.value)} steps/day`;
      case "range":
        return `${grouped.format(t.min)}-${grouped.format(t.max)} steps/day`;
    }
  }
  const t = version.target;
  return `${grouped.format(t.sessionsPerWeek)} x ${String(t.minutesPerSession)} min/week`;
}

export function validateActivityChange(change: ActivityChange): string[] {
  if (change.metric === "steps") {
    const t = change.target;
    if (t === null) return [];
    if (t.kind === "range") {
      if (!positiveInt(t.min) || !positiveInt(t.max))
        return ["Steps range bounds must be positive whole numbers."];
      if (t.min > t.max)
        return ["Steps range lower bound cannot exceed the upper bound."];
      return [];
    }
    if (t.kind === "minimum" || t.kind === "maximum" || t.kind === "fixed")
      return positiveInt(t.value)
        ? []
        : ["Steps target must be a positive whole number."];
    return ["Choose a steps target type."];
  }
  if (change.metric === "cardio") {
    const t = change.target;
    if (t === null) return [];
    const errors: string[] = [];
    if (!positiveInt(t.sessionsPerWeek))
      errors.push("Cardio sessions per week must be a positive whole number.");
    if (!positiveNumber(t.minutesPerSession))
      errors.push("Cardio minutes per session must be a positive number.");
    return errors;
  }
  return ["Choose a supported activity metric."];
}

export function writeActivityTarget({
  versions,
  change,
  effectiveFrom,
  id,
  confirmSameDay = false,
}: {
  versions: ActivityTargetVersion[];
  change: ActivityChange;
  effectiveFrom: string;
  id: string;
  confirmSameDay?: boolean;
}):
  | { kind: "invalid"; errors: string[] }
  | { kind: "confirmation-required" }
  | { kind: "saved"; versions: ActivityTargetVersion[] } {
  const errors = validateActivityChange(change);
  if (!isLocalCalendarDate(effectiveFrom))
    errors.push("Choose a valid effective date.");
  if (typeof id !== "string" || !id.trim())
    errors.push("The target version needs an id.");
  if (errors.length) return { kind: "invalid", errors };
  const sameDay = versions.some(
    (v) => v.metric === change.metric && v.effectiveFrom === effectiveFrom,
  );
  if (sameDay && !confirmSameDay) return { kind: "confirmation-required" };
  const version: ActivityTargetVersion =
    change.metric === "steps"
      ? {
          id,
          effectiveFrom,
          metric: "steps",
          target: structuredClone(change.target),
        }
      : {
          id,
          effectiveFrom,
          metric: "cardio",
          target: structuredClone(change.target),
        };
  return { kind: "saved", versions: [...versions, version] };
}
