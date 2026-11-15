import assert from "node:assert/strict";
import { test } from "node:test";
import { isCoachState } from "./model.ts";
import {
  categoryOf,
  deleteNote,
  editedLabel,
  filterNotes,
  findNote,
  listNotes,
  moveNote,
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
  togglePin,
  updateNote,
} from "./notes-model.ts";

const TODAY = "2026-11-13"; // Friday

const client = (id, name, internalNotes = [], archived = false) => ({
  id,
  name,
  initials: "AA",
  label: "",
  phase: "",
  template: "",
  email: "",
  coachingSince: "2026-01-01",
  priorityMessages: false,
  archived,
  internalNotes,
  generalNotes: [],
  coachTasks: [],
  clientTasks: [],
  onboarding: [],
  schedules: [],
  plan: {
    calories: 2200,
    protein: 140,
    sets: 3,
    instructions: "",
    nutritionVariant: "Training day",
    program: "Week-based",
    weeks: 8,
  },
  entries: [],
  habits: [],
});

const workspaceState = ({ coachNotes = [], clients = [], ...rest } = {}) => ({
  version: 1,
  coachTodos: [],
  coachNotes,
  templates: [],
  clients,
  extras: [],
  submissions: [],
  messages: [],
  drafts: {},
  reviewDrafts: {},
  editorDrafts: {},
  preferences: {
    mode: "dark",
    accent: "#EB91B8",
    availability: "",
    notifications: true,
    priorityNotifications: true,
  },
  ...rest,
});

// --- Legacy loading ---------------------------------------------------------

test("legacy notes load unchanged: bare id/text records validate and list", () => {
  const state = workspaceState({
    coachNotes: [{ id: "n1", text: "Coach note" }],
    clients: [
      client("client-001", "Emma Anders", [
        { id: "a1", text: "Athlete note", pinned: true },
      ]),
    ],
  });
  assert.ok(isCoachState(state));
  const entries = listNotes(state);
  assert.equal(entries.length, 2);
  assert.equal(entries.find((e) => e.note.id === "n1").clientId, undefined);
  assert.equal(entries.find((e) => e.note.id === "a1").clientId, "client-001");
  // New optional fields validate when present too.
  assert.ok(
    isCoachState(
      workspaceState({
        coachNotes: [
          {
            id: "n1",
            text: "x",
            pinned: true,
            category: "health",
            createdAt: "2026-10-01T09:00",
            updatedAt: "2026-10-02T09:00",
          },
        ],
      }),
    ),
  );
});

test("a missing coachNotes array is treated as empty", () => {
  const state = workspaceState();
  delete state.coachNotes;
  assert.equal(listNotes(state).length, 0);
});

// --- Scoped identity --------------------------------------------------------

test("the same id in two scopes stays two independent notes", () => {
  const state = workspaceState({
    coachNotes: [{ id: "dup", text: "General copy" }],
    clients: [
      client("client-001", "Emma Anders", [{ id: "dup", text: "Emma copy" }]),
    ],
  });
  const generalRef = { id: "dup" };
  const emmaRef = { id: "dup", clientId: "client-001" };
  assert.equal(findNote(state, generalRef).note.text, "General copy");
  assert.equal(findNote(state, emmaRef).note.text, "Emma copy");
  assert.notEqual(noteKey(generalRef), noteKey(emmaRef));

  const edited = updateNote(state, emmaRef, { text: "Emma edited" });
  assert.equal(
    findNote(edited, emmaRef).note.text,
    "Emma edited",
    "scoped update hits only the athlete's note",
  );
  assert.equal(findNote(edited, generalRef).note.text, "General copy");

  const deleted = deleteNote(edited, generalRef).state;
  assert.equal(findNote(deleted, generalRef), undefined);
  assert.equal(findNote(deleted, emmaRef).note.text, "Emma edited");
});

test("a legacy coachNotes record carrying clientId belongs to that athlete", () => {
  const state = workspaceState({
    coachNotes: [{ id: "n1", text: "Legacy", clientId: "client-001" }],
    clients: [client("client-001", "Emma Anders")],
  });
  const entry = listNotes(state)[0];
  assert.equal(entry.clientId, "client-001");
  assert.equal(entry.client.name, "Emma Anders");
  // Moving it to General clears the legacy link in place.
  const moved = moveNote(
    state,
    { id: "n1", clientId: "client-001" },
    undefined,
  );
  assert.equal(moved.moved, true);
  assert.equal(moved.state.coachNotes[0].clientId, undefined);
  assert.equal(findNote(moved.state, { id: "n1" }).clientId, undefined);
});

// --- Sorting and filters ----------------------------------------------------

test("sortNotes orders by last edited and keeps undated notes last", () => {
  const state = workspaceState({
    coachNotes: [
      { id: "old", text: "Undated" },
      { id: "mid", text: "Middle", updatedAt: "2026-11-10T09:00" },
      { id: "new", text: "Newest", updatedAt: "2026-11-13T08:00" },
    ],
  });
  const sorted = sortNotes(listNotes(state)).map((e) => e.note.id);
  assert.deepEqual(sorted, ["new", "mid", "old"]);
});

test("filters narrow by athlete scope and category, uncategorised is Other", () => {
  const state = workspaceState({
    coachNotes: [
      { id: "g1", text: "General health", category: "health" },
      { id: "g2", text: "General misc" },
    ],
    clients: [
      client("client-001", "Emma Anders", [
        { id: "a1", text: "Emma training", category: "training" },
      ]),
    ],
  });
  const entries = listNotes(state);
  assert.equal(filterNotes(entries, { athlete: "general" }).length, 2);
  assert.equal(
    filterNotes(entries, { athlete: "client-001" })[0].note.id,
    "a1",
  );
  assert.equal(
    filterNotes(entries, { athlete: "all", category: "health" })[0].note.id,
    "g1",
  );
  assert.equal(categoryOf({ id: "g2", text: "x" }), "other");
  assert.equal(
    filterNotes(entries, { athlete: "all", category: "other" })[0].note.id,
    "g2",
    "uncategorised notes match the Other chip",
  );
  assert.equal(
    searchNotes(entries, "emma")[0].note.id,
    "a1",
    "search matches the athlete name",
  );
  assert.equal(searchNotes(entries, "misc")[0].note.id, "g2");
});

// --- Title and preview ------------------------------------------------------

test("title comes from the first non-empty line, preview from the next", () => {
  assert.equal(
    noteTitle("Knee flares on squats\nSecond line\nThird"),
    "Knee flares on squats",
  );
  assert.equal(
    notePreview("Knee flares on squats\nSecond line\nThird"),
    "Second line",
  );
  assert.equal(noteTitle("  \n\nFirst real line"), "First real line");
  assert.equal(notePreview("Title only"), "");
  assert.equal(noteTitle(""), "New note");
  assert.equal(notePreview(""), "");
});

// --- Pinning ----------------------------------------------------------------

test("general notes pin and unpin like athlete notes", () => {
  const state = workspaceState({
    coachNotes: [{ id: "n1", text: "General" }],
    clients: [
      client("client-001", "Emma Anders", [{ id: "a1", text: "Athlete" }]),
    ],
  });
  let next = togglePin(state, { id: "n1" });
  assert.equal(findNote(next, { id: "n1" }).note.pinned, true);
  next = togglePin(next, { id: "a1", clientId: "client-001" });
  assert.equal(
    findNote(next, { id: "a1", clientId: "client-001" }).note.pinned,
    true,
  );
  next = togglePin(next, { id: "n1" });
  assert.equal(findNote(next, { id: "n1" }).note.pinned, false);
});

// --- Save / move ------------------------------------------------------------

test("saveNote appends a new note into the addressed scope only", () => {
  const state = workspaceState({
    clients: [client("client-001", "Emma Anders")],
  });
  const general = saveNote(
    state,
    { id: "n1", text: "Hello", createdAt: "2026-11-13T09:00" },
    undefined,
  );
  assert.equal(general.coachNotes.length, 1);
  const athlete = saveNote(
    general,
    { id: "a1", text: "For Emma" },
    "client-001",
  );
  assert.equal(athlete.clients[0].internalNotes.length, 1);
  assert.equal(athlete.clients[0].internalNotes[0].clientId, undefined);
  // A replayed create updates in place instead of duplicating.
  const replayed = saveNote(
    athlete,
    { id: "a1", text: "For Emma v2" },
    "client-001",
  );
  assert.equal(replayed.clients[0].internalNotes.length, 1);
  assert.equal(replayed.clients[0].internalNotes[0].text, "For Emma v2");
});

test("moveNote relocates between General and athlete scopes with pending edits", () => {
  const state = workspaceState({
    coachNotes: [{ id: "n1", text: "Draft text" }],
    clients: [
      client("client-001", "Emma Anders"),
      client("client-007", "Amara Lewis"),
    ],
  });
  const moved = moveNote(state, { id: "n1" }, "client-001", {
    text: "Typed while moving",
    updatedAt: "2026-11-13T10:00",
  });
  assert.equal(moved.moved, true);
  assert.equal(moved.state.coachNotes.length, 0);
  const landed = moved.state.clients[0].internalNotes[0];
  assert.equal(landed.text, "Typed while moving");
  assert.equal(landed.updatedAt, "2026-11-13T10:00");
  assert.equal(landed.clientId, undefined);

  const back = moveNote(
    moved.state,
    { id: "n1", clientId: "client-001" },
    undefined,
  );
  assert.equal(back.moved, true);
  assert.equal(back.state.clients[0].internalNotes.length, 0);
  assert.equal(back.state.coachNotes.length, 1);
  assert.equal(back.state.coachNotes[0].clientId, undefined);

  const sideways = moveNote(back.state, { id: "n1" }, "client-007");
  assert.equal(sideways.state.clients[1].internalNotes.length, 1);
});

test("moveNote rejects conflicts and missing destinations without writes", () => {
  const state = workspaceState({
    coachNotes: [{ id: "n1", text: "General" }],
    clients: [
      client("client-001", "Emma Anders", [{ id: "n1", text: "Emma's n1" }]),
    ],
  });
  const conflict = moveNote(state, { id: "n1" }, "client-001");
  assert.equal(conflict.moved, false);
  assert.equal(conflict.reason, "id-conflict");
  assert.equal(
    conflict.state,
    state,
    "a rejected move returns the state untouched",
  );

  const missing = moveNote(state, { id: "n1" }, "client-999");
  assert.equal(missing.moved, false);
  assert.equal(missing.reason, "no-destination");

  const gone = moveNote(state, { id: "nope" }, "client-001");
  assert.equal(gone.moved, false);
  assert.equal(gone.reason, "source-gone");
});

// --- Delete / Undo ----------------------------------------------------------

test("deleteNote removes only the addressed note and restoreNote puts it back", () => {
  const state = workspaceState({
    coachNotes: [
      { id: "n1", text: "One" },
      { id: "n2", text: "Two" },
      { id: "n3", text: "Three" },
    ],
  });
  const { state: deleted, removed } = deleteNote(state, { id: "n2" });
  assert.equal(deleted.coachNotes.length, 2);
  assert.equal(removed.note.text, "Two");
  assert.equal(removed.index, 1);
  const restored = restoreNote(deleted, removed);
  assert.deepEqual(
    restored.coachNotes.map((n) => n.id),
    ["n1", "n2", "n3"],
    "the note returns to its original index",
  );
  // Restoring over an existing record with the same id is a no-op.
  const again = restoreNote(restored, removed);
  assert.equal(again.coachNotes.length, 3);
});

// --- Pending-save ordering ---------------------------------------------------

test("a delayed update never recreates a deleted note", () => {
  const state = workspaceState({
    coachNotes: [{ id: "n1", text: "Will be deleted" }],
  });
  const deleted = deleteNote(state, { id: "n1" }).state;
  // The debounced autosave that was scheduled before the delete fires now.
  const after = updateNote(deleted, { id: "n1" }, { text: "Late write" });
  assert.equal(after, deleted, "update against a missing ref is a no-op");
  assert.equal(after.coachNotes.length, 0);
});

test("a delayed update to the old scope cannot clobber a moved note", () => {
  const state = workspaceState({
    coachNotes: [{ id: "n1", text: "Before move" }],
    clients: [client("client-001", "Emma Anders")],
  });
  const moved = moveNote(state, { id: "n1" }, "client-001", {
    text: "Moved text",
  }).state;
  const after = updateNote(moved, { id: "n1" }, { text: "Stale scope write" });
  assert.equal(
    after.clients[0].internalNotes[0].text,
    "Moved text",
    "the old-scope write is a no-op, not an overwrite",
  );
  // A same-id note in a DIFFERENT scope is never touched either: a write
  // addressed to the General ref lands on the General note and leaves the
  // athlete's note alone.
  const twoScopes = saveNote(
    moved,
    { id: "n1", text: "General n1" },
    undefined,
  );
  const clobber = updateNote(twoScopes, { id: "n1" }, { text: "Wrong note" });
  assert.equal(clobber.coachNotes.at(-1).text, "Wrong note");
  assert.equal(clobber.clients[0].internalNotes[0].text, "Moved text");
});

// --- Fresh-draft discard (P825) -----------------------------------------------

test("only never-saved empty drafts are discardable; cleared existing notes stay", () => {
  const state = workspaceState({
    coachNotes: [
      { id: "existing", text: "Coach wrote this long ago" },
      { id: "fresh-empty", text: "" },
      { id: "fresh-typed", text: "" },
    ],
  });
  const fresh = new Set([
    noteKey({ id: "fresh-empty" }),
    noteKey({ id: "fresh-typed" }),
  ]);

  // An existing note the coach cleared to empty is never auto-discarded.
  assert.equal(
    shouldDiscardDraft(state, { id: "existing" }, fresh),
    false,
    "existing notes are not droppable even when empty",
  );
  // A never-saved draft still empty is droppable.
  assert.equal(shouldDiscardDraft(state, { id: "fresh-empty" }, fresh), true);
  // A fresh draft that received text is a stored record now.
  const typed = updateNote(state, { id: "fresh-typed" }, { text: "has text" });
  assert.equal(shouldDiscardDraft(typed, { id: "fresh-typed" }, fresh), false);
  // A stored note whose key was never marked fresh stays put even at "".
  const cleared = updateNote(state, { id: "existing" }, { text: "" });
  assert.equal(
    shouldDiscardDraft(cleared, { id: "existing" }, fresh),
    false,
    "an existing note cleared to empty remains stored",
  );
});

// --- Delete Undo restores the pending version (P825) --------------------------

test("removeNote folds a pending draft into the removed record; Undo restores it", () => {
  const state = workspaceState({
    coachNotes: [
      { id: "n1", text: "Stored text", pinned: true, category: "prep" },
    ],
  });
  const { state: deleted, removed } = removeNote(
    state,
    { id: "n1" },
    { text: "Unflushed typed text", updatedAt: "2026-11-13T10:00:00" },
  );
  assert.equal(deleted.coachNotes.length, 0);
  assert.equal(
    removed.note.text,
    "Unflushed typed text",
    "the removed record carries the pending draft, not the stale save",
  );
  const restored = restoreNote(deleted, removed);
  assert.deepEqual(restored.coachNotes[0], {
    id: "n1",
    text: "Unflushed typed text",
    pinned: true,
    category: "prep",
    updatedAt: "2026-11-13T10:00:00",
  });
});

test("Undo does not overwrite a replacement note at the same scoped id", () => {
  const state = workspaceState({
    coachNotes: [{ id: "n1", text: "Original" }],
  });
  const { state: deleted, removed } = deleteNote(state, { id: "n1" });
  const replaced = saveNote(
    deleted,
    { id: "n1", text: "Replacement with the same id" },
    undefined,
  );
  const after = restoreNote(replaced, removed);
  assert.equal(
    after,
    replaced,
    "a scoped-id collision leaves the replacement alone",
  );
  assert.equal(after.coachNotes[0].text, "Replacement with the same id");
});

// --- Archived reachability (P825) ---------------------------------------------

test("archived athletes' notes are reachable through includeArchived", () => {
  const state = workspaceState({
    clients: [
      client("client-001", "Emma Anders", [{ id: "a1", text: "Active note" }]),
      client(
        "client-002",
        "Retired Rory",
        [{ id: "a2", text: "Archived note" }],
        true,
      ),
    ],
  });
  assert.deepEqual(
    listNotes(state).map((e) => e.note.id),
    ["a1"],
    "default listing keeps archived athletes out",
  );
  const all = listNotes(state, { includeArchived: true });
  assert.deepEqual(all.map((e) => e.note.id).sort(), ["a1", "a2"]);
  const filtered = filterNotes(all, { athlete: "client-002" });
  assert.deepEqual(
    filtered.map((e) => e.note.id),
    ["a2"],
    "the archived athlete filter reaches their notes",
  );
});

// --- Labels -------------------------------------------------------------------------------------------------------------------------------

test("editedLabel and stampLabel show relative recency, undated stays blank", () => {
  assert.equal(editedLabel({ id: "x", text: "t" }, TODAY), "");
  assert.equal(
    editedLabel({ id: "x", text: "t", updatedAt: `${TODAY}T09:00` }, TODAY),
    "Edited today",
  );
  assert.equal(
    editedLabel({ id: "x", text: "t", updatedAt: "2026-11-12T09:00" }, TODAY),
    "Edited yesterday",
  );
  assert.equal(
    editedLabel({ id: "x", text: "t", updatedAt: "2026-11-10T09:00" }, TODAY),
    "Edited 3 days ago",
  );
  assert.equal(
    editedLabel({ id: "x", text: "t", updatedAt: "2026-10-30T09:00" }, TODAY),
    "Edited 30 Oct",
  );
  assert.equal(
    stampLabel(
      {
        id: "x",
        text: "t",
        createdAt: "2026-10-12T09:00",
        updatedAt: "2026-11-10T09:00",
      },
      TODAY,
    ),
    "Created 12 Oct · Edited 10 Nov",
  );
});
