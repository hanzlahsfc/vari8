"use client";

import { ArrowUpRight, Bell, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Checkbox, SegmentedControl, Tabs } from "../vari8/components";
import { TextArea } from "../vari8/inputs";
import { Section } from "../vari8/layouts";
import {
  createCoachTask,
  deleteCoachTask,
  fetchCoachTasks,
  setCoachTaskCompleted,
} from "../data/notes";
import { type CoachState, uid } from "./model";
import { useCoach } from "./store";
import {
  Button,
  DateField,
  DateTimeField,
  Dialog,
  Empty,
  IconButton,
  PageTitle,
  SearchBox,
  Select,
  Surface,
} from "./ui";
import "./notes.css";

type Item = {
  id: string;
  text: string;
  clientId?: string;
  owner: string;
  complete?: boolean;
  deadline?: string;
  reminderAt?: string;
  notes?: string;
  priority?: "low" | "normal" | "high";
};
type Editor = { kind: "note" | "todo"; item?: Item };
function parsePriority(value: string): NonNullable<Item["priority"]> {
  if (value === "low" || value === "high") return value;
  return "normal";
}

export function NotesWorkspace() {
  const {
    state,
    setState,
    navigate,
    toast,
    hydrated,
    workspaceId,
    clientProfileIdFor,
  } = useCoach();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("Open");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [text, setText] = useState("");
  const [destination, setDestination] = useState("workspace");
  const [tab, setTab] = useState<"todos" | "notes">("todos");
  const [deadline, setDeadline] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [todoNotes, setTodoNotes] = useState("");
  const [priority, setPriority] = useState<Item["priority"]>("normal");
  // W2-A4: the workspace to-do list is remote (coach-tasks routes). The first
  // read wins over the local seed and over any legacy stored rows. Only the
  // workspace rows list here: a client-destined to-do belongs to that
  // client's profile, so the read carries no clientProfileId.
  const todosLoaded = useRef(false);
  useEffect(() => {
    if (!hydrated || !workspaceId || todosLoaded.current) return;
    todosLoaded.current = true;
    fetchCoachTasks(workspaceId)
      .then((todos) => setState((s) => ({ ...s, coachTodos: todos })))
      .catch(() => {
        todosLoaded.current = false;
      });
  }, [hydrated, workspaceId, setState]);
  /** Canvas client id -> the backend profile id the routes key on. */
  const profileIdFor = (canvasId?: string) => {
    const client = state.clients.find((c) => c.id === canvasId);
    return client ? clientProfileIdFor(client.name) : Promise.resolve(null);
  };
  /** POST a new to-do, then swap the optimistic row for the returned view. */
  const createTodo = (item: Item) => {
    setState((s) => change(s, "todo", item, "save"));
    if (!workspaceId) return;
    void (async () => {
      try {
        const clientProfileId = await profileIdFor(item.clientId);
        const todo = await createCoachTask(
          workspaceId,
          item.text,
          clientProfileId ?? undefined,
        );
        // The optimistic row landed in the workspace list or on the client
        // record; swap its local id for the server one either way so the
        // completion and delete calls address the real row.
        setState((s) => ({
          ...s,
          coachTodos: (s.coachTodos ?? []).map((t) =>
            t.id === item.id ? { ...t, id: todo.id, revision: todo.revision } : t,
          ),
          clients: s.clients.map((c) =>
            c.id !== item.clientId
              ? c
              : {
                  ...c,
                  coachTasks: c.coachTasks.map((t) =>
                    t.id === item.id ? { ...t, id: todo.id } : t,
                  ),
                },
          ),
        }));
      } catch {
        toast("To-do could not be saved.");
      }
    })();
  };
  const clients = state.clients.filter((c) => !c.archived);
  const notes: Item[] = [
    ...(state.coachNotes ?? []).map((n) => ({ ...n, owner: "Workspace" })),
    ...clients.flatMap((c) =>
      c.internalNotes.map((n) => ({ ...n, owner: c.name, clientId: c.id })),
    ),
  ];
  const todos: Item[] = [
    ...(state.coachTodos ?? []).map((t) => ({
      ...t,
      text: t.title,
      owner: "Workspace",
      clientId: t.clientId,
    })),
    ...clients.flatMap((c) =>
      c.coachTasks.map((t) => ({
        ...t,
        text: t.title,
        owner: c.name,
        clientId: c.id,
      })),
    ),
  ];
  const matches = (item: Item) =>
    (scope === "all" || (item.clientId ?? "workspace") === scope) &&
    `${item.text} ${item.owner}`.toLowerCase().includes(search.toLowerCase());
  const visibleNotes = notes.filter(matches);
  const visibleTodos = todos
    .filter(matches)
    .filter((t) => status === "All" || t.complete === (status === "Completed"));
  const openEditor = (kind: Editor["kind"], item?: Item) => {
    setText(item?.text ?? "");
    setDestination(item?.clientId ?? (scope !== "all" ? scope : "workspace"));
    setDeadline(item?.deadline ?? "");
    setReminderAt(item?.reminderAt ?? "");
    setTodoNotes(item?.notes ?? "");
    setPriority(item?.priority ?? "normal");
    setEditor({ kind, item });
  };
  const change = (
    s: CoachState,
    kind: Editor["kind"],
    item: Item,
    action: "save" | "delete" | "toggle",
  ): CoachState => {
    if (item.clientId)
      return {
        ...s,
        clients: s.clients.map((c) =>
          c.id !== item.clientId
            ? c
            : kind === "note"
              ? {
                  ...c,
                  internalNotes:
                    action === "delete"
                      ? c.internalNotes.filter((n) => n.id !== item.id)
                      : c.internalNotes.some((n) => n.id === item.id)
                        ? c.internalNotes.map((n) =>
                            n.id === item.id ? { ...n, text: item.text } : n,
                          )
                        : [
                            ...c.internalNotes,
                            { id: item.id, text: item.text },
                          ],
                }
              : {
                  ...c,
                  coachTasks:
                    action === "delete"
                      ? c.coachTasks.filter((t) => t.id !== item.id)
                      : c.coachTasks.some((t) => t.id === item.id)
                        ? c.coachTasks.map((t) =>
                            t.id === item.id
                              ? {
                                  ...t,
                                  title: item.text,
                                  deadline: item.deadline,
                                  reminderAt: item.reminderAt,
                                  notes: item.notes,
                                  priority: item.priority,
                                  complete:
                                    action === "toggle"
                                      ? !t.complete
                                      : (item.complete ?? t.complete),
                                }
                              : t,
                          )
                        : [
                            ...c.coachTasks,
                            {
                              id: item.id,
                              title: item.text,
                              complete: item.complete ?? false,
                              deadline: item.deadline,
                              reminderAt: item.reminderAt,
                              notes: item.notes,
                              priority: item.priority,
                            },
                          ],
                },
        ),
      };
    if (kind === "note")
      return {
        ...s,
        coachNotes:
          action === "delete"
            ? (s.coachNotes ?? []).filter((n) => n.id !== item.id)
            : (s.coachNotes ?? []).some((n) => n.id === item.id)
              ? (s.coachNotes ?? []).map((n) =>
                  n.id === item.id ? { ...n, text: item.text } : n,
                )
              : [...(s.coachNotes ?? []), { id: item.id, text: item.text }],
      };
    return {
      ...s,
      coachTodos:
        action === "delete"
          ? (s.coachTodos ?? []).filter((t) => t.id !== item.id)
          : (s.coachTodos ?? []).some((t) => t.id === item.id)
            ? (s.coachTodos ?? []).map((t) =>
                t.id === item.id
                  ? {
                      ...t,
                      title: item.text,
                      complete:
                        action === "toggle"
                          ? !t.complete
                          : (item.complete ?? t.complete),
                      deadline: item.deadline,
                      reminderAt: item.reminderAt,
                      notes: item.notes,
                      priority: item.priority,
                    }
                  : t,
              )
            : [
                ...(s.coachTodos ?? []),
                {
                  id: item.id,
                  title: item.text,
                  complete: item.complete ?? false,
                  deadline: item.deadline,
                  reminderAt: item.reminderAt,
                  notes: item.notes,
                  priority: item.priority,
                  clientId: item.clientId,
                },
              ],
    };
  };
  const remove = (kind: Editor["kind"], item: Item) => {
    setState((s) => change(s, kind, item, "delete"));
    if (kind === "todo" && workspaceId) {
      // The server soft deletes and there is no restore route, so this drop
      // carries no undo.
      deleteCoachTask(workspaceId, item.id).catch(() =>
        toast("To-do could not be removed."),
      );
      toast("To-do removed.");
      return;
    }
    toast(`${kind === "note" ? "Note" : "To-do"} removed.`, () =>
      setState((s) => change(s, kind, item, "save")),
    );
  };
  const owner = (item: Item) =>
    item.clientId ? (
      <button
        type="button"
        className="cd-notes-owner"
        onClick={() => navigate({ section: "clients", client: item.clientId })}
      >
        {item.owner}
        <ArrowUpRight size={13} />
      </button>
    ) : (
      <span className="cd-notes-owner">Workspace</span>
    );
  return (
    <>
      <PageTitle
        title="Notes & to-dos"
        description="Your private notes and follow-ups, across the workspace."
        actions={
          <>
            <Button onClick={() => openEditor("note")}>
              <Plus size={15} />
              Add note
            </Button>
            <Button primary onClick={() => openEditor("todo")}>
              <Plus size={15} />
              Add to-do
            </Button>
          </>
        }
      />
      <div className="cd-notes-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search notes, to-dos or athletes"
        />
        <Select
          label="Show notes and to-dos for"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "Everyone & workspace" },
            { value: "workspace", label: "Workspace only" },
            ...clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>
      <Tabs
        label="Notes and to-dos"
        value={tab}
        onValueChange={(value) => setTab(value as "todos" | "notes")}
        className="cd-notes-tabs cd-notes-columns"
        items={[
          {
            value: "todos",
            label: `To-dos (${todos.filter((t) => !t.complete && matches(t)).length})`,
            content: (
              <Surface className="cd-notes-section">
                <Section
                  title="To-dos"
                  actions={
                    <span>
                      {todos.filter((t) => !t.complete && matches(t)).length}{" "}
                      open
                    </span>
                  }
                >
                  <SegmentedControl
                    label="To-do status"
                    value={status}
                    onValueChange={setStatus}
                    className="cd-notes-status"
                    options={["Open", "Completed", "All"].map((value) => ({
                      value,
                      label: value,
                    }))}
                  />
                  {visibleTodos.length ? (
                    <ul className="cd-notes-list">
                      {visibleTodos.map((t) => (
                        <li
                          key={`${t.clientId ?? "workspace"}-${t.id}`}
                          className="cd-notes-todo"
                        >
                          <Checkbox
                            label={t.text}
                            className={`cd-notes-todo-checkbox ${t.complete ? "is-complete" : ""}`}
                            checked={Boolean(t.complete)}
                            onCheckedChange={() => {
                              setState((s) => change(s, "todo", t, "toggle"));
                              if (!workspaceId) return;
                              setCoachTaskCompleted(
                                workspaceId,
                                t.id,
                                !t.complete,
                              ).catch(() => toast("To-do could not be saved."));
                            }}
                          />
                          {t.notes && (
                            <p className="cd-notes-text cd-todo-notes">
                              {t.notes}
                            </p>
                          )}
                          <div className="cd-notes-item-footer">
                            {owner(t)}
                            <span
                              className={`cd-todo-priority is-${t.priority ?? "normal"}`}
                            >
                              {t.priority ?? "normal"}
                            </span>
                            {t.deadline && (
                              <time dateTime={t.deadline}>
                                Due {t.deadline}
                              </time>
                            )}
                            {t.reminderAt && (
                              <span title={`In-app reminder ${t.reminderAt}`}>
                                <Bell size={13} /> Reminder
                              </span>
                            )}
                            <div className="cd-actions">
                              <IconButton
                                label={`Edit to-do: ${t.text}`}
                                onClick={() => openEditor("todo", t)}
                              >
                                <Pencil size={15} />
                              </IconButton>
                              <IconButton
                                label={`Remove to-do: ${t.text}`}
                                onClick={() => remove("todo", t)}
                              >
                                <Trash2 size={15} />
                              </IconButton>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty
                      title="No to-dos here"
                      action={
                        <Button onClick={() => openEditor("todo")}>
                          Add to-do
                        </Button>
                      }
                    >
                      {search
                        ? "Try another search or scope."
                        : status === "Completed"
                          ? "Completed to-dos will appear here."
                          : "Add a follow-up for yourself or an athlete."}
                    </Empty>
                  )}
                </Section>
              </Surface>
            ),
          },
          {
            value: "notes",
            label: `Private notes (${visibleNotes.length})`,
            content: (
              <Surface className="cd-notes-section">
                <Section
                  title="Private notes"
                  actions={<span>{visibleNotes.length}</span>}
                >
                  {visibleNotes.length ? (
                    <ul className="cd-notes-list">
                      {visibleNotes.map((n) => (
                        <li key={`${n.clientId ?? "workspace"}-${n.id}`}>
                          <p className="cd-notes-text">{n.text}</p>
                          <div className="cd-notes-item-footer">
                            {owner(n)}
                            <div className="cd-actions">
                              <IconButton
                                label={`Edit note: ${n.text}`}
                                onClick={() => openEditor("note", n)}
                              >
                                <Pencil size={15} />
                              </IconButton>
                              <IconButton
                                label={`Remove note: ${n.text}`}
                                onClick={() => remove("note", n)}
                              >
                                <Trash2 size={15} />
                              </IconButton>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty
                      title="No notes here"
                      action={
                        <Button onClick={() => openEditor("note")}>
                          Add note
                        </Button>
                      }
                    >
                      {search
                        ? "Try another search or scope."
                        : "Keep a workspace note or link it to an athlete."}
                    </Empty>
                  )}
                </Section>
              </Surface>
            ),
          },
        ]}
      />
      {editor && (
        <Dialog
          title={`${editor.item ? "Edit" : "Add"} ${editor.kind === "note" ? "note" : "to-do"}`}
          onClose={() => setEditor(null)}
        >
          <form
            className="cd-notes-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              const item: Item = editor.item
                ? { ...editor.item, text: text.trim() }
                : {
                    id: uid(editor.kind),
                    text: text.trim(),
                    owner: "",
                    clientId:
                      destination === "workspace" ? undefined : destination,
                    complete: false,
                  };
              if (editor.kind === "todo") {
                item.deadline = deadline || undefined;
                item.reminderAt = reminderAt || undefined;
                item.notes = todoNotes.trim() || undefined;
                item.priority = priority;
                item.clientId =
                  destination === "workspace" ? undefined : destination;
              }
              // ponytail: coach-tasks exposes no title edit, so editing an
              // existing to-do stays a local paint until the next read. Add a
              // title PATCH once the route carries one.
              if (editor.kind === "todo" && !editor.item) createTodo(item);
              else setState((s) => change(s, editor.kind, item, "save"));
              setEditor(null);
              toast(`${editor.kind === "note" ? "Note" : "To-do"} saved.`);
            }}
          >
            <Select
              label="Keep in"
              value={destination}
              onChange={setDestination}
              disabled={Boolean(editor.item)}
              options={[
                { value: "workspace", label: "Workspace · no athlete" },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <TextArea
              label={editor.kind === "note" ? "Note" : "To-do"}
              required
              autoFocus
              rows={editor.kind === "note" ? 5 : 3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {editor.kind === "todo" && (
              <>
                <DateField
                  label="Deadline"
                  value={deadline}
                  onChange={setDeadline}
                />
                <DateTimeField
                  label="In-app reminder"
                  value={reminderAt}
                  onChange={setReminderAt}
                />
                <div className="cd-field-hint">
                  <small>
                    Shown in this workspace when its reminder time arrives.
                  </small>
                </div>
                <Select
                  label="Priority"
                  value={priority ?? "normal"}
                  onChange={(value) => setPriority(parsePriority(value))}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "normal", label: "Normal" },
                    { value: "high", label: "High" },
                  ]}
                />
                <TextArea
                  label="Notes"
                  rows={3}
                  value={todoNotes}
                  onChange={(e) => setTodoNotes(e.target.value)}
                />
              </>
            )}
            <p className="cd-caption">
              Private to you. Athlete-linked items also appear in their profile.
            </p>
            <div className="cd-actions">
              <Button onClick={() => setEditor(null)}>Cancel</Button>
              <Button type="submit" primary disabled={!text.trim()}>
                Save {editor.kind === "note" ? "note" : "to-do"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
