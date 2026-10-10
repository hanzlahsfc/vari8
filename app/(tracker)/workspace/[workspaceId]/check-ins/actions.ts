"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import { submitCheckInInstanceFromAction } from "@/lib/checkin/instances-boundary";

/**
 * P-025-B — client Check-In submission server action (decisions #92–#97).
 *
 * Order is load-bearing: GATE → session gate → only then FormData
 * binding → boundary. With the flag off/untrusted, the action returns the
 * unavailable failure BEFORE `auth()` runs — no session lookup, no field
 * reads, no service/database/audit work.
 *
 * The browser submits `workspaceId` + `instanceId` (opaque route IDs) +
 * `answersJson` — a bounded array of {fieldId, value} records. No
 * clientProfileId or userId is ever accepted from the browser — the
 * service rebinds the caller's own profile server-side.
 */

const OFF = "This feature is not available.";
const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";

const fail = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

const singleString = (formData: FormData, key: string, maxLen: number) => {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  return typeof v === "string" && v.length > 0 && v.length <= maxLen ? v : null;
};

/** Byte-bound variant — answersJson's service bound is byte-based, so the
 * transport bound must match. */
const singleStringBytes = (
  formData: FormData,
  key: string,
  maxBytes: number,
) => {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  if (typeof v !== "string" || v.length === 0) return null;
  return new TextEncoder().encode(v).length <= maxBytes ? v : null;
};

export type SubmitCheckInState =
  | { ok: true; status: "submitted" | "already_submitted" }
  | { ok: false; message: string }
  | { ok: "idle" };

export async function submitCheckInInstanceAction(
  _prev: SubmitCheckInState,
  formData: FormData,
): Promise<SubmitCheckInState> {
  // 1. Feature resolver — off/untrusted fails before ANY work.
  if (!isCheckInsEnabled()) return fail(OFF) as SubmitCheckInState;

  // 2. Session gate.
  const session = await auth();
  if (!session?.user?.id) return fail(DENIED) as SubmitCheckInState;

  // 3. Bounded input binding — opaque IDs + the bounded JSON payload.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const instanceId = singleString(formData, "instanceId", 128);
  const answersJson = singleStringBytes(formData, "answersJson", 160 * 1024);
  if (workspaceId === null || instanceId === null || answersJson === null)
    return fail(INVALID) as SubmitCheckInState;

  const result = await submitCheckInInstanceFromAction(
    { user: { id: session.user.id } },
    { workspaceId, instanceId, answersJson },
  );
  if (result.ok)
    revalidatePath(`/workspace/${workspaceId}/check-ins/${instanceId}`);
  if (!result.ok) return result as SubmitCheckInState;
  return { ok: true, status: result.value.status };
}
