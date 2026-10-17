"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import {
  cancelCheckInInstanceFromAction,
  createCheckInScheduleRuleFromAction,
  generateCheckInScheduleRuleInstancesFromAction,
  listSchedulableVersionsForClient,
  listStaffCheckInFeedback,
  markCheckInSubmissionReviewedFromAction,
  readCheckInReviewTrackerContextFromAction,
  readStaffCheckInCalendar,
  readStaffCheckInSubmissionDetail,
  resolveCheckInFeedbackSendFromAction,
  scheduleCheckInInstanceFromAction,
  sendCheckInFeedbackFromAction,
  setCheckInScheduleRuleStatusFromAction,
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
      /** CHECK-IN-FEEDBACK-I1: bounded first feedback page + the
       * advisory send affordance (review exists + assigned write). */
      feedback: StaffCheckInSubmissionDetail["feedback"];
      feedbackNextCursor: string | null;
      canSend: boolean;
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
    feedback: result.value.feedback,
    feedbackNextCursor: result.value.feedbackNextCursor,
    canSend: result.value.canSend,
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

/**
 * P-025-D2 (decision 104): bounded-range calendar read for authorized staff —
 * same `checkinInstances` protocol, range REQUIRED by the boundary.
 * Called programmatically by the calendar component; feature resolver
 * first, session second, bounded args only. Zero audits (header read).
 */
export async function readStaffCheckInCalendarAction(
  ctx: { workspaceId: string; clientProfileId: string },
  input: { from: string; to: string },
): Promise<
  | {
      status: "ok";
      items: import("@/lib/checkin/instances").StaffCheckInInstanceItem[];
      truncated: boolean;
    }
  | { status: "empty" }
  | { status: "error"; message: string }
> {
  if (!isCheckInsEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    typeof ctx !== "object" ||
    ctx === null ||
    typeof ctx.workspaceId !== "string" ||
    ctx.workspaceId.length === 0 ||
    ctx.workspaceId.length > 128 ||
    typeof ctx.clientProfileId !== "string" ||
    ctx.clientProfileId.length === 0 ||
    ctx.clientProfileId.length > 128 ||
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

  const result = await readStaffCheckInCalendar(
    { user: { id: userId } },
    {
      workspaceId: ctx.workspaceId,
      clientProfileId: ctx.clientProfileId,
      from: input.from,
      to: input.to,
    },
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

/**
 * CHECK-IN-FEEDBACK-I1 — staff written feedback (reviewed P3 contract).
 * `sendCheckInFeedbackAction` is the only write path: same gate-first
 * ordering (feature resolver → session → bounded FormData → boundary),
 * one committed send = one `checkin_feedback` CREATE audit. The
 * `clientRequestId` nonce is minted by the composer and carried
 * UNCHANGED through every retry — the unique index, not the network,
 * is the dedup authority. `resolveCheckInFeedbackSendAction` is the
 * bounded reconciliation read for the remount/reload path.
 */
export type StaffCheckInFeedbackSendState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      outcome: "sent" | "already_sent";
      feedbackId: string;
      sentAt: string;
      byName: string;
      body: string;
    };

export async function sendCheckInFeedbackAction(
  _prev: StaffCheckInFeedbackSendState,
  formData: FormData,
): Promise<StaffCheckInFeedbackSendState> {
  // 1. Feature resolver — before ANY session/FormData/DB work.
  if (!isCheckInsEnabled()) return { status: "error", message: OFF };

  // 2. Session gate.
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };

  // 3. Bounded inputs — opaque route IDs + nonce + the text body.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const submissionId = singleString(formData, "submissionId", 128);
  const clientRequestId = singleString(formData, "clientRequestId", 64);
  const body = singleString(formData, "body", 4096);
  if (
    workspaceId === null ||
    clientProfileId === null ||
    submissionId === null ||
    clientRequestId === null ||
    body === null
  )
    return { status: "error", message: INVALID };

  const result = await sendCheckInFeedbackFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId, submissionId, body, clientRequestId },
  );
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(
    `/workspace/${workspaceId}/clients/${clientProfileId}/checkins`,
  );
  return {
    status: "ok",
    outcome: result.value.status,
    feedbackId: result.value.feedbackId,
    sentAt: result.value.sentAt,
    byName: result.value.byName,
    body: result.value.body,
  };
}

export type ResolveCheckInFeedbackSendState =
  | {
      status: "sent";
      feedbackId: string;
      sentAt: string;
      byName: string;
      body: string;
    }
  | { status: "not_sent" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

/** Programmatic (non-form) call — same gate-first ordering. */
export async function resolveCheckInFeedbackSendAction(input: {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
  clientRequestId: string;
}): Promise<ResolveCheckInFeedbackSendState> {
  if (!isCheckInsEnabled()) return { status: "unavailable" };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.workspaceId !== "string" ||
    input.workspaceId.length === 0 ||
    input.workspaceId.length > 128 ||
    typeof input.clientProfileId !== "string" ||
    input.clientProfileId.length === 0 ||
    input.clientProfileId.length > 128 ||
    typeof input.submissionId !== "string" ||
    input.submissionId.length === 0 ||
    input.submissionId.length > 128 ||
    typeof input.clientRequestId !== "string" ||
    input.clientRequestId.length === 0 ||
    input.clientRequestId.length > 64
  )
    return { status: "error", message: INVALID };

  const result = await resolveCheckInFeedbackSendFromAction(
    { user: { id: userId } },
    input,
  );
  if (!result.ok) {
    // Denials and closed failures surface as truthful "unavailable" —
    // never a false "not_sent" (which would invite a duplicate send).
    return { status: "unavailable" };
  }
  return result.value;
}

export type ListStaffCheckInFeedbackState =
  | {
      status: "ok";
      items: import("@/lib/checkin/instances").CheckInFeedbackItem[];
      nextCursor: string | null;
      hasMore: boolean;
    }
  | { status: "error"; message: string };

/** Programmatic bounded page read for the staff thread's "load more". */
export async function listStaffCheckInFeedbackAction(
  ctx: { workspaceId: string; clientProfileId: string; submissionId: string },
  input: { cursor: string },
): Promise<ListStaffCheckInFeedbackState> {
  if (!isCheckInsEnabled()) return { status: "error", message: OFF };
  const userId = await sessionUser();
  if (userId === null) return { status: "error", message: DENIED };
  if (
    typeof ctx !== "object" ||
    ctx === null ||
    typeof ctx.workspaceId !== "string" ||
    ctx.workspaceId.length === 0 ||
    ctx.workspaceId.length > 128 ||
    typeof ctx.clientProfileId !== "string" ||
    ctx.clientProfileId.length === 0 ||
    ctx.clientProfileId.length > 128 ||
    typeof ctx.submissionId !== "string" ||
    ctx.submissionId.length === 0 ||
    ctx.submissionId.length > 128 ||
    typeof input !== "object" ||
    input === null ||
    typeof input.cursor !== "string" ||
    input.cursor.length === 0 ||
    input.cursor.length > 160
  )
    return { status: "error", message: INVALID };

  const result = await listStaffCheckInFeedback(
    { user: { id: userId } },
    { ...ctx, cursor: input.cursor },
  );
  if (!result.ok) return { status: "error", message: result.message };
  return {
    status: "ok",
    items: result.value.items,
    nextCursor: result.value.nextCursor,
    hasMore: result.value.hasMore,
  };
}

/**
 * CHECK-IN-RECURRENCE-I1 (decision 114) — bounded weekly schedule-rule
 * actions (reviewed P3 contract + P3-R1 refinements). All writes are
 * EXPLICIT staff POSTs — same gate-first ordering (feature resolver →
 * session → bounded FormData → boundary). No read path ever schedules.
 * The browser submits a POSITIONAL form selection (re-mapped
 * server-side, never a raw formId), a weekday, HH:MM local time, a
 * coach-CONFIRMED IANA timezone (explicit `timezoneConfirmed` flag
 * required — the browser zone is a suggestion, never proof), and
 * inclusive local start/end dates.
 */
export type StaffCheckInRuleState =
  | { ok: "idle" }
  | { ok: true; status: "created" | "replaced" }
  | { ok: false; message: string };

export async function createCheckInRuleAction(
  _prev: StaffCheckInRuleState,
  formData: FormData,
): Promise<StaffCheckInRuleState> {
  // 1. Feature resolver — before ANY session/FormData/DB work.
  if (!isCheckInsEnabled()) return fail(OFF) as StaffCheckInRuleState;

  // 2. Session gate.
  const userId = await sessionUser();
  if (userId === null) return fail(DENIED) as StaffCheckInRuleState;

  // 3. Bounded input binding.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const positionRaw = singleString(formData, "formVersionPosition", 8);
  const weekday = singleString(formData, "weekday", 16);
  const localTime = singleString(formData, "localTime", 8);
  const timezone = singleString(formData, "timezone", 64);
  const timezoneConfirmed = singleString(formData, "timezoneConfirmed", 4);
  const startDate = singleString(formData, "startDate", 16);
  const endDateRaw = singleString(formData, "endDate", 16);
  const replacesRuleId = singleString(formData, "replacesRuleId", 128);
  if (
    workspaceId === null ||
    clientProfileId === null ||
    positionRaw === null ||
    weekday === null ||
    localTime === null ||
    timezone === null ||
    startDate === null ||
    !/^[0-9]+$/.test(positionRaw) ||
    !/^\d{2}:\d{2}$/.test(localTime)
  )
    return fail(INVALID) as StaffCheckInRuleState;
  // The timezone must be EXPLICITLY confirmed by the coach — a missing
  // or false confirmation is an invalid request, never silently stored.
  if (timezoneConfirmed !== "1") return fail(INVALID) as StaffCheckInRuleState;
  const position = Number(positionRaw);
  if (!Number.isSafeInteger(position))
    return fail(INVALID) as StaffCheckInRuleState;
  const [hh, mm] = localTime.split(":").map(Number);
  const localTimeMinutes = hh * 60 + mm;
  if (hh > 23 || mm > 59) return fail(INVALID) as StaffCheckInRuleState;

  // 4. Positional form selection re-mapped through the authorized list.
  const versions = await listSchedulableVersionsForClient(
    { user: { id: userId } },
    { workspaceId, clientProfileId },
  );
  if (!versions.ok) return versions as StaffCheckInRuleState;
  const picked = versions.value.options[position];
  if (!picked) return fail(INVALID) as StaffCheckInRuleState;

  const result = await createCheckInScheduleRuleFromAction(
    { user: { id: userId } },
    {
      workspaceId,
      clientProfileId,
      formId: picked.formId,
      weekday,
      localTimeMinutes,
      timezone,
      startDate,
      endDate: endDateRaw,
      ...(replacesRuleId !== null ? { replacesRuleId } : {}),
    },
  );
  if (!result.ok) return result as StaffCheckInRuleState;
  revalidatePath(
    `/workspace/${workspaceId}/clients/${clientProfileId}/checkins`,
  );
  return { ok: true, status: result.value.status };
}

export type StaffCheckInRuleLifecycleState =
  | { ok: "idle" }
  | { ok: true; status: "paused" | "resumed" | "ended" }
  | { ok: false; message: string };

export async function setCheckInRuleStatusAction(
  _prev: StaffCheckInRuleLifecycleState,
  formData: FormData,
): Promise<StaffCheckInRuleLifecycleState> {
  if (!isCheckInsEnabled()) return fail(OFF) as StaffCheckInRuleLifecycleState;
  const userId = await sessionUser();
  if (userId === null) return fail(DENIED) as StaffCheckInRuleLifecycleState;

  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const ruleId = singleString(formData, "ruleId", 128);
  const action = singleString(formData, "ruleAction", 8);
  if (
    workspaceId === null ||
    clientProfileId === null ||
    ruleId === null ||
    (action !== "pause" && action !== "resume" && action !== "end")
  )
    return fail(INVALID) as StaffCheckInRuleLifecycleState;

  const result = await setCheckInScheduleRuleStatusFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId, ruleId, action },
  );
  if (!result.ok) return result as StaffCheckInRuleLifecycleState;
  revalidatePath(
    `/workspace/${workspaceId}/clients/${clientProfileId}/checkins`,
  );
  return { ok: true, status: result.value.status };
}

/**
 * The ONLY generation path — an explicit authorized staff POST. The
 * returned classification is rendered verbatim: examinedThrough /
 * created / alreadyGenerated / skippedConflicts / unrepresentable.
 */
export type StaffCheckInGenerateState =
  | { ok: "idle" }
  | { ok: false; message: string }
  | {
      ok: true;
      status: "generated" | "paused" | "ended";
      examinedThrough: string | null;
      created: number;
      alreadyGenerated: number;
      skippedConflicts: string[];
      unrepresentable: string[];
    };

export async function generateCheckInRuleAction(
  _prev: StaffCheckInGenerateState,
  formData: FormData,
): Promise<StaffCheckInGenerateState> {
  if (!isCheckInsEnabled()) return fail(OFF) as StaffCheckInGenerateState;
  const userId = await sessionUser();
  if (userId === null) return fail(DENIED) as StaffCheckInGenerateState;

  const workspaceId = singleString(formData, "workspaceId", 128);
  const clientProfileId = singleString(formData, "clientProfileId", 128);
  const ruleId = singleString(formData, "ruleId", 128);
  if (workspaceId === null || clientProfileId === null || ruleId === null)
    return fail(INVALID) as StaffCheckInGenerateState;

  const result = await generateCheckInScheduleRuleInstancesFromAction(
    { user: { id: userId } },
    { workspaceId, clientProfileId, ruleId },
  );
  if (!result.ok) return result as StaffCheckInGenerateState;
  revalidatePath(
    `/workspace/${workspaceId}/clients/${clientProfileId}/checkins`,
  );
  const v = result.value;
  return v.status === "generated"
    ? { ok: true, ...v }
    : {
        ok: true,
        status: v.status,
        examinedThrough: null,
        created: 0,
        alreadyGenerated: 0,
        skippedConflicts: [],
        unrepresentable: [],
      };
}
