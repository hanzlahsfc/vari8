"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { AccessDeniedError } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import {
  assignCoach,
  removeClientAssignment,
  setPrimaryCoach,
  WorkspaceServiceError,
} from "@/lib/workspace/clients";

/**
 * SOLO-COACH-I1 — coach-assignment server actions (decision 111).
 *
 * Order of operations is load-bearing: session gate → bounded FormData
 * parsing (single values, length cap, well-formed) → role allowlist → the
 * guarded services. Each service independently authorizes
 * `clientAssignments/write`, re-resolves workspace/client/member coherence
 * and eligibility, and commits mutation + audit atomically — the action
 * never relies on the page's admission. Denied/off/unavailable map to
 * truthful failures, never disguised as empty success; raw error codes
 * and identifiers never reach the client.
 */

const INVALID = "Check the form details and try again.";
const DENIED = "You don't have access to do that.";
const GENERIC = "Something went wrong. Please try again in a moment.";

const MAX_ID_LEN = 128;
const ASSIGNMENT_ROLES = new Set(["PRIMARY", "COACH"]);

export type CoachAssignmentActionState =
  | { ok: true; changed: boolean }
  | { ok: false; message: string }
  | { ok: "idle" };

const fail = (message: string): CoachAssignmentActionState => ({
  ok: false,
  message,
});

/** Well-formed UTF-16 — lone surrogates break URI encoding on path builds. */
function isWellFormedString(v: string): boolean {
  try {
    encodeURIComponent(v);
    return true;
  } catch {
    return false;
  }
}

/** Exactly one string value; File/duplicate/missing/oversized → null. */
function singleString(
  formData: FormData,
  key: string,
  maxLen: number,
): string | null {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  if (typeof v !== "string" || v.length === 0 || v.length > maxLen) return null;
  return isWellFormedString(v) ? v : null;
}

async function sessionUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function parseRouteIds(formData: FormData) {
  const workspaceId = singleString(formData, "workspaceId", MAX_ID_LEN);
  const clientProfileId = singleString(formData, "clientProfileId", MAX_ID_LEN);
  const coachMemberId = singleString(formData, "coachMemberId", MAX_ID_LEN);
  if (!workspaceId || !clientProfileId || !coachMemberId) return null;
  return { workspaceId, clientProfileId, coachMemberId };
}

function mapError(error: unknown): CoachAssignmentActionState {
  if (error instanceof AccessDeniedError) return fail(DENIED);
  if (error instanceof WorkspaceServiceError) {
    switch (error.code) {
      case "member_not_eligible":
        return fail("That member can't be assigned as a coach.");
      case "assignment_conflict":
        return fail(
          "That assignment conflicts with the current state. Refresh and try again.",
        );
      case "assignment_not_accessible":
      case "client_not_accessible":
        return fail(DENIED);
      case "invalid_input":
        return fail(INVALID);
      default:
        return fail(GENERIC);
    }
  }
  return fail(GENERIC);
}

function revalidate(workspaceId: string, clientProfileId: string) {
  try {
    revalidatePath(
      `/workspace/${workspaceId}/clients/${clientProfileId}/coaches`,
    );
  } catch {
    // A revalidation failure never converts a committed mutation into a
    // reported failure.
  }
}

export async function assignCoachAction(
  _prev: CoachAssignmentActionState,
  formData: FormData,
): Promise<CoachAssignmentActionState> {
  const userId = await sessionUserId();
  if (userId === null) return fail(DENIED);

  const ids = parseRouteIds(formData);
  const role = singleString(formData, "role", 16);
  if (ids === null || role === null || !ASSIGNMENT_ROLES.has(role))
    return fail(INVALID);

  try {
    const result = await assignCoach(
      { user: { id: userId } },
      { ...ids, role: role as "PRIMARY" | "COACH" },
      prisma,
    );
    revalidate(ids.workspaceId, ids.clientProfileId);
    return { ok: true, changed: result.changed };
  } catch (error) {
    return mapError(error);
  }
}

export async function setPrimaryCoachAction(
  _prev: CoachAssignmentActionState,
  formData: FormData,
): Promise<CoachAssignmentActionState> {
  const userId = await sessionUserId();
  if (userId === null) return fail(DENIED);

  const ids = parseRouteIds(formData);
  if (ids === null) return fail(INVALID);

  try {
    const result = await setPrimaryCoach({ user: { id: userId } }, ids, prisma);
    revalidate(ids.workspaceId, ids.clientProfileId);
    return { ok: true, changed: result.changed };
  } catch (error) {
    return mapError(error);
  }
}

export async function removeCoachAssignmentAction(
  _prev: CoachAssignmentActionState,
  formData: FormData,
): Promise<CoachAssignmentActionState> {
  const userId = await sessionUserId();
  if (userId === null) return fail(DENIED);

  const ids = parseRouteIds(formData);
  if (ids === null) return fail(INVALID);

  try {
    const result = await removeClientAssignment(
      { user: { id: userId } },
      ids,
      prisma,
    );
    revalidate(ids.workspaceId, ids.clientProfileId);
    return { ok: true, changed: result.changed };
  } catch (error) {
    return mapError(error);
  }
}
