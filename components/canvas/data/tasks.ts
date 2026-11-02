// Tasks domain provider (card 05a). Remote-only: the client task list and
// the own-scoped completion transition go through /api/v1, never through a
// local fixture. Wire shapes mirror lib/tasks/service.ts.

import { apiFetch } from "./http";

export type OwnTaskWire = {
  id: string;
  title: string;
  dueDate: string;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  dueState: "overdue" | "due-today" | "upcoming";
  completedAt: string | null;
  assignedByMemberId: string;
  revision: number;
};

export type OwnTaskListWire = {
  /** The caller's own profile id - the PATCH path's clientProfileId. */
  clientProfileId: string;
  tasks: OwnTaskWire[];
  hasMore: boolean;
};

/** GET tasks?option= - the caller's own task list. */
export function fetchOwnTasks(
  workspaceId: string,
  option?: "open" | "completed" | "both",
): Promise<OwnTaskListWire> {
  const suffix = option ? `?option=${encodeURIComponent(option)}` : "";
  return apiFetch<OwnTaskListWire>(
    `/workspaces/${workspaceId}/tasks${suffix}`,
  );
}

/** PATCH clients/:clientProfileId/tasks/:taskId - the completion toggle. */
export function setOwnTaskCompletion(
  workspaceId: string,
  clientProfileId: string,
  taskId: string,
  input: { desired: "COMPLETED" | "OPEN"; expectedRevision: number },
): Promise<{ revision: number; status: "OPEN" | "COMPLETED"; changed: boolean }> {
  return apiFetch(
    `/workspaces/${workspaceId}/clients/${clientProfileId}/tasks/${taskId}`,
    { method: "PATCH", body: input },
  );
}
