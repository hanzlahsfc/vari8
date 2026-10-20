// Notes domain provider (PR-W0). Owns the standalone coach notes and coach
// to-dos of the Notes screen. Per-client notes (internalNotes, generalNotes)
// stay on the client record in the clients slice: they are profile data and
// ruling O13 keeps their visibility split on the record. PR-W10 wires this
// domain to the server; it edits this file only.

import type { CoachState } from "../coach/model";
import type { CoachSlice } from "./provider";

export const NOTES_KEY = "coach-data-notes-v1";

type NotesData = {
  coachNotes: CoachState["coachNotes"];
  coachTodos: CoachState["coachTodos"];
};

export const notesSlice: CoachSlice = {
  key: NOTES_KEY,
  extract: (state): NotesData => ({
    coachNotes: state.coachNotes,
    coachTodos: state.coachTodos,
  }),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid notes slice");
    const data = slice as Partial<NotesData>;
    state.coachNotes = data.coachNotes;
    state.coachTodos = data.coachTodos;
  },
};
