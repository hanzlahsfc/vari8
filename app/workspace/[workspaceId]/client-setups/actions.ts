"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  assignTemplateFromAction,
  cancelSetupAssignmentFromAction,
  type ActionResult,
} from "@/lib/coaching/client-setup-boundary";
import { isClientSetupEnabled } from "@/lib/coaching/client-setup-gate";
import { issueClientInviteLink } from "@/lib/workspace/invite-links";

/**
 * P-016 — client setup / template assignment server actions.
 *
 * Order of operations is load-bearing: DEV FLAG → session gate → only then
 * binding user-controlled fields. With the flag off, the action returns the
 * feature-off failure before `auth()` runs — no session lookup, no form
 * field reads, no boundary/database/audit work.
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
  `/workspace/${encodeURIComponent(workspaceId)}/client-setups`;

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

/** A positional selection index: decimal digits only, integer, bounded. */
function indexField(formData: FormData, key: string): number | null {
  const raw = singleString(formData, key, 9);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
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

export async function assignTemplate(
  workspaceId: string,
  formData: FormData,
): Promise<ActionResult<{ assignmentId: string }>> {
  if (!isClientSetupEnabled(process.env.ENABLE_CLIENT_SETUP)) return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  // Positional contract: the browser submits indices + the rendered list
  // fingerprint — never raw client/template ids (P-016-R2).
  const clientIndex = indexField(formData, "clientIndex");
  const templateIndex = indexField(formData, "templateIndex");
  const listFingerprint = singleString(formData, "listFingerprint", MAX_ID_LEN);
  if (
    clientIndex === null ||
    templateIndex === null ||
    listFingerprint === null
  )
    return fail(INVALID);
  return delegate(
    () =>
      assignTemplateFromAction(gate.session, {
        workspaceId: ws,
        clientIndex,
        templateIndex,
        listFingerprint,
      }),
    listPath(ws),
  );
}

export async function cancelSetupAssignment(
  workspaceId: string,
  formData: FormData,
): Promise<ActionResult<{ cancelled: true }>> {
  if (!isClientSetupEnabled(process.env.ENABLE_CLIENT_SETUP)) return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const pinIndex = indexField(formData, "pinIndex");
  const rowFingerprint = singleString(formData, "rowFingerprint", MAX_ID_LEN);
  if (pinIndex === null || rowFingerprint === null) return fail(INVALID);
  return delegate(
    () =>
      cancelSetupAssignmentFromAction(gate.session, {
        workspaceId: ws,
        pinIndex,
        rowFingerprint,
      }),
    listPath(ws),
  );
}

const MAX_EMAIL_LEN = 320;

/**
 * T3: issue a client invite link alongside the pin/assignment flow. Same
 * gate order: DEV FLAG → session gate → bounded fields → service. The
 * returned link carries the raw token once, to the issuing coach only.
 */
export async function issueClientInvite(
  workspaceId: string,
  formData: FormData,
): Promise<ActionResult<{ link: string }>> {
  if (!isClientSetupEnabled(process.env.ENABLE_CLIENT_SETUP)) return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const boundWorkspaceId = singleString(formData, "workspaceId", MAX_ID_LEN);
  const email = singleString(formData, "email", MAX_EMAIL_LEN);
  if (boundWorkspaceId === null || boundWorkspaceId !== ws || email === null) {
    return fail(INVALID);
  }
  let result;
  try {
    result = await issueClientInviteLink(gate.session, {
      workspaceId: ws,
      targetEmail: email,
    });
  } catch {
    return fail(GENERIC);
  }
  if (!result.ok) return result;
  revalidate(listPath(ws));
  return { ok: true, value: { link: result.link } };
}
