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
  readHabitCompletions,
  readHabitConsistency,
} from "@/lib/habits/boundary";
import { frequencyToWeekdayMask } from "@/lib/habits/frequency";

/** Canvas frequency labels ("Daily", "Weekdays", ...) resolve to the
 * stored ISO weekday mask through the shared mapping. */
function weekdaysFromInput(input: {
  weekdays?: unknown;
  frequency?: unknown;
}): unknown {
  if (input.weekdays !== undefined) return input.weekdays;
  if (input.frequency === undefined) return undefined;
  return frequencyToWeekdayMask(input.frequency);
}

export async function createClientHabit(input: {
  workspaceId: string;
  clientProfileId: string;
  name: unknown;
  target: unknown;
  reason?: unknown;
  startDate: unknown;
  weekdays?: unknown;
  frequency?: unknown;
  endDate?: unknown;
}) {
  const { userId } = await requireSessionUser();
  return createHabitFromAction(
    { user: { id: userId } },
    { ...input, weekdays: weekdaysFromInput(input) },
  );
}

export async function editClientHabit(input: {
  workspaceId: string;
  clientProfileId: string;
  habitId: string;
  name?: unknown;
  target?: unknown;
  reason?: unknown;
  schedule?: { weekdays?: unknown; frequency?: unknown; endDate?: unknown };
  expectedRevision: number;
}) {
  const { userId } = await requireSessionUser();
  const schedule =
    input.schedule === undefined
      ? undefined
      : { ...input.schedule, weekdays: weekdaysFromInput(input.schedule) };
  return editHabitFromAction({ user: { id: userId } }, { ...input, schedule });
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

export async function readClientHabitCompletions(input: {
  workspaceId: string;
  clientProfileId: string;
}) {
  const { userId } = await requireSessionUser();
  return readHabitCompletions({ user: { id: userId } }, input);
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
