"use client";

import {
  ArrowUpRight,
  AtSign,
  Bell,
  CalendarDays,
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
  listTasks,
  matchAthletes,
  moveTask,
  overdueLabel,
  parseQuickAdd,
  type RemovedTask,
  relativeDay,
  repeatLabel,
  rescheduleOverdue,
  restoreTask,
  saveTask,
  searchTasks,
  snoozeReminder,
  type TaskEntry,
  type TaskViewId,
  type ToggleInverse,
  taskViews,
  toggleTask,
  undoToggle,
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

const nowIso = () => new Date().toISOString();

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
  const { state, setState, toast, navigate } = useCoach();
  const today = localToday();
  const reduced = useReducedMotion();
  const [search, setSearch] = useState("");
  const [completing, setCompleting] = useState<ReadonlySet<string>>(new Set());
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
  const views = useMemo(
    () =>
      view === "today" || view === "upcoming"
        ? taskViews(activePool, today)
        : taskViews(visible, today),
    [view, activePool, visible, today],
  );
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

  const inverseRef = useRef<ToggleInverse | undefined>(undefined);
  const removedRef = useRef<RemovedTask | undefined>(undefined);
  const movedRef = useRef<
    { ref: { id: string; clientId?: string }; previousDeadline: string }[]
  >([]);

  const applyToggle = (entry: TaskEntry) => {
    setState((s) => {
      const result = toggleTask(s, entry, today);
      inverseRef.current = result.inverse;
      return result.state;
    });
    if (!entry.task.complete)
      toast("Task completed.", () => {
        const inverse = inverseRef.current;
        if (inverse) setState((s) => undoToggle(s, inverse));
      });
  };

  const complete = (entry: TaskEntry) => {
    if (entry.task.complete) return applyToggle(entry);
    if (reduced) return applyToggle(entry);
    const id = entry.task.id;
    setCompleting((s) => new Set(s).add(id));
    window.setTimeout(() => {
      applyToggle(entry);
      setCompleting((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }, 600);
  };

  const add = (task: TaskFields) => {
    setState((s) => saveTask(s, task, task.clientId));
  };

  const remove = (entry: TaskEntry) => {
    setState((s) => {
      const result = deleteTask(s, {
        id: entry.task.id,
        clientId: entry.clientId,
      });
      removedRef.current = result.removed;
      return result.state;
    });
    if (selectedId === entry.task.id) onSelect(null);
    toast("Task deleted.", () => {
      const removed = removedRef.current;
      if (removed) setState((s) => restoreTask(s, removed));
    });
  };

  const duplicate = (entry: TaskEntry) => {
    setState((s) =>
      saveTask(s, { ...entry.task, id: uid("task") }, entry.clientId),
    );
    toast("Task duplicated.");
  };

  const moveAllToToday = (items: TaskEntry[]) => {
    setState((s) => {
      const result = rescheduleOverdue(s, items, today);
      movedRef.current = result.moved;
      return result.state;
    });
    const moved = movedRef.current;
    if (moved.length)
      toast(
        `Moved ${moved.length} ${moved.length === 1 ? "task" : "tasks"} to today.`,
        () =>
          setState((s) =>
            moved.reduce((next, m) => {
              const current = next.coachTodos
                ?.concat(next.clients.flatMap((c) => c.coachTasks))
                .find((t) => t.id === m.ref.id);
              return current
                ? saveTask(
                    next,
                    { ...current, deadline: m.previousDeadline },
                    m.ref.clientId,
                  )
                : next;
            }, s),
          ),
      );
  };

  const openAthlete = (entry: TaskEntry) => {
    if (entry.clientId)
      navigate({ section: "clients", client: entry.clientId });
  };

  const selected = selectedId
    ? entries.find((e) => e.task.id === selectedId)
    : undefined;
  const detailWide = wide && !fixedClientId;

  const listProps = {
    today,
    fixedClientId,
    completing,
    onToggle: complete,
    onOpen: (entry: TaskEntry) => onSelect(entry.task.id),
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
            entry={selected}
            athletes={athletes}
            today={today}
            instant
            onClose={() => onSelect(null)}
            onSave={(task) =>
              setState((s) => saveTask(s, task, selected.clientId))
            }
            onMove={(clientId) =>
              setState((s) => moveTask(s, selected, clientId))
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
            entry={selected}
            athletes={athletes}
            today={today}
            instant={false}
            onClose={() => onSelect(null)}
            onSave={(task, clientId) =>
              setState((s) => saveTask(s, task, clientId))
            }
            onMove={() => {}}
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
            value={moveEntry.clientId ?? "general"}
            onValueChange={(value) => {
              const clientId = value === "general" ? undefined : value;
              const name = clientId
                ? (athletes.find((a) => a.id === clientId)?.name ?? "athlete")
                : "General";
              setState((s) => moveTask(s, moveEntry, clientId));
              setMoveEntry(null);
              toast(`Task moved to ${name}.`);
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
          <TaskRow key={entry.task.id} entry={entry} {...rowProps} />
        ))}
      </ul>
    </section>
  );
}

function TaskRow({
  entry,
  today,
  fixedClientId,
  completing,
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
  completing: ReadonlySet<string>;
  showCompletedAt?: boolean;
  onToggle: (entry: TaskEntry) => void;
  onOpen: (entry: TaskEntry) => void;
  onDuplicate: (entry: TaskEntry) => void;
  onDelete: (entry: TaskEntry) => void;
  onMoveRequest: (entry: TaskEntry) => void;
  onOpenAthlete?: (entry: TaskEntry) => void;
}) {
  const { task } = entry;
  const isCompleting = completing.has(task.id);
  const overdue = !task.complete && !!task.deadline && task.deadline < today;

  const rowKey = (event: KeyboardEvent<HTMLElement>) => {
    const list = event.currentTarget.closest("ul");
    const mains = list
      ? Array.from(
          list.querySelectorAll<HTMLElement>("li.cd-task-row .cd-task-main"),
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
      className={`cd-task-row${task.complete ? " is-done" : ""}${isCompleting ? " is-completing" : ""}`}
    >
      <Checkbox
        label=""
        ariaLabel={`${task.complete ? "Reopen" : "Complete"} ${task.title}`}
        checked={task.complete || isCompleting}
        onCheckedChange={() => onToggle(entry)}
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
              Completed {relativeDay(task.completedAt.slice(0, 10), today)}
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
  const [override, setOverride] = useState<{
    deadline?: string;
    clientId?: string;
  }>({});
  const [flag, setFlag] = useState<boolean | null>(null);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;

  const parsed = parseQuickAdd(text, athletes, today, disabled);
  const athleteToken = parsed.tokens.find((t) => t.kind === "athlete");
  const clientId =
    override.clientId !== undefined
      ? override.clientId
      : athleteToken
        ? parsed.clientId
        : fixedClientId;
  const deadline = override.deadline ?? parsed.deadline ?? prefillDate;
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
    const atStart = text.length - mention[0].length;
    setText(`${text.slice(0, atStart)}@${athlete.name.split(" ")[0]} `);
    setSuggestIndex(0);
    ref.current?.focus();
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
      ...(parsed.repeat ? { repeat: parsed.repeat } : {}),
      ...(reminderAt ? { reminderAt } : {}),
      ...(high ? { priority: "high" as const } : {}),
      ...(clientId ? { clientId } : {}),
    });
    setText("");
    setDisabled(new Set());
    setOverride({});
    setFlag(null);
    setPicker(null);
    ref.current?.focus();
  };

  const fixedAthlete =
    fixedClientId && !athleteToken
      ? athletes.find((a) => a.id === (override.clientId ?? fixedClientId))
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
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSuggestIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
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
          <IconButton
            label="Set date"
            size="sm"
            aria-pressed={picker === "date"}
            onClick={() => setPicker(picker === "date" ? null : "date")}
          >
            <CalendarDays size={15} />
          </IconButton>
          <IconButton
            label="Set athlete"
            size="sm"
            aria-pressed={picker === "athlete"}
            onClick={() => setPicker(picker === "athlete" ? null : "athlete")}
          >
            <AtSign size={15} />
          </IconButton>
          <IconButton
            label={high ? "Remove high priority" : "Mark high priority"}
            size="sm"
            aria-pressed={high}
            onClick={() => setFlag(!(flag ?? parsed.priority === "high"))}
          >
            <Flag size={15} />
          </IconButton>
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

      {(parsed.tokens.length > 0 || fixedAthlete || override.deadline) && (
        <div className="cd-quickadd-tokens">
          {fixedAthlete && (
            <span className="cd-token cd-token-fixed">{fixedAthlete.name}</span>
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
          {override.deadline && (
            <button
              type="button"
              className="cd-token"
              title="Clear date"
              onClick={() =>
                setOverride((o) => ({ ...o, deadline: undefined }))
              }
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

      {picker === "date" && (
        <div className="cd-quickadd-picker">
          <DatePicker
            label="Date"
            value={deadline ?? ""}
            onValueChange={(value) =>
              setOverride((o) => ({ ...o, deadline: value || undefined }))
            }
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
                clientId: value === "general" ? undefined : value,
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
  onSave: (task: TaskFields, clientId?: string) => void;
  onMove: (clientId?: string) => void;
  onSnooze: () => void;
  onClose: () => void;
}) {
  const task = entry.task;
  const [draft, setDraft] = useState<TaskFields>(task);
  const [clientSel, setClientSel] = useState<string | undefined>(
    entry.clientId,
  );
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setDraft(task);
  }, [task]);
  useEffect(() => {
    setClientSel(entry.clientId);
  }, [entry.clientId]);
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
    },
    [],
  );

  const scheduleSave = (next: TaskFields) => {
    if (!instant) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onSave(next), 400);
  };

  const patch = (partial: Partial<TaskFields>, debounce = false) => {
    const next = { ...draft, ...partial };
    setDraft(next);
    if (instant) {
      if (debounce) scheduleSave(next);
      else onSave(next);
    }
  };

  const setAthlete = (value: string) => {
    const clientId = value === "general" ? undefined : value;
    setClientSel(clientId);
    if (instant) onMove(clientId);
  };

  const applyRepeat = (value: string) => {
    const option = value as RepeatOption;
    if (option === "none") {
      const next = { ...draft };
      delete next.repeat;
      patch(next);
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
    patch({ repeat });
  };

  const repeat = draft.repeat;
  const repeatValue = repeatOption(repeat);
  const patchReminder = (date: string, time: string) => {
    const next = { ...draft };
    if (date) next.reminderAt = `${date}T${time || "09:00"}`;
    else delete next.reminderAt;
    if (!next.reminderAt) delete next.reminderShownAt;
    setDraft(next);
    if (instant) onSave(next);
  };

  const fields = (
    <>
      <Input
        label="Title"
        value={draft.title}
        onChange={(event) => patch({ title: event.currentTarget.value }, true)}
      />
      <SearchableSelect
        label="Athlete"
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
      <DatePicker
        label="Date"
        value={draft.deadline ?? ""}
        onValueChange={(value) =>
          patch(value ? { deadline: value } : { deadline: undefined })
        }
      />
      <Select
        label="Repeat"
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
        <Button variant="ghost" size="sm" onClick={onSnooze}>
          <Bell size={13} /> Snooze 1 hour
        </Button>
      )}
      <Toggle
        label="High priority"
        checked={draft.priority === "high"}
        onChange={(checked) =>
          patch(checked ? { priority: "high" } : { priority: undefined })
        }
      />
      <TextArea
        label="Notes"
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
          onClick={() => {
            if (clientSel !== entry.clientId) onMove(clientSel);
            onSave(draft, clientSel);
            onClose();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
