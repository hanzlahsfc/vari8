// Notes domain provider (PR-W0). Owns the standalone coach notes and coach
// to-dos of the Notes screen. Per-client notes (internalNotes, generalNotes)
// stay on the client record in the clients slice: they are profile data and
// ruling O13 keeps their visibility split on the record.
//
// W2-A1: the workspace coachNotes list also syncs through /api/v1 via the
// functions below. W2-A4: the coach to-dos sync through the coach-tasks
// routes. The slice still persists both lists so the localStorage seam keeps
// its full-state round-trip: the local copy is the cache and first paint,
// the remote reads overwrite it once they land.

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
    `/workspaces/${workspaceId}/client-detail/workspace-notes`,
  );
  return body.notes;
}

/** PUT the whole workspace-level private note list (full replace). */
export function putWorkspaceCoachNotes(
  workspaceId: string,
  notes: RemoteWorkspaceNote[],
): Promise<{ notes: RemoteWorkspaceNote[] }> {
  return apiFetch<{ notes: RemoteWorkspaceNote[] }>(
    `/workspaces/${workspaceId}/client-detail/workspace-notes`,
    { method: "PUT", body: { notes } },
  );
}

// --- W2-A4 remote coach to-dos (coach-tasks routes) ---

/** One row of the coach-tasks list (lib/coach-tasks CoachTaskView). */
export type CoachTaskView = {
  id: string;
  clientProfileId: string | null;
  title: string;
  complete: boolean;
  revision: number;
};

/** A coach-tasks row as the canvas stores it (state.coachTodos entries). */
export type CoachTodo = {
  id: string;
  title: string;
  complete: boolean;
  clientId?: string;
  revision: number;
};

export function toCoachTodo(view: CoachTaskView): CoachTodo {
  return {
    id: view.id,
    title: view.title,
    complete: view.complete,
    clientId: view.clientProfileId ?? undefined,
    revision: view.revision,
  };
}

async function listTasks(
  workspaceId: string,
  clientProfileId?: string,
): Promise<CoachTaskView[]> {
  const suffix = clientProfileId
    ? `?clientProfileId=${encodeURIComponent(clientProfileId)}`
    : "";
  const body = await apiFetch<{ tasks: CoachTaskView[] }>(
    `/workspaces/${workspaceId}/coach-tasks${suffix}`,
  );
  return body.tasks;
}

/**
 * GET coach-tasks - without a client the workspace-level rows only, with one
 * that client's rows. Soft-deleted rows never come back.
 */
export async function fetchCoachTasks(
  workspaceId: string,
  clientProfileId?: string,
): Promise<CoachTodo[]> {
  const tasks = await listTasks(workspaceId, clientProfileId);
  return tasks
    .filter((t) => clientProfileId || t.clientProfileId === null)
    .map(toCoachTodo);
}

/** POST coach-tasks - one workspace or client to-do. */
export async function createCoachTask(
  workspaceId: string,
  title: string,
  clientProfileId?: string,
): Promise<CoachTodo> {
  const body = await apiFetch<{ id: string; revision: number }>(
    `/workspaces/${workspaceId}/coach-tasks`,
    { method: "POST", body: { title, clientProfileId } },
  );
  return {
    id: body.id,
    title,
    complete: false,
    clientId: clientProfileId,
    revision: body.revision,
  };
}

/** The task routes demand a CAS revision; read it fresh so callers need none. */
async function revisionOf(workspaceId: string, coachTaskId: string) {
  const row = (await listTasks(workspaceId)).find((t) => t.id === coachTaskId);
  if (!row) throw new Error("coach task not found");
  return row.revision;
}

/** PATCH coach-tasks/:id - complete or reopen one to-do. */
export async function setCoachTaskCompleted(
  workspaceId: string,
  coachTaskId: string,
  completed: boolean,
): Promise<void> {
  await apiFetch(
    `/workspaces/${workspaceId}/coach-tasks/${encodeURIComponent(coachTaskId)}`,
    {
      method: "PATCH",
      body: {
        complete: completed,
        expectedRevision: await revisionOf(workspaceId, coachTaskId),
      },
    },
  );
}

/** DELETE coach-tasks/:id - soft delete (undo window is server side). */
export async function deleteCoachTask(
  workspaceId: string,
  coachTaskId: string,
): Promise<void> {
  const rev = await revisionOf(workspaceId, coachTaskId);
  await apiFetch(
    `/workspaces/${workspaceId}/coach-tasks/${encodeURIComponent(coachTaskId)}?expectedRevision=${rev}`,
    { method: "DELETE" },
  );
}
