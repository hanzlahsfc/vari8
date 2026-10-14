"use server";

import { requireSessionUser } from "@/lib/auth/route-guard";
import {
  readOwnClientTasks,
  setClientTaskCompletionFromAction,
} from "@/lib/tasks/boundary";

/**
 * CLIENT-TASKS-I1 (decision 109): the client's own task actions.
 * Gate + authorization live inside the boundary; this layer binds the
 * session only. `desired` is explicit state — never a blind toggle.
 */
export async function readMyClientTasks(input: {
  workspaceId: string;
  option?: "open" | "completed" | "both";
}) {
  const { userId } = await requireSessionUser();
  return readOwnClientTasks({ user: { id: userId } }, input);
}

export async function setMyTaskCompletion(input: {
  workspaceId: string;
  clientProfileId: string;
  taskId: string;
  desired: "COMPLETED" | "OPEN";
  expectedRevision: number;
}) {
  const { userId } = await requireSessionUser();
  return setClientTaskCompletionFromAction({ user: { id: userId } }, input);
}
