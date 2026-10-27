// Notes domain provider (PR-W0). Owns the standalone coach notes and coach
// to-dos of the Notes screen. Per-client notes (internalNotes, generalNotes)
// stay on the client record in the clients slice: they are profile data and
// ruling O13 keeps their visibility split on the record.
//
// W2-A1: the workspace coachNotes list also syncs through /api/v1 via the
// functions below. The slice still persists both lists so the localStorage
// seam keeps its full-state round-trip: the local copy is the cache and
// first paint, the remote reads overwrite it once they land.

import type { CoachState } from "../coach/model";
import { apiFetch } from "./http";
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

// --- W2-A1 remote workspace notes ---

export type RemoteWorkspaceNote = { id: string; text: string };

/** GET the workspace-level private notes (coach/notes.tsx list). */
export async function fetchWorkspaceCoachNotes(
  workspaceId: string,
): Promise<RemoteWorkspaceNote[]> {
  const body = await apiFetch<{ notes: RemoteWorkspaceNote[] }>(
    `/workspaces/${workspaceId}/notes`,
  );
  return body.notes;
}

/** PUT the whole workspace-level private note list (full replace). */
export function putWorkspaceCoachNotes(
  workspaceId: string,
  notes: RemoteWorkspaceNote[],
): Promise<{ notes: RemoteWorkspaceNote[] }> {
  return apiFetch<{ notes: RemoteWorkspaceNote[] }>(
    `/workspaces/${workspaceId}/notes`,
    { method: "PUT", body: { notes } },
  );
}
