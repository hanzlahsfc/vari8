"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import {
  cancelCheckInInstanceFromAction,
  listSchedulableVersionsForClient,
  markCheckInSubmissionReviewedFromAction,
  readCheckInReviewTrackerContextFromAction,
  readStaffCheckInSubmissionDetail,
  scheduleCheckInInstanceFromAction,
} from "@/lib/checkin/instances-boundary";
import type { StaffCheckInSubmissionDetail } from "@/lib/checkin/instances";

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

/**
 * P-025-C — staff Check-In submission detail + terminal review actions
 * (decisions #86–#91 carried by #96). `viewCheckInSubmissionDetail` is the
 * ONLY answer-bearing staff surface — an explicit POST; one committed call
 * writes exactly one structural READ audit. `markCheckInSubmissionReviewed`
 * creates at most one immutable acknowledgement — server-side
 * reauthorization is authoritative; the UI's detail-gated enable is never
 * trusted.
 */

export type StaffCheckInDetailState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      submissionId: string;
      formName: string;
      versionSeq: number;
      dueAt: string;
      submittedAt: string;
      late: boolean;
      reviewed: { byName: string; at: string } | null;
      fields: StaffCheckInSubmissionDetail["fields"];
      /** Server-decided: the calling staff member may mark (assigned
       * coach cell only). The mark action re-authorizes regardless. */
      canMark: boolean;
    };

export async function viewCheckInSubmissionDetail(
  _prev: StaffCheckInDetailState,
  formData: FormData,
): Promise<StaffCheckInDetailState> {
  // 1. Feature resolver — before ANY session/FormData/DB work.
  if (!isCheckInsEnabled()) return { status: "error", message: OFF };

  // 2. Session gate.
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };

  // 3. Bounded opaque IDs — rebound server-side through authorization.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const submissionId = singleString(formData, "submissionId", 128);
  if (workspaceId === null || clientProfileId === null || submissionId === null)
    return { status: "error", message: INVALID };

  const result = await readStaffCheckInSubmissionDetail(
    { user: { id: userId } },
    { workspaceId, clientProfileId, submissionId },
  );
  if (!result.ok) return { status: "error", message: result.message };

  return {
    status: "ok",
    submissionId: result.value.submissionId,
    formName: result.value.formName,
    versionSeq: result.value.versionSeq,
    dueAt: result.value.dueAt,
    submittedAt: result.value.submittedAt,
    late: result.value.late,
    reviewed: result.value.reviewed,
    fields: result.value.fields,
    canMark: result.value.canMark,
  };
}

export type StaffCheckInMarkState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; reviewedAt: string };

export async function markCheckInSubmissionReviewed(
  _prev: StaffCheckInMarkState,
  formData: FormData,
): Promise<StaffCheckInMarkState> {
  // 1. Feature resolver first.
  if (!isCheckInsEnabled()) return { status: "error", message: OFF };

  // 2. Session gate.
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };

  // 3. Bounded opaque IDs.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const submissionId = singleString(formData, "submissionId", 128);
  if (workspaceId === null || clientProfileId === null || submissionId === null)
    return { status: "error", message: INVALID };

  const result = await markCheckInSubmissionReviewedFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId, submissionId },
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${workspaceId}/clients/${clientProfileId}/checkins`,
  );
  return { status: "ok", reviewedAt: result.value.reviewedAt };
}

/**
 * P-025-D6 — explicit DailyEntry tracker context (decision 103, C1
 * manual date entry only). Staff deliberately enter ONE declared
 * `YYYY-MM-DD` `entryDate`; the server re-validates it, independently
 * re-authorizes the strict `checkinsCoachReviews/read` ∩
 * `dailyTracking/read` intersection inside a separate Serializable
 * transaction, and returns only the latest committed revision for that
 * exact date — or a non-disclosing empty state. No fallback, no passive
 * preload, no availability browsing; each committed call is one
 * structural `READ daily_entry` audit.
 */
export type StaffCheckInTrackerContextState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | {
      status: "ok";
      entryDate: string;
      revisionSeq: number;
      declaredAt: string;
      values: {
        parameterKey: string;
        label: string;
        unit: string | null;
        display: string;
      }[];
    };

export async function showCheckInReviewTrackerContext(
  _prev: StaffCheckInTrackerContextState,
  formData: FormData,
): Promise<StaffCheckInTrackerContextState> {
  // 1. Feature resolver first.
  if (!isCheckInsEnabled()) return { status: "error", message: OFF };

  // 2. Session gate.
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };

  // 3. Bounded opaque IDs + the one declared date.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const submissionId = singleString(formData, "submissionId", 128);
  const entryDate = singleString(formData, "entryDate", 32);
  if (
    workspaceId === null ||
    clientProfileId === null ||
    submissionId === null ||
    entryDate === null
  )
    return { status: "error", message: INVALID };

  const result = await readCheckInReviewTrackerContextFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId, submissionId, entryDate },
  );
  if (!result.ok) {
    if (result.code === "not_available") return { status: "empty" };
    return { status: "error", message: result.message };
  }
  return {
    status: "ok",
    entryDate: result.value.entryDate,
    revisionSeq: result.value.revisionSeq,
    declaredAt: result.value.declaredAt,
    values: result.value.values,
  };
}
