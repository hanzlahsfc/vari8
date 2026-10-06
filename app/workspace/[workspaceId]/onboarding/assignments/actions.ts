"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  assignFormFromAction,
  cancelAssignmentFromAction,
  replaceAssignmentFromAction,
  type ActionResult,
} from "@/lib/onboarding/assignments-boundary";
import { isOnboardingAssignmentsEnabled } from "@/lib/onboarding/assignments-gate";

/**
 * P-013 — onboarding assignment server actions.
 *
 * Order of operations is load-bearing: session gate → DEV FLAG → only then
 * binding user-controlled fields. With the flag off, the action returns the
 * feature-off failure before any form field is read and before the boundary
 * is touched — no mutation, no audit, no service call.
 *
 * Contract notes:
 * - `workspaceId` is a caller-bound argument but remains an UNTRUSTED input;
 *   the guarded service is the final workspace/membership/scope authority.
 * - All results are `{ ok, value | message }`; `revalidatePath` fires only
 *   after a confirmed success, and a revalidation throw never converts a
 *   committed mutation into a reported failure.
 */

const INVALID = "Check the form details and try again.";
const DENIED = "You don't have access to do that.";
const GENERIC = "Something went wrong. Please try again in a moment.";
const OFF = "This feature is not available.";

const MAX_ID_LEN = 128;

const fail = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

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

function boundedArg(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LEN &&
    isWellFormedString(value)
    ? value
    : null;
}

/** Session gate — runs before ANY input work or delegation. */
async function sessionGate(): Promise<
  | { ok: true; session: { user: { id: string } } }
  | { ok: false; message: string }
> {
  let session;
  try {
    session = await auth();
  } catch {
    return fail(GENERIC);
  }
  const id = session?.user?.id;
  if (typeof id !== "string" || id.length === 0) return fail(DENIED);
  return { ok: true, session: { user: { id } } };
}

const listPath = (workspaceId: string) =>
  `/workspace/${encodeURIComponent(workspaceId)}/onboarding/assignments`;

/** Revalidation is best-effort: a committed mutation stays successful even
 * when the cache layer throws. Never echoes the exception. */
function revalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Cache invalidation failure must not convert a committed write into a
    // retryable-looking failure.
  }
}

function isFormData(value: unknown): value is FormData {
  return value instanceof FormData;
}

async function delegate<T>(
  fn: () => Promise<ActionResult<T>>,
  path: string,
): Promise<ActionResult<T>> {
  let result: ActionResult<T>;
  try {
    result = await fn();
  } catch {
    return fail(GENERIC);
  }
  if (result.ok) revalidate(path);
  return result;
}

export async function createAssignment(
  workspaceId: string,
  formData: FormData,
): Promise<ActionResult<{ assignmentId: string }>> {
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  if (
    !isOnboardingAssignmentsEnabled(process.env.ENABLE_ONBOARDING_ASSIGNMENTS)
  )
    return fail(OFF);
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const clientProfileId = singleString(formData, "clientProfileId", MAX_ID_LEN);
  const formId = singleString(formData, "formId", MAX_ID_LEN);
  if (clientProfileId === null || formId === null) return fail(INVALID);
  return delegate(
    () =>
      assignFormFromAction(gate.session, {
        workspaceId: ws,
        clientProfileId,
        formId,
      }),
    listPath(ws),
  );
}

export async function replaceAssignment(
  workspaceId: string,
  formData: FormData,
): Promise<ActionResult<{ changed: boolean; assignmentId?: string }>> {
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  if (
    !isOnboardingAssignmentsEnabled(process.env.ENABLE_ONBOARDING_ASSIGNMENTS)
  )
    return fail(OFF);
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const assignmentId = singleString(formData, "assignmentId", MAX_ID_LEN);
  if (assignmentId === null) return fail(INVALID);
  return delegate(
    () =>
      replaceAssignmentFromAction(gate.session, {
        workspaceId: ws,
        assignmentId,
      }),
    listPath(ws),
  );
}

export async function cancelAssignment(
  workspaceId: string,
  formData: FormData,
): Promise<ActionResult<{ cancelled: true }>> {
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  if (
    !isOnboardingAssignmentsEnabled(process.env.ENABLE_ONBOARDING_ASSIGNMENTS)
  )
    return fail(OFF);
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const assignmentId = singleString(formData, "assignmentId", MAX_ID_LEN);
  if (assignmentId === null) return fail(INVALID);
  return delegate(
    () =>
      cancelAssignmentFromAction(gate.session, {
        workspaceId: ws,
        assignmentId,
      }),
    listPath(ws),
  );
}
