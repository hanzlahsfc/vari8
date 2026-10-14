"use server";

import { requireSessionUser } from "@/lib/auth/route-guard";
import {
  readStaffDashboardLayout,
  updateClientDashboardLayoutFromAction,
} from "@/lib/dashboard/boundary";

/**
 * DASHBOARD-I1 (decision 108): the staff dashboard actions. The
 * feature gate and authorization live inside the boundary — this layer
 * only binds the session and re-exports the closed result.
 */
export async function saveClientDashboardLayout(input: {
  workspaceId: string;
  clientProfileId: string;
  config: unknown;
  expectedRevision: number;
}) {
  const { userId } = await requireSessionUser();
  return updateClientDashboardLayoutFromAction({ user: { id: userId } }, input);
}

/** Staff re-read used by the autosave reconciler on conflict/timeout. */
export async function reloadClientDashboardLayout(input: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const { userId } = await requireSessionUser();
  return readStaffDashboardLayout({ user: { id: userId } }, input);
}

/* ---------------- CLIENT-TASKS-I1 staff task actions ---------------- */

import {
  assignClientTaskFromAction,
  editClientTaskFromAction,
  cancelClientTaskFromAction,
  readStaffClientTasks,
} from "@/lib/tasks/boundary";

export async function assignClientTask(input: {
  workspaceId: string;
  clientProfileId: string;
  title: unknown;
  dueDate: unknown;
}) {
  const { userId } = await requireSessionUser();
  return assignClientTaskFromAction({ user: { id: userId } }, input);
}

export async function editClientTask(input: {
  workspaceId: string;
  clientProfileId: string;
  taskId: string;
  title?: unknown;
  dueDate?: unknown;
  expectedRevision: number;
}) {
  const { userId } = await requireSessionUser();
  return editClientTaskFromAction({ user: { id: userId } }, input);
}

export async function cancelClientTask(input: {
  workspaceId: string;
  clientProfileId: string;
  taskId: string;
  expectedRevision: number;
}) {
  const { userId } = await requireSessionUser();
  return cancelClientTaskFromAction({ user: { id: userId } }, input);
}

export async function readClientTasks(input: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const { userId } = await requireSessionUser();
  return readStaffClientTasks({ user: { id: userId } }, input);
}

/* ---------------- HABITS-I1 staff habit actions (decision 110) -------- */

import {
  createHabitFromAction,
  editHabitFromAction,
  archiveHabitFromAction,
  readStaffHabits,
  readHabitChoices,
  readHabitConsistency,
} from "@/lib/habits/boundary";

export async function createClientHabit(input: {
  workspaceId: string;
  clientProfileId: string;
  name: unknown;
  target: unknown;
  startDate: unknown;
  weekdays: unknown;
  endDate?: unknown;
}) {
  const { userId } = await requireSessionUser();
  return createHabitFromAction({ user: { id: userId } }, input);
}

export async function editClientHabit(input: {
  workspaceId: string;
  clientProfileId: string;
  habitId: string;
  name?: unknown;
  target?: unknown;
  schedule?: { weekdays?: unknown; endDate?: unknown };
  expectedRevision: number;
}) {
  const { userId } = await requireSessionUser();
  return editHabitFromAction({ user: { id: userId } }, input);
}

export async function archiveClientHabit(input: {
  workspaceId: string;
  clientProfileId: string;
  habitId: string;
  expectedRevision: number;
}) {
  const { userId } = await requireSessionUser();
  return archiveHabitFromAction({ user: { id: userId } }, input);
}

export async function readClientHabits(input: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const { userId } = await requireSessionUser();
  return readStaffHabits({ user: { id: userId } }, input);
}

export async function readClientHabitChoices(input: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const { userId } = await requireSessionUser();
  return readHabitChoices({ user: { id: userId } }, input);
}

export async function readClientHabitConsistency(input: {
  workspaceId: string;
  clientProfileId: string;
  period: unknown;
  fields?: unknown;
}) {
  const { userId } = await requireSessionUser();
  return readHabitConsistency({ user: { id: userId } }, input);
}
