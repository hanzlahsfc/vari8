"use client";

import { ArrowUpRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
};
type Editor = { kind: "note" | "todo"; item?: Item };

export function NotesWorkspace() {
  const { state, setState, navigate, toast } = useCoach();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("Open");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [text, setText] = useState("");
  const [destination, setDestination] = useState("workspace");
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
                                  complete:
                                    action === "toggle"
                                      ? !t.complete
                                      : t.complete,
                                }
                              : t,
                          )
                        : [
                            ...c.coachTasks,
                            {
                              id: item.id,
                              title: item.text,
                              complete: item.complete ?? false,
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
                      complete: action === "toggle" ? !t.complete : t.complete,
                    }
                  : t,
              )
            : [
                ...(s.coachTodos ?? []),
                {
                  id: item.id,
                  title: item.text,
                  complete: item.complete ?? false,
                },
              ],
    };
  };
  const remove = (kind: Editor["kind"], item: Item) => {
    setState((s) => change(s, kind, item, "delete"));
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
      <div className="cd-notes-columns">
        <Surface className="cd-notes-section">
          <div className="cd-notes-heading">
            <h2>To-dos</h2>
            <span>
              {todos.filter((t) => !t.complete && matches(t)).length} open
            </span>
          </div>
          <fieldset
            className="cd-tabs cd-notes-status"
            aria-label="To-do status"
          >
            {["Open", "Completed", "All"].map((value) => (
              <Button
                type="button"
                aria-pressed={status === value}
                key={value}
                onClick={() => setStatus(value)}
              >
                {value}
              </Button>
            ))}
          </fieldset>
          {visibleTodos.length ? (
            <ul className="cd-notes-list">
              {visibleTodos.map((t) => (
                <li
                  key={`${t.clientId ?? "workspace"}-${t.id}`}
                  className="cd-notes-todo"
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={t.complete}
                      onChange={() =>
                        setState((s) => change(s, "todo", t, "toggle"))
                      }
                    />
                    <span className={t.complete ? "is-complete" : ""}>
                      {t.text}
                    </span>
                  </label>
                  <div className="cd-notes-item-footer">
                    {owner(t)}
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
                <Button onClick={() => openEditor("todo")}>Add to-do</Button>
              }
            >
              {search
                ? "Try another search or scope."
                : status === "Completed"
                  ? "Completed to-dos will appear here."
                  : "Add a follow-up for yourself or an athlete."}
            </Empty>
          )}
        </Surface>
        <Surface className="cd-notes-section">
          <div className="cd-notes-heading">
            <h2>Private notes</h2>
            <span>{visibleNotes.length}</span>
          </div>
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
                <Button onClick={() => openEditor("note")}>Add note</Button>
              }
            >
              {search
                ? "Try another search or scope."
                : "Keep a workspace note or link it to an athlete."}
            </Empty>
          )}
        </Surface>
      </div>
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
              setState((s) => change(s, editor.kind, item, "save"));
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
            <label className="cd-field">
              {editor.kind === "note" ? "Note" : "To-do"}
              <textarea
                required
                autoFocus
                rows={editor.kind === "note" ? 5 : 3}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
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
