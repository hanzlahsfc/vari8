// Coach note domain logic shared by the Notes section and the athlete
// profile. Pure functions over CoachState — storage keeps its two legacy
// locations (state.coachNotes, client.internalNotes) so saved workspaces
// need no migration. Legacy coachNotes entries that carry a clientId are
// treated as belonging to that athlete, mirroring the task model.

import type { ClientNote, NoteCategory } from "../ethereal/clients/model";
import { type CoachClient, type CoachState, formatDate } from "./model";

export type NoteEntry = {
  /** Owner athlete id; undefined = General (workspace, no athlete). */
  clientId?: string;
  client?: CoachClient;
  note: ClientNote;
};
export type NoteRef = { id: string; clientId?: string };
/** Stored records may carry a legacy clientId link inside coachNotes. */
type StoredNote = ClientNote & { clientId?: string };
export type RemovedNote = {
  note: StoredNote;
  clientId?: string;
  where: "notes" | "client";
  index: number;
};

/** Stable scope+id key — unique even when ids collide across owners. */
export const noteKey = (ref: NoteRef | NoteEntry) =>
  `${ref.clientId ?? ""}${"note" in ref ? ref.note.id : ref.id}`;

/** Provisional category set from the handoff — labels are not yet
 * owner-approved. */
export const NOTE_CATEGORIES: { id: NoteCategory; label: string }[] = [
  { id: "health", label: "Health & injuries" },
  { id: "schedule", label: "Schedule & availability" },
  { id: "training", label: "Training" },
  { id: "nutrition", label: "Nutrition" },
  { id: "prep", label: "Prep & posing" },
  { id: "other", label: "Other" },
];
const KNOWN = new Set<NoteCategory>(NOTE_CATEGORIES.map((c) => c.id));
/** Uncategorised (or unrecognised legacy) notes display as Other. */
export const categoryOf = (note: ClientNote): NoteCategory =>
  note.category && KNOWN.has(note.category) ? note.category : "other";
export const categoryLabel = (id?: NoteCategory) =>
  NOTE_CATEGORIES.find((c) => c.id === id)?.label ?? "Other";

export function listNotes(
  state: CoachState,
  options: { includeArchived?: boolean } = {},
): NoteEntry[] {
  const entries: NoteEntry[] = [];
  const clientById = new Map(state.clients.map((c) => [c.id, c]));
  for (const note of (state.coachNotes ?? []) as StoredNote[]) {
    const client = note.clientId ? clientById.get(note.clientId) : undefined;
    if (client?.archived && !options.includeArchived) continue;
    entries.push({ clientId: note.clientId, client, note });
  }
  for (const client of state.clients) {
    if (client.archived && !options.includeArchived) continue;
    for (const note of client.internalNotes)
      entries.push({ clientId: client.id, client, note });
  }
  return entries;
}

export function findNote(
  state: CoachState,
  ref: NoteRef,
): NoteEntry | undefined {
  return listNotes(state, { includeArchived: true }).find(
    (entry) => entry.note.id === ref.id && entry.clientId === ref.clientId,
  );
}

type Located = {
  where: "notes" | "client";
  clientId?: string;
  index: number;
  note: StoredNote;
};
/** Locate the stored record addressed by an owner-scoped ref. General refs
 * only match coachNotes entries without a clientId; athlete refs match
 * that athlete's internalNotes plus legacy coachNotes carrying the id. */
function locateRecord(state: CoachState, ref: NoteRef): Located | null {
  const notes = (state.coachNotes ?? []) as StoredNote[];
  const notesIndex = notes.findIndex(
    (n) => n.id === ref.id && (n.clientId ?? undefined) === ref.clientId,
  );
  if (notesIndex >= 0)
    return {
      where: "notes",
      clientId: notes[notesIndex].clientId,
      index: notesIndex,
      note: notes[notesIndex],
    };
  if (ref.clientId) {
    const client = state.clients.find((c) => c.id === ref.clientId);
    const index = client?.internalNotes.findIndex((n) => n.id === ref.id) ?? -1;
    if (client && index >= 0)
      return {
        where: "client",
        clientId: client.id,
        index,
        note: client.internalNotes[index],
      };
  }
  return null;
}

function insertAt<T>(list: T[], index: number, item: T): T[] {
  return [
    ...list.slice(0, Math.min(index, list.length)),
    item,
    ...list.slice(Math.min(index, list.length)),
  ];
}

/** Merge a field-scoped patch onto the current record; undefined-valued
 * keys delete the field. */
function applyEdits(at: Located, fields: Partial<ClientNote>): StoredNote {
  const stored: StoredNote = { ...at.note };
  for (const [key, value] of Object.entries(fields) as [
    keyof ClientNote,
    unknown,
  ][]) {
    if (value === undefined) delete stored[key];
    else (stored as Record<string, unknown>)[key] = value;
  }
  return stored;
}

function writeLocated(
  state: CoachState,
  at: Located,
  stored: StoredNote,
): CoachState {
  if (at.where === "notes")
    return {
      ...state,
      coachNotes: (state.coachNotes ?? []).map((n, i) =>
        i === at.index ? stored : n,
      ),
    };
  return {
    ...state,
    clients: state.clients.map((c) =>
      c.id === at.clientId
        ? {
            ...c,
            internalNotes: c.internalNotes.map((n, i) =>
              i === at.index ? stored : n,
            ),
          }
        : c,
    ),
  };
}

/** Update an existing record addressed by an exact scoped ref, merging only
 * `fields` (undefined-valued keys delete). Never creates and never searches
 * beyond the ref's scope — a late write for a deleted or moved-away note is
 * a no-op, and only the edited fields can overwrite. This is the autosave
 * path: a debounced write can never recreate a removed note or clobber a
 * different record that happens to share the id. */
export function updateNote(
  state: CoachState,
  ref: NoteRef,
  fields: Partial<ClientNote>,
): CoachState {
  const at = locateRecord(state, ref);
  if (!at) return state;
  return writeLocated(state, at, applyEdits(at, fields));
}

/** Write a NEW note into `clientId`'s scope (undefined = General). An id
 * already stored at that scope is updated in place instead — a replayed
 * create never duplicates. */
export function saveNote(
  state: CoachState,
  note: ClientNote,
  clientId: string | undefined,
): CoachState {
  const at = locateRecord(state, { id: note.id, clientId });
  if (at) return writeLocated(state, at, { ...at.note, ...note });
  if (!clientId)
    return { ...state, coachNotes: [...(state.coachNotes ?? []), note] };
  const forAthlete = { ...note };
  delete (forAthlete as StoredNote).clientId;
  return {
    ...state,
    clients: state.clients.map((c) =>
      c.id === clientId
        ? { ...c, internalNotes: [...c.internalNotes, forAthlete] }
        : c,
    ),
  };
}

export type NoteMoveResult =
  | { state: CoachState; moved: true; ref: NoteRef }
  | {
      state: CoachState;
      moved: false;
      reason: "source-gone" | "no-destination" | "id-conflict";
    };

/** Move a note to `clientId`'s scope (undefined = General), applying any
 * pending field edits to the verified source in the same transition — a
 * debounced autosave never has to choose between the old and new owner.
 * The source is resolved by exact scoped ref and the destination validated
 * BEFORE anything is removed or appended; success is explicit. Records
 * relocate between the two storage locations so athlete-owned notes always
 * live in `client.internalNotes` (read directly by the profile and the
 * overview pinned card) and General notes in `coachNotes`. */
export function moveNote(
  state: CoachState,
  ref: NoteRef,
  clientId: string | undefined,
  fields?: Partial<ClientNote>,
): NoteMoveResult {
  const at = locateRecord(state, ref);
  if (!at) return { state, moved: false, reason: "source-gone" };
  if (clientId && !state.clients.some((c) => c.id === clientId))
    return { state, moved: false, reason: "no-destination" };
  if ((at.clientId ?? undefined) === clientId) {
    return {
      state: fields ? writeLocated(state, at, applyEdits(at, fields)) : state,
      moved: true,
      ref: { id: ref.id, clientId },
    };
  }
  if (locateRecord(state, { id: ref.id, clientId }))
    return { state, moved: false, reason: "id-conflict" };
  // Scopes differ — relocate the record between the two storage locations
  // so athlete-owned notes always live in internalNotes (the profile and
  // overview card read it directly) and General notes in coachNotes.
  const moved = applyEdits(at, fields ?? {});
  delete moved.clientId;
  const removedState =
    at.where === "notes"
      ? {
          ...state,
          coachNotes: (state.coachNotes ?? []).filter((_, i) => i !== at.index),
        }
      : {
          ...state,
          clients: state.clients.map((c) =>
            c.id === at.clientId
              ? {
                  ...c,
                  internalNotes: c.internalNotes.filter(
                    (_, i) => i !== at.index,
                  ),
                }
              : c,
          ),
        };
  if (!clientId)
    return {
      state: {
        ...removedState,
        coachNotes: [...(removedState.coachNotes ?? []), moved],
      },
      moved: true,
      ref: { id: ref.id, clientId },
    };
  return {
    state: {
      ...removedState,
      clients: removedState.clients.map((c) =>
        c.id === clientId
          ? { ...c, internalNotes: [...c.internalNotes, moved] }
          : c,
      ),
    },
    moved: true,
    ref: { id: ref.id, clientId },
  };
}

export function deleteNote(
  state: CoachState,
  ref: NoteRef,
): { state: CoachState; removed?: RemovedNote } {
  const at = locateRecord(state, ref);
  if (!at) return { state };
  const removed: RemovedNote = {
    note: at.note,
    clientId: at.clientId,
    where: at.where,
    index: at.index,
  };
  if (at.where === "notes")
    return {
      state: {
        ...state,
        coachNotes: (state.coachNotes ?? []).filter((_, i) => i !== at.index),
      },
      removed,
    };
  return {
    state: {
      ...state,
      clients: state.clients.map((c) =>
        c.id === at.clientId
          ? {
              ...c,
              internalNotes: c.internalNotes.filter((_, i) => i !== at.index),
            }
          : c,
      ),
    },
    removed,
  };
}

/** Restore a deleted note at its original index and scope. A record that
 * now lives at the destination with the same id is left alone instead of
 * duplicated. */
export function restoreNote(
  state: CoachState,
  removed: RemovedNote,
): CoachState {
  if (locateRecord(state, { id: removed.note.id, clientId: removed.clientId }))
    return state;
  const copy = { ...removed.note };
  if (removed.where === "client" && removed.clientId) {
    delete copy.clientId;
    return {
      ...state,
      clients: state.clients.map((c) =>
        c.id === removed.clientId
          ? {
              ...c,
              internalNotes: insertAt(c.internalNotes, removed.index, copy),
            }
          : c,
      ),
    };
  }
  if (removed.clientId) copy.clientId = removed.clientId;
  else delete copy.clientId;
  return {
    ...state,
    coachNotes: insertAt(state.coachNotes ?? [], removed.index, copy),
  };
}

export function togglePin(state: CoachState, ref: NoteRef): CoachState {
  const at = locateRecord(state, ref);
  if (!at) return state;
  return writeLocated(state, at, {
    ...at.note,
    pinned: !at.note.pinned,
  });
}

// --- Views -----------------------------------------------------------------

/** Title = first non-empty line; empty notes show a placeholder. */
export function noteTitle(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? "New note";
}

/** Preview = the next non-empty line after the title line. */
export function notePreview(text: string): string {
  const lines = text.split("\n").map((l) => l.trim());
  const titleIndex = lines.findIndex((l) => l.length > 0);
  if (titleIndex < 0) return "";
  return lines.slice(titleIndex + 1).find((l) => l.length > 0) ?? "";
}

/** Last-edited sort: dated notes newest first; notes without updatedAt
 * sort after dated ones (never invent dates for legacy data) and keep
 * their stored order for stability. */
export function sortNotes(entries: NoteEntry[]): NoteEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        (b.entry.note.updatedAt ?? "").localeCompare(
          a.entry.note.updatedAt ?? "",
        ) ||
        noteTitle(a.entry.note.text).localeCompare(
          noteTitle(b.entry.note.text),
        ) ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
}

export function searchNotes(entries: NoteEntry[], query: string): NoteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (entry) =>
      entry.note.text.toLowerCase().includes(q) ||
      (entry.client?.name ?? "").toLowerCase().includes(q),
  );
}

export function filterNotes(
  entries: NoteEntry[],
  options: { athlete?: string; category?: string },
): NoteEntry[] {
  let pool = entries;
  const athlete = options.athlete ?? "all";
  if (athlete === "general") pool = pool.filter((e) => !e.clientId);
  else if (athlete !== "all") pool = pool.filter((e) => e.clientId === athlete);
  const category = options.category ?? "all";
  if (category !== "all")
    pool = pool.filter((e) => categoryOf(e.note) === category);
  return pool;
}

const dayDiff = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000,
  );
const dayOf = (value: string) => value.slice(0, 10);

/** "Edited 3 days ago" style label; "" when the note has no updatedAt —
 * legacy notes show no date rather than an invented one. */
export function editedLabel(note: ClientNote, today: string): string {
  if (!note.updatedAt) return "";
  const diff = dayDiff(today, dayOf(note.updatedAt));
  if (diff <= 0) return "Edited today";
  if (diff === 1) return "Edited yesterday";
  if (diff < 7) return `Edited ${diff} days ago`;
  return `Edited ${formatDate(dayOf(note.updatedAt))}`;
}

/** "Created 12 Oct · Edited 14 Oct" supporting line for the editor;
 * falls back to whichever stamp exists, "" for legacy notes. */
export function stampLabel(note: ClientNote, today: string): string {
  const parts: string[] = [];
  if (note.createdAt)
    parts.push(`Created ${formatDate(dayOf(note.createdAt))}`);
  if (note.updatedAt) {
    const diff = dayDiff(today, dayOf(note.updatedAt));
    parts.push(
      diff === 0
        ? "Edited today"
        : `Edited ${formatDate(dayOf(note.updatedAt))}`,
    );
  }
  return parts.join(" · ");
}
