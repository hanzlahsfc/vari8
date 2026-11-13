// Coach task domain logic shared by the Tasks section, the athlete profile
// tab and the reminder effect. Pure functions over CoachState — storage keeps
// its two legacy locations (state.coachTodos, client.coachTasks) so saved
// workspaces need no migration. Legacy coachTodos entries that carry a
// clientId are treated as belonging to that athlete.

import {
  type CoachClient,
  type CoachState,
  formatDate,
  type TaskFields,
  type TaskRepeat,
} from "./model";
import { addLocalDays, mondayOf } from "./targets/model";

export type TaskEntry = {
  /** Owner athlete id; undefined = General (workspace, no athlete). */
  clientId?: string;
  client?: CoachClient;
  task: TaskFields;
};

export type TaskRef = { id: string; clientId?: string };

const pad = (n: number) => String(n).padStart(2, "0");
const isoNow = () => new Date().toISOString();
const taskId = () => `task-${crypto.randomUUID()}`;
/** Local naive datetime used by reminderAt (matches the shared DateTimeField). */
const localDateTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** JS Date convention: Sunday = 0 … Saturday = 6. */
const weekdayOf = (date: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 =>
  new Date(`${date}T12:00:00Z`).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** JS weekday → offset from Monday (Mon = 0 … Sun = 6) for week math. */
const fromMonday = (weekday: number) => (weekday + 6) % 7;
const dayDiff = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000,
  );
const isDay = (v: string | undefined): v is string =>
  !!v &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
/** Shift the date part of a `YYYY-MM-DD[THH:mm…]` value, keeping any time. */
const shiftDays = (iso: string, days: number) =>
  `${addLocalDays(iso.slice(0, 10), days)}${iso.slice(10)}`;

export function listTasks(
  state: CoachState,
  options: { includeArchived?: boolean } = {},
): TaskEntry[] {
  const entries: TaskEntry[] = [];
  const clientById = new Map(state.clients.map((c) => [c.id, c]));
  for (const task of state.coachTodos ?? []) {
    const client = task.clientId ? clientById.get(task.clientId) : undefined;
    if (client?.archived && !options.includeArchived) continue;
    entries.push({ clientId: task.clientId, client, task });
  }
  for (const client of state.clients) {
    if (client.archived && !options.includeArchived) continue;
    for (const task of client.coachTasks)
      entries.push({ clientId: client.id, client, task });
  }
  return entries;
}

export function findTask(
  state: CoachState,
  ref: TaskRef,
): TaskEntry | undefined {
  return listTasks(state, { includeArchived: true }).find(
    (entry) =>
      entry.task.id === ref.id &&
      (ref.clientId === undefined || entry.clientId === ref.clientId),
  );
}

type Location = { where: "todos" } | { where: "client"; clientId: string };
function locate(state: CoachState, id: string): Location | null {
  if ((state.coachTodos ?? []).some((t) => t.id === id))
    return { where: "todos" };
  for (const client of state.clients)
    if (client.coachTasks.some((t) => t.id === id))
      return { where: "client", clientId: client.id };
  return null;
}

function insertAt<T>(list: T[], index: number, item: T): T[] {
  return [
    ...list.slice(0, Math.min(index, list.length)),
    item,
    ...list.slice(Math.min(index, list.length)),
  ];
}

/** Upsert a task owned by `clientId` (undefined = General). The record stays
 * in its current storage location when it can; only a real owner change
 * moves it. */
export function saveTask(
  state: CoachState,
  task: TaskFields,
  clientId: string | undefined,
): CoachState {
  const stored = { ...task };
  if (clientId) stored.clientId = clientId;
  else delete stored.clientId;
  const at = locate(state, task.id);
  if (at?.where === "todos") {
    return {
      ...state,
      coachTodos: (state.coachTodos ?? []).map((t) =>
        t.id === task.id ? stored : t,
      ),
    };
  }
  if (at?.where === "client" && at.clientId === clientId) {
    const forAthlete = { ...stored };
    delete forAthlete.clientId;
    return {
      ...state,
      clients: state.clients.map((c) =>
        c.id === clientId
          ? {
              ...c,
              coachTasks: c.coachTasks.map((t) =>
                t.id === task.id ? forAthlete : t,
              ),
            }
          : c,
      ),
    };
  }
  const removed = removeTaskRecord(state, task.id);
  return appendTask(removed, stored, clientId);
}

function appendTask(
  state: CoachState,
  task: TaskFields,
  clientId: string | undefined,
): CoachState {
  if (!clientId)
    return { ...state, coachTodos: [...(state.coachTodos ?? []), task] };
  const forAthlete = { ...task };
  delete forAthlete.clientId;
  return {
    ...state,
    clients: state.clients.map((c) =>
      c.id === clientId
        ? { ...c, coachTasks: [...c.coachTasks, forAthlete] }
        : c,
    ),
  };
}

function removeTaskRecord(state: CoachState, id: string): CoachState {
  if ((state.coachTodos ?? []).some((t) => t.id === id))
    return {
      ...state,
      coachTodos: (state.coachTodos ?? []).filter((t) => t.id !== id),
    };
  return {
    ...state,
    clients: state.clients.map((c) =>
      c.coachTasks.some((t) => t.id === id)
        ? { ...c, coachTasks: c.coachTasks.filter((t) => t.id !== id) }
        : c,
    ),
  };
}

export function moveTask(
  state: CoachState,
  entry: TaskEntry,
  clientId: string | undefined,
): CoachState {
  return saveTask(state, entry.task, clientId);
}

export type RemovedTask = {
  task: TaskFields;
  clientId?: string;
  where: "todos" | "client";
  index: number;
};

export function deleteTask(
  state: CoachState,
  ref: TaskRef,
): { state: CoachState; removed?: RemovedTask } {
  const todosIndex = (state.coachTodos ?? []).findIndex((t) => t.id === ref.id);
  if (todosIndex >= 0) {
    const task = (state.coachTodos ?? [])[todosIndex];
    return {
      state: {
        ...state,
        coachTodos: (state.coachTodos ?? []).filter((t) => t.id !== ref.id),
      },
      removed: {
        task,
        clientId: task.clientId,
        where: "todos",
        index: todosIndex,
      },
    };
  }
  for (const client of state.clients) {
    const index = client.coachTasks.findIndex((t) => t.id === ref.id);
    if (index >= 0) {
      const task = client.coachTasks[index];
      return {
        state: {
          ...state,
          clients: state.clients.map((c) =>
            c.id === client.id
              ? {
                  ...c,
                  coachTasks: c.coachTasks.filter((t) => t.id !== ref.id),
                }
              : c,
          ),
        },
        removed: { task, clientId: client.id, where: "client", index },
      };
    }
  }
  return { state };
}

export function restoreTask(
  state: CoachState,
  removed: RemovedTask,
): CoachState {
  if (
    removed.where === "client" &&
    removed.clientId &&
    state.clients.some((c) => c.id === removed.clientId)
  ) {
    const copy = { ...removed.task };
    delete copy.clientId;
    return {
      ...state,
      clients: state.clients.map((c) =>
        c.id === removed.clientId
          ? { ...c, coachTasks: insertAt(c.coachTasks, removed.index, copy) }
          : c,
      ),
    };
  }
  return {
    ...state,
    coachTodos: insertAt(state.coachTodos ?? [], removed.index, {
      ...removed.task,
    }),
  };
}

// --- Recurrence ------------------------------------------------------------

const sortedWeekdays = (repeat: TaskRepeat) =>
  [...(repeat.weekdays ?? [])].sort((a, b) => a - b);
const repeatInterval = (repeat: TaskRepeat) =>
  Math.max(1, Math.floor(repeat.interval) || 1);

/** First occurrence strictly after `after`. */
export function nextOccurrence(after: string, repeat: TaskRepeat): string {
  const interval = repeatInterval(repeat);
  if (repeat.unit === "day") return addLocalDays(after, interval);
  if (repeat.unit === "month") return addMonths(after, interval);
  const weekdays = sortedWeekdays(repeat);
  if (!weekdays.length) return addLocalDays(after, 7 * interval);
  const anchor = mondayOf(after);
  const afterOffset = fromMonday(weekdayOf(after));
  const offsets = weekdays.map(fromMonday).sort((a, b) => a - b);
  for (const offset of offsets)
    if (offset > afterOffset) return addLocalDays(anchor, offset);
  return addLocalDays(anchor, 7 * interval + offsets[0]);
}

/** First occurrence on or after `date`, anchoring interval repeats at `date`. */
export function occurrenceOnOrAfter(date: string, repeat: TaskRepeat): string {
  const weekdays = sortedWeekdays(repeat);
  if (
    repeat.unit === "week" &&
    weekdays.length &&
    !weekdays.includes(weekdayOf(date))
  ) {
    const anchor = mondayOf(date);
    const offsets = weekdays.map(fromMonday).sort((a, b) => a - b);
    const later = offsets.find(
      (offset) => offset > fromMonday(weekdayOf(date)),
    );
    if (later !== undefined) return addLocalDays(anchor, later);
    return addLocalDays(anchor, 7 * repeatInterval(repeat) + offsets[0]);
  }
  return date;
}

/** Deadline for the next occurrence after completing `task`, per the spec:
 * from the scheduled date by default, from today for completion repeats, and
 * overdue schedules skip forward to the first occurrence after today. */
export function advanceTaskDeadline(
  deadline: string,
  repeat: TaskRepeat,
  today: string,
): string {
  let next = nextOccurrence(repeat.fromCompletion ? today : deadline, repeat);
  while (next <= today) next = nextOccurrence(next, repeat);
  return next;
}

export type ToggleInverse = {
  ref: TaskRef;
  previous: TaskFields;
  copyId?: string;
};

export function toggleTask(
  state: CoachState,
  entry: TaskEntry,
  today: string,
  now: string = isoNow(),
): { state: CoachState; inverse?: ToggleInverse } {
  const { task, clientId } = entry;
  const ref = { id: task.id, clientId };
  if (task.complete) {
    const previous = { ...task };
    const restored = { ...task, complete: false };
    delete restored.completedAt;
    return {
      state: saveTask(state, restored, clientId),
      inverse: { ref, previous },
    };
  }
  const previous = { ...task };
  if (task.repeat && task.deadline) {
    const next = advanceTaskDeadline(task.deadline, task.repeat, today);
    const completedCopy: TaskFields = {
      ...task,
      id: taskId(),
      complete: true,
      completedAt: now,
      createdAt: now,
    };
    delete completedCopy.repeat;
    delete completedCopy.reminderAt;
    delete completedCopy.reminderShownAt;
    const advanced: TaskFields = { ...task, deadline: next };
    if (task.reminderAt) {
      advanced.reminderAt = shiftDays(
        task.reminderAt,
        dayDiff(next, task.deadline),
      );
      delete advanced.reminderShownAt;
    }
    const refForInsert = { id: task.id, clientId };
    const located = locate(state, refForInsert.id);
    const withAdvanced = saveTask(state, advanced, clientId);
    let withCopy: CoachState;
    if (located?.where === "todos") {
      const index = (withAdvanced.coachTodos ?? []).findIndex(
        (t) => t.id === task.id,
      );
      const copy = { ...completedCopy };
      if (clientId) copy.clientId = clientId;
      withCopy = {
        ...withAdvanced,
        coachTodos: insertAt(withAdvanced.coachTodos ?? [], index + 1, copy),
      };
    } else {
      withCopy = {
        ...withAdvanced,
        clients: withAdvanced.clients.map((c) => {
          if (c.id !== clientId) return c;
          const index = c.coachTasks.findIndex((t) => t.id === task.id);
          const copy = { ...completedCopy };
          delete copy.clientId;
          return {
            ...c,
            coachTasks: insertAt(c.coachTasks, index + 1, copy),
          };
        }),
      };
    }
    return {
      state: withCopy,
      inverse: { ref, previous, copyId: completedCopy.id },
    };
  }
  return {
    state: saveTask(
      state,
      { ...task, complete: true, completedAt: now },
      clientId,
    ),
    inverse: { ref, previous },
  };
}

export function undoToggle(
  state: CoachState,
  inverse: ToggleInverse,
): CoachState {
  const withoutCopy = inverse.copyId
    ? removeTaskRecord(state, inverse.copyId)
    : state;
  return saveTask(withoutCopy, inverse.previous, inverse.ref.clientId);
}

/** Set every listed overdue open task's deadline to today. Returns the moved
 * entries with their previous deadlines so the change can be undone. */
export function rescheduleOverdue(
  state: CoachState,
  entries: TaskEntry[],
  today: string,
): {
  state: CoachState;
  moved: { ref: TaskRef; previousDeadline: string }[];
} {
  const moved: { ref: TaskRef; previousDeadline: string }[] = [];
  let next = state;
  for (const entry of entries) {
    const { task, clientId } = entry;
    if (task.complete || !task.deadline || task.deadline >= today) continue;
    moved.push({
      ref: { id: task.id, clientId },
      previousDeadline: task.deadline,
    });
    next = saveTask(next, { ...task, deadline: today }, clientId);
  }
  return { state: next, moved };
}

// --- Views -----------------------------------------------------------------

export type TaskViewId = "today" | "upcoming" | "anytime" | "completed";
export type TaskGroup = { id: string; label: string; items: TaskEntry[] };
export type TaskViews = {
  today: { groups: TaskGroup[]; count: number };
  upcoming: { groups: TaskGroup[]; count: number };
  anytime: { items: TaskEntry[]; count: number };
  completed: { groups: TaskGroup[]; count: number };
};

const byOpenOrder = (
  a: { entry: TaskEntry; index: number },
  b: { entry: TaskEntry; index: number },
) =>
  Number(b.entry.task.priority === "high") -
    Number(a.entry.task.priority === "high") ||
  (a.entry.task.reminderAt ?? "￿").localeCompare(
    b.entry.task.reminderAt ?? "￿",
  ) ||
  (a.entry.task.createdAt ?? "￿").localeCompare(
    b.entry.task.createdAt ?? "￿",
  ) ||
  a.index - b.index;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});
const WEEKDAY_LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  timeZone: "UTC",
});
const dayName = (date: string, long = false) =>
  (long ? WEEKDAY_LONG : WEEKDAY_SHORT).format(new Date(`${date}T12:00:00Z`));

/** "Today" / "Tomorrow" / "Yesterday" / weekday within the next 6 days /
 * short date, with the year added when it differs. */
export function relativeDay(date: string, today: string): string {
  const diff = dayDiff(date, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff >= 2 && diff <= 6) return dayName(date, true);
  return formatDate(date, {
    year: date.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined,
  });
}

export function overdueLabel(date: string, today: string): string {
  const days = Math.max(1, dayDiff(today, date));
  return `Overdue · ${days} ${days === 1 ? "day" : "days"}`;
}

/** Short repeat description for the task row meta line. */
export function repeatLabel(repeat: TaskRepeat): string {
  const interval = repeatInterval(repeat);
  const suffix = repeat.fromCompletion ? " · after done" : "";
  if (repeat.unit === "day")
    return `${interval === 1 ? "Daily" : `Every ${interval} days`}${suffix}`;
  if (repeat.unit === "week") {
    const weekdays = sortedWeekdays(repeat);
    if (weekdays.length)
      return `${weekdays.map((w) => WEEKDAY_NAMES[w].slice(0, 3)).join("/")} weekly${suffix}`;
    return `${interval === 1 ? "Weekly" : `Every ${interval} weeks`}${suffix}`;
  }
  return `${interval === 1 ? "Monthly" : `Every ${interval} months`}${suffix}`;
}

export function taskViews(entries: TaskEntry[], today: string): TaskViews {
  const indexed = entries.map((entry, index) => ({ entry, index }));
  const overdue = indexed
    .filter(
      ({ entry }) =>
        !entry.task.complete &&
        isDay(entry.task.deadline) &&
        (entry.task.deadline as string) < today,
    )
    .sort(
      (a, b) =>
        (a.entry.task.deadline as string).localeCompare(
          b.entry.task.deadline as string,
        ) || byOpenOrder(a, b),
    )
    .map(({ entry }) => entry);
  const dueToday = indexed
    .filter(
      ({ entry }) => !entry.task.complete && entry.task.deadline === today,
    )
    .sort(byOpenOrder)
    .map(({ entry }) => entry);

  const dayBuckets = new Map<string, TaskEntry[]>();
  const weekBuckets = new Map<string, TaskEntry[]>();
  const dayLimit = addLocalDays(today, 14);
  const upcoming = indexed.filter(
    ({ entry }) =>
      !entry.task.complete &&
      isDay(entry.task.deadline) &&
      (entry.task.deadline as string) > today,
  );
  for (const { entry } of upcoming) {
    const deadline = entry.task.deadline as string;
    if (deadline <= dayLimit) {
      const bucket = dayBuckets.get(deadline) ?? [];
      bucket.push(entry);
      dayBuckets.set(deadline, bucket);
    } else {
      const week = mondayOf(deadline);
      const bucket = weekBuckets.get(week) ?? [];
      bucket.push(entry);
      weekBuckets.set(week, bucket);
    }
  }
  const upcomingGroups: TaskGroup[] = [
    ...[...dayBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        id: `day:${date}`,
        label:
          date === addLocalDays(today, 1)
            ? "Tomorrow"
            : `${dayName(date)} ${formatDate(date)}`,
        items,
      })),
    ...[...weekBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, items]) => ({
        id: `week:${week}`,
        label: `Week of ${formatDate(week)}`,
        items,
      })),
  ];
  for (const group of upcomingGroups)
    group.items = indexed
      .filter(({ entry }) => group.items.includes(entry))
      .sort(byOpenOrder)
      .map(({ entry }) => entry);

  const anytime = indexed
    .filter(({ entry }) => !entry.task.complete && !isDay(entry.task.deadline))
    .sort(
      (a, b) =>
        Number(b.entry.task.priority === "high") -
          Number(a.entry.task.priority === "high") ||
        (b.entry.task.createdAt ?? "").localeCompare(
          a.entry.task.createdAt ?? "",
        ) ||
        b.index - a.index,
    )
    .map(({ entry }) => entry);

  const doneBuckets = new Map<string, TaskEntry[]>();
  const undated: TaskEntry[] = [];
  for (const { entry } of indexed.filter(({ entry }) => entry.task.complete)) {
    const day = entry.task.completedAt?.slice(0, 10);
    if (day && isDay(day)) {
      const bucket = doneBuckets.get(day) ?? [];
      bucket.push(entry);
      doneBuckets.set(day, bucket);
    } else undated.push(entry);
  }
  const completedGroups: TaskGroup[] = [...doneBuckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, items]) => ({
      id: `done:${day}`,
      label: relativeDay(day, today),
      items: items.sort((a, b) =>
        (b.task.completedAt ?? "").localeCompare(a.task.completedAt ?? ""),
      ),
    }));
  if (undated.length)
    completedGroups.push({
      id: "done:earlier",
      label: "Earlier",
      items: undated,
    });

  const openCount = (list: TaskEntry[]) => list.length;
  return {
    today: {
      groups: [
        ...(overdue.length
          ? [{ id: "overdue", label: "Overdue", items: overdue }]
          : []),
        ...(dueToday.length
          ? [{ id: "today", label: "Today", items: dueToday }]
          : []),
      ],
      count: openCount([...overdue, ...dueToday]),
    },
    upcoming: {
      groups: upcomingGroups,
      count: upcoming.length,
    },
    anytime: { items: anytime, count: anytime.length },
    completed: {
      groups: completedGroups,
      count: indexed.filter(({ entry }) => entry.task.complete).length,
    },
  };
}

export function searchTasks(entries: TaskEntry[], query: string): TaskEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (entry) =>
      entry.task.title.toLowerCase().includes(q) ||
      (entry.client?.name ?? "").toLowerCase().includes(q),
  );
}

export function filterTasks(entries: TaskEntry[], filter: string): TaskEntry[] {
  if (filter === "all") return entries;
  if (filter === "general") return entries.filter((e) => !e.clientId);
  return entries.filter((e) => e.clientId === filter);
}

export function todayCount(state: CoachState, today: string): number {
  return listTasks(state).filter(
    (entry) =>
      !entry.task.complete &&
      isDay(entry.task.deadline) &&
      (entry.task.deadline as string) <= today,
  ).length;
}

// --- Reminders -------------------------------------------------------------

export function dueReminders(state: CoachState, now: number): TaskEntry[] {
  return listTasks(state).filter(
    (entry) =>
      !entry.task.complete &&
      entry.task.reminderAt &&
      Date.parse(entry.task.reminderAt) <= now &&
      !entry.task.reminderShownAt,
  );
}

export function markRemindersShown(
  state: CoachState,
  entries: TaskEntry[],
  shownAt: string = isoNow(),
): CoachState {
  let next = state;
  for (const entry of entries)
    next = saveTask(
      next,
      { ...entry.task, reminderShownAt: shownAt },
      entry.clientId,
    );
  return next;
}

export function snoozeReminder(
  state: CoachState,
  entry: TaskEntry,
  until: Date,
): CoachState {
  const task = { ...entry.task, reminderAt: localDateTime(until) };
  delete task.reminderShownAt;
  return saveTask(state, task, entry.clientId);
}

// --- Quick add -------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};
const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};
const MONTH_PATTERN = Object.keys(MONTHS).join("|");
const WEEKDAY_PATTERN = Object.keys(WEEKDAYS).join("|");

export type QuickToken = {
  key: string;
  start: number;
  end: number;
  kind: "athlete" | "date" | "repeat" | "reminder" | "priority";
  label: string;
};
export type QuickAddFields = {
  title: string;
  deadline?: string;
  repeat?: TaskRepeat;
  reminderAt?: string;
  priority?: "high";
  clientId?: string;
  tokens: QuickToken[];
};

type Candidate = QuickToken & {
  date?: string;
  repeat?: TaskRepeat;
  time?: string;
  clientId?: string;
};

const overlap = (a: Candidate, b: Candidate) =>
  a.start < b.end && b.start < a.end;

const addMonths = (date: string, months: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDate();
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
};

/** Athletes matching a partial `@` token: starts-with matches first, then
 * contains matches, each in roster order. */
export function matchAthletes(
  partial: string,
  athletes: { id: string; name: string }[],
): { id: string; name: string }[] {
  const q = partial.trim().toLowerCase();
  if (!q) return athletes;
  const first = athletes.filter((a) => {
    const name = a.name.toLowerCase();
    return (
      name.startsWith(q) ||
      name.split(/\s+/).some((word) => word.startsWith(q)) ||
      name.replace(/\s+/g, "").startsWith(q.replace(/\s+/g, ""))
    );
  });
  const rest = athletes.filter(
    (a) => !first.includes(a) && a.name.toLowerCase().includes(q),
  );
  return [...first, ...rest];
}

export function parseQuickAdd(
  text: string,
  athletes: { id: string; name: string }[],
  today: string,
  disabled: ReadonlySet<string> = new Set(),
): QuickAddFields {
  const candidates: Candidate[] = [];
  const push = (re: RegExp, make: (m: RegExpExecArray) => Candidate | null) => {
    re.lastIndex = 0;
    let m = re.exec(text);
    while (m) {
      const candidate = make(m);
      if (candidate) candidates.push(candidate);
      if (m[0].length === 0) re.lastIndex += 1;
      m = re.exec(text);
    }
  };

  // Repeat: every[!] [N|other] day|week|month|weekday[s]
  push(
    new RegExp(
      `\\bevery(!)?\\s+(?:(\\d+|other)\\s+)?(${WEEKDAY_PATTERN}|day|week|month)s?\\b`,
      "gi",
    ),
    (m) => {
      const interval = m[2] === "other" ? 2 : m[2] ? Number(m[2]) : 1;
      const unit = m[3].toLowerCase();
      const repeat: TaskRepeat =
        unit in WEEKDAYS
          ? {
              unit: "week",
              interval,
              weekdays: [WEEKDAYS[unit] as 0 | 1 | 2 | 3 | 4 | 5 | 6],
            }
          : { unit: unit as "day" | "week" | "month", interval };
      if (m[1]) repeat.fromCompletion = true;
      const unitLabel = unit in WEEKDAYS ? WEEKDAY_NAMES[WEEKDAYS[unit]] : unit;
      const label =
        `${m[2] ? `Every ${interval}` : "Every"} ${unitLabel}` +
        `${interval > 1 && !(unit in WEEKDAYS) ? "s" : ""}` +
        `${m[1] ? " · from completion" : ""}`;
      return {
        key: `repeat:${m.index}`,
        start: m.index,
        end: m.index + m[0].length,
        kind: "repeat",
        label,
        repeat,
      };
    },
  );
  // Date phrases
  push(/\bnext\s+week\b/gi, (m) => ({
    key: `date:${m.index}`,
    start: m.index,
    end: m.index + m[0].length,
    kind: "date",
    label: `${dayName(addLocalDays(mondayOf(today), 7))} ${formatDate(addLocalDays(mondayOf(today), 7))}`,
    date: addLocalDays(mondayOf(today), 7),
  }));
  push(/\b(today|tod)\b/gi, (m) => ({
    key: `date:${m.index}`,
    start: m.index,
    end: m.index + m[0].length,
    kind: "date",
    label: "Today",
    date: today,
  }));
  push(/\b(tomorrow|tom)\b/gi, (m) => ({
    key: `date:${m.index}`,
    start: m.index,
    end: m.index + m[0].length,
    kind: "date",
    label: "Tomorrow",
    date: addLocalDays(today, 1),
  }));
  push(/\bin\s+(\d+)\s+(day|week|month)s?\b/gi, (m) => {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const date =
      unit === "day"
        ? addLocalDays(today, n)
        : unit === "week"
          ? addLocalDays(today, 7 * n)
          : addMonths(today, n);
    return {
      key: `date:${m.index}`,
      start: m.index,
      end: m.index + m[0].length,
      kind: "date",
      label: `${dayName(date)} ${formatDate(date)}`,
      date,
    };
  });
  // <day> <month> / <month> <day>, optional year
  push(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\b(?:\\s+(\\d{4}))?|\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s+(\\d{4}))?`,
      "gi",
    ),
    (m) => {
      const day = Number(m[1] ?? m[5]);
      const month = MONTHS[(m[2] ?? m[4]).toLowerCase()];
      if (!day || day > 31 || month === undefined) return null;
      let year = Number(m[3] ?? m[6]) || Number(today.slice(0, 4));
      let date = `${year}-${pad(month + 1)}-${pad(Math.min(day, 31))}`;
      if (!isDay(date)) return null;
      if (!m[3] && !m[6] && date < today) {
        year += 1;
        date = `${year}-${pad(month + 1)}-${pad(day)}`;
      }
      return {
        key: `date:${m.index}`,
        start: m.index,
        end: m.index + m[0].length,
        kind: "date",
        label: `${dayName(date)} ${formatDate(date, { year: date.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined })}`,
        date,
      };
    },
  );
  // d/m
  push(/\b(\d{1,2})\/(\d{1,2})\b/g, (m) => {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (!day || day > 31 || !month || month > 12) return null;
    const year = Number(today.slice(0, 4));
    let date = `${year}-${pad(month)}-${pad(day)}`;
    if (!isDay(date)) return null;
    if (date < today) date = `${year + 1}-${pad(month)}-${pad(day)}`;
    return {
      key: `date:${m.index}`,
      start: m.index,
      end: m.index + m[0].length,
      kind: "date",
      label: `${dayName(date)} ${formatDate(date, { year: date.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined })}`,
      date,
    };
  });
  // Bare weekday names
  push(new RegExp(`\\b(${WEEKDAY_PATTERN})\\b`, "gi"), (m) => {
    const target = WEEKDAYS[m[1].toLowerCase()];
    const current = weekdayOf(today);
    const offset = (target - current + 7) % 7;
    const date = addLocalDays(today, offset);
    return {
      key: `date:${m.index}`,
      start: m.index,
      end: m.index + m[0].length,
      kind: "date",
      label: offset === 0 ? "Today" : `${dayName(date)} ${formatDate(date)}`,
      date,
    };
  });
  // Reminders: "at 9", "at 18:30", "9am", "9:30pm", "18:30"
  push(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi, (m) => {
    let hour = Number(m[1]);
    const minute = Number(m[2] ?? 0);
    const meridiem = m[3]?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    const time = `${pad(hour)}:${pad(minute)}`;
    return {
      key: `reminder:${m.index}`,
      start: m.index,
      end: m.index + m[0].length,
      kind: "reminder",
      label: time,
      time,
    };
  });
  push(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b|\b(\d{1,2})\s*(am|pm)\b/gi, (m) => {
    let hour = Number(m[1] ?? m[4]);
    const minute = Number(m[2] ?? 0);
    const meridiem = (m[3] ?? m[5])?.toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    const time = `${pad(hour)}:${pad(minute)}`;
    return {
      key: `reminder:${m.index}`,
      start: m.index,
      end: m.index + m[0].length,
      kind: "reminder",
      label: time,
      time,
    };
  });
  // Priority: standalone ! or p1
  push(/(^|\s)(!|p1)(?=\s|$)/gi, (m) => {
    const start = m.index + m[1].length;
    return {
      key: `priority:${start}`,
      start,
      end: start + m[2].length,
      kind: "priority",
      label: "High priority",
    };
  });
  // Athletes: @token — only recognised when it matches an athlete; an
  // unmatched @word stays literal text.
  push(/@([^\s@]+)/g, (m) => {
    const athlete = matchAthletes(m[1], athletes)[0];
    if (!athlete) return null;
    return {
      key: `athlete:${m.index}`,
      start: m.index,
      end: m.index + m[0].length,
      kind: "athlete",
      label: athlete.name,
      clientId: athlete.id,
    };
  });

  // Resolve overlaps greedily: earliest start wins, longest span on ties.
  const enabled: Candidate[] = [];
  for (const c of candidates
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((c) => !disabled.has(c.key)))
    if (!enabled.some((k) => overlap(k, c))) enabled.push(c);

  const dateToken = enabled.find((c) => c.kind === "date");
  const repeatToken = enabled.find((c) => c.kind === "repeat");
  // A reminder needs a task date; without one the time stays literal text.
  const reminderToken =
    dateToken || repeatToken
      ? enabled.find((c) => c.kind === "reminder")
      : undefined;
  const active = enabled.filter(
    (c) => c.kind !== "reminder" || c === reminderToken,
  );
  const deadline =
    dateToken?.date ??
    (repeatToken?.repeat
      ? occurrenceOnOrAfter(today, repeatToken.repeat)
      : undefined);

  const title = text
    .split("")
    .map((ch, i) => (active.some((c) => i >= c.start && i < c.end) ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    deadline,
    repeat: repeatToken?.repeat,
    reminderAt:
      reminderToken && deadline
        ? `${deadline}T${reminderToken.time}`
        : undefined,
    priority: active.some((c) => c.kind === "priority") ? "high" : undefined,
    clientId: active.find((c) => c.kind === "athlete")?.clientId,
    tokens: active.map(({ key, start, end, kind, label }) => ({
      key,
      start,
      end,
      kind,
      label: kind === "reminder" ? `Reminder ${label}` : label,
    })),
  };
}
