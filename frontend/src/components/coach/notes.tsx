"use client";

import { ArrowUpRight, Bell, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { SegmentedControl, Tabs } from "../vari8/components";
import { TextArea } from "../vari8/inputs";
import { Section } from "../vari8/layouts";
import { type CoachState, uid } from "./model";
import { useCoach } from "./store";
import {
  Button,
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
type Editor = { kind: "note"; item?: Item };

export function NotesWorkspace() {
  const { state, setState, navigate, toast } = useCoach();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("Open");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [text, setText] = useState("");
  const [destination, setDestination] = useState("workspace");
  const [tab, setTab] = useState<"todos" | "notes">("todos");
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
  const openEditor = (item?: Item) => {
    setText(item?.text ?? "");
    setDestination(item?.clientId ?? (scope !== "all" ? scope : "workspace"));
    setEditor({ kind: "note", item });
  };
  const change = (
    s: CoachState,
    item: Item,
    action: "save" | "delete",
  ): CoachState => {
    if (item.clientId)
      return {
        ...s,
        clients: s.clients.map((c) =>
          c.id !== item.clientId
            ? c
            : {
                ...c,
                internalNotes:
                  action === "delete"
                    ? c.internalNotes.filter((n) => n.id !== item.id)
                    : c.internalNotes.some((n) => n.id === item.id)
                      ? c.internalNotes.map((n) =>
                          n.id === item.id ? { ...n, text: item.text } : n,
                        )
                      : [...c.internalNotes, { id: item.id, text: item.text }],
              },
        ),
      };
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
  };
  const remove = (item: Item) => {
    setState((s) => change(s, item, "delete"));
    toast("Note removed.", () => setState((s) => change(s, item, "save")));
  };
  const openTask = (item: Item) =>
    navigate({
      section: "tasks",
      task: `${item.clientId ?? "general"}:${item.id}`,
    });
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
            <Button onClick={() => navigate({ section: "tasks" })}>
              Open Tasks
            </Button>
            <Button primary onClick={() => openEditor()}>
              <Plus size={15} />
              Add note
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
                          <span
                            className={`cd-notes-todo-title ${t.complete ? "is-complete" : ""}`}
                          >
                            {t.complete && (
                              <Check size={13} aria-hidden="true" />
                            )}
                            {t.text}
                          </span>
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
                                label={`Open to-do in Tasks: ${t.text}`}
                                onClick={() => openTask(t)}
                              >
                                <ArrowUpRight size={15} />
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
                        <Button onClick={() => navigate({ section: "tasks" })}>
                          Open Tasks
                        </Button>
                      }
                    >
                      {search
                        ? "Try another search or scope."
                        : status === "Completed"
                          ? "Completed to-dos will appear here."
                          : "Tasks are managed in the Tasks section."}
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
                                onClick={() => openEditor(n)}
                              >
                                <Pencil size={15} />
                              </IconButton>
                              <IconButton
                                label={`Remove note: ${n.text}`}
                                onClick={() => remove(n)}
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
                        <Button onClick={() => openEditor()}>Add note</Button>
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
          title={`${editor.item ? "Edit" : "Add"} note`}
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
                    id: uid("note"),
                    text: text.trim(),
                    owner: "",
                    clientId:
                      destination === "workspace" ? undefined : destination,
                  };
              setState((s) => change(s, item, "save"));
              setEditor(null);
              toast("Note saved.");
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
              label="Note"
              required
              autoFocus
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="cd-caption">
              Private to you. Athlete-linked items also appear in their profile.
            </p>
            <div className="cd-actions">
              <Button onClick={() => setEditor(null)}>Cancel</Button>
              <Button type="submit" primary disabled={!text.trim()}>
                Save note
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
