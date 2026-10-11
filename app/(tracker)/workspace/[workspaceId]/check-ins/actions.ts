"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import {
  readOwnCheckInCalendar,
  submitCheckInInstanceFromAction,
} from "@/lib/checkin/instances-boundary";

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

/**
 * P-025-D2 (decision 104): bounded-range calendar read for the owning client —
 * same `checkinInstances` own-scope protocol. Programmatic load from
 * the calendar component; resolver → session → bounded args → boundary.
 * Zero audits (header read).
 */
export async function readOwnCheckInCalendarAction(
  ctx: { workspaceId: string },
  input: { from: string; to: string },
): Promise<
  | {
      status: "ok";
      items: import("@/lib/checkin/instances").OwnCheckInInstanceItem[];
      truncated: boolean;
    }
  | { status: "empty" }
  | { status: "error"; message: string }
> {
  if (!isCheckInsEnabled()) return { status: "error", message: OFF };
  const session = await auth();
  if (!session?.user?.id) return { status: "error", message: DENIED };
  const userId = session.user.id;
  if (
    typeof ctx !== "object" ||
    ctx === null ||
    typeof ctx.workspaceId !== "string" ||
    ctx.workspaceId.length === 0 ||
    ctx.workspaceId.length > 128 ||
    typeof input !== "object" ||
    input === null ||
    typeof input.from !== "string" ||
    input.from.length === 0 ||
    input.from.length > 40 ||
    typeof input.to !== "string" ||
    input.to.length === 0 ||
    input.to.length > 40
  )
    return { status: "error", message: INVALID };

  const result = await readOwnCheckInCalendar(
    { user: { id: userId } },
    { workspaceId: ctx.workspaceId, from: input.from, to: input.to },
  );
  if (!result.ok) {
    if (result.code === "not_available") return { status: "empty" };
    return { status: "error", message: result.message };
  }
  return {
    status: "ok",
    items: result.value.items,
    truncated: result.value.truncated === true,
  };
}
