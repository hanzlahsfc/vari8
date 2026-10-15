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

/* ---------------- HABITS-I1 client habit actions (decision 110) ------- */

import {
  readTodayHabits,
  readHabitConsistency,
  setHabitLogFromAction,
} from "@/lib/habits/boundary";

/**
 * The client's own habit actions — TL21/TL22 reads and the desired-state
 * log mark. Gate + authorization live inside the boundary; this layer
 * binds the session only. `desired` is explicit — never a blind toggle;
 * no skip control exists (SKIPPED is modelled, writer deferred).
 */
export async function readMyTodayHabits(input: {
  workspaceId: string;
  fields?: unknown;
}) {
  const { userId } = await requireSessionUser();
  return readTodayHabits({ user: { id: userId } }, input);
}

export async function readMyHabitConsistency(input: {
  workspaceId: string;
  period: unknown;
  fields?: unknown;
}) {
  const { userId } = await requireSessionUser();
  return readHabitConsistency({ user: { id: userId } }, input);
}

export async function setMyHabitLog(input: {
  workspaceId: string;
  clientProfileId: string;
  habitId: string;
  date: unknown;
  desired: "DONE" | "CLEARED";
}) {
  const { userId } = await requireSessionUser();
  return setHabitLogFromAction({ user: { id: userId } }, input);
}
