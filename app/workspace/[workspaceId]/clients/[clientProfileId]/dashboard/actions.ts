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
