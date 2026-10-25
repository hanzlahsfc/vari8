// Habit frequency: structured value on CoachClient.habits[].frequency with
// legacy string compatibility, plus habitLog adherence helpers.

import { addDays, type CoachClient, type HabitFrequency } from "../model";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Legacy text maps to structured; unknown strings become daily. */
export function parseHabitFrequency(
  frequency: string | HabitFrequency | undefined,
): HabitFrequency {
  if (frequency && typeof frequency === "object") return frequency;
  const text = (frequency ?? "").toLowerCase();
  const perWeek = /(\d)\s*(?:x|×)\s*(?:per week|a week|weekly|\/\s*week)/.exec(
    text,
  );
  if (perWeek)
    return {
      kind: "per-week",
      count: Math.min(7, Math.max(1, Number(perWeek[1]))),
    };
  const everyN = /every\s+(\d)\s*days?/.exec(text);
  if (everyN)
    return {
      kind: "every-n-days",
      n: Math.min(7, Math.max(2, Number(everyN[1]))),
    };
  if (/weekday/.test(text) && !/weekend/.test(text))
    return { kind: "weekdays", days: [1, 2, 3, 4, 5] };
  return { kind: "daily" };
}

export function habitFrequencyLabel(f: HabitFrequency): string {
  switch (f.kind) {
    case "daily":
      return "Daily";
    case "per-week":
      return `${f.count}× per week`;
    case "every-n-days":
      return `Every ${f.n} days`;
    case "weekdays":
      return f.days
        .slice()
        .sort()
        .map((d) => WEEKDAY_SHORT[d - 1])
        .join(" · ");
  }
}

/** Expected occurrences per 7-day week for adherence. */
function expectedPerWeek(f: HabitFrequency): number {
  switch (f.kind) {
    case "daily":
      return 7;
    case "per-week":
      return f.count;
    case "every-n-days":
      return Math.max(1, Math.round(7 / f.n));
    case "weekdays":
      return f.days.length;
  }
}

const countInWindow = (dates: string[], start: string, end: string) =>
  dates.filter((d) => d >= start && d <= end).length;

/**
 * Adherence = completions ÷ expected occurrences, capped at 100 %.
 * Returns undefined when there is no log yet.
 */
export function habitAdherence(
  client: CoachClient,
  habitId: string,
  frequency: HabitFrequency,
  today: string,
): { thisWeek: number | undefined; fourWeek: number | undefined } {
  const log = client.habitLog?.[habitId] ?? [];
  const expected = expectedPerWeek(frequency);
  if (!expected || !log.length)
    return { thisWeek: undefined, fourWeek: undefined };
  const weekStart = addDays(
    today,
    -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7),
  );
  const fourWeekStart = addDays(weekStart, -21);
  const ratio = (done: number, expectedN: number) =>
    Math.min(100, Math.round((done / expectedN) * 100));
  return {
    thisWeek: ratio(
      countInWindow(log, weekStart, addDays(weekStart, 6)),
      expected,
    ),
    fourWeek: ratio(
      countInWindow(log, fourWeekStart, addDays(weekStart, 6)),
      expected * 4,
    ),
  };
}

/** Mon–Sun dates where the habit is expected this week. */
export function habitExpectedDates(
  f: HabitFrequency,
  weekStart: string,
): string[] {
  if (f.kind === "weekdays")
    return f.days
      .slice()
      .sort()
      .map((d) => addDays(weekStart, d - 1));
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
