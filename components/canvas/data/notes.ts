// Notes domain provider (PR-W0). Owns the standalone coach notes and coach
// to-dos of the Notes screen. Per-client notes (internalNotes, generalNotes)
// stay on the client record in the clients slice: they are profile data and
// ruling O13 keeps their visibility split on the record.
//
// W2-A1: the workspace coachNotes list is served by /api/v1 through the
// functions below. W2-A4: the coach to-dos are served by the coach-tasks
// routes, so the slice persists neither list - a legacy stored envelope that
// still carries them keeps merging so nothing is lost before the first
// remote read.

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
  // Both lists are remote-owned; nothing is persisted any more.
  extract: () => ({}),
  merge: (slice, state) => {
    if (!slice || typeof slice !== "object")
      throw new Error("Invalid notes slice");
    const data = slice as Partial<NotesData>;
    if (data.coachNotes) state.coachNotes = data.coachNotes;
    if (Array.isArray(data.coachTodos)) state.coachTodos = data.coachTodos;
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

// --- W2-A4 remote coach to-dos (coach-tasks routes) ---

export type CoachTaskView = {
  id: string;
  clientProfileId: string | null;
  title: string;
  completedAt: string | null;
  completedByMemberId: string | null;
  createdByMemberId: string;
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
    complete: view.completedAt !== null,
    clientId: view.clientProfileId ?? undefined,
    revision: view.revision,
  };
}

/**
 * GET coach-tasks - without a client the workspace-level rows only, with one
 * that client's rows. Soft-deleted rows never come back.
 */
export async function fetchCoachTasks(
  workspaceId: string,
  clientProfileId?: string,
): Promise<CoachTodo[]> {
  const suffix = clientProfileId
    ? `?clientProfileId=${encodeURIComponent(clientProfileId)}`
    : "";
  const body = await apiFetch<{ coachTasks: CoachTaskView[] }>(
    `/workspaces/${workspaceId}/coach-tasks${suffix}`,
  );
  return body.coachTasks.map(toCoachTodo);
}

/** POST coach-tasks - one workspace or client to-do. */
export async function createCoachTask(
  workspaceId: string,
  title: string,
  clientProfileId?: string,
): Promise<CoachTodo> {
  const body = await apiFetch<{ coachTask: CoachTaskView }>(
    `/workspaces/${workspaceId}/coach-tasks`,
    { method: "POST", body: { title, clientProfileId } },
  );
  return toCoachTodo(body.coachTask);
}

/** PATCH coach-tasks/:id - complete or reopen one to-do. */
export async function setCoachTaskCompleted(
  workspaceId: string,
  coachTaskId: string,
  completed: boolean,
): Promise<CoachTodo> {
  const body = await apiFetch<{ coachTask: CoachTaskView }>(
    `/workspaces/${workspaceId}/coach-tasks/${encodeURIComponent(coachTaskId)}`,
    { method: "PATCH", body: { completed } },
  );
  return toCoachTodo(body.coachTask);
}

/** DELETE coach-tasks/:id - soft delete with a seven day restore window. */
export async function deleteCoachTask(
  workspaceId: string,
  coachTaskId: string,
): Promise<CoachTodo> {
  const body = await apiFetch<{ coachTask: CoachTaskView }>(
    `/workspaces/${workspaceId}/coach-tasks/${encodeURIComponent(coachTaskId)}`,
    { method: "DELETE", body: {} },
  );
  return toCoachTodo(body.coachTask);
}
