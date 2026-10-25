import { addDays } from "../../coach/model";
import { trainingWeek } from "../../coach/plans/domain";
import {
  type RotationScheduleEntry,
  trainingRotationSchedule,
} from "../../coach/plans/training/training-model";
import type {
  LogField,
  LoggedExercise,
  LoggedSet,
  TrainingExercise,
  TrainingPlan,
  TrainingSession,
  TrainingSessionLog,
} from "../../coach/plans/types";
import { mondayOf } from "../../coach/targets/model";

export const DEFAULT_LOG_FIELDS: LogField[] = ["weight", "reps", "note"];

/** Identity for "previous performance": the shared library exercise, never the name. */
export function exerciseKey(exercise: TrainingExercise): string {
  return exercise.libraryId ?? exercise.id;
}

const DAY_MS = 86400000;
const dayNumber = (date: string) => Date.parse(`${date}T12:00:00Z`) / DAY_MS;

/** Mon–Sun calendar-week index; content selection still uses trainingWeek(). */
export function displayWeek(plan: TrainingPlan, date: string): number {
  return Math.max(
    1,
    Math.floor(
      (dayNumber(mondayOf(date)) - dayNumber(mondayOf(plan.startDate))) / 7,
    ) + 1,
  );
}

export function weekRange(
  plan: TrainingPlan,
  week: number,
): { start: string; end: string } {
  const start = addDays(mondayOf(plan.startDate), (week - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export type ScheduledSession = {
  occurrenceKey: string;
  date: string;
  session: TrainingSession;
  weekdayLabel: string;
};

const weekdayIndex = (date: string) =>
  (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Dated occurrences inside the week's Mon–Sun range; cycle rotations return none. */
export function scheduledSessions(
  plan: TrainingPlan,
  week: number,
): ScheduledSession[] {
  const { start, end } = weekRange(plan, week);
  const firstDay = start < plan.startDate ? plan.startDate : start;
  const scheduleFor = (contentWeek: number) =>
    trainingRotationSchedule(plan, contentWeek);
  const firstSchedule = scheduleFor(trainingWeek(plan, firstDay));
  if (firstSchedule.mode === "cycle") return [];
  if (firstSchedule.mode === "legacy")
    return firstSchedule.entries
      .filter(
        (entry): entry is RotationScheduleEntry & { kind: "session" } =>
          entry.kind === "session",
      )
      .map((entry) => ({
        occurrenceKey: entry.key,
        date: firstDay,
        session: entry.session,
        weekdayLabel: "",
      }));
  // Weekly: each calendar date in the range picks the weekday entry from the
  // prescription week that applies on that date.
  const items: ScheduledSession[] = [];
  for (let date = firstDay; date <= end; date = addDays(date, 1)) {
    const weekday = WEEKDAYS[weekdayIndex(date)];
    const schedule =
      trainingWeek(plan, date) === trainingWeek(plan, firstDay)
        ? firstSchedule
        : scheduleFor(trainingWeek(plan, date));
    if (schedule.mode !== "weekly") continue;
    for (const entry of schedule.entries)
      if (entry.kind === "session" && entry.label === weekday)
        items.push({
          occurrenceKey: entry.key,
          date,
          session: entry.session,
          weekdayLabel: entry.label,
        });
  }
  return items;
}

export type SessionStatus =
  | "done"
  | "in-progress"
  | "today"
  | "upcoming"
  | "missed";

export const STATUS_META: Record<
  SessionStatus,
  { label: string; tone: "positive" | "info" | "warning" | "neutral" | "danger" }
> = {
  done: { label: "Done", tone: "positive" },
  "in-progress": { label: "In progress", tone: "info" },
  today: { label: "Today", tone: "warning" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  missed: { label: "Missed", tone: "danger" },
};

const logFor = (logs: TrainingSessionLog[], item: ScheduledSession) =>
  logs.find(
    (log) =>
      log.occurrenceKey === item.occurrenceKey &&
      log.scheduledDate === item.date,
  );

export function sessionStatus(
  item: ScheduledSession,
  logs: TrainingSessionLog[],
  today: string,
): SessionStatus {
  const log = logFor(logs, item);
  if (log?.status === "finished") return "done";
  if (log) return "in-progress";
  if (item.date === today) return "today";
  if (item.date > today) return "upcoming";
  return "missed";
}

export function nextSession(
  items: ScheduledSession[],
  logs: TrainingSessionLog[],
  today: string,
): ScheduledSession | undefined {
  return (
    items.find((item) =>
      ["in-progress", "today"].includes(sessionStatus(item, logs, today)),
    ) ?? items.find((item) => sessionStatus(item, logs, today) === "upcoming")
  );
}

export function findLog(
  logs: TrainingSessionLog[],
  planId: string,
  scheduledDate: string,
  occurrenceKey: string,
): TrainingSessionLog | undefined {
  return logs.find(
    (log) =>
      log.planId === planId &&
      log.scheduledDate === scheduledDate &&
      log.occurrenceKey === occurrenceKey,
  );
}

/** Most recent finished log of the same session+exercise in an earlier week. */
export function previousPerformance(
  logs: TrainingSessionLog[],
  args: {
    clientId: string;
    sessionId: string;
    exerciseKey: string;
    plan: TrainingPlan;
    date: string;
  },
): { date: string; exercise: LoggedExercise } | undefined {
  const beforeWeek = displayWeek(args.plan, args.date);
  const hit = [...logs]
    .filter(
      (log) =>
        log.clientId === args.clientId &&
        log.sessionId === args.sessionId &&
        log.status === "finished" &&
        displayWeek(args.plan, log.scheduledDate) < beforeWeek &&
        log.exercises.some(
          (exercise) => exercise.exerciseKey === args.exerciseKey,
        ),
    )
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))[0];
  if (!hit) return undefined;
  const exercise = hit.exercises.find(
    (candidate) => candidate.exerciseKey === args.exerciseKey,
  );
  return exercise ? { date: hit.scheduledDate, exercise } : undefined;
}

export function startLog(args: {
  id: string;
  clientId: string;
  plan: TrainingPlan;
  item: ScheduledSession;
  logFields: LogField[];
  loadUnit: "kg" | "lb";
  now: string;
}): TrainingSessionLog {
  return {
    id: args.id,
    clientId: args.clientId,
    planId: args.plan.id,
    week: displayWeek(args.plan, args.item.date),
    occurrenceKey: args.item.occurrenceKey,
    sessionId: args.item.session.id,
    sessionName: args.item.session.name,
    scheduledDate: args.item.date,
    logFields: [...args.logFields],
    loadUnit: args.loadUnit,
    exercises: args.item.session.exercises.map((exercise) => ({
      exerciseId: exercise.id,
      exerciseKey: exerciseKey(exercise),
      prescription: structuredClone(exercise),
      sets: exercise.sets.map(
        (set): LoggedSet => ({
          setId: set.id,
          done: false,
          weight: null,
          reps: null,
          rpe: null,
          rir: null,
          note: "",
          flagged: false,
        }),
      ),
    })),
    status: "in-progress",
    startedAt: args.now,
  };
}

export function updateSet(
  log: TrainingSessionLog,
  exerciseId: string,
  setId: string,
  patch: Partial<Omit<LoggedSet, "setId">>,
): TrainingSessionLog {
  return {
    ...log,
    exercises: log.exercises.map((exercise) =>
      exercise.exerciseId !== exerciseId
        ? exercise
        : {
            ...exercise,
            sets: exercise.sets.map((set) =>
              set.setId === setId ? { ...set, ...patch } : set,
            ),
          },
    ),
  };
}

export function finishLog(
  log: TrainingSessionLog,
  finishedAt: string,
): TrainingSessionLog {
  return { ...log, status: "finished", finishedAt };
}

export function notDoneCount(log: TrainingSessionLog): number {
  return log.exercises.reduce(
    (count, exercise) =>
      count + exercise.sets.filter((set) => !set.done).length,
    0,
  );
}
