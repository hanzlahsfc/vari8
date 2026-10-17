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
  assignTemplate,
  type CoachClient,
  DAYS,
  eventsBetween,
  formatDate,
  TODAY,
  uid,
  unreadCount,
} from "./model";
import { ClientPlansSummary } from "./plans/setup-ui";
import { useCoach } from "./store";
import { templateSetup } from "./template-setup";
import { PreviewDialog } from "./templates";
import "./workspace-polish.css";
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
            <Surface key={c.id} className="cd-roster-card-surface">
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
  const tab = route.tab ?? "Overview";
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
  const assignedSetup = c.assignment
    ? templateSetup(c.assignment.snapshot, c.assignment.variantId)
    : undefined;
  const hasEditablePlan =
    Boolean(
      c.plans &&
        (c.plans.nutrition.mealPlan.draft ||
          c.plans.nutrition.mealPlan.active ||
          c.plans.nutrition.iifym.draft ||
          c.plans.nutrition.iifym.active ||
          c.plans.training.draft ||
          c.plans.training.active ||
          c.plans.goals.length > 0),
    ) || c.habits.length > 0;
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
        {["Overview", "Plans", "Check-ins", "Notes & tasks", "Onboarding"].map(
          (t) => (
            <Button
              key={t}
              aria-pressed={tab === t}
              onClick={() =>
                navigate({
                  ...route,
                  section: "clients",
                  client: c.id,
                  tab: t === "Overview" ? undefined : t,
                })
              }
            >
              {t}
            </Button>
          ),
        )}
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
              <span>
                <strong>{c.assignment?.snapshot.name ?? "Not assigned"}</strong>
                {assignedSetup && (
                  <small>
                    {assignedSetup.views.join(" · ")} · Nutrition:{" "}
                    {assignedSetup.views.some(
                      (view) => view === "Nutrition" || view === "Mealplan",
                    )
                      ? assignedSetup.nutrition
                      : "not included"}{" "}
                    · Habits: {assignedSetup.habits ? "enabled" : "off"}
                  </small>
                )}
              </span>
            </div>

            <div className="cd-actions cd-wrap cd-profile-actions">
              <Button disabled={!c.assignment} onClick={() => setPreview(true)}>
                <EyeIcon />
                Preview assigned tool
              </Button>
              <Button primary={!c.assignment} onClick={() => setAssign(true)}>
                <Users size={14} />
                {c.assignment ? "Change assignment" : "Assign template"}
              </Button>
              {c.assignment && (
                <Button
                  primary
                  onClick={() =>
                    navigate({
                      ...route,
                      section: "clients",
                      client: c.id,
                      plan: "setup",
                      tab: "Plans",
                    })
                  }
                >
                  {hasEditablePlan ? "Edit plans" : "Continue setup"}
                  <ArrowUpRight size={14} />
                </Button>
              )}
            </div>
            <ClientPlansSummary client={c} />
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
              <Button
                className="cd-profile-add-date"
                onClick={() => setExtra(true)}
              >
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
          </div>
        </div>
      )}
      {tab === "Plans" && (
        <ClientPlansSummary
          client={c}
          expanded
          onAssign={() => setAssign(true)}
        />
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
          title={`Assign a setup to ${c.name}`}
          onClose={() => setAssign(false)}
        >
          {state.templates.length === 0 ? (
            <div className="cd-assignment-empty">
              <p>No saved templates yet.</p>
              <Button
                primary
                onClick={() => {
                  setAssign(false);
                  navigate({
                    ...route,
                    section: "templates",
                    editor: uid("template"),
                    client: c.id,
                  });
                }}
              >
                Create a template
              </Button>
              <Button onClick={() => setAssign(false)}>Cancel</Button>
            </div>
          ) : (
            <>
              <p className="cd-muted">
                Choose a saved setup. The client’s plans and history stay with
                their profile.
              </p>
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
            </>
          )}
        </Dialog>
      )}
      {extra && (
        <ExtraDateDialog clientId={c.id} onClose={() => setExtra(false)} />
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
  const { state, setState, toast, navigate, route } = useCoach();
  const t = state.templates.find((t) => t.id === templateId);
  if (!t) return null;
  const configuration = templateSetup(t, t.defaultVariant);
  return (
    <div className="cd-assignment-review">
      <h3>{t.name}</h3>
      <p className="cd-assignment-description">
        {t.description || "No description"}
      </p>
      <div className="cd-assignment-views">
        <strong>Included views</strong>
        <span>{configuration.views.join(" · ") || "No views configured"}</span>
      </div>
      <div className="cd-assignment-views">
        <strong>Nutrition</strong>
        <span>
          {configuration.views.some(
            (view) => view === "Nutrition" || view === "Mealplan",
          )
            ? configuration.nutrition
            : "Not configured"}
        </span>
      </div>
      <div className="cd-assignment-views">
        <strong>Training</strong>
        <span>
          {configuration.views.includes("Training Program")
            ? "Training program included"
            : "Not configured"}
        </span>
      </div>
      <div className="cd-assignment-views">
        <strong>Habits</strong>
        <span>{configuration.habits ? "Enabled" : "Not enabled"}</span>
      </div>
      <div className="cd-dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          primary
          onClick={() => {
            setState((s) => assignTemplate(s, client.id, t, t.defaultVariant));
            toast("Template assigned; client plans and history retained");
            onClose();
            navigate({
              ...route,
              section: "clients",
              client: client.id,
              plan: "setup",
              tab: "Plans",
            });
          }}
        >
          Assign & personalize
        </Button>
      </div>
    </div>
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
