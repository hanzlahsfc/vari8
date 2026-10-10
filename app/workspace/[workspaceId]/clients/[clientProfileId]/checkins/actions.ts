"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import {
  cancelCheckInInstanceFromAction,
  listSchedulableVersionsForClient,
  scheduleCheckInInstanceFromAction,
} from "@/lib/checkin/instances-boundary";

/**
 * P-025-B — staff Check-In instance schedule/cancel server actions
 * (decisions #92–#97; #95 owner/coach write, #97 SCHEDULED-only cancel).
 *
 * Order is load-bearing: feature resolver → session → only then FormData
 * binding → boundary. With the flag off/untrusted, the action returns the
 * unavailable failure BEFORE `auth()` runs — no session lookup, no field
 * reads, no service/database/audit work.
 *
 * The browser submits opaque route IDs + a POSITIONAL version selection;
 * the action re-runs the authorized version list server-side and maps
 * position → (formId, formVersionId). Raw internal IDs never leave the
 * browser as trusted selections.
 */

const OFF = "This feature is not available.";
const DENIED = "You don't have access to do that.";
const INVALID = "Check the request details and try again.";

const fail = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

/** Well-formed UTF-16 — lone surrogates break URIComponent encoding on
 * canonical path builds; malformed strings reject as INVALID. */
function isWellFormedString(v: string): boolean {
  try {
    encodeURIComponent(v);
    return true;
  } catch {
    return false;
  }
}

const singleString = (formData: FormData, key: string, maxLen: number) => {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  return typeof v === "string" && v.length > 0 && v.length <= maxLen
    ? isWellFormedString(v)
      ? v
      : null
    : null;
};

export type StaffCheckInActionState =
  | { ok: true; status: "scheduled" | "already_scheduled" | "cancelled" }
  | { ok: false; message: string }
  | { ok: "idle" };

async function sessionUser() {
  const session = await auth();
  const id = session?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function scheduleCheckInInstanceAction(
  _prev: StaffCheckInActionState,
  formData: FormData,
): Promise<StaffCheckInActionState> {
  // 1. Feature resolver — before ANY session/FormData/DB work.
  if (!isCheckInsEnabled()) return fail(OFF) as StaffCheckInActionState;

  // 2. Session gate.
  const userId = await sessionUser();
  if (userId === null) return fail(DENIED) as StaffCheckInActionState;

  // 3. Bounded input binding — opaque route IDs + positional selection +
  //    due timestamp (bounded); no raw form/version IDs are accepted.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const positionRaw = singleString(formData, "formVersionPosition", 8);
  const dueAtRaw = singleString(formData, "dueAt", 64);
  const dueTz = singleString(formData, "dueTz", 64);
  if (
    workspaceId === null ||
    clientProfileId === null ||
    positionRaw === null ||
    dueAtRaw === null ||
    !/^[0-9]+$/.test(positionRaw)
  )
    return fail(INVALID) as StaffCheckInActionState;
  const position = Number(positionRaw);
  if (!Number.isSafeInteger(position))
    return fail(INVALID) as StaffCheckInActionState;

  // 4. Server-revalidated selection — re-run the authorized list and map
  //    the positional index to the server-side (formId, formVersionId).
  //    A forged/stale position resolves to nothing or a real authorized
  //    row — never to caller-chosen internals.
  const versions = await listSchedulableVersionsForClient(
    { user: { id: userId } },
    { workspaceId, clientProfileId },
  );
  if (!versions.ok) return versions as StaffCheckInActionState;
  const picked = versions.value.options[position];
  if (!picked) return fail(INVALID) as StaffCheckInActionState;

  // datetime-local yields `YYYY-MM-DDTHH:MM` (no seconds/zone) — the
  // scheduling contract is a strict ISO UTC instant, so normalize to
  // `:00Z` here; the service re-validates the full instant.
  const dueAtIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueAtRaw)
    ? `${dueAtRaw}:00Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dueAtRaw)
      ? `${dueAtRaw}Z`
      : dueAtRaw;

  const result = await scheduleCheckInInstanceFromAction(
    { user: { id: userId } },
    {
      workspaceId,
      clientProfileId,
      formId: picked.formId,
      formVersionId: picked.formVersionId,
      dueAt: dueAtIso,
      dueTz,
    },
  );
  if (!result.ok) return result as StaffCheckInActionState;
  revalidatePath(
    `/workspace/${workspaceId}/clients/${clientProfileId}/checkins`,
  );
  return { ok: true, status: result.value.status };
}

export async function cancelCheckInInstanceAction(
  _prev: StaffCheckInActionState,
  formData: FormData,
): Promise<StaffCheckInActionState> {
  // 1. Feature resolver first.
  if (!isCheckInsEnabled()) return fail(OFF) as StaffCheckInActionState;

  // 2. Session gate.
  const userId = await sessionUser();
  if (userId === null) return fail(DENIED) as StaffCheckInActionState;

  // 3. Bounded IDs — the instance ID is an opaque route-level identifier.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const instanceId = singleString(formData, "instanceId", 128);
  if (workspaceId === null || clientProfileId === null || instanceId === null)
    return fail(INVALID) as StaffCheckInActionState;

  const result = await cancelCheckInInstanceFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId, instanceId },
  );
  if (!result.ok) return result as StaffCheckInActionState;
  revalidatePath(
    `/workspace/${workspaceId}/clients/${clientProfileId}/checkins`,
  );
  return { ok: true, status: result.value.status };
}
