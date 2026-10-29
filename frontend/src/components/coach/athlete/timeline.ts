import {
  displayWeek,
  findLog,
  scheduledSessions,
  sessionStatus,
} from "../../client-app/training-log/model";
import type { MealPlan } from "../../ethereal/mealplan/model";
import { type CoachClient, type CoachState, formatDate } from "../model";
import { applicablePlan, scheduledOption } from "../plans/domain";
import { type ClientPhase, phaseRanges } from "../plans/phase-planning";
import { temporaryNutritionForDate } from "../plans/temporary-nutrition";
import type { IifymPlan, TemporaryNutrition } from "../plans/types";
import { addLocalDays, isLocalCalendarDate, mondayOf } from "../targets/model";
import { templateSetup } from "../template-setup";
import { clientTracking } from "../tracking/data";

export type TimelineEventKind = "deload" | "diet-break" | "refeed";
export type TimelineEvent = {
  id: string;
  kind: TimelineEventKind;
  /** ISO date */
  startDate: string;
  /** ISO date, >= startDate; refeed defaults to one day */
  endDate: string;
  note: string;
};

export const TIMELINE_KIND_LABELS: Record<TimelineEventKind, string> = {
  deload: "Deload",
  "diet-break": "Diet break",
  refeed: "Refeed day",
};

const DAY_MS = 86_400_000;
const dayCount = (start: string, end: string) =>
  Math.round(
    (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
      DAY_MS,
  ) + 1;

export function eventsOnDate(
  events: TimelineEvent[] | undefined,
  date: string,
): TimelineEvent[] {
  return (events ?? []).filter(
    (event) => event.startDate <= date && date <= event.endDate,
  );
}

/** Structural guard for values restored from browser storage. */
export function isTimelineEvent(value: unknown): value is TimelineEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const event = value as Record<string, unknown>;
  if (
    typeof event.id !== "string" ||
    !["deload", "diet-break", "refeed"].includes(event.kind as string) ||
    typeof event.startDate !== "string" ||
    !isLocalCalendarDate(event.startDate) ||
    typeof event.endDate !== "string" ||
    !isLocalCalendarDate(event.endDate) ||
    event.endDate < event.startDate ||
    typeof event.note !== "string"
  )
    return false;
  // Stored events may still carry a legacy `nutritionOverride`; it is stripped
  // by the normaliser, so the guard simply ignores unknown extra keys.
  return true;
}

export type ResolvedNutrition = {
  source: "mealPlan" | "iifym";
  plan: MealPlan | IifymPlan | undefined;
  optionId: string | undefined;
  label: string | undefined;
  /** Set when a temporary plan covers the date. */
  temporary: TemporaryNutrition | undefined;
};

/**
 * The plan + option that apply on a date. A temporary plan covering the date
 * (latest createdAt wins) replaces the regular plan entirely; otherwise the
 * regular lifecycle plan's schedule selects the option.
 */
export function nutritionForDate(
  client: CoachClient,
  date: string,
): ResolvedNutrition {
  const setup = client.assignment
    ? templateSetup(client.assignment.snapshot, client.assignment.variantId)
    : undefined;
  const source: ResolvedNutrition["source"] =
    setup?.nutrition === "IIFYM" ? "iifym" : "mealPlan";
  const plans = client.plans;
  const temporary = plans
    ? temporaryNutritionForDate(plans.nutrition.temporary, date, source)
    : null;
  const plan =
    temporary?.plan ??
    (plans
      ? source === "iifym"
        ? applicablePlan(plans.nutrition.iifym, date)
        : applicablePlan(plans.nutrition.mealPlan, date)
      : undefined);
  if (!plan)
    return {
      source,
      plan: undefined,
      optionId: undefined,
      label: undefined,
      temporary: temporary ?? undefined,
    };
  const ids =
    source === "iifym"
      ? (plan as IifymPlan).options.map((option) => option.id)
      : (plan as MealPlan).variants.map((variant) => variant.id);
  const optionId = scheduledOption(plan.schedule, ids, date);
  const option =
    source === "iifym"
      ? (plan as IifymPlan).options.find((entry) => entry.id === optionId)
      : (plan as MealPlan).variants.find((entry) => entry.id === optionId);
  return {
    source,
    plan,
    optionId,
    label: option?.label,
    temporary: temporary ?? undefined,
  };
}

/** Calendar weeks until the contest date; 0 on the day itself. */
export function weeksOut(
  contestDate: string | undefined,
  today: string,
): number | undefined {
  if (!contestDate || !isLocalCalendarDate(contestDate)) return undefined;
  return Math.max(
    0,
    Math.ceil(
      (Date.parse(`${contestDate}T12:00:00Z`) -
        Date.parse(`${today}T12:00:00Z`)) /
        (7 * DAY_MS),
    ),
  );
}

export function currentPhase(
  phases: ClientPhase[] | undefined,
  today: string,
):
  | {
      name: string;
      week: number;
      weeks: number;
      startDate: string;
      endDate: string;
    }
  | undefined {
  const range = phaseRanges(phases).find(
    (phase) => today >= phase.startDate && today <= phase.endDate,
  );
  if (!range) return undefined;
  const week =
    Math.floor(
      (Date.parse(`${today}T12:00:00Z`) -
        Date.parse(`${range.startDate}T12:00:00Z`)) /
        (7 * DAY_MS),
    ) + 1;
  return {
    name: range.name,
    week,
    weeks: range.durationWeeks,
    startDate: range.startDate,
    endDate: range.endDate,
  };
}

/**
 * Validate a candidate event against the client's existing events and active
 * nutrition plan. Returns an error string or null.
 */
export function validateTimelineEvent(
  client: CoachClient,
  event: TimelineEvent,
  opts: { ignoreId?: string } = {},
): string | null {
  if (
    !isLocalCalendarDate(event.startDate) ||
    !isLocalCalendarDate(event.endDate)
  )
    return "Choose valid dates.";
  if (event.endDate < event.startDate)
    return "End date must be on or after the start date.";
  if (event.kind === "refeed" && dayCount(event.startDate, event.endDate) > 3)
    return "A refeed can span at most 3 days.";
  const clash = (client.timelineEvents ?? []).find(
    (existing) =>
      existing.id !== opts.ignoreId &&
      existing.kind === event.kind &&
      existing.startDate <= event.endDate &&
      event.startDate <= existing.endDate,
  );
  if (clash)
    return `This overlaps an existing ${TIMELINE_KIND_LABELS[event.kind].toLowerCase()}.`;
  return null;
}

export type AttentionItem = {
  kind: "check-in" | "flagged-note" | "missed-session" | "in-progress";
  label: string;
  detail: string;
  date: string;
  /** Submission id when the row opens a check-in review. */
  reviewId?: string;
};

type AttentionState = Pick<CoachState, "submissions" | "trainingLogs">;

export function attentionItems(
  state: AttentionState,
  client: CoachClient,
  today: string,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const submission of state.submissions)
    if (submission.clientId === client.id && !submission.response)
      items.push({
        kind: "check-in",
        label: "Check-in awaiting feedback",
        detail: `${submission.type} check-in`,
        date: submission.date,
        reviewId: submission.id,
      });
  const logs = (state.trainingLogs ?? []).filter(
    (log) => log.clientId === client.id,
  );
  for (const log of logs)
    for (const exercise of log.exercises)
      exercise.sets.forEach((set, index) => {
        if (!set.flagged || !set.note.trim()) return;
        items.push({
          kind: "flagged-note",
          label: `${exercise.prescription.name ?? exercise.exerciseId} · set ${index + 1}`,
          detail: set.note,
          date: log.scheduledDate,
        });
      });
  const plan = client.plans
    ? applicablePlan(client.plans.training, today)
    : undefined;
  if (plan) {
    const week = displayWeek(plan, today);
    for (const item of scheduledSessions(plan, week)) {
      const status = sessionStatus(item, logs, today);
      if (status === "missed")
        items.push({
          kind: "missed-session",
          label: item.session.name,
          detail: `Scheduled ${item.weekdayLabel}`,
          date: item.date,
        });
      if (status === "in-progress" && item.date < today) {
        const log = findLog(logs, plan.id, item.date, item.occurrenceKey);
        const sets = (log?.exercises ?? []).flatMap(
          (exercise) => exercise.sets,
        );
        const done = sets.filter((set) => set.done).length;
        items.push({
          kind: "in-progress",
          label: "Unfinished session",
          detail: `Started ${formatDate(item.date, { weekday: "short" })} · ${String(done)} of ${String(sets.length)} sets`,
          date: item.date,
        });
      }
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export function weekTrainingSummary(
  state: AttentionState,
  client: CoachClient,
  today: string,
): { scheduled: number; done: number; inProgress: number; flagged: number } {
  const plan = client.plans
    ? applicablePlan(client.plans.training, today)
    : undefined;
  const logs = (state.trainingLogs ?? []).filter(
    (log) => log.clientId === client.id,
  );
  if (!plan) return { scheduled: 0, done: 0, inProgress: 0, flagged: 0 };
  const week = displayWeek(plan, today);
  const items = scheduledSessions(plan, week);
  return {
    scheduled: items.length,
    done: items.filter((item) => sessionStatus(item, logs, today) === "done")
      .length,
    inProgress: items.filter(
      (item) => sessionStatus(item, logs, today) === "in-progress",
    ).length,
    flagged: logs.reduce(
      (count, log) =>
        count +
        log.exercises.reduce(
          (inner, exercise) =>
            inner + exercise.sets.filter((set) => set.flagged).length,
          0,
        ),
      0,
    ),
  };
}

export function bodyweightSummary(
  client: CoachClient,
  today: string,
): {
  latest: { date: string; value: number } | undefined;
  avg7: number | undefined;
  delta: number | undefined;
  points: { date: string; value: number }[];
} {
  const entries = clientTracking(client)
    .filter((entry) => entry.date <= today && entry.values.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      date: entry.date,
      weight: entry.values.weight as number,
    }));
  const latest = entries.at(-1);
  const windowAvg = (from: string, to: string) => {
    const slice = entries.filter(
      (entry) => entry.date >= from && entry.date <= to,
    );
    return slice.length
      ? slice.reduce((sum, entry) => sum + entry.weight, 0) / slice.length
      : undefined;
  };
  const current = windowAvg(addLocalDays(today, -6), today);
  const prior = windowAvg(addLocalDays(today, -13), addLocalDays(today, -7));
  const points = entries
    .filter((entry) => entry.date >= addLocalDays(today, -27))
    .map((entry) => ({ date: entry.date, value: entry.weight }));
  return {
    latest: latest ? { date: latest.date, value: latest.weight } : undefined,
    avg7: current,
    delta:
      current !== undefined && prior !== undefined
        ? current - prior
        : undefined,
    points,
  };
}

/** Track window for the timeline widget. */
export type TimelineWindow = { start: string; end: string };

const WINDOW_BACK_DAYS = 28;
const WINDOW_AHEAD_DAYS = 56;
const FALLBACK_WEEKS = 16;

const daysBetween = (start: string, end: string) => dayCount(start, end) - 1;

/**
 * The visible track window. Near-term mode focuses on 4 weeks back to 8
 * weeks ahead, clipped to the phase plan when one exists; full-plan mode
 * spans the whole plan (or a 16-week fallback around today).
 * All comparisons are plain string compares — ISO dates sort
 * lexicographically, so never use Math.min/Math.max on them (they return
 * NaN and blank the track).
 */
export function timelineWindow(
  today: string,
  ranges: { startDate: string; endDate: string }[],
  fullPlan: boolean,
): TimelineWindow {
  const nearStart = addLocalDays(today, -WINDOW_BACK_DAYS);
  const nearEnd = addLocalDays(today, WINDOW_AHEAD_DAYS);
  const planStart = ranges[0]?.startDate ?? mondayOf(today);
  const planEnd =
    ranges.at(-1)?.endDate ?? addLocalDays(planStart, FALLBACK_WEEKS * 7 - 1);
  if (fullPlan) return { start: planStart, end: planEnd };
  if (!ranges.length) return { start: nearStart, end: nearEnd };
  return {
    start: nearStart < planStart ? planStart : nearStart,
    end: planEnd < nearEnd ? planEnd : nearEnd,
  };
}

/** True when [start, end] overlaps the window. */
export function timelineInWindow(
  window: TimelineWindow,
  start: string,
  end: string,
): boolean {
  return end >= window.start && start <= window.end;
}

/**
 * A date range clipped to the window, as track percentages, or undefined
 * when it lies fully outside.
 */
export function timelineSegment(
  window: TimelineWindow,
  start: string,
  end: string,
): { left: number; width: number } | undefined {
  if (!timelineInWindow(window, start, end)) return undefined;
  const totalDays = Math.max(1, daysBetween(window.start, window.end));
  const clippedStart = start < window.start ? window.start : start;
  const clippedEnd = end > window.end ? window.end : end;
  return {
    left: Math.min(
      100,
      Math.max(0, (daysBetween(window.start, clippedStart) / totalDays) * 100),
    ),
    width: ((daysBetween(clippedStart, clippedEnd) + 1) / totalDays) * 100,
  };
}
