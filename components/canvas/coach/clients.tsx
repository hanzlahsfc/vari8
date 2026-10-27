"use client";
import {
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  MessageCircle,
  Pin,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  Checkbox,
  SegmentedControl,
  Input as SharedInput,
  Tabs,
} from "../vari8/components";
import { TextArea } from "../vari8/inputs";
import { FormGrid, Toolbar } from "../vari8/layouts";
import { AthleteOverview, AthleteProfileHeader } from "./athlete/overview";
import { AthleteTimelineTab } from "./athlete/timeline-tab";
import { AthleteTrackerTab } from "./athlete/tracker-tab";
import {
  addDays,
  assignTemplate,
  type CoachClient,
  eventsBetween,
  formatDate,
  TODAY,
  uid,
  unreadCount,
} from "./model";
import { ClientTrainingLogs } from "./client-training-logs";
import { ClientMediaPanel } from "./media";
import { ClientPlansSummary } from "./plans/setup-ui";
import { useCoach } from "./store";
import { templateSetup } from "./template-setup";
import "./workspace-polish.css";
import {
  Avatar,
  Button,
  DateField,
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
      <Toolbar className="cd-roster-toolbar">
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
        <SegmentedControl
          label="Athlete display"
          value={view}
          onValueChange={setView}
          className="cd-roster-view-control"
          options={[
            { value: "Table", label: "Table" },
            { value: "Cards", label: "Cards" },
          ]}
        />
      </Toolbar>
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
  const { state, setState, navigate, route } = useCoach();
  const tab = route.tab ?? "Overview";
  const [assign, setAssign] = useState(false);
  const [templateId, setTemplate] = useState(state.templates[0]?.id ?? "");
  const [noteText, setNoteText] = useState("");
  const [notePinned, setNotePinned] = useState(false);
  const [todoText, setTodoText] = useState("");
  const [todoDue, setTodoDue] = useState("");
  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState(addDays(TODAY, 7));
  const [extra, setExtra] = useState(false);
  const update = (fn: (c: CoachClient) => CoachClient) =>
    setState((s) => ({
      ...s,
      clients: s.clients.map((client) =>
        client.id === c.id ? fn(client) : client,
      ),
    }));
  const history = state.submissions
    .filter((s) => s.clientId === c.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const profilePanel = (
    <>
      {tab === "Overview" && <AthleteOverview client={c} />}
      {tab === "Timeline" && <AthleteTimelineTab client={c} />}
      {tab === "Tracker" && <AthleteTrackerTab client={c} />}
      {tab === "Plans" && (
        <>
          <ClientPlansSummary
            client={c}
            expanded
            onAssign={() => setAssign(true)}
          />
          <ClientTrainingLogs client={c} />
        </>
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
        <div className="cd-nt-grid">
          <Surface>
            <h2>Private note</h2>
            <p className="cd-muted">Visible only in your workspace.</p>
            <TextArea
              label="Note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
            />
            <Toggle
              label="Pin to overview"
              checked={notePinned}
              onChange={setNotePinned}
            />
            <Button
              primary
              disabled={!noteText.trim()}
              onClick={() => {
                update((c) => ({
                  ...c,
                  internalNotes: [
                    ...c.internalNotes,
                    {
                      id: uid("note"),
                      text: noteText.trim(),
                      ...(notePinned ? { pinned: true } : {}),
                    },
                  ],
                }));
                setNoteText("");
                setNotePinned(false);
              }}
            >
              Add note
            </Button>
            <div className="cd-nt-list">
              {[...c.internalNotes]
                .sort(
                  (a, b) =>
                    Number(b.pinned ?? false) - Number(a.pinned ?? false),
                )
                .map((n) => (
                  <div className="cd-nt-row" key={n.id}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={n.pinned ? "cd-nt-pin is-pinned" : "cd-nt-pin"}
                      onClick={() =>
                        update((c) => ({
                          ...c,
                          internalNotes: c.internalNotes.map((x) =>
                            x.id === n.id ? { ...x, pinned: !x.pinned } : x,
                          ),
                        }))
                      }
                    >
                      <Pin
                        size={13}
                        aria-hidden="true"
                        fill={n.pinned ? "currentColor" : "none"}
                      />
                      {n.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <p data-pinned={n.pinned || undefined}>{n.text}</p>
                    <IconButton
                      label="Remove note"
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
            </div>
            {c.generalNotes.length > 0 && (
              <details className="cd-nt-general">
                <summary>General coaching notes</summary>
                {c.generalNotes.map((n) => (
                  <p className="cd-note-text" key={n.id}>
                    {n.text}
                  </p>
                ))}
              </details>
            )}
          </Surface>
          <Surface>
            <h2>Coach to-do</h2>
            <p className="cd-muted">Your own reminders.</p>
            <SharedInput
              label="To-do"
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
            />
            <DateField
              label="Due (optional)"
              value={todoDue}
              onChange={setTodoDue}
            />
            <Button
              primary
              disabled={!todoText.trim()}
              onClick={() => {
                update((c) => ({
                  ...c,
                  coachTasks: [
                    ...c.coachTasks,
                    {
                      id: uid("task"),
                      title: todoText.trim(),
                      complete: false,
                      ...(todoDue ? { deadline: todoDue } : {}),
                    },
                  ],
                }));
                setTodoText("");
                setTodoDue("");
              }}
            >
              Add to-do
            </Button>
            <div className="cd-nt-list">
              {c.coachTasks.map((t) => (
                <div className="cd-nt-row" key={t.id}>
                  <Checkbox
                    className="cd-task"
                    label={t.title}
                    checked={t.complete}
                    onCheckedChange={(checked) =>
                      update((c) => ({
                        ...c,
                        coachTasks: c.coachTasks.map((x) =>
                          x.id === t.id ? { ...x, complete: checked } : x,
                        ),
                      }))
                    }
                  />
                  {t.deadline && <small>Due {formatDate(t.deadline)}</small>}
                </div>
              ))}
            </div>
          </Surface>
          <Surface>
            <h2>Client task</h2>
            <p className="cd-muted">Assigned to the client app.</p>
            <SharedInput
              label="Task"
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
            />
            <DateField label="Deadline" value={taskDue} onChange={setTaskDue} />
            <Button
              primary
              disabled={!taskText.trim() || !taskDue}
              onClick={() => {
                update((c) => ({
                  ...c,
                  clientTasks: [
                    ...c.clientTasks,
                    {
                      id: uid("task"),
                      title: taskText.trim(),
                      dueDate: taskDue,
                      status: "open",
                    },
                  ],
                }));
                setTaskText("");
              }}
            >
              Assign task
            </Button>
            <div className="cd-nt-list">
              {c.clientTasks.map((t) => {
                const status =
                  t.status === "complete"
                    ? "Done"
                    : t.dueDate < TODAY
                      ? "Overdue"
                      : "Open";
                return (
                  <div className="cd-nt-row" key={t.id}>
                    <span className="cd-nt-task-title">
                      {t.title}
                      <small>Due {formatDate(t.dueDate)}</small>
                    </span>
                    <Status text={status} />
                  </div>
                );
              })}
            </div>
          </Surface>
        </div>
      )}
      {tab === "Media" && <ClientMediaPanel client={c} />}
    </>
  );
  return (
    <>
      <AthleteProfileHeader
        client={c}
        onBack={() => navigate({ section: "clients" })}
        onAssign={() => setAssign(true)}
        onAddDate={() => setExtra(true)}
      />
      <Tabs
        label="Client profile"
        value={tab}
        onValueChange={(value) =>
          navigate({
            ...route,
            section: "clients",
            client: c.id,
            tab: value === "Overview" ? undefined : value,
          })
        }
        className="cd-profile-tabs"
        items={[
          "Overview",
          "Timeline",
          "Tracker",
          "Plans",
          "Check-ins",
          "Notes & tasks",
          "Media",
        ].map((value) => ({
          value,
          label: value,
          content: value === tab ? profilePanel : null,
        }))}
      />
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
      <FormGrid columns={2} className="cd-extra-date-grid">
        <Select
          label="Athlete"
          value={client}
          options={state.clients.map((c) => ({ value: c.id, label: c.name }))}
          onChange={setClient}
        />
        <DateField
          label="Date · Europe/Vienna"
          min={TODAY}
          value={date}
          onChange={setDate}
        />
        <Select
          label="Requested update"
          value={type}
          options={["Custom", "Full"]}
          onChange={(v) => setType(v as "Full" | "Custom")}
        />
        <TextArea
          label="Note to athlete"
          className="cd-dialog-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What would you like to follow up on?"
        />
      </FormGrid>
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
