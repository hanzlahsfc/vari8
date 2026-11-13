"use client";

import {
  ArrowUpRight,
  AtSign,
  Bell,
  CalendarDays,
  Check,
  Flag,
  Pencil,
  Plus,
  Repeat,
  X,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Checkbox,
  DropdownMenu,
  Input,
  SegmentedControl,
} from "../vari8/components";
import {
  DatePicker,
  DateTimePicker,
  SearchableSelect,
  TextArea,
} from "../vari8/inputs";
import { Section } from "../vari8/layouts";
import {
  type CoachClient,
  formatDate,
  type TaskFields,
  type TaskRepeat,
  uid,
} from "./model";
import { useCoach } from "./store";
import { localToday } from "./targets/model";
import {
  deleteTask,
  filterTasks,
  findTask,
  listTasks,
  localDateTime,
  localDayOf,
  matchAthletes,
  moveLocksEntry,
  occurrenceOnOrAfter,
  overdueLabel,
  parseQuickAdd,
  type RemovedTask,
  relativeDay,
  repeatLabel,
  rescheduleOverdue,
  resolveTaskParam,
  restoreTask,
  saveTask,
  searchTasks,
  snoozeReminder,
  type TaskEntry,
  type TaskRef,
  type TaskViewId,
  type ToggleInverse,
  taskKey,
  taskParam,
  taskViews,
  toggleTask,
  undoToggle,
  updateTask,
} from "./tasks-model";
import {
  Button,
  Dialog,
  Empty,
  IconButton,
  PageTitle,
  SearchBox,
  Select,
  Toggle,
} from "./ui";
import "./tasks.css";

const VIEW_OPTIONS: { id: TaskViewId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "anytime", label: "Anytime" },
  { id: "completed", label: "Completed" },
];

const isTaskView = (value?: string): value is TaskViewId =>
  !!value && VIEW_OPTIONS.some((option) => option.id === value);

const nowIso = () => localDateTime(new Date());

// --- Workspaces ------------------------------------------------------------

export function TasksWorkspace() {
  const { route, navigate } = useCoach();
  const view: TaskViewId = isTaskView(route.tab) ? route.tab : "today";
  const filter = route.client ?? "all";

  const update = (patch: {
    view?: TaskViewId;
    filter?: string;
    task?: string | null;
  }) => {
    const nextView = patch.view ?? view;
    const nextFilter = patch.filter ?? filter;
    const nextTask =
      patch.task === undefined ? route.task : (patch.task ?? undefined);
    navigate({
      section: "tasks",
      tab: nextView === "today" ? undefined : nextView,
      client: nextFilter === "all" ? undefined : nextFilter,
      task: nextTask,
    });
  };

  return (
    <Section className="cd-tasks-page">
      <PageTitle
        title="Tasks"
        description="What needs doing, and when. Dates, athletes and priorities can be typed straight into quick add."
      />
      <TasksView
        view={view}
        onView={(next) => update({ view: next })}
        filter={filter}
        onFilter={(next) => update({ filter: next })}
        selectedId={route.task ?? null}
        onSelect={(id) => update({ task: id })}
      />
    </Section>
  );
}

/** Shared task list + quick add for the athlete profile "Notes & tasks" tab.
 * Filtered to one athlete; coach-owned tasks only — athlete-assigned
 * `clientTasks` keep their existing separate UI. */
export function AthleteTasksPanel({ client }: { client: CoachClient }) {
  const [view, setView] = useState<TaskViewId>("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <TasksView
      fixedClientId={client.id}
      view={view}
      onView={setView}
      filter={client.id}
      onFilter={() => {}}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
}

// --- Shared view -----------------------------------------------------------

type PendingMove = {
  id: number;
  entry: TaskEntry;
  clientId: string | undefined;
};

function TasksView({
  fixedClientId,
  view,
  onView,
  filter,
  onFilter,
  selectedId,
  onSelect,
}: {
  fixedClientId?: string;
  view: TaskViewId;
  onView: (view: TaskViewId) => void;
  filter: string;
  onFilter: (filter: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const {
    state,
    setState,
    toast,
    navigate,
    requestMove,
    moveOutcome,
    ackMove,
  } = useCoach();
  const today = localToday();
  const reduced = useReducedMotion();
  const [search, setSearch] = useState("");
  // Pre-toggle snapshots kept for the ~600 ms strike-through. Display
  // only — ghost rows are inert and never write to the store.
  const [completing, setCompleting] = useState<ReadonlyMap<string, TaskEntry>>(
    new Map(),
  );
  // One timeout per ghost so undo (or delete) can cancel it immediately
  // instead of leaving a stale snapshot until the 600 ms expires.
  const completingTimers = useRef(new Map<string, number>());
  // The in-flight move request — used only to flag the pending editor
  // and gate duplicate submissions. The request itself goes to the store,
  // which commits the write and its outcome together (see coachCoreReducer);
  // `moveOutcomes` delivers that committed outcome to the right caller.
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const pendingMoveRef = useRef(false);
  const moveSeq = useRef(0);
  const handledMove = useRef(-1);
  const moveOutcomes = useRef(
    new Map<number, (moved: boolean, reason?: string) => void>(),
  );
  const [dayAdd, setDayAdd] = useState<string | null>(null);
  const [moveEntry, setMoveEntry] = useState<TaskEntry | null>(null);
  const quickRef = useRef<HTMLInputElement>(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // "N" focuses quick add when focus is not in a field.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']"))
        return;
      if (document.querySelector("[role='dialog']")) return;
      quickRef.current?.focus();
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const athletes = useMemo(
    () => state.clients.filter((c) => !c.archived),
    [state.clients],
  );
  const archived = useMemo(
    () => state.clients.filter((c) => c.archived),
    [state.clients],
  );
  const activeIds = useMemo(
    () => new Set(athletes.map((a) => a.id)),
    [athletes],
  );

  const entries = useMemo(
    () => listTasks(state, { includeArchived: true }),
    [state],
  );
  const visible = useMemo(
    () => searchTasks(filterTasks(entries, fixedClientId ?? filter), search),
    [entries, filter, fixedClientId, search],
  );
  // Archived athletes stay visible in Anytime/Completed history; Today and
  // Upcoming only show them when that athlete is explicitly filtered.
  const activePool = useMemo(
    () =>
      visible.filter(
        (e) =>
          !e.clientId || activeIds.has(e.clientId) || e.clientId === filter,
      ),
    [visible, activeIds, filter],
  );
  const views = useMemo(() => {
    const ghosts = [...completing.values()];
    return view === "today" || view === "upcoming"
      ? taskViews(activePool, today, { ghosts })
      : taskViews(visible, today, { ghosts });
  }, [view, activePool, visible, today, completing]);
  const counts = useMemo(() => {
    const active = taskViews(activePool, today);
    const all = taskViews(visible, today);
    return {
      today: active.today.count,
      upcoming: active.upcoming.count,
      anytime: all.anytime.count,
      completed: all.completed.count,
    };
  }, [activePool, visible, today]);

  const clearCompleting = (key: string) => {
    const timer = completingTimers.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    completingTimers.current.delete(key);
    setCompleting((s) => {
      if (!s.has(key)) return s;
      const next = new Map(s);
      next.delete(key);
      return next;
    });
  };

  /** Single state transition resolved by scope+id at write time. The write
   * happens immediately — the ~600 ms strike-through is display only — so a
   * second activation acts on the advanced/restored record, undo is instant,
   * and a delete or move during the animation can neither resurrect the task
   * nor revert its owner. */
  const applyToggle = (entry: TaskEntry) => {
    const ref = { id: entry.task.id, clientId: entry.clientId };
    const key = taskKey(entry);
    const result: { inverse?: ToggleInverse; completed?: boolean } = {};
    setState((s) => {
      const r = toggleTask(s, ref, today);
      result.inverse = r.inverse;
      result.completed = r.completed;
      return r.state;
    });
    // The toast follows the transition that actually ran, not the possibly
    // stale entry that was rendered — a second click during the animation
    // reopens instead of double-completing.
    if (result.completed)
      toast("Task completed.", () => {
        // Undo removes the strike-through ghost and cancels its timer
        // immediately — no duplicate row lingers for 600 ms.
        clearCompleting(key);
        if (result.inverse)
          setState((s) => undoToggle(s, result.inverse as ToggleInverse));
      });
  };

  const complete = (entry: TaskEntry) => {
    // Ghost rows are display-only: a second activation on the snapshot must
    // not reach the store.
    if (entry.ghost) return;
    const key = taskKey(entry);
    if (entry.task.complete || completing.has(key)) return applyToggle(entry);
    applyToggle(entry);
    if (reduced) return;
    setCompleting((s) => new Map(s).set(key, { ...entry, ghost: true }));
    completingTimers.current.set(
      key,
      window.setTimeout(() => clearCompleting(key), 600),
    );
  };

  const add = (task: TaskFields) => {
    setState((s) => saveTask(s, task, task.clientId));
  };

  /** One shared move request for the wide panel, the narrow dialog's Save
   * and the row menu. Returns false only while a request is in flight —
   * the write and its outcome commit together in the store's reducer, so
   * `onDone` always receives the result of the actual committed write. */
  const attemptMove = (
    entry: TaskEntry,
    clientId: string | undefined,
    fields: Partial<TaskFields> | undefined,
    onDone: (moved: boolean, reason?: string) => void,
  ): boolean => {
    if (pendingMoveRef.current) return false;
    pendingMoveRef.current = true;
    const id = ++moveSeq.current;
    moveOutcomes.current.set(id, onDone);
    setPendingMove({ id, entry, clientId });
    requestMove({ id, ref: entry, clientId, fields });
    return true;
  };

  // Acknowledge the outcome that committed WITH the write — the reducer
  // already produced it on the real base, so this effect only consumes:
  // it never predicts a result or schedules a write. `handledMove` and
  // the once-per-request outcome map keep an effect replay from
  // double-acknowledging.
  useEffect(() => {
    const outcome = moveOutcome;
    if (!outcome || handledMove.current === outcome.reqId) return;
    handledMove.current = outcome.reqId;
    pendingMoveRef.current = false;
    setPendingMove(null);
    ackMove(outcome.reqId);
    const done = moveOutcomes.current.get(outcome.reqId);
    moveOutcomes.current.delete(outcome.reqId);
    if (outcome.moved) {
      done?.(true);
      return;
    }
    toast(
      outcome.reason === "id-conflict"
        ? "Move blocked — that scope already has a task with this id."
        : outcome.reason === "no-destination"
          ? "Move blocked — that athlete is no longer available."
          : "Move blocked — the task is no longer there.",
    );
    done?.(false, outcome.reason);
  }, [moveOutcome, ackMove, toast]);

  const remove = (entry: TaskEntry) => {
    clearCompleting(taskKey(entry));
    const result: { removed?: RemovedTask } = {};
    setState((s) => {
      const r = deleteTask(s, {
        id: entry.task.id,
        clientId: entry.clientId,
      });
      result.removed = r.removed;
      return r.state;
    });
    if (selected && taskKey(selected) === taskKey(entry)) onSelect(null);
    toast("Task deleted.", () => {
      if (result.removed)
        setState((s) => restoreTask(s, result.removed as RemovedTask));
    });
  };

  const duplicate = (entry: TaskEntry) => {
    setState((s) => {
      const current = findTask(s, {
        id: entry.task.id,
        clientId: entry.clientId,
      });
      return current
        ? saveTask(s, { ...current.task, id: uid("task") }, current.clientId)
        : s;
    });
    toast("Task duplicated.");
  };

  const moveAllToToday = (items: TaskEntry[]) => {
    const refs = items.map((entry) => ({
      id: entry.task.id,
      clientId: entry.clientId,
    }));
    let moved: {
      ref: { id: string; clientId?: string };
      previousDeadline: string;
    }[] = [];
    setState((s) => {
      const result = rescheduleOverdue(s, refs, today);
      moved = result.moved;
      return result.state;
    });
    if (moved.length)
      toast(
        `Moved ${moved.length} ${moved.length === 1 ? "task" : "tasks"} to today.`,
        () =>
          setState((s) =>
            moved.reduce(
              (next, m) =>
                updateTask(next, m.ref, { deadline: m.previousDeadline }),
              s,
            ),
          ),
      );
  };

  const openAthlete = (entry: TaskEntry) => {
    if (entry.clientId)
      navigate({ section: "clients", client: entry.clientId });
  };

  const selected = resolveTaskParam(entries, selectedId ?? undefined);
  const detailWide = wide && !fixedClientId;

  const listProps = {
    today,
    fixedClientId,
    onToggle: complete,
    onOpen: (entry: TaskEntry) => onSelect(taskParam(entry, entries)),
    onDuplicate: duplicate,
    onDelete: remove,
    onMoveRequest: setMoveEntry,
    onOpenAthlete: fixedClientId ? undefined : openAthlete,
  };

  return (
    <div
      className={`cd-tasks ${detailWide && selected ? "cd-tasks--split" : ""}`}
    >
      <div className="cd-tasks-main">
        <QuickAdd
          id="task-quick-add"
          athletes={athletes}
          today={today}
          fixedClientId={fixedClientId}
          onAdd={add}
          inputRef={quickRef}
        />
        {!fixedClientId && (
          <div className="cd-tasks-toolbar">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search tasks or athletes"
              label="Search tasks or athletes"
            />
            <SearchableSelect
              label="Athlete"
              value={filter}
              onValueChange={onFilter}
              options={[
                { value: "all", label: "Everyone" },
                { value: "general", label: "General" },
                ...athletes.map((a) => ({ value: a.id, label: a.name })),
                ...(archived.length
                  ? [
                      {
                        value: "__archived",
                        label: "Archived",
                        disabled: true,
                      },
                      ...archived.map((a) => ({
                        value: a.id,
                        label: `${a.name} (archived)`,
                      })),
                    ]
                  : []),
              ]}
            />
          </div>
        )}
        <div className="cd-tasks-views">
          <SegmentedControl
            label="Task views"
            value={view}
            onValueChange={(v) => isTaskView(v) && onView(v)}
            options={VIEW_OPTIONS.map((option) => ({
              value: option.id,
              label: `${option.label} ${counts[option.id]}`,
            }))}
          />
        </div>

        {view === "today" &&
          (views.today.groups.length ? (
            views.today.groups.map((group) => (
              <TaskGroup
                key={group.id}
                label={group.label}
                action={
                  group.id === "overdue" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveAllToToday(group.items)}
                    >
                      Move all to today
                    </Button>
                  ) : undefined
                }
                entries={group.items}
                {...listProps}
              />
            ))
          ) : (
            <Empty
              title={
                search ? "Try another search or athlete." : "Nothing due today."
              }
              action={
                !search ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onView("upcoming")}
                  >
                    See upcoming
                  </Button>
                ) : undefined
              }
            />
          ))}

        {view === "upcoming" &&
          (views.upcoming.groups.length ? (
            views.upcoming.groups.map((group) => (
              <div key={group.id} className="cd-task-block">
                <TaskGroup
                  label={group.label}
                  action={
                    group.id.startsWith("day:") ? (
                      <IconButton
                        label={`Add a task for ${group.label}`}
                        size="sm"
                        onClick={() =>
                          setDayAdd(dayAdd === group.id ? null : group.id)
                        }
                      >
                        <Plus size={15} />
                      </IconButton>
                    ) : undefined
                  }
                  entries={group.items}
                  {...listProps}
                />
                {dayAdd === group.id && (
                  <QuickAdd
                    id={`task-quick-add-${group.id}`}
                    athletes={athletes}
                    today={today}
                    fixedClientId={fixedClientId}
                    prefillDate={group.id.slice(4)}
                    autoFocus
                    onAdd={(task) => {
                      add(task);
                      setDayAdd(null);
                    }}
                    onDone={() => setDayAdd(null)}
                  />
                )}
              </div>
            ))
          ) : (
            <Empty
              title={
                search ? "Try another search or athlete." : "Nothing scheduled."
              }
            />
          ))}

        {view === "anytime" &&
          (views.anytime.items.length ? (
            <TaskGroup label="" entries={views.anytime.items} {...listProps} />
          ) : (
            <Empty
              title={
                search
                  ? "Try another search or athlete."
                  : "Tasks without a date land here."
              }
            />
          ))}

        {view === "completed" &&
          (views.completed.groups.length ? (
            views.completed.groups.map((group) => (
              <TaskGroup
                key={group.id}
                label={group.label}
                entries={group.items}
                showCompletedAt
                {...listProps}
              />
            ))
          ) : (
            <Empty
              title={
                search
                  ? "Try another search or athlete."
                  : "Nothing completed yet."
              }
            />
          ))}
      </div>

      {selected && detailWide && (
        <aside className="cd-task-detail" aria-label="Task details">
          <TaskDetail
            key={taskKey(selected)}
            entry={selected}
            athletes={athletes}
            today={today}
            instant
            movePending={moveLocksEntry(pendingMove, selected)}
            onClose={() => onSelect(null)}
            onSave={(ref, fields) =>
              setState((s) => updateTask(s, ref, fields))
            }
            onMove={(clientId, fields, onDone) =>
              attemptMove(selected, clientId, fields, onDone)
            }
            onSnooze={() => {
              const until = new Date(Date.now() + 60 * 60 * 1000);
              setState((s) => snoozeReminder(s, selected, until));
              toast("Reminder snoozed for 1 hour.");
            }}
          />
        </aside>
      )}

      {selected && !detailWide && (
        <Dialog title="Task details" onClose={() => onSelect(null)} wide>
          <TaskDetail
            key={taskKey(selected)}
            entry={selected}
            athletes={athletes}
            today={today}
            instant={false}
            movePending={moveLocksEntry(pendingMove, selected)}
            onClose={() => onSelect(null)}
            onSave={(ref, fields) =>
              setState((s) => updateTask(s, ref, fields))
            }
            onMove={(clientId, fields, onDone) =>
              attemptMove(selected, clientId, fields, onDone)
            }
            onSnooze={() => {
              const until = new Date(Date.now() + 60 * 60 * 1000);
              setState((s) => snoozeReminder(s, selected, until));
              toast("Reminder snoozed for 1 hour.");
              onSelect(null);
            }}
          />
        </Dialog>
      )}

      {moveEntry && (
        <Dialog title="Move task" onClose={() => setMoveEntry(null)}>
          <SearchableSelect
            label="Athlete"
            disabled={pendingMove !== null}
            value={moveEntry.clientId ?? "general"}
            onValueChange={(value) => {
              const clientId = value === "general" ? undefined : value;
              const name = clientId
                ? (athletes.find((a) => a.id === clientId)?.name ?? "athlete")
                : "General";
              // The dialog only closes on the committed outcome — a
              // rejected move keeps it open and the toast explains why.
              attemptMove(moveEntry, clientId, undefined, (moved) => {
                if (!moved) return;
                setMoveEntry(null);
                toast(`Task moved to ${name}.`);
              });
            }}
            options={[
              { value: "general", label: "General" },
              ...athletes.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </Dialog>
      )}
    </div>
  );
}

// --- Task group + row ------------------------------------------------------

function TaskGroup({
  label,
  action,
  entries,
  ...rowProps
}: {
  label: string;
  action?: React.ReactNode;
  entries: TaskEntry[];
} & Omit<Parameters<typeof TaskRow>[0], "entry">) {
  return (
    <section className="cd-task-group">
      {(label || action) && (
        <header className="cd-task-group-head">
          {label && <h3>{label}</h3>}
          {action}
        </header>
      )}
      <ul className="cd-task-list">
        {entries.map((entry) => (
          <TaskRow
            key={`${entry.ghost ? "ghost:" : ""}${taskKey(entry)}`}
            entry={entry}
            {...rowProps}
          />
        ))}
      </ul>
    </section>
  );
}

function TaskRow({
  entry,
  today,
  fixedClientId,
  showCompletedAt,
  onToggle,
  onOpen,
  onDuplicate,
  onDelete,
  onMoveRequest,
  onOpenAthlete,
}: {
  entry: TaskEntry;
  today: string;
  fixedClientId?: string;
  showCompletedAt?: boolean;
  onToggle: (entry: TaskEntry) => void;
  onOpen: (entry: TaskEntry) => void;
  onDuplicate: (entry: TaskEntry) => void;
  onDelete: (entry: TaskEntry) => void;
  onMoveRequest: (entry: TaskEntry) => void;
  onOpenAthlete?: (entry: TaskEntry) => void;
}) {
  const { task } = entry;
  // Ghost rows render the pre-toggle snapshot for the ~600 ms strike-through:
  // display-only content with no interactive descendants at all — no checkbox,
  // button, link or menu exists for a second activation to reach, and nothing
  // ghost-owned can write to the store.
  const isGhost = !!entry.ghost;
  const overdue = !task.complete && !!task.deadline && task.deadline < today;

  if (isGhost)
    return (
      <li className="cd-task-row is-completing" aria-hidden="true">
        <span className="cd-task-ghost-check">
          <Check size={12} />
        </span>
        <div className="cd-task-body">
          <div className="cd-task-ghost-main">
            <span className="cd-task-title">
              {task.title}
              {task.priority === "high" && (
                <Flag size={13} className="cd-task-flag" aria-hidden="true" />
              )}
            </span>
            {task.notes && (
              <span className="cd-task-preview">{task.notes}</span>
            )}
          </div>
          <div className="cd-task-meta">
            {entry.client && !fixedClientId && (
              <span className="cd-task-owner">{entry.client.name}</span>
            )}
            {task.deadline && (
              <span className={overdue ? "cd-task-overdue" : undefined}>
                {overdue
                  ? overdueLabel(task.deadline, today)
                  : relativeDay(task.deadline, today)}
              </span>
            )}
            {task.repeat && (
              <span className="cd-task-repeat">
                <Repeat size={11} aria-hidden="true" />
                {repeatLabel(task.repeat)}
              </span>
            )}
            {task.reminderAt && (
              <span className="cd-task-reminder">
                <Bell size={11} aria-hidden="true" />
                {task.reminderAt.slice(11, 16)}
              </span>
            )}
          </div>
        </div>
      </li>
    );

  const rowKey = (event: KeyboardEvent<HTMLElement>) => {
    if (isGhost) return;
    const root = event.currentTarget.closest(".cd-tasks");
    const mains = root
      ? Array.from(
          root.querySelectorAll<HTMLElement>("li.cd-task-row .cd-task-main"),
        )
      : [];
    const index = mains.indexOf(event.currentTarget);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next =
        event.key === "ArrowDown"
          ? (mains[index + 1] ?? mains[0])
          : (mains[index - 1] ?? mains.at(-1));
      next?.focus();
    } else if (event.key === " ") {
      event.preventDefault();
      onToggle(entry);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDelete(entry);
    }
  };

  return (
    <li
      className={`cd-task-row${task.complete ? " is-done" : ""}${isGhost ? " is-completing" : ""}`}
    >
      <Checkbox
        label=""
        ariaLabel={`${task.complete ? "Reopen" : "Complete"} ${task.title}`}
        checked={task.complete || isGhost}
        disabled={isGhost}
        onCheckedChange={() => {
          if (!isGhost) onToggle(entry);
        }}
      />
      <div className="cd-task-body">
        <button
          type="button"
          className="cd-task-main"
          onClick={() => onOpen(entry)}
          onKeyDown={rowKey}
        >
          <span className="cd-task-title">
            {task.title}
            {task.priority === "high" && (
              <Flag
                size={13}
                className="cd-task-flag"
                aria-label="High priority"
              />
            )}
          </span>
          {task.notes && <span className="cd-task-preview">{task.notes}</span>}
        </button>
        <div className="cd-task-meta">
          {entry.client && !fixedClientId && (
            <button
              type="button"
              className="cd-task-owner"
              onClick={() => onOpenAthlete?.(entry)}
            >
              {entry.client.name}
              <ArrowUpRight size={11} aria-hidden="true" />
            </button>
          )}
          {showCompletedAt && task.completedAt ? (
            <span>
              Completed {relativeDay(localDayOf(task.completedAt), today)}
            </span>
          ) : (
            task.deadline && (
              <span className={overdue ? "cd-task-overdue" : undefined}>
                {overdue
                  ? overdueLabel(task.deadline, today)
                  : relativeDay(task.deadline, today)}
              </span>
            )
          )}
          {task.repeat && (
            <span className="cd-task-repeat">
              <Repeat size={11} aria-hidden="true" />
              {repeatLabel(task.repeat)}
            </span>
          )}
          {task.reminderAt && (
            <span className="cd-task-reminder">
              <Bell size={11} aria-hidden="true" />
              {task.reminderAt.slice(11, 16)}
            </span>
          )}
        </div>
      </div>
      <div className="cd-task-actions">
        <IconButton
          label={`Edit ${task.title}`}
          size="sm"
          onClick={() => onOpen(entry)}
        >
          <Pencil size={14} />
        </IconButton>
        <DropdownMenu
          label="More"
          items={[
            {
              id: "move",
              label: "Move to athlete",
              onSelect: () => onMoveRequest(entry),
            },
            {
              id: "duplicate",
              label: "Duplicate",
              onSelect: () => onDuplicate(entry),
            },
            {
              id: "delete",
              label: "Delete",
              onSelect: () => onDelete(entry),
            },
          ]}
        />
      </div>
    </li>
  );
}

// --- Quick add -------------------------------------------------------------

function QuickAdd({
  id,
  athletes,
  today,
  fixedClientId,
  prefillDate,
  autoFocus = false,
  onAdd,
  onDone,
  inputRef,
}: {
  id: string;
  athletes: { id: string; name: string }[];
  today: string;
  fixedClientId?: string;
  prefillDate?: string;
  autoFocus?: boolean;
  onAdd: (task: TaskFields) => void;
  onDone?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState("");
  const [disabled, setDisabled] = useState<ReadonlySet<string>>(new Set());
  const [picker, setPicker] = useState<"date" | "athlete" | null>(null);
  /** deadline undefined = untouched, null = explicitly cleared;
   * clientId undefined = untouched, null = explicitly "No athlete". */
  const [override, setOverride] = useState<{
    deadline?: string | null;
    clientId?: string | null;
  }>({});
  const [flag, setFlag] = useState<boolean | null>(null);
  const [correction, setCorrection] = useState<string | undefined>(undefined);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [suggestTouched, setSuggestTouched] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;

  const parsed = parseQuickAdd(text, athletes, today, disabled);
  const athleteToken = parsed.tokens.find((t) => t.kind === "athlete");
  const priorityTokens = parsed.tokens.filter((t) => t.kind === "priority");
  const clientId =
    override.clientId === undefined
      ? athleteToken
        ? parsed.clientId
        : fixedClientId
      : (override.clientId ?? undefined);
  const deadline =
    override.deadline === undefined
      ? (parsed.deadline ?? prefillDate)
      : (override.deadline ?? undefined);
  const high = flag ?? parsed.priority === "high";

  const mention = /(^|\s)@([^\s@]*)$/.exec(text);
  const mentionParsed = parsed.tokens.some(
    (t) => t.kind === "athlete" && t.end === text.length,
  );
  const suggestions = mention
    ? matchAthletes(mention[2], athletes).slice(0, 6)
    : [];

  const applySuggestion = (athlete: { id: string; name: string }) => {
    if (!mention) return;
    // An explicit pick binds by id — safer than re-parsing a first name
    // that could collide with another athlete — and shows as a removable
    // chip just like the athlete picker's selection.
    const atStart = text.length - mention[0].length;
    setText(text.slice(0, atStart).replace(/\s+$/, " "));
    setOverride((o) => ({ ...o, clientId: athlete.id }));
    setSuggestIndex(0);
    setSuggestTouched(false);
    ref.current?.focus();
  };

  /** Clearing the date while a repeat token is active would leave the rule
   * stranded — un-parse it so the words stay literal and say what happened. */
  const setDateOverride = (value: string | null | undefined) => {
    if (parsed.repeat && !value) {
      setDisabled((s) => {
        const next = new Set(s);
        for (const token of parsed.tokens)
          if (token.kind === "repeat") next.add(token.key);
        return next;
      });
      setCorrection("Repeat removed — repeating tasks need a date.");
    } else setCorrection(undefined);
    setOverride((o) => ({ ...o, deadline: value }));
  };

  const toggleFlag = () => {
    const next = !(flag ?? parsed.priority === "high");
    setFlag(next);
    // Turning the flag off un-parses a typed priority token so the literal
    // `!`/`p1` stays as text; turning it on re-enables the token.
    setDisabled((s) => {
      const nextSet = new Set(s);
      for (const token of priorityTokens)
        if (next) nextSet.delete(token.key);
        else nextSet.add(token.key);
      return nextSet;
    });
  };

  const submit = () => {
    const title = parsed.title || text.trim();
    if (!title) {
      onDone?.();
      return;
    }
    const reminderAt =
      parsed.reminderAt && deadline
        ? `${deadline}T${parsed.reminderAt.slice(11)}`
        : parsed.reminderAt;
    onAdd({
      id: uid("task"),
      title,
      complete: false,
      createdAt: nowIso(),
      ...(deadline ? { deadline } : {}),
      // A repeat rule needs a date to advance from — never save one without.
      ...(parsed.repeat && deadline ? { repeat: parsed.repeat } : {}),
      ...(reminderAt ? { reminderAt } : {}),
      ...(high ? { priority: "high" as const } : {}),
      ...(clientId ? { clientId } : {}),
    });
    setText("");
    setDisabled(new Set());
    setOverride({});
    setFlag(null);
    setCorrection(undefined);
    setPicker(null);
    ref.current?.focus();
  };

  const overrideAthlete =
    override.clientId === null
      ? { id: "", name: "No athlete" }
      : override.clientId
        ? athletes.find((a) => a.id === override.clientId)
        : undefined;
  const fixedAthlete =
    fixedClientId && !athleteToken && override.clientId === undefined
      ? athletes.find((a) => a.id === fixedClientId)
      : undefined;

  return (
    <div className="cd-quickadd">
      <div className="cd-quickadd-line">
        <Input
          id={id}
          ref={ref}
          label="Add a task"
          hideLabel
          value={text}
          autoFocus={autoFocus}
          placeholder={
            prefillDate
              ? `Add a task for ${relativeDay(prefillDate, today)}`
              : "Add a task, e.g. Review Theo's check-in fri @Theo"
          }
          onChange={(event) => {
            setText(event.currentTarget.value);
            setSuggestIndex(0);
            setSuggestTouched(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setPicker(null);
              if (!text) onDone?.();
              return;
            }
            if (suggestions.length && !mentionParsed) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSuggestIndex((i) => Math.min(i + 1, suggestions.length - 1));
                setSuggestTouched(true);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSuggestIndex((i) => Math.max(i - 1, 0));
                setSuggestTouched(true);
                return;
              }
              // Tab always accepts the highlighted suggestion; Enter only
              // picks one the coach deliberately arrowed to, so a partial
              // @match can't silently bind the first athlete.
              if (event.key === "Tab") {
                event.preventDefault();
                applySuggestion(suggestions[suggestIndex] ?? suggestions[0]);
                return;
              }
              if (event.key === "Enter" && suggestTouched) {
                event.preventDefault();
                applySuggestion(suggestions[suggestIndex] ?? suggestions[0]);
                return;
              }
            }
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="cd-quickadd-buttons">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Set date"
            title="Set date"
            aria-pressed={picker === "date"}
            onClick={() => setPicker(picker === "date" ? null : "date")}
          >
            <CalendarDays size={15} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Set athlete"
            title="Set athlete"
            aria-pressed={picker === "athlete"}
            onClick={() => setPicker(picker === "athlete" ? null : "athlete")}
          >
            <AtSign size={15} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={high ? "Remove high priority" : "Mark high priority"}
            title={high ? "Remove high priority" : "Mark high priority"}
            aria-pressed={high}
            onClick={toggleFlag}
          >
            <Flag size={15} />
          </Button>
        </div>
      </div>

      {suggestions.length > 0 && !mentionParsed && (
        <div
          className="cd-quickadd-suggest"
          role="listbox"
          aria-label="Athletes"
        >
          {suggestions.map((athlete, index) => (
            <button
              key={athlete.id}
              type="button"
              role="option"
              aria-selected={index === suggestIndex}
              className={index === suggestIndex ? "is-active" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applySuggestion(athlete)}
            >
              {athlete.name}
            </button>
          ))}
        </div>
      )}

      {(parsed.tokens.length > 0 ||
        fixedAthlete ||
        overrideAthlete ||
        override.deadline ||
        flag === true) && (
        <div className="cd-quickadd-tokens">
          {fixedAthlete && (
            <span
              className="cd-token cd-token-fixed"
              title="Athlete for this profile"
            >
              Athlete · {fixedAthlete.name}
            </span>
          )}
          {parsed.tokens.map((token) => (
            <button
              key={token.key}
              type="button"
              className="cd-token"
              title="Remove — keep the words as plain text"
              onClick={() => setDisabled((s) => new Set(s).add(token.key))}
            >
              {token.label}
              <X size={11} aria-hidden="true" />
            </button>
          ))}
          {overrideAthlete && (
            <button
              type="button"
              className="cd-token"
              title="Remove athlete"
              onClick={() =>
                setOverride((o) => ({ ...o, clientId: undefined }))
              }
            >
              {overrideAthlete.name}
              <X size={11} aria-hidden="true" />
            </button>
          )}
          {override.deadline && (
            <button
              type="button"
              className="cd-token"
              title="Clear date"
              onClick={() => setDateOverride(null)}
            >
              {relativeDay(override.deadline, today)}
              <X size={11} aria-hidden="true" />
            </button>
          )}
          {flag === true && !parsed.priority && (
            <button
              type="button"
              className="cd-token"
              title="Remove high priority"
              onClick={() => setFlag(null)}
            >
              High priority
              <X size={11} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {correction && <p className="cd-task-correction">{correction}</p>}

      {picker === "date" && (
        <div className="cd-quickadd-picker">
          <DatePicker
            label="Date"
            value={deadline ?? ""}
            onValueChange={(value) => setDateOverride(value || null)}
          />
        </div>
      )}
      {picker === "athlete" && (
        <div className="cd-quickadd-picker">
          <SearchableSelect
            label="Athlete"
            value={clientId ?? "general"}
            onValueChange={(value) => {
              setOverride((o) => ({
                ...o,
                clientId: value === "general" ? null : value,
              }));
              setPicker(null);
            }}
            options={[
              { value: "general", label: "No athlete" },
              ...athletes.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
      )}
    </div>
  );
}

// --- Detail ----------------------------------------------------------------

type RepeatOption =
  | "none"
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "custom";

const repeatOption = (repeat: TaskRepeat | undefined): RepeatOption => {
  if (!repeat) return "none";
  const interval = repeat.interval ?? 1;
  if (repeat.unit === "day" && interval === 1) return "daily";
  if (repeat.unit === "week" && !repeat.weekdays?.length) {
    if (interval === 1) return "weekly";
    if (interval === 2) return "biweekly";
  }
  if (repeat.unit === "month" && interval === 1) return "monthly";
  return "custom";
};

const WEEKDAY_SELECT = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

function TaskDetail({
  entry,
  athletes,
  today,
  instant,
  movePending,
  onSave,
  onMove,
  onSnooze,
  onClose,
}: {
  entry: TaskEntry;
  athletes: { id: string; name: string }[];
  today: string;
  /** Panel mode saves field edits as they happen; dialog mode keeps a draft. */
  instant: boolean;
  /** A move request for THIS task is committing — all draft-mutating
   * controls are locked until the committed outcome is consumed. The
   * parent derives it from the request's source AND destination scopes
   * so it survives the keyed remount on a successful move. */
  movePending?: boolean;
  /** Applies `fields` to the task at `ref`'s scope — never creates,
   * never moves, never writes fields the caller did not edit. */
  onSave: (ref: TaskRef, fields: Partial<TaskFields>) => void;
  /** Submits a move request — `fields` carries any pending edited fields
   * so the move and patch apply atomically after commit. Returns false
   * only when another request is in flight; the committed outcome arrives
   * via `onDone` — the caller keeps its draft until then. */
  onMove: (
    clientId: string | undefined,
    fields: Partial<TaskFields> | undefined,
    onDone: (moved: boolean, reason?: string) => void,
  ) => boolean;
  onSnooze: () => void;
  onClose: () => void;
}) {
  const task = entry.task;
  const [draft, setDraft] = useState<TaskFields>(task);
  const [clientSel, setClientSel] = useState<string | undefined>(
    entry.clientId,
  );
  const [correction, setCorrection] = useState<string | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  // Pending saves bind the task's id, the scope it lives at NOW (moves
  // update clientSel), and only the fields the coach actually edited —
  // a flush can never write a stale draft over newer fields, create a
  // deleted record, or drag the task back to a former athlete.
  const editedRef = useRef<Partial<TaskFields>>({});
  const clientSelRef = useRef(clientSel);
  clientSelRef.current = clientSel;
  const instantRef = useRef(instant);
  instantRef.current = instant;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const taskIdRef = useRef(task.id);
  taskIdRef.current = task.id;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // The lock: `movePending` (parent) covers the committed window incl.
  // the post-move remount; `moving` renders the pending state from
  // submit; `pendingLock` guards handlers synchronously in the gap
  // between the submit event and the render that delivers the lock.
  const [moving, setMoving] = useState(false);
  const pendingLock = useRef(false);
  const locked = !!movePending || moving || pendingLock.current;

  const ref = () => ({
    id: taskIdRef.current,
    clientId: clientSelRef.current,
  });
  const flush = () => {
    const fields = editedRef.current;
    editedRef.current = {};
    if (instantRef.current && Object.keys(fields).length)
      onSaveRef.current(ref(), fields);
  };

  useEffect(() => {
    // Keep the coach's pending (unsaved) edits visible across the reset.
    setDraft({ ...task, ...editedRef.current });
  }, [task]);
  useEffect(() => {
    setClientSel(entry.clientId);
  }, [entry.clientId]);
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      // Unmount (close, task switch, athlete move) commits the pending
      // field-scoped save instead of dropping it.
      const fields = editedRef.current;
      editedRef.current = {};
      if (instantRef.current && Object.keys(fields).length)
        onSaveRef.current(
          { id: taskIdRef.current, clientId: clientSelRef.current },
          fields,
        );
    },
    [],
  );

  const scheduleSave = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 400);
  };

  const patch = (partial: Partial<TaskFields>, debounce = false) => {
    // Guard the handler itself — an event that arrives before React
    // renders the lock must not mutate the submitted draft.
    if (pendingLock.current || movePending) return;
    setDraft((d) => ({ ...d, ...partial }));
    if (!instant) return;
    if (debounce) {
      editedRef.current = { ...editedRef.current, ...partial };
      scheduleSave();
    } else {
      onSaveRef.current(ref(), partial);
    }
  };

  const setAthlete = (value: string) => {
    if (pendingLock.current || movePending) return;
    const clientId = value === "general" ? undefined : value;
    if (!instant) {
      setClientSel(clientId);
      return;
    }
    window.clearTimeout(saveTimer.current);
    // The pending patch travels WITH the request — the outcome arrives
    // committed with the write. The editor locks synchronously at submit
    // and stays locked until this exact outcome is consumed: only a
    // successful move consumes the fields it submitted; a rejection
    // keeps the draft, the current scope and resumes autosave.
    const submitted = { ...editedRef.current };
    pendingLock.current = true;
    setMoving(true);
    const accepted = onMove(clientId, submitted, (moved) => {
      pendingLock.current = false;
      setMoving(false);
      if (!moved) {
        // The draft must keep flushing — a rejection delays, never drops.
        scheduleSave();
        return;
      }
      const rest = { ...editedRef.current };
      for (const key of Object.keys(submitted) as (keyof TaskFields)[])
        if (rest[key] === submitted[key]) delete rest[key];
      editedRef.current = {};
      setClientSel(clientId);
      if (Object.keys(rest).length)
        onSaveRef.current({ id: taskIdRef.current, clientId }, rest);
    });
    if (!accepted) {
      pendingLock.current = false;
      setMoving(false);
    }
  };

  const applyRepeat = (value: string) => {
    const option = value as RepeatOption;
    if (option === "none") {
      patch({ repeat: undefined });
      return;
    }
    const base = draft.deadline ?? today;
    const weekday = new Date(`${base}T12:00:00`).getDay() as
      | 0
      | 1
      | 2
      | 3
      | 4
      | 5
      | 6;
    const repeat: TaskRepeat =
      option === "daily"
        ? { unit: "day", interval: 1 }
        : option === "weekly"
          ? { unit: "week", interval: 1, weekdays: [weekday] }
          : option === "biweekly"
            ? { unit: "week", interval: 2 }
            : option === "monthly"
              ? { unit: "month", interval: 1 }
              : { unit: "day", interval: 2 };
    const partial: Partial<TaskFields> = { repeat };
    if (!draft.deadline) {
      // A repeat rule needs a date to advance from — start it at the next
      // occurrence and say so rather than saving a silent one-shot.
      partial.deadline = occurrenceOnOrAfter(today, repeat);
      setCorrection("Date set to the next occurrence — repeats need a date.");
    } else setCorrection(undefined);
    patch(partial);
  };

  const onDateChange = (value: string) => {
    if (value) {
      setCorrection(undefined);
      patch({ deadline: value });
      return;
    }
    const partial: Partial<TaskFields> = { deadline: undefined };
    if (draft.repeat) {
      partial.repeat = undefined;
      setCorrection("Repeat removed — repeating tasks need a date.");
    } else setCorrection(undefined);
    patch(partial);
  };

  const repeat = draft.repeat;
  const repeatValue = repeatOption(repeat);
  const patchReminder = (date: string, time: string) => {
    // The model owns the shown marker: a changed reminder re-arms it,
    // an unchanged one keeps it.
    patch({
      reminderAt: date ? `${date}T${time || "09:00"}` : undefined,
    });
  };

  // Dialog mode snoozes the draft so the coach still saves explicitly;
  // panel mode writes straight through the shared reminder lifecycle.
  const snooze = () => {
    if (pendingLock.current || movePending) return;
    const until = new Date(Date.now() + 60 * 60 * 1000);
    if (instant) {
      onSnooze();
      return;
    }
    setDraft((d) => ({ ...d, reminderAt: localDateTime(until) }));
  };

  const fields = (
    <>
      <Input
        label="Title"
        disabled={locked}
        value={draft.title}
        onChange={(event) => patch({ title: event.currentTarget.value }, true)}
      />
      <SearchableSelect
        label="Athlete"
        disabled={locked}
        value={clientSel ?? "general"}
        onValueChange={setAthlete}
        options={[
          { value: "general", label: "General" },
          ...athletes.map((a) => ({ value: a.id, label: a.name })),
          // Keep an archived owner selectable so history isn't rewritten.
          ...(entry.clientId && !athletes.some((a) => a.id === entry.clientId)
            ? [
                {
                  value: entry.clientId,
                  label: `${entry.client?.name ?? "Athlete"} (archived)`,
                },
              ]
            : []),
        ]}
      />
      {locked && <p className="cd-task-correction">Moving task…</p>}
      <DatePicker
        label="Date"
        disabled={locked}
        value={draft.deadline ?? ""}
        onValueChange={onDateChange}
      />
      {correction && <p className="cd-task-correction">{correction}</p>}
      <Select
        label="Repeat"
        disabled={locked}
        value={repeatValue}
        onChange={applyRepeat}
        options={[
          { value: "none", label: "None" },
          { value: "daily", label: "Daily" },
          {
            value: "weekly",
            label: `Weekly on ${new Date(`${draft.deadline ?? today}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" })}`,
          },
          { value: "biweekly", label: "Every 2 weeks" },
          { value: "monthly", label: "Monthly" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {repeatValue === "custom" && repeat && (
        <div className="cd-task-detail-custom">
          <Select
            label="Every"
            disabled={locked}
            value={String(repeat.interval ?? 1)}
            onChange={(value) =>
              patch({ repeat: { ...repeat, interval: Number(value) } })
            }
            options={[
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "4", label: "4" },
            ]}
          />
          <Select
            label="Unit"
            disabled={locked}
            value={repeat.unit}
            onChange={(value) =>
              patch({
                repeat: {
                  ...repeat,
                  unit: value as TaskRepeat["unit"],
                  ...(value === "week" && !repeat.weekdays?.length
                    ? {
                        weekdays: [
                          new Date(
                            `${draft.deadline ?? today}T12:00:00`,
                          ).getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
                        ],
                      }
                    : {}),
                },
              })
            }
            options={[
              { value: "day", label: "days" },
              { value: "week", label: "weeks" },
              { value: "month", label: "months" },
            ]}
          />
          {repeat.unit === "week" && (
            <Select
              label="On"
              disabled={locked}
              value={String(repeat.weekdays?.[0] ?? 1)}
              onChange={(value) =>
                patch({
                  repeat: {
                    ...repeat,
                    weekdays: [Number(value) as 0 | 1 | 2 | 3 | 4 | 5 | 6],
                  },
                })
              }
              options={WEEKDAY_SELECT}
            />
          )}
        </div>
      )}
      {repeat && (
        <Toggle
          label="Repeat from completion date"
          disabled={locked}
          checked={!!repeat.fromCompletion}
          onChange={(checked) =>
            patch({
              repeat: { ...repeat, fromCompletion: checked || undefined },
            })
          }
        />
      )}
      <DateTimePicker
        label="Reminder"
        disabled={locked}
        hint="Shown in this workspace when the time arrives"
        date={draft.reminderAt?.slice(0, 10) ?? ""}
        time={draft.reminderAt?.slice(11, 16) ?? ""}
        onDateChange={(date) =>
          patchReminder(date, draft.reminderAt?.slice(11, 16) ?? "")
        }
        onTimeChange={(time) =>
          patchReminder(
            draft.reminderAt?.slice(0, 10) || draft.deadline || today,
            time,
          )
        }
      />
      {draft.reminderAt && (
        <Button variant="ghost" size="sm" disabled={locked} onClick={snooze}>
          <Bell size={13} /> Snooze 1 hour
        </Button>
      )}
      <Toggle
        label="High priority"
        disabled={locked}
        checked={draft.priority === "high"}
        onChange={(checked) =>
          patch(checked ? { priority: "high" } : { priority: undefined })
        }
      />
      <TextArea
        label="Notes"
        disabled={locked}
        value={draft.notes ?? ""}
        onChange={(event) =>
          patch({ notes: event.currentTarget.value || undefined }, true)
        }
        rows={3}
      />
      <p className="cd-task-detail-meta">
        {draft.createdAt &&
          `Created ${formatDate(draft.createdAt.slice(0, 10))}`}
        {draft.createdAt && draft.completedAt && " · "}
        {draft.completedAt &&
          `Completed ${formatDate(draft.completedAt.slice(0, 10))}`}
        {!draft.createdAt && !draft.completedAt && "No timestamps recorded."}
      </p>
    </>
  );

  if (instant)
    return (
      <div className="cd-task-detail-fields">
        <div className="cd-task-detail-head">
          <h3>Task</h3>
          <IconButton label="Close details" size="sm" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        {fields}
      </div>
    );

  return (
    <div className="cd-task-detail-fields">
      {fields}
      <div className="cd-task-detail-actions">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          primary
          disabled={locked}
          onClick={() => {
            if (draft.repeat && !draft.deadline) {
              setCorrection(
                "Repeating tasks need a date — set one or remove the repeat.",
              );
              return;
            }
            if (clientSel !== entry.clientId) {
              // The move carries the draft in one committed transition so
              // the edits land at the new owner, never the old scope. The
              // editor locks synchronously at submit; the committed
              // outcome closes the dialog on success, a rejected move
              // unlocks, keeps the draft and shows why.
              pendingLock.current = true;
              setMoving(true);
              const accepted = onMove(clientSel, draft, (moved, reason) => {
                pendingLock.current = false;
                setMoving(false);
                if (moved) {
                  // Carry only edits made while the request committed —
                  // never replay the submitted draft over newer fields.
                  const newer: Partial<TaskFields> = {};
                  for (const [key, value] of Object.entries(
                    draftRef.current,
                  ) as [keyof TaskFields, unknown][])
                    if (value !== draft[key])
                      (newer as Record<string, unknown>)[key] = value;
                  if (Object.keys(newer).length)
                    onSaveRef.current(
                      { id: taskIdRef.current, clientId: clientSel },
                      newer,
                    );
                  onClose();
                  return;
                }
                setCorrection(
                  reason === "id-conflict"
                    ? "That athlete already has a task with this id — your changes were kept."
                    : reason === "no-destination"
                      ? "That athlete is no longer available — your changes were kept."
                      : "The task is no longer there — your changes were kept.",
                );
              });
              if (!accepted) {
                pendingLock.current = false;
                setMoving(false);
                setCorrection("Still finishing the previous move — try again.");
              }
            } else {
              onSave({ id: entry.task.id, clientId: clientSel }, draft);
              onClose();
            }
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
