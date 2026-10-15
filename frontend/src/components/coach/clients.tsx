"use client";
import {
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  LayoutGrid,
  List,
  MessageCircle,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  addDays,
  type CoachClient,
  DAYS,
  eventsBetween,
  formatDate,
  type Plan,
  TODAY,
  uid,
  unreadCount,
} from "./model";
import { useCoach } from "./store";
import { templateSetup } from "./template-setup";
import { PreviewDialog } from "./templates";
import {
  Avatar,
  Button,
  Dialog,
  Empty,
  IconButton,
  PageTitle,
  SearchBox,
  Select,
  Status,
  Surface,
  Toggle,
} from "./ui";
export function nextEvent(
  state: ReturnType<typeof useCoach>["state"],
  id: string,
) {
  return eventsBetween(state, TODAY, addDays(TODAY, 35)).find(
    (e) => e.clientId === id && !e.submission,
  );
}
export function ClientsWorkspace() {
  const { state, navigate, route } = useCoach();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All athletes");
  const [sort, setSort] = useState("Name");
  const [view, setView] = useState("Table");
  const attention = useCallback(
    (c: CoachClient) =>
      state.submissions.filter((s) => s.clientId === c.id && !s.response)
        .length +
      unreadCount(state, c.id) +
      c.clientTasks.filter((t) => t.status === "overdue").length,
    [state],
  );
  const list = useMemo(
    () =>
      state.clients
        .filter(
          (c) =>
            !c.archived &&
            `${c.name} ${c.label} ${c.phase} ${c.assignment?.snapshot.name}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .filter(
          (c) =>
            filter === "All athletes" ||
            (filter === "Needs attention"
              ? attention(c) > 0
              : unreadCount(state, c.id) > 0),
        )
        .sort((a, b) =>
          sort === "Name"
            ? a.name.localeCompare(b.name)
            : sort === "Attention"
              ? attention(b) - attention(a)
              : (nextEvent(state, a.id)?.date ?? "9999").localeCompare(
                  nextEvent(state, b.id)?.date ?? "9999",
                ),
        ),
    [state, search, filter, sort, attention],
  );
  if (route.client) {
    const c = state.clients.find((c) => c.id === route.client);
    return c ? (
      <ClientProfile client={c} />
    ) : (
      <Empty
        title="Athlete not found"
        action={
          <Button onClick={() => navigate({ section: "clients" })}>
            Back to athletes
          </Button>
        }
      />
    );
  }
  return (
    <>
      <PageTitle
        title="Clients"
        description="The people behind the progress."
      />
      <div className="cd-roster-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search athletes, labels or phases"
        />
        <Select
          label="Filter athletes"
          value={filter}
          options={["All athletes", "Needs attention", "Unread messages"]}
          onChange={setFilter}
        />
        <Select
          label="Sort athletes"
          value={sort}
          options={["Name", "Attention", "Next check-in"]}
          onChange={setSort}
        />
        <div className="cd-tabs">
          <IconButton
            label="Table view"
            aria-pressed={view === "Table"}
            onClick={() => setView("Table")}
          >
            <List size={17} />
          </IconButton>
          <IconButton
            label="Card view"
            aria-pressed={view === "Cards"}
            onClick={() => setView("Cards")}
          >
            <LayoutGrid size={17} />
          </IconButton>
        </div>
      </div>
      {list.length === 0 ? (
        <Surface>
          <Empty
            title="No athletes match"
            action={
              <Button
                onClick={() => {
                  setSearch("");
                  setFilter("All athletes");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </Surface>
      ) : view === "Table" ? (
        <Surface>
          <div className="cd-table-scroll">
            <table className="cd-table cd-roster-table">
              <thead>
                <tr>
                  <th>Athlete</th>
                  <th>Coaching</th>
                  <th>Assigned template</th>
                  <th>Next check-in</th>
                  <th>Attention</th>
                  <th>
                    <span className="cd-sr">Open profile</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        type="button"
                        className="cd-person-button"
                        onClick={() =>
                          navigate({ section: "clients", client: c.id })
                        }
                      >
                        <Avatar client={c} />
                        <span>
                          <strong>{c.name}</strong>
                          <small>{c.label}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      {c.phase}
                      <small>Week {c.week}</small>
                    </td>
                    <td>
                      {c.assignment?.snapshot.name ?? "Not assigned"}
                      {c.assignment && (
                        <small>
                          {templateSetup(c.assignment.snapshot).views.length}{" "}
                          tabs
                        </small>
                      )}
                    </td>
                    <td>
                      {nextEvent(state, c.id)
                        ? formatDate(nextEvent(state, c.id)?.date ?? TODAY)
                        : "No scheduled dates"}
                    </td>
                    <td>
                      <div className="cd-roster-signals">
                        {state.submissions.some(
                          (s) => s.clientId === c.id && !s.response,
                        ) && (
                          <span>
                            <ClipboardCheck size={14} />
                            Awaiting feedback
                          </span>
                        )}
                        {unreadCount(state, c.id) > 0 && (
                          <span>
                            <MessageCircle size={14} />
                            {unreadCount(state, c.id)} unread
                          </span>
                        )}
                        {c.clientTasks.some((t) => t.status === "overdue") && (
                          <span>Overdue task</span>
                        )}
                        {attention(c) === 0 && (
                          <span className="cd-muted">Up to date</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <IconButton
                        label={`Open ${c.name}`}
                        onClick={() =>
                          navigate({ section: "clients", client: c.id })
                        }
                      >
                        <ArrowUpRight size={17} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : (
        <div className="cd-roster-cards">
          {list.map((c) => (
            <Surface key={c.id}>
              <button
                type="button"
                className="cd-roster-card"
                onClick={() => navigate({ section: "clients", client: c.id })}
              >
                <Avatar client={c} />
                <h2>{c.name}</h2>
                <p>
                  {c.label} · {c.phase}
                </p>
                <small>Coaching since {formatDate(c.coachingSince)}</small>
                <div className="cd-stat-row">
                  <span>Next check-in</span>
                  <strong>
                    {nextEvent(state, c.id)
                      ? formatDate(nextEvent(state, c.id)?.date ?? TODAY)
                      : "Not scheduled"}
                  </strong>
                </div>
                <span>
                  {attention(c)
                    ? `${attention(c)} items need attention`
                    : "Up to date"}
                </span>
              </button>
            </Surface>
          ))}
        </div>
      )}
    </>
  );
}
function ClientProfile({ client: c }: { client: CoachClient }) {
  const { state, setState, navigate, route, toast } = useCoach();
  const [tab, setTab] = useState("Overview");
  const [preview, setPreview] = useState(false);
  const [assign, setAssign] = useState(false);
  const [templateId, setTemplate] = useState(state.templates[0]?.id ?? "");
  const [text, setText] = useState("");
  const [newKind, setNewKind] = useState("Private coach note");
  const [extra, setExtra] = useState(false);
  const update = (fn: (c: CoachClient) => CoachClient) =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((client) =>
        client.id === c.id ? fn(client) : client,
      ),
    }));
  const activeSchedule = c.schedules.at(-1);
  const history = state.submissions
    .filter((s) => s.clientId === c.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const next = nextEvent(state, c.id);
  return (
    <>
      <PageTitle
        title={c.name}
        description={`${c.label} · ${c.phase} · Week ${c.week}`}
        back={() => navigate({ section: "clients" })}
        actions={
          <>
            <Button
              onClick={() => navigate({ section: "check-ins", client: c.id })}
            >
              <CalendarDays size={16} />
              Check-in calendar
            </Button>
            <Button
              primary
              onClick={() => navigate({ section: "messages", client: c.id })}
            >
              <MessageCircle size={16} />
              Open chat
              {unreadCount(state, c.id) > 0 && (
                <span>{unreadCount(state, c.id)}</span>
              )}
            </Button>
          </>
        }
      />
      <div className="cd-profile-summary">
        <Avatar client={c} />
        <div>
          <strong>{c.email}</strong>
          <small>
            Coaching since {formatDate(c.coachingSince, { year: "numeric" })} ·{" "}
            {c.heightCm} cm
          </small>
        </div>
        <div className="cd-profile-next">
          <span>Next check-in</span>
          <strong>
            {next
              ? formatDate(next.date, { weekday: "short" })
              : "Not scheduled"}
          </strong>
        </div>
      </div>
      <div className="cd-tabs cd-profile-tabs">
        {["Overview", "Check-ins", "Notes & tasks", "Onboarding"].map((t) => (
          <Button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>
      {tab === "Overview" && (
        <div className="cd-profile-grid">
          <Surface>
            <h2>Client setup</h2>
            <div className="cd-stat-row">
              <span>Current bodyweight</span>
              <strong>{c.entries.at(-1)?.weight} kg</strong>
            </div>
            <div className="cd-stat-row">
              <span>Assigned template</span>
              <strong>{c.assignment?.snapshot.name ?? "Not assigned"}</strong>
            </div>

            <div className="cd-actions cd-wrap">
              <Button disabled={!c.assignment} onClick={() => setPreview(true)}>
                <EyeIcon />
                Preview assigned tool
              </Button>
              <Button
                disabled={!state.templates.length}
                onClick={() => setAssign(true)}
              >
                <Users size={14} />
                Change assignment
              </Button>
            </div>
            <h3>Plans & targets</h3>
            <div className="cd-stat-row">
              <span>{c.plan.nutritionVariant}</span>
              <strong>
                {c.plan.calories} kcal · {c.plan.protein} g protein
              </strong>
            </div>
            <div className="cd-stat-row">
              <span>{c.plan.program} program</span>
              <strong>
                {c.plan.program === "Week-based"
                  ? `${c.plan.weeks} weeks`
                  : "Ongoing"}
              </strong>
            </div>
            <div className="cd-actions cd-wrap">
              <Button
                onClick={() =>
                  navigate({
                    section: "clients",
                    client: c.id,
                    plan: "nutrition",
                  })
                }
              >
                Open nutrition setup
                <ArrowUpRight size={14} />
              </Button>
              <Button
                onClick={() =>
                  navigate({
                    section: "clients",
                    client: c.id,
                    plan: "training",
                  })
                }
              >
                Open training setup
                <ArrowUpRight size={14} />
              </Button>
            </div>
            <h3>Habit setup · independent tracker</h3>
            {c.habits.map((h, i) => (
              <div className="cd-habit-setup" key={h.id}>
                <label className="cd-field">
                  Habit
                  <input
                    value={h.name}
                    onChange={(e) =>
                      update((c) => ({
                        ...c,
                        habits: c.habits.map((x, n) =>
                          n === i ? { ...x, name: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </label>
                <div className="cd-two-fields">
                  <label className="cd-field">
                    Frequency
                    <input
                      value={h.frequency}
                      onChange={(e) =>
                        update((c) => ({
                          ...c,
                          habits: c.habits.map((x, n) =>
                            n === i ? { ...x, frequency: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="cd-field">
                    Goal
                    <input
                      value={h.goal}
                      onChange={(e) =>
                        update((c) => ({
                          ...c,
                          habits: c.habits.map((x, n) =>
                            n === i ? { ...x, goal: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="cd-field">
                  Purpose
                  <input
                    value={h.reason}
                    onChange={(e) =>
                      update((c) => ({
                        ...c,
                        habits: c.habits.map((x, n) =>
                          n === i ? { ...x, reason: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </label>
                <small>{h.completed} / 7 logged this week</small>
                <IconButton
                  label="Remove habit"
                  onClick={() =>
                    update((c) => ({
                      ...c,
                      habits: c.habits.filter((_, n) => n !== i),
                    }))
                  }
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
            <Button
              onClick={() =>
                update((c) => ({
                  ...c,
                  habits: [
                    ...c.habits,
                    {
                      id: uid("habit"),
                      name: "New habit",
                      frequency: "Daily",
                      goal: "",
                      reason: "",
                      completed: 0,
                    },
                  ],
                }))
              }
            >
              <Plus size={14} />
              Add habit
            </Button>
          </Surface>
          <div className="cd-profile-side">
            <Surface>
              <h2>Coaching rhythm</h2>
              <p className="cd-muted">Recurring check-ins · Europe/Vienna</p>
              <div className="cd-weekdays">
                {DAYS.map((d, i) => (
                  <button
                    type="button"
                    key={d}
                    aria-label={d}
                    aria-pressed={activeSchedule?.weekdays.includes(i) ?? false}
                    onClick={() => {
                      const oldDays = c.schedules.at(-1)?.weekdays ?? [];
                      const weekdays = oldDays.includes(i)
                        ? oldDays.filter((d) => d !== i)
                        : [...oldDays, i];
                      update((c) => ({
                        ...c,
                        schedules: [
                          ...c.schedules.filter(
                            (s) => s.effective !== addDays(TODAY, 1),
                          ),
                          { effective: addDays(TODAY, 1), weekdays },
                        ],
                      }));
                      toast(
                        "Recurring schedule updated from tomorrow. Submitted history retained.",
                      );
                    }}
                  >
                    {d.slice(0, 2)}
                  </button>
                ))}
              </div>
              {c.schedules.some((s) => s.effective > TODAY) && (
                <p className="cd-caption">
                  From tomorrow:{" "}
                  {c.schedules
                    .at(-1)
                    ?.weekdays.map((d) => DAYS[d])
                    .join(", ") || "No recurring days"}
                </p>
              )}
              <h3>Additional dates</h3>
              {state.extras
                .filter((e) => e.clientId === c.id)
                .map((e) => (
                  <div className="cd-setting-row" key={e.id}>
                    <span>
                      {formatDate(e.date)}
                      <small>
                        {e.type} · {e.note}
                      </small>
                    </span>
                    <Button
                      onClick={() =>
                        navigate({ section: "check-ins", client: c.id })
                      }
                    >
                      Manage
                    </Button>
                  </div>
                ))}
              {!state.extras.some((e) => e.clientId === c.id) && (
                <p className="cd-muted">No additional dates.</p>
              )}
              <Button onClick={() => setExtra(true)}>
                <Plus size={14} />
                Add date
              </Button>
            </Surface>
            <Surface>
              <h2>Priority messages</h2>
              <Toggle
                label="Allow priority flags"
                detail="Applies to new chat flags. Training set notes stay separate."
                checked={c.priorityMessages}
                onChange={(priorityMessages) =>
                  update((c) => ({ ...c, priorityMessages }))
                }
              />
            </Surface>
            <Surface>
              <h2>Recent entries</h2>
              {c.entries.slice(-3).map((e) => (
                <div className="cd-stat-row" key={e.date}>
                  <span>{formatDate(e.date)}</span>
                  <strong>
                    {e.weight} kg · {e.sleep}h sleep
                  </strong>
                </div>
              ))}
            </Surface>
          </div>
        </div>
      )}
      {tab === "Check-ins" && (
        <Surface>
          <h2>Submission history</h2>
          {history.length ? (
            history.map((s) => (
              <div className="cd-history-row" key={s.id}>
                <div>
                  <strong>{formatDate(s.date, { year: "numeric" })}</strong>
                  <small>
                    {s.type} check-in · {s.note || s.answers[0]?.answer}
                  </small>
                </div>
                <Status
                  text={s.response ? "Feedback sent" : "Awaiting feedback"}
                />
                <Button
                  onClick={() =>
                    navigate({
                      section: "check-ins",
                      review: s.id,
                      client: c.id,
                    })
                  }
                >
                  Open review
                  <ArrowUpRight size={14} />
                </Button>
              </div>
            ))
          ) : (
            <Empty title="No submissions yet">
              Scheduled dates will appear in the shared calendar.
            </Empty>
          )}
          <Button
            onClick={() => navigate({ section: "check-ins", client: c.id })}
          >
            <CalendarDays size={14} />
            Open calendar
          </Button>
        </Surface>
      )}
      {tab === "Notes & tasks" && (
        <div className="cd-profile-grid">
          <Surface>
            <h2>Private coach notes</h2>
            <p className="cd-muted">Visible only in your workspace.</p>
            {c.internalNotes.map((n) => (
              <div className="cd-setting-row" key={n.id}>
                <p>{n.text}</p>
                <IconButton
                  label="Remove coach note"
                  onClick={() =>
                    update((c) => ({
                      ...c,
                      internalNotes: c.internalNotes.filter(
                        (x) => x.id !== n.id,
                      ),
                    }))
                  }
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
            <h3>General coaching notes</h3>
            {c.generalNotes.map((n) => (
              <p className="cd-note-text" key={n.id}>
                {n.text}
              </p>
            ))}
            <h3>Your to-dos</h3>
            {c.coachTasks.map((t) => (
              <label className="cd-task" key={t.id}>
                <input
                  type="checkbox"
                  checked={t.complete}
                  onChange={(e) =>
                    update((c) => ({
                      ...c,
                      coachTasks: c.coachTasks.map((x) =>
                        x.id === t.id
                          ? { ...x, complete: e.target.checked }
                          : x,
                      ),
                    }))
                  }
                />
                <span>{t.title}</span>
              </label>
            ))}
            <Select
              label="Add to"
              value={newKind}
              onChange={setNewKind}
              options={[
                "Private coach note",
                "Coach to-do",
                "Client-assigned task",
              ]}
            />
            <label className="cd-field">
              {newKind}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
              />
            </label>
            <Button
              primary
              disabled={!text.trim()}
              onClick={() => {
                const id = uid("note");
                update((c) =>
                  newKind === "Private coach note"
                    ? {
                        ...c,
                        internalNotes: [
                          ...c.internalNotes,
                          { id, text: text.trim() },
                        ],
                      }
                    : newKind === "Coach to-do"
                      ? {
                          ...c,
                          coachTasks: [
                            ...c.coachTasks,
                            { id, title: text.trim(), complete: false },
                          ],
                        }
                      : {
                          ...c,
                          clientTasks: [
                            ...c.clientTasks,
                            {
                              id,
                              title: text.trim(),
                              dueDate: addDays(TODAY, 7),
                              status: "open",
                            },
                          ],
                        },
                );
                setText("");
              }}
            >
              Add
            </Button>
          </Surface>
          <Surface>
            <h2>Client-assigned tasks</h2>
            <p className="cd-muted">
              {c.clientTasks.filter((t) => t.status === "complete").length}{" "}
              completed ·{" "}
              {c.clientTasks.filter((t) => t.status === "overdue").length}{" "}
              overdue
            </p>
            {c.clientTasks.map((t) => (
              <div className="cd-client-task" key={t.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={t.status === "complete"}
                    onChange={(e) =>
                      update((c) => ({
                        ...c,
                        clientTasks: c.clientTasks.map((x) =>
                          x.id === t.id
                            ? {
                                ...x,
                                status: e.target.checked
                                  ? "complete"
                                  : x.dueDate < TODAY
                                    ? "overdue"
                                    : "open",
                              }
                            : x,
                        ),
                      }))
                    }
                  />
                  {t.title}
                </label>
                <small>
                  {formatDate(t.dueDate)} · {t.status}
                </small>
              </div>
            ))}
          </Surface>
        </div>
      )}
      {tab === "Onboarding" && (
        <Surface>
          <h2>Submitted onboarding</h2>
          <p className="cd-muted">
            Original answers retained with {c.name.split(" ")[0]}’s profile.
          </p>
          {c.onboarding.map((a) => (
            <div className="cd-answer" key={a.question}>
              <h3>{a.question}</h3>
              <p>{a.answer}</p>
            </div>
          ))}
        </Surface>
      )}
      {preview && c.assignment && (
        <PreviewDialog
          template={c.assignment.snapshot}
          client={c}
          onClose={() => setPreview(false)}
        />
      )}
      {assign && (
        <Dialog
          title="Choose a saved template"
          onClose={() => setAssign(false)}
        >
          <Select
            label="Template"
            value={templateId}
            options={state.templates.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            onChange={setTemplate}
          />

          {state.templates.find((t) => t.id === templateId) && (
            <AssignmentInline
              client={c}
              templateId={templateId}
              onClose={() => setAssign(false)}
            />
          )}
        </Dialog>
      )}
      {extra && (
        <ExtraDateDialog clientId={c.id} onClose={() => setExtra(false)} />
      )}
      {route.plan && (
        <PlanDialog
          client={c}
          kind={route.plan}
          onClose={() => navigate({ section: "clients", client: c.id })}
          onApply={(plan) => {
            update((c) => ({ ...c, plan }));
            toast("Client plan updated");
            navigate({ section: "clients", client: c.id });
          }}
        />
      )}
    </>
  );
}
function EyeIcon() {
  return <ArrowUpRight size={14} />;
}
function AssignmentInline({
  client,
  templateId,
  onClose,
}: {
  client: CoachClient;
  templateId: string;
  onClose: () => void;
}) {
  const { state, setState, toast } = useCoach();
  const t = state.templates.find((t) => t.id === templateId);
  if (!t) return null;
  return (
    <Button
      primary
      onClick={() => {
        const snapshot = structuredClone(t);
        setState((s) => ({
          ...s,
          clients: s.clients.map((c) =>
            c.id === client.id
              ? {
                  ...c,
                  assignment: {
                    templateId,
                    variantId: templateSetup(t).id,
                    snapshot,
                  },
                }
              : c,
          ),
        }));
        toast("Template assigned; athlete history retained");
        onClose();
      }}
    >
      Assign to {client.name.split(" ")[0]}
    </Button>
  );
}
export function ExtraDateDialog({
  clientId,
  onClose,
  existing,
  initialDate,
}: {
  clientId?: string;
  onClose: () => void;
  existing?: import("./model").Extra;
  initialDate?: string;
}) {
  const { state, setState, toast } = useCoach();
  const [client, setClient] = useState(
    existing?.clientId ?? clientId ?? state.clients[0]?.id ?? "",
  );
  const [date, setDate] = useState(
    existing?.date ?? initialDate ?? addDays(TODAY, 1),
  );
  const [type, setType] = useState(existing?.type ?? "Custom");
  const [note, setNote] = useState(existing?.note ?? "");
  const duplicate = state.extras.some(
    (e) => e.clientId === client && e.date === date && e.id !== existing?.id,
  );
  return (
    <Dialog
      title={
        existing
          ? "Reschedule additional check-in"
          : "Add an extra check-in date"
      }
      onClose={onClose}
    >
      <Select
        label="Athlete"
        value={client}
        options={state.clients.map((c) => ({ value: c.id, label: c.name }))}
        onChange={setClient}
      />
      <label className="cd-field">
        Date · Europe/Vienna
        <input
          type="date"
          min={TODAY}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <Select
        label="Requested update"
        value={type}
        options={["Custom", "Full"]}
        onChange={(v) => setType(v as "Full" | "Custom")}
      />
      <label className="cd-field">
        Note to athlete
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What would you like to follow up on?"
        />
      </label>
      {duplicate && (
        <p role="alert" className="cd-error">
          This athlete already has an additional request on this date.
        </p>
      )}
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          primary
          disabled={!client || !date || date < TODAY || duplicate}
          onClick={() => {
            const x = {
              id: existing?.id ?? uid("extra"),
              clientId: client,
              date,
              type,
              note,
            };
            setState((s) => ({
              ...s,
              extras: existing
                ? s.extras.map((e) => (e.id === existing.id ? x : e))
                : [...s.extras, x],
            }));
            toast(
              existing
                ? "Additional date updated"
                : "Additional check-in scheduled",
            );
            onClose();
          }}
        >
          Save date
        </Button>
      </div>
    </Dialog>
  );
}
export function PlanDialog({
  client,
  kind,
  onClose,
  onApply,
}: {
  client: CoachClient;
  kind: string;
  onClose: () => void;
  onApply: (plan: Plan) => void;
}) {
  const [plan, setPlan] = useState({ ...client.plan });
  const nutrition = kind === "nutrition";
  const valid =
    Number.isFinite(plan.calories) &&
    plan.calories > 0 &&
    Number.isFinite(plan.protein) &&
    plan.protein > 0 &&
    Number.isInteger(plan.sets) &&
    plan.sets > 0 &&
    plan.sets <= 20 &&
    plan.weeks > 0 &&
    plan.weeks <= 52;
  return (
    <Dialog
      title={`${nutrition ? "Nutrition" : "Training"} setup · ${client.name.split(" ")[0]}`}
      onClose={onClose}
    >
      {nutrition ? (
        <>
          <Select
            label="Nutrition option"
            value={plan.nutritionVariant}
            options={["Training day", "Rest day"]}
            onChange={(v) =>
              setPlan((p) => ({
                ...p,
                nutritionVariant: v as Plan["nutritionVariant"],
              }))
            }
          />
          <div className="cd-two-fields">
            <label className="cd-field">
              Daily energy target · kcal
              <input
                type="number"
                min={1}
                value={plan.calories}
                onChange={(e) =>
                  setPlan((p) => ({
                    ...p,
                    calories: e.target.valueAsNumber || 0,
                  }))
                }
              />
            </label>
            <label className="cd-field">
              Protein target · g
              <input
                type="number"
                min={1}
                value={plan.protein}
                onChange={(e) =>
                  setPlan((p) => ({
                    ...p,
                    protein: e.target.valueAsNumber || 0,
                  }))
                }
              />
            </label>
          </div>
          <h3>Current meals</h3>
          <p className="cd-muted">
            07:30 Breakfast · 12:30 Lunch · 19:00 Dinner
          </p>
        </>
      ) : (
        <>
          <Select
            label="Program type"
            value={plan.program}
            options={["Evergreen", "Week-based"]}
            onChange={(v) =>
              setPlan((p) => ({ ...p, program: v as Plan["program"] }))
            }
          />
          {plan.program === "Week-based" && (
            <label className="cd-field">
              Number of weeks
              <input
                type="number"
                min={1}
                max={52}
                value={plan.weeks}
                onChange={(e) =>
                  setPlan((p) => ({ ...p, weeks: e.target.valueAsNumber || 0 }))
                }
              />
            </label>
          )}
          <label className="cd-field">
            Split squat · working sets
            <input
              type="number"
              min={1}
              max={20}
              value={plan.sets}
              onChange={(e) =>
                setPlan((p) => ({ ...p, sets: e.target.valueAsNumber || 0 }))
              }
            />
          </label>
          <label className="cd-field">
            Exercise instructions
            <textarea
              value={plan.instructions}
              onChange={(e) =>
                setPlan((p) => ({ ...p, instructions: e.target.value }))
              }
              rows={3}
            />
          </label>
        </>
      )}
      {!valid && (
        <p className="cd-error" role="alert">
          Use positive targets, 1–20 sets and 1–52 weeks.
        </p>
      )}
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button primary disabled={!valid} onClick={() => onApply(plan)}>
          Apply adjustment
        </Button>
      </div>
    </Dialog>
  );
}
