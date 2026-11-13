import assert from "node:assert/strict";
import { test } from "node:test";
import { isCoachState, seedState } from "./model.ts";
import {
  advanceTaskDeadline,
  deleteTask,
  dueReminders,
  findTask,
  listTasks,
  markRemindersShown,
  moveTask,
  nextOccurrence,
  parseQuickAdd,
  rescheduleOverdue,
  resolveTaskParam,
  restoreTask,
  saveTask,
  snoozeReminder,
  taskParam,
  tasksById,
  taskViews,
  toggleTask,
  undoToggle,
  updateTask,
} from "./tasks-model.ts";

const TODAY = "2026-11-13"; // Friday
const athletes = [
  { id: "client-001", name: "Emma Anders" },
  { id: "client-007", name: "Amara Lewis" },
  { id: "client-010", name: "Theo Brandt" },
];

const workspaceState = (overrides = {}) => ({
  version: 1,
  coachTodos: [],
  coachNotes: [],
  templates: [],
  clients: [],
  extras: [],
  submissions: [],
  messages: [],
  drafts: {},
  reviewDrafts: {},
  editorDrafts: {},
  preferences: {
    mode: "dark",
    accent: "#EB91B8",
    availability: "",
    notifications: true,
    priorityNotifications: true,
  },
  ...overrides,
});

const client = (id, coachTasks = []) => ({
  id,
  name: athletes.find((a) => a.id === id)?.name ?? id,
  initials: "AA",
  label: "",
  phase: "",
  template: "",
  email: "",
  coachingSince: "2026-01-01",
  priorityMessages: false,
  archived: false,
  internalNotes: [],
  generalNotes: [],
  coachTasks,
  clientTasks: [],
  onboarding: [],
  schedules: [],
  plan: {
    calories: 2200,
    protein: 140,
    sets: 3,
    instructions: "",
    nutritionVariant: "Training day",
    program: "Week-based",
    weeks: 8,
  },
  entries: [],
  habits: [],
});

test("parseQuickAdd extracts athlete, date, repeat, reminder and priority", () => {
  const parsed = parseQuickAdd(
    "Review Theo's check-in fri @Theo at 9 p1",
    athletes,
    TODAY,
  );
  assert.equal(parsed.title, "Review Theo's check-in");
  assert.equal(parsed.clientId, "client-010");
  assert.equal(parsed.deadline, TODAY); // today is Friday: "fri" means today
  assert.equal(parsed.reminderAt, "2026-11-13T09:00");
  assert.equal(parsed.priority, "high");
  assert.deepEqual([...parsed.tokens.map((t) => t.kind)].sort(), [
    "athlete",
    "date",
    "priority",
    "reminder",
  ]);
});

test("parseQuickAdd dates: today, tomorrow, weekday, next week, in N, named dates", () => {
  assert.equal(parseQuickAdd("call today", [], TODAY).deadline, TODAY);
  assert.equal(parseQuickAdd("call tod", [], TODAY).deadline, TODAY);
  assert.equal(
    parseQuickAdd("call tomorrow", [], TODAY).deadline,
    "2026-11-14",
  );
  assert.equal(parseQuickAdd("call tom", [], TODAY).deadline, "2026-11-14");
  assert.equal(parseQuickAdd("call fri", [], TODAY).deadline, TODAY); // today is Friday
  assert.equal(parseQuickAdd("call mon", [], TODAY).deadline, "2026-11-16");
  assert.equal(
    parseQuickAdd("call next week", [], TODAY).deadline,
    "2026-11-16",
  );
  assert.equal(
    parseQuickAdd("call in 3 days", [], TODAY).deadline,
    "2026-11-16",
  );
  assert.equal(
    parseQuickAdd("call in 2 weeks", [], TODAY).deadline,
    "2026-11-27",
  );
  assert.equal(parseQuickAdd("call 17 oct", [], TODAY).deadline, "2027-10-17");
  assert.equal(parseQuickAdd("call oct 17", [], TODAY).deadline, "2027-10-17");
  assert.equal(parseQuickAdd("call 17/11", [], TODAY).deadline, "2026-11-17");
  assert.equal(parseQuickAdd("call 20 nov", [], TODAY).deadline, "2026-11-20");
});

test("parseQuickAdd recurrence: every day/week/weekday/month and every!", () => {
  const daily = parseQuickAdd("standup every day", [], TODAY);
  assert.deepEqual(daily.repeat, { unit: "day", interval: 1 });
  assert.equal(daily.deadline, TODAY); // next occurrence of "every day" is today
  const weekly = parseQuickAdd("review every mon", [], TODAY);
  assert.deepEqual(weekly.repeat, { unit: "week", interval: 1, weekdays: [1] });
  assert.equal(weekly.deadline, "2026-11-16"); // coming Monday
  const fortnightly = parseQuickAdd("plan every 2 weeks", [], TODAY);
  assert.deepEqual(fortnightly.repeat, { unit: "week", interval: 2 });
  const monthly = parseQuickAdd("photos every month", [], TODAY);
  assert.deepEqual(monthly.repeat, { unit: "month", interval: 1 });
  const fromCompletion = parseQuickAdd("plan every! week", [], TODAY);
  assert.deepEqual(fromCompletion.repeat, {
    unit: "week",
    interval: 1,
    fromCompletion: true,
  });
});

test("parseQuickAdd reminder needs a date; 'at 9', '9am', '18:30'", () => {
  assert.equal(
    parseQuickAdd("call tom at 9", [], TODAY).reminderAt,
    "2026-11-14T09:00",
  );
  assert.equal(
    parseQuickAdd("call tom 9am", [], TODAY).reminderAt,
    "2026-11-14T09:00",
  );
  assert.equal(
    parseQuickAdd("call tom 18:30", [], TODAY).reminderAt,
    "2026-11-14T18:30",
  );
  assert.equal(
    parseQuickAdd("call tom 5pm", [], TODAY).reminderAt,
    "2026-11-14T17:00",
  );
  const noDate = parseQuickAdd("call the lab 9am", [], TODAY);
  assert.equal(noDate.reminderAt, undefined);
  assert.equal(noDate.title, "call the lab 9am"); // stays literal
});

test("parseQuickAdd disables tokens so the text stays in the title", () => {
  const first = parseQuickAdd("Review monthly report fri", athletes, TODAY);
  assert.equal(first.deadline, TODAY); // today is Friday
  const dateToken = first.tokens.find((t) => t.kind === "date");
  assert.ok(dateToken);
  const second = parseQuickAdd(
    "Review monthly report fri",
    athletes,
    TODAY,
    new Set([dateToken.key]),
  );
  assert.equal(second.deadline, undefined);
  assert.equal(second.title, "Review monthly report fri");
  assert.equal(second.tokens.length, 0);
});

test("parseQuickAdd athlete fuzzy match and unmatched @ stays literal", () => {
  assert.equal(
    parseQuickAdd("check @amara", athletes, TODAY).clientId,
    "client-007",
  );
  assert.equal(
    parseQuickAdd("check @amara l", athletes, TODAY).clientId,
    "client-007",
  );
  const unmatched = parseQuickAdd("check @nobody", athletes, TODAY);
  assert.equal(unmatched.clientId, undefined);
  assert.equal(unmatched.title, "check @nobody");
});

test("listTasks merges workspace todos and athlete tasks; archived filtered", () => {
  const state = workspaceState({
    coachTodos: [
      { id: "t1", title: "general", complete: false },
      {
        id: "t2",
        title: "legacy link",
        complete: false,
        clientId: "client-001",
      },
    ],
    clients: [
      client("client-001", [{ id: "t3", title: "emma", complete: false }]),
      {
        ...client("client-009", [{ id: "t4", title: "old", complete: false }]),
        archived: true,
      },
    ],
  });
  const entries = listTasks(state);
  assert.deepEqual(
    entries.map((e) => e.task.id),
    ["t1", "t2", "t3"],
  );
  assert.equal(entries.find((e) => e.task.id === "t2")?.clientId, "client-001");
  const all = listTasks(state, { includeArchived: true });
  assert.equal(all.length, 4);
});

test("saveTask writes athlete tasks to client.coachTasks, general to coachTodos", () => {
  let state = workspaceState({ clients: [client("client-001")] });
  state = saveTask(
    state,
    { id: "a", title: "for emma", complete: false },
    "client-001",
  );
  assert.equal(state.clients[0].coachTasks.length, 1);
  assert.equal(state.coachTodos.length, 0);
  state = saveTask(
    state,
    { id: "b", title: "mine", complete: false },
    undefined,
  );
  assert.equal(state.coachTodos.length, 1);
});

test("moveTask relocates between scopes; legacy todos keep their home", () => {
  let state = workspaceState({
    coachTodos: [
      {
        id: "legacy",
        title: "linked",
        complete: false,
        clientId: "client-001",
      },
    ],
    clients: [
      client("client-001", [{ id: "owned", title: "emma", complete: false }]),
      client("client-010"),
    ],
  });
  const entries = listTasks(state);
  // Athlete-owned task moves to the other athlete.
  state = moveTask(
    state,
    entries.find((e) => e.task.id === "owned"),
    "client-010",
  );
  assert.equal(state.clients[0].coachTasks.length, 0);
  assert.equal(state.clients[1].coachTasks.length, 1);
  // Moving it to General puts it in coachTodos.
  state = moveTask(
    state,
    listTasks(state).find((e) => e.task.id === "owned"),
    undefined,
  );
  assert.equal(
    state.coachTodos.some((t) => t.id === "owned"),
    true,
  );
  // The legacy linked todo stays in coachTodos when re-owned.
  state = moveTask(
    state,
    listTasks(state).find((e) => e.task.id === "legacy"),
    "client-010",
  );
  const legacy = state.coachTodos.find((t) => t.id === "legacy");
  assert.equal(legacy.clientId, "client-010");
});

test("deleteTask + restoreTask round-trips both stores", () => {
  const state = workspaceState({
    coachTodos: [{ id: "w", title: "mine", complete: false }],
    clients: [
      client("client-001", [{ id: "a", title: "emma", complete: false }]),
    ],
  });
  const one = deleteTask(state, { id: "a", clientId: "client-001" });
  assert.equal(one.state.clients[0].coachTasks.length, 0);
  const back = restoreTask(one.state, one.removed);
  assert.equal(back.clients[0].coachTasks[0].id, "a");
  const two = deleteTask(back, { id: "w" });
  const back2 = restoreTask(two.state, two.removed);
  assert.equal(back2.coachTodos[0].id, "w");
});

test("toggleTask completes a plain task and restore reopens it", () => {
  let state = workspaceState({
    coachTodos: [{ id: "x", title: "job", complete: false }],
  });
  const entry = listTasks(state)[0];
  const done = toggleTask(state, entry, TODAY, "2026-11-13T10:00:00Z");
  state = done.state;
  assert.equal(state.coachTodos[0].complete, true);
  assert.equal(state.coachTodos[0].completedAt, "2026-11-13T10:00:00Z");
  const reopened = toggleTask(state, listTasks(state)[0], TODAY);
  assert.equal(reopened.state.coachTodos[0].complete, false);
  assert.equal(reopened.state.coachTodos[0].completedAt, undefined);
});

test("recurring completion keeps a completed copy and advances the original", () => {
  let state = workspaceState({
    coachTodos: [
      {
        id: "r",
        title: "weekly review",
        complete: false,
        deadline: "2026-11-13",
        reminderAt: "2026-11-13T09:00",
        repeat: { unit: "week", interval: 1 },
      },
    ],
  });
  const result = toggleTask(
    state,
    listTasks(state)[0],
    TODAY,
    "2026-11-13T10:30:00Z",
  );
  state = result.state;
  assert.equal(state.coachTodos.length, 2);
  const original = state.coachTodos.find((t) => t.id === "r");
  const copy = state.coachTodos.find((t) => t.id !== "r");
  assert.equal(original.complete, false);
  assert.equal(original.deadline, "2026-11-20");
  assert.equal(original.reminderAt, "2026-11-20T09:00"); // shifted with the date
  assert.equal(copy.complete, true);
  assert.equal(copy.completedAt, "2026-11-13T10:30:00Z");
  assert.equal(copy.deadline, "2026-11-13"); // the occurrence that was done
  assert.equal(copy.repeat, undefined);
  // Undo restores both records.
  const undone = undoToggle(state, result.inverse);
  assert.equal(undone.coachTodos.length, 1);
  assert.equal(undone.coachTodos[0].deadline, "2026-11-13");
  assert.equal(undone.coachTodos[0].complete, false);
});

test("overdue recurring completion skips to the first occurrence after today", () => {
  const deadline = advanceTaskDeadline(
    "2026-11-06",
    { unit: "week", interval: 1 },
    TODAY,
  );
  assert.equal(deadline, "2026-11-20"); // not 13th (today) — first after today
  const daily = advanceTaskDeadline(
    "2026-11-12",
    { unit: "day", interval: 1 },
    TODAY,
  );
  assert.equal(daily, "2026-11-14");
});

test("repeat-from-completion advances from today, not the scheduled date", () => {
  const next = advanceTaskDeadline(
    "2026-11-02",
    { unit: "week", interval: 1, fromCompletion: true },
    TODAY,
  );
  assert.equal(next, "2026-11-20"); // today + 7
});

test("nextOccurrence handles weekdays lists and month-end clamping", () => {
  assert.equal(
    nextOccurrence("2026-11-13", {
      unit: "week",
      interval: 1,
      weekdays: [0, 4],
    }),
    "2026-11-15", // Friday -> next listed weekday is Sunday
  );
  assert.equal(
    nextOccurrence("2026-11-13", {
      unit: "week",
      interval: 1,
      weekdays: [0, 5],
    }),
    "2026-11-15", // Friday -> Sunday of the same week
  );
  assert.equal(
    nextOccurrence("2026-01-31", { unit: "month", interval: 1 }),
    "2026-02-28",
  );
});

test("rescheduleOverdue moves only open overdue tasks to today", () => {
  const state = workspaceState({
    coachTodos: [
      { id: "a", title: "old", complete: false, deadline: "2026-11-10" },
      { id: "b", title: "today", complete: false, deadline: TODAY },
      { id: "c", title: "done", complete: true, deadline: "2026-11-01" },
      { id: "d", title: "later", complete: false, deadline: "2026-11-20" },
    ],
  });
  const { state: next, moved } = rescheduleOverdue(
    state,
    listTasks(state),
    TODAY,
  );
  assert.deepEqual(
    moved.map((m) => m.ref.id),
    ["a"],
  );
  assert.equal(next.coachTodos.find((t) => t.id === "a").deadline, TODAY);
  assert.equal(
    next.coachTodos.find((t) => t.id === "d").deadline,
    "2026-11-20",
  );
});

test("dueReminders fires once; snooze reschedules and clears the marker", () => {
  let state = workspaceState({
    coachTodos: [
      {
        id: "r1",
        title: "ping",
        complete: false,
        reminderAt: "2026-11-13T08:00",
      },
      {
        id: "r2",
        title: "later",
        complete: false,
        reminderAt: "2026-11-13T23:00",
      },
      {
        id: "r3",
        title: "already",
        complete: false,
        reminderAt: "2026-11-13T07:00",
        reminderShownAt: "2026-11-13T07:00:05Z",
      },
    ],
  });
  const now = Date.parse("2026-11-13T09:00");
  const due = dueReminders(state, now);
  assert.deepEqual(
    due.map((e) => e.task.id),
    ["r1"],
  );
  state = markRemindersShown(state, due, "2026-11-13T09:00:00Z");
  assert.equal(dueReminders(state, now).length, 0);
  // Snooze clears the marker and refires at the new time.
  const entry = listTasks(state).find((e) => e.task.id === "r1");
  state = snoozeReminder(state, entry, new Date("2026-11-13T10:00:00"));
  assert.equal(
    state.coachTodos.find((t) => t.id === "r1").reminderAt,
    "2026-11-13T10:00",
  );
  assert.equal(dueReminders(state, Date.parse("2026-11-13T10:00")).length, 1);
});

test("saved legacy workspaces validate without any new fields", () => {
  const state = seedState();
  assert.equal(isCoachState(state), true);
  // A workspace written before the Tasks feature: no new task fields at all.
  const legacy = {
    ...state,
    coachTodos: [
      { id: "old-1", title: "plain todo", complete: false },
      {
        id: "old-2",
        title: "with old fields",
        complete: true,
        deadline: "2026-10-01",
        reminderAt: "2026-10-01T09:00",
        notes: "legacy note",
        priority: "high",
        clientId: "client-001",
      },
    ],
    clients: state.clients.map((c) => ({
      ...c,
      coachTasks: [
        { id: `${c.id}-t`, title: "old athlete task", complete: false },
      ],
    })),
  };
  assert.equal(isCoachState(legacy), true);
  const entries = listTasks(legacy);
  assert.equal(
    entries.find((e) => e.task.id === "old-2")?.clientId,
    "client-001",
  );
});

test("new optional fields validate inside both task stores", () => {
  const state = workspaceState({
    coachTodos: [
      {
        id: "n1",
        title: "rich",
        complete: false,
        createdAt: "2026-11-10T08:00:00Z",
        repeat: {
          unit: "week",
          interval: 2,
          weekdays: [0, 3],
          fromCompletion: true,
        },
        reminderShownAt: "2026-11-10T09:00:00Z",
        checklist: [{ id: "c1", text: "step", done: false }],
        link: { kind: "check-in", id: "s1", label: "Check-in 10 Nov" },
      },
    ],
    clients: [
      client("client-001", [
        {
          id: "n2",
          title: "athlete rich",
          complete: true,
          completedAt: "2026-11-12T11:00:00Z",
        },
      ]),
    ],
  });
  assert.equal(isCoachState(state), true);
});

// --- P788/P789 regression coverage ------------------------------------------

test("toggle resolves the current record by scope+id; stale refs are no-ops", () => {
  const base = workspaceState({
    clients: [
      client("client-001", [
        { id: "dup", title: "A task", complete: false, deadline: TODAY },
      ]),
      client("client-007", [
        { id: "dup", title: "B task", complete: false, deadline: TODAY },
      ]),
    ],
    coachTodos: [
      { id: "dup", title: "G task", complete: false, deadline: TODAY },
    ],
  });
  // Each scoped ref toggles only its own record.
  const a = toggleTask(base, { id: "dup", clientId: "client-001" }, TODAY);
  assert.equal(
    findTask(a.state, { id: "dup", clientId: "client-001" })?.task.complete,
    true,
  );
  assert.equal(
    findTask(a.state, { id: "dup", clientId: "client-007" })?.task.complete,
    false,
  );
  assert.equal(
    findTask(a.state, { id: "dup", clientId: undefined })?.task.complete,
    false,
  );
  // A ref left over from before a move is a no-op, not a stale write.
  const moved = moveTask(
    a.state,
    { id: "dup", clientId: "client-001" },
    "client-007",
  );
  const stale = toggleTask(moved, { id: "dup", clientId: "client-001" }, TODAY);
  assert.equal(stale.state, moved);
  assert.equal(stale.inverse, undefined);
  assert.equal(tasksById(stale.state, "dup").length, 3);
});

test("immediate undo restores the exact task and preserves unrelated edits", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "t1",
        title: "original",
        complete: false,
        deadline: TODAY,
        createdAt: "2026-11-01T09:00",
      },
    ],
  });
  const toggled = toggleTask(base, { id: "t1" }, TODAY);
  // An unrelated edit lands after the toggle, then the coach hits undo.
  const edited = saveTask(
    toggled.state,
    { ...findTask(toggled.state, { id: "t1" }).task, title: "renamed" },
    undefined,
  );
  const undone = undoToggle(edited, toggled.inverse);
  const task = findTask(undone, { id: "t1" }).task;
  assert.equal(task.complete, false);
  assert.equal(task.completedAt, undefined);
  assert.equal(task.deadline, TODAY);
  assert.equal(task.title, "renamed"); // the post-toggle edit survives
});

test("delete during completion: undo does not resurrect the task", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "t1",
        title: "weekly",
        complete: false,
        deadline: TODAY,
        repeat: { unit: "week", interval: 1 },
        createdAt: "2026-11-01T09:00",
      },
    ],
  });
  const toggled = toggleTask(base, { id: "t1" }, TODAY);
  const deleted = deleteTask(toggled.state, { id: "t1" });
  assert.equal(findTask(deleted.state, { id: "t1" }), undefined);
  const undone = undoToggle(deleted.state, toggled.inverse);
  // Gone stays gone — the undo removes the completed copy but cannot
  // bring back a deleted record.
  assert.equal(findTask(undone, { id: "t1" }), undefined);
  assert.equal(tasksById(undone, toggled.inverse.copyId).length, 0);
});

test("move during completion: undo restores fields at the new owner", () => {
  const base = workspaceState({
    clients: [
      client("client-001", [
        {
          id: "t1",
          title: "weekly",
          complete: false,
          deadline: TODAY,
          repeat: { unit: "week", interval: 1 },
        },
      ]),
      client("client-007"),
    ],
  });
  const toggled = toggleTask(base, { id: "t1", clientId: "client-001" }, TODAY);
  const moved = moveTask(
    toggled.state,
    { id: "t1", clientId: "client-001" },
    "client-007",
  );
  const undone = undoToggle(moved, toggled.inverse);
  const task = findTask(undone, { id: "t1", clientId: "client-007" })?.task;
  assert.ok(task);
  assert.equal(task.complete, false);
  assert.equal(task.deadline, TODAY); // pre-toggle deadline restored
  assert.equal(
    findTask(undone, { id: "t1", clientId: "client-001" }),
    undefined,
  );
  // And the completed copy moved with its owner... it stays where the
  // toggle wrote it; only the live record is owner-preserved on undo.
  assert.equal(tasksById(undone, toggled.inverse.copyId).length, 0);
});

test("double activation: one completion, one copy; un-toggle completes none", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "t1",
        title: "weekly",
        complete: false,
        deadline: TODAY,
        repeat: { unit: "week", interval: 1 },
      },
    ],
  });
  const once = toggleTask(base, { id: "t1" }, TODAY);
  const copies = listTasks(once.state).filter((e) => e.task.complete);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].task.id, once.inverse.copyId);
  // Re-activating the (already-advanced) live record completes the NEXT
  // occurrence — a distinct history row, never a duplicate of the first.
  const twice = toggleTask(once.state, { id: "t1" }, TODAY);
  const laterCopies = listTasks(twice.state).filter((e) => e.task.complete);
  assert.equal(laterCopies.length, 2);
  assert.notEqual(laterCopies[0].task.id, laterCopies[1].task.id);
});

test("recurring completion is lossless: copy keeps createdAt, drops lifecycle", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "t1",
        title: "weekly",
        complete: false,
        deadline: TODAY,
        createdAt: "2026-10-01T08:00",
        reminderAt: `${TODAY}T09:00`,
        reminderShownAt: `${TODAY}T09:00`,
        repeat: { unit: "week", interval: 1 },
        checklist: [{ id: "c1", text: "step", done: true }],
        link: { kind: "check-in", id: "s1", label: "Check-in" },
      },
    ],
  });
  const { state, inverse } = toggleTask(base, { id: "t1" }, TODAY);
  const copy = tasksById(state, inverse.copyId)[0].task;
  assert.equal(copy.createdAt, "2026-10-01T08:00"); // original, not "now"
  assert.equal(copy.complete, true);
  assert.ok(copy.completedAt);
  assert.equal(copy.repeat, undefined);
  assert.equal(copy.reminderAt, undefined);
  assert.equal(copy.reminderShownAt, undefined);
  assert.deepEqual(copy.checklist, [{ id: "c1", text: "step", done: true }]);
  const live = findTask(state, { id: "t1" }).task;
  assert.equal(live.complete, false);
  assert.equal(live.deadline, "2026-11-20");
  assert.equal(live.reminderAt, "2026-11-20T09:00");
  assert.equal(live.reminderShownAt, undefined);
});

test("a save never reverts an owner: pending edit writes at the current scope", () => {
  const base = workspaceState({
    clients: [
      client("client-001", [
        { id: "t1", title: "old", complete: false, deadline: TODAY },
      ]),
      client("client-007"),
    ],
  });
  const moved = moveTask(
    base,
    { id: "t1", clientId: "client-001" },
    "client-007",
  );
  // A debounced save that still carries the OLD scope must write the
  // record where it now lives, not drag it back to client-001.
  const saved = saveTask(
    moved,
    { id: "t1", title: "new", complete: false, deadline: TODAY },
    "client-001",
  );
  assert.equal(
    findTask(saved, { id: "t1", clientId: "client-007" })?.task.title,
    "new",
  );
  assert.equal(
    findTask(saved, { id: "t1", clientId: "client-001" }),
    undefined,
  );
});

test("reminder rescheduling clears the marker; unrelated edits keep it", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "t1",
        title: "check-in",
        complete: false,
        deadline: TODAY,
        reminderAt: `${TODAY}T09:00`,
        reminderShownAt: `${TODAY}T09:00`,
      },
    ],
  });
  const entry = findTask(base, { id: "t1" }).task;
  // Unrelated edit — caller does not even carry the marker field — the
  // marker survives because the reminder time did not change.
  const edited = saveTask(
    base,
    { ...entry, title: "renamed", reminderShownAt: undefined },
    undefined,
  );
  assert.equal(
    findTask(edited, { id: "t1" }).task.reminderShownAt,
    `${TODAY}T09:00`,
  );
  assert.equal(dueReminders(edited, Date.now()).length, 0);
  // Moving the reminder to a new time re-arms it exactly once.
  const rescheduled = saveTask(
    edited,
    { ...entry, reminderAt: `${TODAY}T10:00` },
    undefined,
  );
  assert.equal(
    findTask(rescheduled, { id: "t1" }).task.reminderShownAt,
    undefined,
  );
  assert.equal(
    dueReminders(rescheduled, Date.parse(`${TODAY}T10:00`)).length,
    1,
  );
});

test("snooze reschedules and re-arms; shown marker persists across reload", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "t1",
        title: "remind me",
        complete: false,
        deadline: TODAY,
        reminderAt: `${TODAY}T09:00`,
      },
    ],
  });
  const due = dueReminders(base, Date.parse(`${TODAY}T09:01`));
  assert.equal(due.length, 1);
  const shown = markRemindersShown(base, due, `${TODAY}T09:01`);
  assert.equal(dueReminders(shown, Date.parse(`${TODAY}T23:00`)).length, 0);
  // The marker lives on the record — a "reload" re-reading the same
  // state must not fire again.
  assert.equal(
    findTask(shown, { id: "t1" }).task.reminderShownAt,
    `${TODAY}T09:01`,
  );
  const snoozed = snoozeReminder(
    shown,
    { id: "t1" },
    new Date(Date.parse(`${TODAY}T10:00`)),
  );
  const task = findTask(snoozed, { id: "t1" }).task;
  assert.equal(task.reminderAt, `${TODAY}T10:00`);
  assert.equal(task.reminderShownAt, undefined);
  assert.equal(dueReminders(snoozed, Date.parse(`${TODAY}T09:30`)).length, 0);
  assert.equal(dueReminders(snoozed, Date.parse(`${TODAY}T10:05`)).length, 1);
});

test("completed grouping uses the local day, same basis as Today", () => {
  const late = {
    id: "t1",
    title: "late finish",
    complete: true,
    completedAt: `${TODAY}T23:55`,
  };
  const early = {
    id: "t2",
    title: "next-day finish",
    complete: true,
    completedAt: "2026-11-14T00:10",
  };
  const state = workspaceState({ coachTodos: [late, early] });
  const views = taskViews(listTasks(state), TODAY);
  const lateGroup = views.completed.groups.find((g) =>
    g.items.some((e) => e.task.id === "t1"),
  );
  const earlyGroup = views.completed.groups.find((g) =>
    g.items.some((e) => e.task.id === "t2"),
  );
  assert.equal(lateGroup.id, `done:${TODAY}`);
  assert.equal(lateGroup.label, "Today");
  assert.equal(earlyGroup.id, "done:2026-11-14");
  // The same rows label correctly from the next day's perspective too.
  const nextViews = taskViews(listTasks(state), "2026-11-14");
  const lateThen = nextViews.completed.groups.find((g) =>
    g.items.some((e) => e.task.id === "t1"),
  );
  assert.equal(lateThen.label, "Yesterday");
});

test("task params are scope-aware; bare ids resolve only when unique", () => {
  const state = workspaceState({
    coachTodos: [
      { id: "dup", title: "general", complete: false },
      { id: "uniq", title: "only one", complete: false },
    ],
    clients: [
      client("client-001", [{ id: "dup", title: "athlete", complete: false }]),
    ],
  });
  const entries = listTasks(state, { includeArchived: true });
  const general = entries.find((e) => e.task.id === "dup" && !e.clientId);
  const athlete = entries.find((e) => e.task.id === "dup" && e.clientId);
  const unique = entries.find((e) => e.task.id === "uniq");
  assert.equal(taskParam(general, entries), "general:dup");
  assert.equal(taskParam(athlete, entries), "client-001:dup");
  assert.equal(taskParam(unique, entries), "uniq"); // unambiguous stays bare
  assert.equal(resolveTaskParam(entries, "general:dup").task.title, "general");
  assert.equal(
    resolveTaskParam(entries, "client-001:dup").task.title,
    "athlete",
  );
  assert.equal(resolveTaskParam(entries, "uniq").task.title, "only one");
  // A stale bare link to a now-duplicated id opens nothing rather than
  // the wrong athlete's task.
  assert.equal(resolveTaskParam(entries, "dup"), undefined);
});

test("quick add @token binds only unique matches; ambiguous stays literal", () => {
  const ambiguous = parseQuickAdd("check @a in", athletes, TODAY);
  assert.equal(ambiguous.clientId, undefined);
  assert.equal(ambiguous.title, "check @a in");
  const unique = parseQuickAdd("check @em", athletes, TODAY);
  assert.equal(unique.clientId, "client-001");
  assert.equal(unique.title, "check");
});

// --- P791 closure: O1 pending saves, O2/O4 scoped undo, O5 ghosts ---------
// These exercise the exact model calls the detail panel's debounce flush
// and unmount cleanup make: updateTask(ref, fields). The ref-and-fields
// binding lives in TaskDetail; there is no DOM harness in this repo, so the
// switch/delete/move/Snooze paths below are model-level evidence.

test("updateTask merges only edited fields on the exact scoped record", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "dup",
        title: "general",
        complete: false,
        notes: "g-notes",
        deadline: TODAY,
      },
    ],
    clients: [
      client("client-001", [
        {
          id: "dup",
          title: "athlete",
          complete: false,
          notes: "a-notes",
          deadline: TODAY,
        },
      ]),
    ],
  });
  const next = updateTask(
    base,
    { id: "dup", clientId: "client-001" },
    { title: "renamed" },
  );
  const athlete = findTask(next, { id: "dup", clientId: "client-001" }).task;
  const general = findTask(next, { id: "dup", clientId: undefined }).task;
  assert.equal(athlete.title, "renamed");
  assert.equal(athlete.notes, "a-notes"); // unedited field untouched
  assert.equal(general.title, "general"); // same-id record untouched
});

test("updateTask never creates and never moves — late writes are no-ops", () => {
  const base = workspaceState({
    clients: [
      client("client-001", [{ id: "t1", title: "task", complete: false }]),
      client("client-007"),
    ],
  });
  // Deleted record: a late debounced save must not resurrect or create.
  const deleted = deleteTask(base, { id: "t1", clientId: "client-001" });
  const late = updateTask(
    deleted.state,
    { id: "t1", clientId: "client-001" },
    {
      title: "stale",
    },
  );
  assert.equal(late, deleted.state);
  assert.equal(tasksById(late, "t1").length, 0);
  // Moved-away record: a save bound to the old scope is a no-op, not a
  // write-back to the former athlete.
  const moved = moveTask(
    base,
    { id: "t1", clientId: "client-001" },
    "client-007",
  );
  const staleScope = updateTask(
    moved,
    { id: "t1", clientId: "client-001" },
    {
      title: "stale",
    },
  );
  assert.equal(staleScope, moved);
  // The same save bound to the CURRENT scope preserves the edit.
  const currentScope = updateTask(
    moved,
    { id: "t1", clientId: "client-007" },
    { title: "kept" },
  );
  assert.equal(
    findTask(currentScope, { id: "t1", clientId: "client-007" }).task.title,
    "kept",
  );
});

test("pending field saves cannot overwrite fields they did not edit", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "t1",
        title: "original",
        complete: false,
        notes: "keep me",
        deadline: TODAY,
        reminderAt: `${TODAY}T09:00`,
        reminderShownAt: `${TODAY}T09:00`,
      },
    ],
  });
  // An external write lands "during the debounce window": reminder marked.
  let next = saveTask(
    base,
    {
      ...findTask(base, { id: "t1" }).task,
      notes: "external change",
    },
    undefined,
  );
  // The pending flush carries only the edited title.
  next = updateTask(next, { id: "t1" }, { title: "debounced title" });
  const task = findTask(next, { id: "t1" }).task;
  assert.equal(task.title, "debounced title");
  assert.equal(task.notes, "external change"); // not rolled back
  assert.equal(task.reminderShownAt, `${TODAY}T09:00`); // marker kept
});

test("task-switch: A's flush writes A; B's draft never lands on A", () => {
  const base = workspaceState({
    coachTodos: [
      { id: "a", title: "A", complete: false, notes: "a" },
      { id: "b", title: "B", complete: false, notes: "b" },
    ],
  });
  // The unmount cleanup for A's detail instance flushes A's edited fields
  // at A's scope — even if selection already moved to B.
  let next = updateTask(base, { id: "a" }, { title: "A edited" });
  next = updateTask(next, { id: "b" }, { notes: "B edited" });
  assert.equal(findTask(next, { id: "a" }).task.title, "A edited");
  assert.equal(findTask(next, { id: "a" }).task.notes, "a");
  assert.equal(findTask(next, { id: "b" }).task.notes, "B edited");
  assert.equal(findTask(next, { id: "b" }).task.title, "B");
});

test("undo hits the exact occurrence when ids collide across scopes", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "dup",
        title: "general copy",
        complete: false,
        deadline: TODAY,
        createdAt: "2026-11-01T08:00",
      },
    ],
    clients: [
      client("client-001", [
        {
          id: "dup",
          title: "athlete copy",
          complete: false,
          deadline: TODAY,
          createdAt: "2026-11-02T08:00",
        },
      ]),
    ],
  });
  const toggled = toggleTask(
    base,
    { id: "dup", clientId: "client-001" },
    TODAY,
  );
  const undone = undoToggle(toggled.state, toggled.inverse);
  assert.equal(
    findTask(undone, { id: "dup", clientId: "client-001" }).task.complete,
    false,
  );
  assert.equal(
    findTask(undone, { id: "dup", clientId: undefined }).task.complete,
    false,
  );
  assert.equal(
    findTask(undone, { id: "dup", clientId: undefined }).task.completedAt,
    undefined,
  );
});

test("undo after a move targets the moved record via signature, not bare id", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "dup",
        title: "lookalike",
        complete: false,
        deadline: TODAY,
        createdAt: "2026-11-01T08:00",
      },
    ],
    clients: [
      client("client-001", [
        {
          id: "dup",
          title: "distinct",
          complete: false,
          deadline: TODAY,
          createdAt: "2026-11-02T08:00",
        },
      ]),
      client("client-007"),
    ],
  });
  const toggled = toggleTask(
    base,
    { id: "dup", clientId: "client-001" },
    TODAY,
  );
  const moved = moveTask(
    toggled.state,
    { id: "dup", clientId: "client-001" },
    "client-007",
  );
  const undone = undoToggle(moved, toggled.inverse);
  // The toggled record is restored where it now lives; the lookalike
  // same-id record in General is never touched.
  const atB = findTask(undone, { id: "dup", clientId: "client-007" }).task;
  assert.equal(atB.complete, false);
  assert.equal(atB.title, "distinct");
  const general = findTask(undone, { id: "dup", clientId: undefined }).task;
  assert.equal(general.complete, false);
  assert.equal(general.title, "lookalike");
});

test("undo refuses ambiguous same-id lookalikes rather than corrupting", () => {
  // Two same-id records with identical signatures: after a move the undo
  // cannot prove which occurrence it belongs to, so it no-ops.
  const record = (title) => ({
    id: "dup",
    title,
    complete: false,
    deadline: TODAY,
    createdAt: "2026-11-01T08:00",
  });
  const base = workspaceState({
    coachTodos: [record("same")],
    clients: [client("client-001", [record("same")]), client("client-007")],
  });
  const toggled = toggleTask(
    base,
    { id: "dup", clientId: "client-001" },
    TODAY,
  );
  const moved = moveTask(
    toggled.state,
    { id: "dup", clientId: "client-001" },
    "client-007",
  );
  const undone = undoToggle(moved, toggled.inverse);
  // Both records remain in their toggled/moved state — nothing rewritten.
  assert.equal(
    findTask(undone, { id: "dup", clientId: "client-007" }).task.complete,
    true,
  );
  assert.equal(
    findTask(undone, { id: "dup", clientId: undefined }).task.complete,
    false,
  );
});

test("ghosts render the struck-through snapshot while the live record moves on", () => {
  const base = workspaceState({
    coachTodos: [
      {
        id: "t1",
        title: "weekly",
        complete: false,
        deadline: TODAY,
        repeat: { unit: "week", interval: 1 },
      },
      { id: "t2", title: "plain", complete: false, deadline: TODAY },
    ],
  });
  // Weekly completes: live record advances to next week, ghost keeps the
  // today-bucket row for the animation.
  const toggled = toggleTask(base, { id: "t1" }, TODAY);
  const entries = listTasks(toggled.state);
  const ghost = entries.find((e) => e.task.id === "t1" && !e.task.complete);
  const ghosts = [
    {
      ...ghost,
      ghost: true,
      task: { ...ghost.task, deadline: TODAY },
    },
  ];
  const views = taskViews(entries, TODAY, { ghosts });
  const todayItems = views.today.groups.flatMap((g) => g.items);
  const ghostRow = todayItems.find((e) => e.ghost);
  assert.ok(ghostRow);
  assert.equal(ghostRow.task.deadline, TODAY);
  // The advanced live record is NOT in Today — it moved to next week.
  assert.equal(
    todayItems.some((e) => e.task.id === "t1" && !e.ghost),
    false,
  );
  // And the ghost never lands in Completed — it's open-snapshot data.
  assert.equal(
    views.completed.groups.flatMap((g) => g.items).some((e) => e.ghost),
    false,
  );
  // A non-recurring completion leaves only the ghost in the open view —
  // the ghost row is built from pre-toggle snapshot data, not the live
  // (now completed) record.
  const plainToggled = toggleTask(base, { id: "t2" }, TODAY);
  const plainEntries = listTasks(plainToggled.state);
  const plainGhost = [
    {
      ...plainEntries.find((e) => e.task.id === "t2"),
      ghost: true,
      task: {
        ...plainEntries.find((e) => e.task.id === "t2").task,
        complete: false,
        completedAt: undefined,
      },
    },
  ];
  assert.equal(
    plainEntries.filter((e) => e.task.id === "t2" && !e.task.complete).length,
    0,
  );
  const plainViews = taskViews(plainEntries, TODAY, { ghosts: plainGhost });
  const plainToday = plainViews.today.groups.flatMap((g) => g.items);
  assert.equal(plainToday.find((e) => e.task.id === "t2").ghost, true);
});
