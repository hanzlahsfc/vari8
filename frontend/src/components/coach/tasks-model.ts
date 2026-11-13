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
  /** Display-only snapshot of a task mid complete-out animation. Ghosts
   * render the struck-through pre-toggle row; they never write to state. */
  ghost?: boolean;
};

export type TaskRef = { id: string; clientId?: string };

/** Stable scope+id key — unique even when ids collide across owners. */
export const taskKey = (ref: TaskRef | TaskEntry) =>
  `${ref.clientId ?? ""}${"task" in ref ? ref.task.id : ref.id}`;

const pad = (n: number) => String(n).padStart(2, "0");
/** Local naive datetime used by task timestamps (matches DateTimeField). */
export const localDateTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isoNow = () => localDateTime(new Date());
const taskId = () => `task-${crypto.randomUUID()}`;
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
/** Local calendar day of a date or datetime value. Day strings return
 * unchanged; naive datetimes parse as local time; zoned datetimes convert to
 * the device's local day so Completed groups on the same basis as Today. */
export function localDayOf(value: string | undefined): string {
  if (!value) return "";
  if (isDay(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}
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

/** Find a task by scope and id: `ref.clientId` undefined means the General
 * scope, so an athlete-owned task sharing the id is never matched by
 * accident. For unscoped lookups use `tasksById`. */
export function findTask(
  state: CoachState,
  ref: TaskRef,
): TaskEntry | undefined {
  return listTasks(state, { includeArchived: true }).find(
    (entry) => entry.task.id === ref.id && entry.clientId === ref.clientId,
  );
}

/** Every task carrying `id`, regardless of owner. */
export function tasksById(state: CoachState, id: string): TaskEntry[] {
  return listTasks(state, { includeArchived: true }).filter(
    (entry) => entry.task.id === id,
  );
}

type TaskRefish = TaskRef | TaskEntry;
const refOf = (input: TaskRefish): TaskRef => ({
  id: "task" in input ? input.task.id : input.id,
  clientId: input.clientId,
});

type Located = {
  where: "todos" | "client";
  /** Owning client of the record's scope; undefined = General. */
  clientId?: string;
  index: number;
  task: TaskFields;
};
/** Locate the stored record addressed by an owner-scoped ref. General refs
 * only match coachTodos entries without a clientId; athlete refs match that
 * athlete's coachTasks plus legacy coachTodos entries carrying the id. */
function locateRecord(state: CoachState, ref: TaskRef): Located | null {
  const todosIndex = (state.coachTodos ?? []).findIndex(
    (t) => t.id === ref.id && (t.clientId ?? undefined) === ref.clientId,
  );
  if (todosIndex >= 0)
    return {
      where: "todos",
      clientId: (state.coachTodos ?? [])[todosIndex].clientId,
      index: todosIndex,
      task: (state.coachTodos ?? [])[todosIndex],
    };
  if (ref.clientId) {
    const client = state.clients.find((c) => c.id === ref.clientId);
    const index = client?.coachTasks.findIndex((t) => t.id === ref.id) ?? -1;
    if (client && index >= 0)
      return {
        where: "client",
        clientId: client.id,
        index,
        task: client.coachTasks[index],
      };
  }
  return null;
}

/** Locate a stored record by id alone, preferring the `prefer` owner scope.
 * Used when the current owner is unknown (e.g. a move between scopes). */
function locateById(
  state: CoachState,
  id: string,
  prefer?: string,
): Located | null {
  const preferred = locateRecord(state, { id, clientId: prefer });
  if (preferred) return preferred;
  for (const entry of listTasks(state, { includeArchived: true }))
    if (entry.task.id === id)
      return locateRecord(state, { id, clientId: entry.clientId });
  return null;
}

function insertAt<T>(list: T[], index: number, item: T): T[] {
  return [
    ...list.slice(0, Math.min(index, list.length)),
    item,
    ...list.slice(Math.min(index, list.length)),
  ];
}

type StoredTask = { clientId?: string } & TaskFields;

/** Normalize a would-be stored record to its location: ownership follows
 * where the record lives (saves never move), and the reminder shown-marker
 * resets only when the reminder time itself changes. */
function normalizeWrite(at: Located, stored: StoredTask): StoredTask {
  if (at.where === "todos") {
    if (at.clientId) stored.clientId = at.clientId;
    else delete stored.clientId;
  } else {
    delete stored.clientId;
  }
  if ((at.task.reminderAt ?? "") !== (stored.reminderAt ?? "")) {
    // Rescheduled reminder may fire again; snoozes set a new time.
    delete stored.reminderShownAt;
  } else if (stored.reminderShownAt === undefined) {
    // Unrelated edits that never touched the marker keep the stored one —
    // an explicit write (markRemindersShown) or reschedule still works.
    stored.reminderShownAt = at.task.reminderShownAt;
  }
  return stored;
}

/** Merge a field-scoped patch onto the current record; undefined-valued
 * keys delete the field. */
function applyEdits(at: Located, fields: Partial<TaskFields>): StoredTask {
  const stored: StoredTask = { ...at.task };
  for (const [key, value] of Object.entries(fields) as [
    keyof TaskFields,
    unknown,
  ][]) {
    if (value === undefined) delete stored[key];
    else (stored as Record<string, unknown>)[key] = value;
  }
  return normalizeWrite(at, stored);
}

function writeLocated(
  state: CoachState,
  at: Located,
  stored: StoredTask,
): CoachState {
  if (at.where === "todos")
    return {
      ...state,
      coachTodos: (state.coachTodos ?? []).map((t, i) =>
        i === at.index ? stored : t,
      ),
    };
  return {
    ...state,
    clients: state.clients.map((c) =>
      c.id === at.clientId
        ? {
            ...c,
            coachTasks: c.coachTasks.map((t, i) =>
              i === at.index ? stored : t,
            ),
          }
        : c,
    ),
  };
}

/** Update an existing record addressed by an exact scoped ref, merging only
 * `fields` (undefined-valued keys delete). Never creates, never moves, and
 * never searches beyond the ref's scope — a late write for a deleted or
 * moved-away task is a no-op, and only the edited fields can overwrite. */
export function updateTask(
  state: CoachState,
  ref: TaskRef,
  fields: Partial<TaskFields>,
): CoachState {
  const at = locateRecord(state, ref);
  if (!at) return state;
  return writeLocated(state, at, applyEdits(at, fields));
}

/** Write a task into `clientId`'s scope (undefined = General) for NEW tasks.
 * Existing records update in place wherever they live — ownership is never
 * silently changed by a save, only by `moveTask`. Rescheduling a reminder
 * clears its shown marker; unrelated edits keep it. Prefer `updateTask`
 * for edits to an existing record: it never creates and stays scoped. */
export function saveTask(
  state: CoachState,
  task: TaskFields,
  clientId: string | undefined,
): CoachState {
  const at = locateById(state, task.id, clientId);
  if (at) return writeLocated(state, at, normalizeWrite(at, { ...task }));
  const fresh = { ...task };
  if (clientId) fresh.clientId = clientId;
  else delete fresh.clientId;
  // A brand-new record must never carry a pending completion binding —
  // duplicating a task mid-animation cannot let an old Undo act on it.
  delete fresh.undoToken;
  return appendTask(state, fresh, clientId);
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

function removeLocated(state: CoachState, at: Located): CoachState {
  if (at.where === "todos")
    return {
      ...state,
      coachTodos: (state.coachTodos ?? []).filter((_, i) => i !== at.index),
    };
  return {
    ...state,
    clients: state.clients.map((c) =>
      c.id === at.clientId
        ? {
            ...c,
            coachTasks: c.coachTasks.filter((_, i) => i !== at.index),
          }
        : c,
    ),
  };
}

function removeTaskRecord(state: CoachState, id: string): CoachState {
  const at = locateById(state, id);
  return at ? removeLocated(state, at) : state;
}

export type MoveResult =
  | { state: CoachState; moved: true }
  | {
      state: CoachState;
      moved: false;
      /** Why the move was rejected — the UI reports this and keeps editing. */
      reason: "source-gone" | "no-destination" | "id-conflict";
    };

/** Move a task to `clientId`'s scope (undefined = General), applying any
 * pending field edits to the verified source in the same transition. The
 * source is resolved by exact scoped ref and the destination validated
 * BEFORE anything is removed, appended or edited: a missing source is a
 * no-op (never recreated, never writes another task), a nonexistent
 * destination rejects without touching the source, and a destination that
 * already holds a record with the same id rejects instead of overwriting
 * it or creating a duplicate id inside the scope. Success is explicit —
 * callers must check `moved`, never infer it from an id lookup. Legacy
 * coachTodos records keep their storage home and re-point their clientId
 * in place; client-owned records relocate between owners. */
export function moveTask(
  state: CoachState,
  ref: TaskRefish,
  clientId: string | undefined,
  fields?: Partial<TaskFields>,
): MoveResult {
  const resolved = refOf(ref);
  const at = locateRecord(state, resolved);
  if (!at) return { state, moved: false, reason: "source-gone" };
  if (clientId && !state.clients.some((c) => c.id === clientId))
    return { state, moved: false, reason: "no-destination" };
  if ((at.clientId ?? undefined) === clientId) {
    // Same scope is not a move — but pending edits still apply in place.
    return {
      state: fields ? writeLocated(state, at, applyEdits(at, fields)) : state,
      moved: true,
    };
  }
  // Scopes differ, so a record found at the destination scope is always a
  // DIFFERENT record — collision, not the source.
  if (locateRecord(state, { id: resolved.id, clientId }))
    return { state, moved: false, reason: "id-conflict" };
  const stored = applyEdits(at, fields ?? {});
  const moved = { ...stored };
  if (clientId) moved.clientId = clientId;
  else delete moved.clientId;
  if (at.where === "todos")
    return {
      state: {
        ...state,
        coachTodos: (state.coachTodos ?? []).map((t, i) =>
          i === at.index ? moved : t,
        ),
      },
      moved: true,
    };
  return {
    state: appendTask(removeLocated(state, at), moved, clientId),
    moved: true,
  };
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
  const at = locateRecord(state, ref);
  if (!at) return { state };
  return {
    state: removeLocated(state, at),
    removed: {
      task: at.task,
      clientId: at.clientId,
      where: at.where,
      index: at.index,
    },
  };
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
    delete copy.undoToken;
    return {
      ...state,
      clients: state.clients.map((c) =>
        c.id === removed.clientId
          ? { ...c, coachTasks: insertAt(c.coachTasks, removed.index, copy) }
          : c,
      ),
    };
  }
  const restored = { ...removed.task };
  delete restored.undoToken;
  return {
    ...state,
    coachTodos: insertAt(state.coachTodos ?? [], removed.index, restored),
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
  /** Unique token stamped on the record by this toggle (`undoToken`). It
   * travels with the record through moves and survives edits, but a
   * different record in the same slot never inherits it — undo binds to
   * this operation's task, nothing else. */
  op: string;
};

/** Flip a task's completion in a single state transition. The record is
 * resolved inside by scope and id, so the write always applies to the
 * current task — concurrent edits are preserved and a ref whose record was
 * moved or deleted in the meantime is a no-op instead of a stale write. */
export function toggleTask(
  state: CoachState,
  input: TaskRefish,
  today: string,
  now: string = isoNow(),
): { state: CoachState; inverse?: ToggleInverse; completed?: boolean } {
  const ref = refOf(input);
  const at = locateRecord(state, ref);
  if (!at) return { state };
  const task = at.task;
  const clientId = at.clientId;
  const op = taskId();
  if (task.complete) {
    const previous = { ...task };
    return {
      state: updateTask(state, ref, {
        complete: false,
        completedAt: undefined,
        undoToken: op,
      }),
      inverse: { ref: { id: task.id, clientId }, previous, op },
      completed: false,
    };
  }
  const previous = { ...task };
  if (task.repeat && task.deadline) {
    const next = advanceTaskDeadline(task.deadline, task.repeat, today);
    // The completed copy records the occurrence: no repeat, no reminder, and
    // it keeps the original createdAt rather than inventing a new one.
    const completedCopy: TaskFields = {
      ...task,
      id: taskId(),
      complete: true,
      completedAt: now,
    };
    delete completedCopy.repeat;
    delete completedCopy.reminderAt;
    delete completedCopy.reminderShownAt;
    delete completedCopy.undoToken;
    const advanced: TaskFields = { ...task, deadline: next };
    if (task.reminderAt) {
      advanced.reminderAt = shiftDays(
        task.reminderAt,
        dayDiff(next, task.deadline),
      );
      delete advanced.reminderShownAt;
    }
    const withAdvanced = updateTask(state, ref, {
      deadline: next,
      reminderAt: advanced.reminderAt,
      reminderShownAt: undefined,
      undoToken: op,
    });
    const relocated = locateRecord(withAdvanced, { id: task.id, clientId });
    const copy = { ...completedCopy };
    let withCopy: CoachState;
    if (relocated?.where === "client" && relocated.clientId) {
      delete copy.clientId;
      withCopy = {
        ...withAdvanced,
        clients: withAdvanced.clients.map((c) =>
          c.id === relocated.clientId
            ? {
                ...c,
                coachTasks: insertAt(c.coachTasks, relocated.index + 1, copy),
              }
            : c,
        ),
      };
    } else {
      if (clientId) copy.clientId = clientId;
      withCopy = {
        ...withAdvanced,
        coachTodos: insertAt(
          withAdvanced.coachTodos ?? [],
          (relocated?.index ?? -1) + 1,
          copy,
        ),
      };
    }
    return {
      state: withCopy,
      inverse: {
        ref: { id: task.id, clientId },
        previous,
        copyId: completedCopy.id,
        op,
      },
      completed: true,
    };
  }
  return {
    state: updateTask(state, ref, {
      complete: true,
      completedAt: now,
      undoToken: op,
    }),
    inverse: { ref: { id: task.id, clientId }, previous, op },
    completed: true,
  };
}

/** Find the record stamped with this operation's `undoToken`. The token
 * is written by `toggleTask`, travels with the record through moves and
 * survives edits, and is never inherited by another record — a same-id
 * replacement in the old slot or a superseding toggle leaves no match. */
function locateByToken(
  state: CoachState,
  id: string,
  token: string,
): Located | null {
  const todos = state.coachTodos ?? [];
  const todosIndex = todos.findIndex(
    (t) => t.id === id && t.undoToken === token,
  );
  if (todosIndex >= 0)
    return {
      where: "todos",
      clientId: todos[todosIndex].clientId,
      index: todosIndex,
      task: todos[todosIndex],
    };
  for (const client of state.clients) {
    const tasks = client.coachTasks as TaskFields[];
    const index = tasks.findIndex((t) => t.id === id && t.undoToken === token);
    if (index >= 0)
      return {
        where: "client",
        clientId: client.id,
        index,
        task: client.coachTasks[index],
      };
  }
  return null;
}

/** Reverse a toggle — but only while the live record still owns the exact
 * completion operation. The `undoToken` is verified BEFORE history or the
 * record are touched: a stale, superseded or missing operation leaves
 * both the task and its completed copy unchanged. On a match, the
 * operation-owned copy (unique id, never collides) is removed and only
 * the fields the toggle changed are re-applied to the current record —
 * edits after the toggle, and a move to another athlete, survive. */
export function undoToggle(
  state: CoachState,
  inverse: ToggleInverse,
): CoachState {
  if (!locateByToken(state, inverse.ref.id, inverse.op)) return state;
  const withoutCopy = inverse.copyId
    ? removeTaskRecord(state, inverse.copyId)
    : state;
  const current = locateByToken(withoutCopy, inverse.ref.id, inverse.op);
  if (!current) return withoutCopy;
  const stored: StoredTask = {
    ...current.task,
    complete: inverse.previous.complete,
    deadline: inverse.previous.deadline,
  };
  if (inverse.previous.completedAt)
    stored.completedAt = inverse.previous.completedAt;
  else delete stored.completedAt;
  if (inverse.previous.reminderAt)
    stored.reminderAt = inverse.previous.reminderAt;
  else delete stored.reminderAt;
  if (inverse.previous.reminderShownAt)
    stored.reminderShownAt = inverse.previous.reminderShownAt;
  else delete stored.reminderShownAt;
  delete stored.undoToken;
  return writeLocated(withoutCopy, current, stored);
}

/** Set every listed overdue open task's deadline to today. Refs resolve to
 * the current record inside the update, so tasks that moved or were edited
 * since the list rendered stay consistent. Returns the moved refs with
 * their previous deadlines so the change can be undone. */
export function rescheduleOverdue(
  state: CoachState,
  refs: (TaskRef | TaskEntry)[],
  today: string,
): {
  state: CoachState;
  moved: { ref: TaskRef; previousDeadline: string }[];
} {
  const moved: { ref: TaskRef; previousDeadline: string }[] = [];
  let next = state;
  for (const input of refs) {
    const ref = refOf(input);
    const at = locateRecord(next, ref);
    const task = at?.task;
    const clientId = at?.clientId;
    if (!task || task.complete || !task.deadline || task.deadline >= today)
      continue;
    moved.push({
      ref: { id: task.id, clientId },
      previousDeadline: task.deadline,
    });
    next = updateTask(next, ref, { deadline: today });
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

export function taskViews(
  entries: TaskEntry[],
  today: string,
  options: { ghosts?: TaskEntry[] } = {},
): TaskViews {
  // Ghosts are pre-toggle snapshots kept for the ~600 ms strike-through.
  // They group by their own (old) deadline like any open entry — the live
  // record meanwhile lands wherever its current fields put it — and they
  // can never complete again because the row renders them inert.
  const pool = [...entries, ...(options.ghosts ?? [])];
  const indexed = pool.map((entry, index) => ({ entry, index }));
  const isOpen = (entry: TaskEntry) => !entry.task.complete || !!entry.ghost;
  const overdue = indexed
    .filter(
      ({ entry }) =>
        isOpen(entry) &&
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
    .filter(({ entry }) => isOpen(entry) && entry.task.deadline === today)
    .sort(byOpenOrder)
    .map(({ entry }) => entry);

  const dayBuckets = new Map<string, TaskEntry[]>();
  const weekBuckets = new Map<string, TaskEntry[]>();
  const dayLimit = addLocalDays(today, 14);
  const upcoming = indexed.filter(
    ({ entry }) =>
      isOpen(entry) &&
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
    .filter(({ entry }) => isOpen(entry) && !isDay(entry.task.deadline))
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
    const day = localDayOf(entry.task.completedAt);
    if (day) {
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
      count: overdue.length + dueToday.length,
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
  entries: (TaskEntry | TaskRef)[],
  shownAt: string = isoNow(),
): CoachState {
  let next = state;
  for (const input of entries) {
    const ref = refOf(input);
    if (!locateRecord(next, ref)) continue;
    next = updateTask(next, ref, { reminderShownAt: shownAt });
  }
  return next;
}

/** Snooze a reminder: new reminderAt, shown marker cleared so it fires once
 * at the new time. Resolves the current record by ref. */
export function snoozeReminder(
  state: CoachState,
  input: TaskRefish,
  until: Date,
): CoachState {
  const ref = refOf(input);
  if (!locateRecord(state, ref)) return state;
  return updateTask(state, ref, {
    reminderAt: localDateTime(until),
    reminderShownAt: undefined,
  });
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
  // Athletes: @token — binds only when the match is unique; an unmatched or
  // ambiguous @word stays literal so a partial can never silently pick the
  // first roster entry. The suggestion list handles choosing among matches.
  push(/@([^\s@]+)/g, (m) => {
    const matches = matchAthletes(m[1], athletes);
    if (matches.length !== 1) return null;
    const athlete = matches[0];
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

// --- URL task params -------------------------------------------------------

/** Serialize a selection for the `task` route param. Bare ids stay readable
 * and backward-compatible; a `scope:id` prefix is only added when the id is
 * not unique across owners. */
export function taskParam(entry: TaskEntry, all: TaskEntry[]): string {
  const ambiguous = all.some(
    (other) => other.task.id === entry.task.id && other !== entry,
  );
  return ambiguous
    ? `${entry.clientId ?? "general"}:${entry.task.id}`
    : entry.task.id;
}

/** Resolve a `task` route param to an entry. `scope:id` params are exact;
 * bare ids only resolve when unique so a colliding link cannot open the
 * wrong athlete's task. */
export function resolveTaskParam(
  entries: TaskEntry[],
  param: string | undefined,
): TaskEntry | undefined {
  if (!param) return undefined;
  const scoped = /^([^:]+):(.+)$/.exec(param);
  if (scoped) {
    const clientId = scoped[1] === "general" ? undefined : scoped[1];
    return entries.find(
      (entry) => entry.task.id === scoped[2] && entry.clientId === clientId,
    );
  }
  const matches = entries.filter((entry) => entry.task.id === param);
  return matches.length === 1 ? matches[0] : undefined;
}
