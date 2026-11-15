"use client";

import { ArrowLeft, ArrowUpRight, Pin, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DropdownMenu, SegmentedControl } from "../vari8/components";
import { SearchableSelect, TextArea } from "../vari8/inputs";
import { Section } from "../vari8/layouts";
import { type CoachClient, type CoachNote, uid } from "./model";
import {
  categoryLabel,
  categoryOf,
  deleteNote,
  editedLabel,
  filterNotes,
  findNote,
  listNotes,
  moveNote,
  NOTE_CATEGORIES,
  type NoteEntry,
  type NoteRef,
  noteKey,
  notePreview,
  noteTitle,
  removeNote,
  restoreNote,
  saveNote,
  searchNotes,
  shouldDiscardDraft,
  sortNotes,
  stampLabel,
  updateNote,
} from "./notes-model";
import { useCoach } from "./store";
import { localToday } from "./targets/model";
import { localDateTime } from "./tasks-model";
import {
  Button,
  Empty,
  IconButton,
  PageTitle,
  SearchBox,
  Select,
  Toggle,
} from "./ui";
import "./notes.css";

const AUTOSAVE_MS = 600;

type Draft = { ref: NoteRef; text: string };

export function NotesWorkspace() {
  const { navigate } = useCoach();
  return (
    <Section className="cd-notes-page">
      <PageTitle
        title="Notes"
        description="Private to you. Athlete notes also appear in their profile."
        actions={
          <Button onClick={() => navigate({ section: "tasks" })}>
            Open Tasks
          </Button>
        }
      />
      <NotesView />
    </Section>
  );
}

/** Shared note list + editor for the athlete profile "Notes & tasks" tab,
 * filtered to one athlete. */
export function AthleteNotesPanel({ client }: { client: CoachClient }) {
  return <NotesView fixedClientId={client.id} />;
}

function NotesView({ fixedClientId }: { fixedClientId?: string }) {
  const { state, setState, navigate, toast } = useCoach();
  const today = localToday();
  const [search, setSearch] = useState("");
  const [athlete, setAthlete] = useState("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<NoteRef | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [wide, setWide] = useState(false);

  // Debounced autosave lives here (not inside the editor) so flushes can
  // be ordered ahead of selection changes, moves and the empty-note
  // discard — the pending text always lands on the record it was typed on.
  const draft = useRef<Draft | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Keys of notes created this session that have never stored text — only
  // these may be auto-discarded when left empty. Anything that once held
  // text (a saved draft or any pre-existing note) is a stored record and
  // survives being cleared to empty.
  const freshKeys = useRef<Set<string>>(new Set());
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const d = draft.current;
    if (!d) return;
    draft.current = null;
    if (d.text.trim()) freshKeys.current.delete(noteKey(d.ref));
    setState((s) =>
      updateNote(s, d.ref, {
        text: d.text,
        updatedAt: localDateTime(new Date()),
      }),
    );
  }, [setState]);
  const onDraft = useCallback(
    (ref: NoteRef, text: string) => {
      draft.current = { ref, text };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, AUTOSAVE_MS);
    },
    [flush],
  );

  /** Leave `prev` for `next` in one commit: any pending draft lands first,
   * then an empty never-saved `prev` is discarded — freshly-typed text is
   * always stored before the emptiness check can read it, and existing
   * notes cleared to empty stay stored. */
  const leave = useCallback(
    (prev: NoteRef | null, next: NoteRef | null) => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      const d = draft.current;
      draft.current = null;
      if (d?.text.trim()) freshKeys.current.delete(noteKey(d.ref));
      // The discard decision reads freshKeys inside the updater but never
      // mutates it there — React may invoke updaters more than once and a
      // second pass must reach the same state. Keys are retired when the
      // draft stores text; a key left for a discarded note is inert.
      const prevLeft =
        prev && (!next || noteKey(prev) !== noteKey(next)) ? prev : null;
      setState((s) => {
        let out = d
          ? updateNote(s, d.ref, {
              text: d.text,
              updatedAt: localDateTime(new Date()),
            })
          : s;
        if (prevLeft && shouldDiscardDraft(out, prevLeft, freshKeys.current))
          out = deleteNote(out, prevLeft).state;
        return out;
      });
      setSelected(next);
    },
    [setState],
  );

  // Leaving the section entirely: commit the pending draft, then drop the
  // note if it was still an empty draft — including one that was created
  // but never typed into.
  const selectedRef = useRef<NoteRef | null>(null);
  selectedRef.current = selected;
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      const d = draft.current;
      draft.current = null;
      if (d?.text.trim()) freshKeys.current.delete(noteKey(d.ref));
      const open = selectedRef.current;
      const ref = d?.ref ?? open;
      setState((s) => {
        let next = d
          ? updateNote(s, d.ref, {
              text: d.text,
              updatedAt: localDateTime(new Date()),
            })
          : s;
        if (ref && shouldDiscardDraft(next, ref, freshKeys.current))
          next = deleteNote(next, ref).state;
        return next;
      });
    },
    [setState],
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const athletes = useMemo(() => state.clients, [state.clients]);

  const create = useCallback(() => {
    const scope =
      fixedClientId ??
      (athlete !== "all" && athlete !== "general" ? athlete : undefined);
    const id = uid("note");
    const now = localDateTime(new Date());
    leave(selected, { id, clientId: scope });
    freshKeys.current.add(noteKey({ id, clientId: scope }));
    setState((s) =>
      saveNote(s, { id, text: "", createdAt: now, updatedAt: now }, scope),
    );
    setFocusId(id);
  }, [fixedClientId, athlete, leave, selected, setState]);

  // "N" creates a new note when focus is not in a field — the workspace
  // only; the profile panel leaves N to the task quick add beside it.
  useEffect(() => {
    if (fixedClientId) return;
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
      create();
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fixedClientId, create]);

  const entries = useMemo(
    () => listNotes(state, { includeArchived: true }),
    [state],
  );
  const visible = useMemo(
    () =>
      sortNotes(
        searchNotes(
          filterNotes(entries, {
            athlete: fixedClientId ?? athlete,
            category,
          }),
          search,
        ),
      ),
    [entries, fixedClientId, athlete, category, search],
  );
  const pinned = visible.filter((e) => e.note.pinned);
  const rest = visible.filter((e) => !e.note.pinned);

  const selectedEntry = selected ? findNote(state, selected) : undefined;

  const remove = useCallback(
    (entry: NoteEntry) => {
      // The pending draft is folded into the removed record in the same
      // transition so Undo restores the latest text — and clearing the
      // pending write means no delayed autosave can recreate it.
      const ref: NoteRef = { id: entry.note.id, clientId: entry.clientId };
      const d =
        draft.current && noteKey(draft.current.ref) === noteKey(entry)
          ? draft.current
          : null;
      const fields =
        d && d.text !== entry.note.text
          ? { text: d.text, updatedAt: localDateTime(new Date()) }
          : undefined;
      const result = removeNote(state, ref, fields);
      window.clearTimeout(timer.current);
      timer.current = undefined;
      if (d) draft.current = null;
      setState(result.state);
      if (selected && noteKey(selected) === noteKey(entry)) setSelected(null);
      const removed = result.removed;
      if (removed)
        toast("Note deleted.", () => setState((s) => restoreNote(s, removed)));
    },
    [state, setState, selected, toast],
  );

  const attemptMove = useCallback(
    (entry: NoteEntry, clientId: string | undefined): boolean => {
      // The pending draft travels inside the move so an autosave scheduled
      // before the move can never write it to the old scope — but only
      // once the scoped source and destination have validated. A rejected
      // move leaves the draft armed so the text stays editable and the
      // debounce can still flush to the original scope or on close.
      const d =
        draft.current && noteKey(draft.current.ref) === noteKey(entry)
          ? draft.current
          : null;
      const fields =
        d && d.text !== entry.note.text
          ? { text: d.text, updatedAt: localDateTime(new Date()) }
          : undefined;
      const result = moveNote(
        state,
        { id: entry.note.id, clientId: entry.clientId },
        clientId,
        fields,
      );
      if (!result.moved) {
        toast(
          result.reason === "id-conflict"
            ? "Move blocked — that scope already has a note with this id."
            : result.reason === "no-destination"
              ? "Move blocked — that athlete is no longer available."
              : "Move blocked — the note is no longer there.",
        );
        return false;
      }
      window.clearTimeout(timer.current);
      timer.current = undefined;
      if (d) draft.current = null;
      // A still-fresh draft keeps its draft status under the new scope so
      // leaving it empty can still discard it.
      if (freshKeys.current.delete(noteKey(entry)))
        freshKeys.current.add(noteKey(result.ref));
      setState(result.state);
      setSelected(result.ref);
      const name = clientId
        ? (athletes.find((a) => a.id === clientId)?.name ?? "athlete")
        : "General";
      toast(`Note moved to ${name}.`);
      return true;
    },
    [state, athletes, setState, toast],
  );

  const openAthlete = (entry: NoteEntry) => {
    if (entry.clientId && !fixedClientId)
      navigate({ section: "clients", client: entry.clientId });
  };

  const split = wide && !fixedClientId;
  const showEditor = !!selectedEntry;

  const listBlock = (
    <div className="cd-notes-main">
      <div className="cd-notes-toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search notes or athletes"
          label="Search notes or athletes"
        />
        {!fixedClientId && (
          <SearchableSelect
            label="Athlete"
            value={athlete}
            onValueChange={setAthlete}
            options={[
              { value: "all", label: "Everyone" },
              { value: "general", label: "General" },
              ...athletes
                .filter((a) => !a.archived)
                .map((a) => ({ value: a.id, label: a.name })),
              ...(athletes.some((a) => a.archived)
                ? [
                    {
                      value: "__archived-divider",
                      label: "Archived",
                      disabled: true,
                    },
                    ...athletes
                      .filter((a) => a.archived)
                      .map((a) => ({
                        value: a.id,
                        label: `${a.name} (archived)`,
                      })),
                  ]
                : []),
            ]}
          />
        )}
        <Button primary onClick={create} className="cd-notes-new">
          <Plus size={15} />
          New note
        </Button>
      </div>
      <div className="cd-notes-chips">
        <SegmentedControl
          label="Category"
          value={category}
          onValueChange={setCategory}
          options={[
            { value: "all", label: "All" },
            ...NOTE_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
          ]}
        />
        <span className="v8-field__hint">
          Category names are provisional — not yet approved.
        </span>
      </div>
      {visible.length ? (
        <>
          {pinned.length > 0 && (
            <NoteGroup
              label="Pinned"
              entries={pinned}
              today={today}
              fixedClientId={fixedClientId}
              selected={selected}
              onOpen={(entry) =>
                leave(selected, {
                  id: entry.note.id,
                  clientId: entry.clientId,
                })
              }
              onOpenAthlete={openAthlete}
            />
          )}
          <NoteGroup
            label={pinned.length ? "Notes" : ""}
            entries={rest}
            today={today}
            fixedClientId={fixedClientId}
            selected={selected}
            onOpen={(entry) =>
              leave(selected, {
                id: entry.note.id,
                clientId: entry.clientId,
              })
            }
            onOpenAthlete={openAthlete}
          />
        </>
      ) : (
        <Empty
          title={search ? "Try another search or filter." : "No notes yet."}
          action={
            !search ? (
              <Button onClick={create}>
                <Plus size={15} />
                New note
              </Button>
            ) : undefined
          }
        >
          {search ? "" : "Press N anywhere on this page to start a note."}
        </Empty>
      )}
    </div>
  );

  const editorBlock = selectedEntry && (
    <NoteEditor
      key={noteKey(selectedEntry)}
      entry={selectedEntry}
      initialText={
        draft.current && noteKey(draft.current.ref) === noteKey(selectedEntry)
          ? draft.current.text
          : selectedEntry.note.text
      }
      athletes={athletes}
      today={today}
      autoFocus={focusId === selectedEntry.note.id}
      back={!split}
      fixedClientId={fixedClientId}
      onBack={() => leave(selected, null)}
      onDraft={onDraft}
      onMove={attemptMove}
      onDelete={remove}
    />
  );

  return (
    <div className={`cd-notes ${split && showEditor ? "cd-notes--split" : ""}`}>
      {split || !showEditor ? listBlock : null}
      {showEditor &&
        (split ? (
          <aside className="cd-note-detail" aria-label="Note editor">
            {editorBlock}
          </aside>
        ) : (
          editorBlock
        ))}
    </div>
  );
}

function NoteGroup({
  label,
  entries,
  today,
  fixedClientId,
  selected,
  onOpen,
  onOpenAthlete,
}: {
  label: string;
  entries: NoteEntry[];
  today: string;
  fixedClientId?: string;
  selected: NoteRef | null;
  onOpen: (entry: NoteEntry) => void;
  onOpenAthlete: (entry: NoteEntry) => void;
}) {
  return (
    <section className="cd-note-group">
      {label && (
        <header className="cd-note-group-head">
          <h3>{label}</h3>
        </header>
      )}
      <ul className="cd-note-list">
        {entries.map((entry) => {
          const edited = editedLabel(entry.note, today);
          return (
            <li key={noteKey(entry)} className="cd-note-row">
              <button
                type="button"
                className={`cd-note-main${selected && noteKey(selected) === noteKey(entry) ? " is-selected" : ""}`}
                onClick={() => onOpen(entry)}
              >
                <span className="cd-note-title">
                  {entry.note.pinned && (
                    <Pin size={12} aria-hidden="true" className="cd-note-pin" />
                  )}
                  {noteTitle(entry.note.text)}
                </span>
                {notePreview(entry.note.text) && (
                  <span className="cd-note-preview">
                    {notePreview(entry.note.text)}
                  </span>
                )}
                <span className="cd-note-meta">
                  {entry.client && !fixedClientId ? (
                    <span className="cd-note-owner">
                      {entry.client.archived
                        ? `${entry.client.name} (archived)`
                        : entry.client.name}
                    </span>
                  ) : !entry.clientId && !fixedClientId ? (
                    <span className="cd-note-owner">General</span>
                  ) : null}
                  <span className="cd-note-category">
                    {categoryLabel(categoryOf(entry.note))}
                  </span>
                  {edited && <span>{edited}</span>}
                </span>
              </button>
              {entry.clientId && !fixedClientId && (
                <IconButton
                  label={`Open ${entry.client?.name ?? "athlete"}'s profile`}
                  size="sm"
                  className="cd-note-open"
                  onClick={() => onOpenAthlete(entry)}
                >
                  <ArrowUpRight size={14} />
                </IconButton>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NoteEditor({
  entry,
  initialText,
  athletes,
  today,
  autoFocus,
  back,
  fixedClientId,
  onBack,
  onDraft,
  onMove,
  onDelete,
}: {
  entry: NoteEntry;
  /** Draft text carried across a remount (e.g. a wide↔narrow layout
   * change) — normally the note's stored text. */
  initialText: string;
  athletes: CoachClient[];
  today: string;
  autoFocus?: boolean;
  back?: boolean;
  fixedClientId?: string;
  onBack: () => void;
  onDraft: (ref: NoteRef, text: string) => void;
  onMove: (entry: NoteEntry, clientId: string | undefined) => boolean;
  onDelete: (entry: NoteEntry) => void;
}) {
  const { setState } = useCoach();
  const ref: NoteRef = { id: entry.note.id, clientId: entry.clientId };
  const [text, setText] = useState(initialText);
  const [athlete, setAthlete] = useState(entry.clientId ?? "general");
  const stamp = stampLabel(entry.note, today);

  /** Discrete field edits write immediately through the same scoped
   * update path — they apply at once, not at the next autosave tick. */
  const apply = (fields: Partial<CoachNote>) =>
    setState((s) => updateNote(s, ref, fields));

  return (
    <div className="cd-note-editor">
      <div className="cd-note-editor-bar">
        {back && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={15} />
            Back
          </Button>
        )}
        <span className="cd-note-editor-spacer" />
        <DropdownMenu
          label="More"
          items={[
            {
              id: "delete",
              label: "Delete",
              onSelect: () => onDelete(entry),
            },
          ]}
        />
      </div>
      <TextArea
        label="Note"
        className="cd-note-editor-text"
        value={text}
        autoFocus={autoFocus}
        rows={10}
        placeholder="New note"
        onChange={(event) => {
          setText(event.currentTarget.value);
          onDraft(ref, event.currentTarget.value);
        }}
      />
      <div className="cd-note-editor-fields">
        {!fixedClientId && (
          <SearchableSelect
            label="Athlete"
            value={athlete}
            onValueChange={(value) => {
              const moved = onMove(
                entry,
                value === "general" ? undefined : value,
              );
              // A rejected move keeps the note in its original scope — the
              // select shows where it actually lives.
              setAthlete(moved ? value : (entry.clientId ?? "general"));
            }}
            options={[
              { value: "general", label: "General" },
              ...athletes.map((a) => ({
                value: a.id,
                label: a.archived ? `${a.name} (archived)` : a.name,
              })),
            ]}
          />
        )}
        <Select
          label="Category"
          value={categoryOf(entry.note)}
          onChange={(value) =>
            apply({ category: value as CoachNote["category"] })
          }
          options={NOTE_CATEGORIES.map((c) => ({
            value: c.id,
            label: c.label,
          }))}
        />
        <Toggle
          label="Pinned"
          checked={!!entry.note.pinned}
          onChange={(checked) => apply({ pinned: checked })}
        />
      </div>
      <p className="cd-note-editor-meta">
        {stamp && <span>{stamp}</span>}
        <span>Private to you. Athlete notes also appear in their profile.</span>
      </p>
    </div>
  );
}
