import assert from "node:assert/strict";
import { test } from "node:test";
import { isCoachState, seedState } from "./model.ts";
import {
  advanceTaskDeadline,
  deleteTask,
  dueReminders,
  listTasks,
  markRemindersShown,
  moveTask,
  nextOccurrence,
  parseQuickAdd,
  rescheduleOverdue,
  restoreTask,
  saveTask,
  snoozeReminder,
  toggleTask,
  undoToggle,
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
