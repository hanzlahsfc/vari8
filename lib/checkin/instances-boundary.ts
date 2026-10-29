/**
 * P-025-B Check-In instance/submission boundary — the ONLY module the app
 * layer touches. Every service-domain error is mapped to a closed,
 * non-disclosing safe vocabulary; nothing raw escapes to the client.
 */

import {
  fail as sharedFail,
  guard as sharedGuard,
  mapError as sharedMapError,
} from "../boundary";
import { isCheckInsEnabled } from "./forms-gate";
import {
  CheckInInstanceError,
  type CheckInInstanceDeps,
  type CheckInInstanceState,
  listCheckInInstancesForClient,
  listOwnCheckInInstances as serviceListOwnCheckInInstances,
  getOwnNextCheckInInstance as serviceGetOwnNextCheckInInstance,
  getOwnCheckInInstance as serviceGetOwnCheckInInstance,
  scheduleCheckInInstance,
  cancelCheckInInstance,
  submitCheckInInstance,
  listSchedulableFormVersions,
  type GetOwnCheckInInstanceInput,
  type OwnCheckInInstanceDetail,
  type ScheduleCheckInInstanceInput,
  type ScheduleCheckInInstanceResult,
  type CancelCheckInInstanceInput,
  type CancelCheckInInstanceResult,
  type ScheduleFormOption,
  type StaffCheckInInstanceItem,
  type OwnCheckInInstanceItem,
  type OwnNextCheckInInstance,
  type SubmitCheckInInstanceInput,
  type SubmitCheckInInstanceResult,
  listCheckInSubmissionsForClient,
  readCheckInSubmissionDetail,
  markCheckInSubmissionReviewed,
  listCheckInReviewQueue,
  parseCheckInSubmissionParam,
  type StaffCheckInReviewQueueItem,
  type StaffCheckInSubmissionItem,
  type StaffCheckInSubmissionDetail,
  type MarkCheckInSubmissionReviewedInput,
  type MarkCheckInSubmissionReviewedResult,
  sendCheckInFeedback,
  resolveCheckInFeedbackSend,
  listCheckInFeedback,
  listOwnCheckInFeedback,
  type CheckInFeedbackPage,
  type SendCheckInFeedbackInput,
  type SendCheckInFeedbackResult,
  type ResolveCheckInFeedbackSendInput,
  type ResolveCheckInFeedbackSendResult,
  type ListCheckInFeedbackInput,
  type ListOwnCheckInFeedbackInput,
} from "./instances";
import {
  readCheckInReviewTrackerContext,
  type CheckInTrackerContextDeps,
  type CheckInTrackerContextResult,
} from "./tracker-context";
import {
  readCheckInReviewPanel,
  type CheckInReviewPanelDetail,
} from "./review-panel";
import {
  createCheckInScheduleRule,
  setCheckInScheduleRuleStatus,
  generateCheckInScheduleRuleInstances,
  listCheckInScheduleRules,
  projectCheckInScheduleOccurrences,
  type CheckInScheduleDeps,
  type CreateCheckInScheduleRuleInput,
  type CreateCheckInScheduleRuleResult,
  type SetCheckInScheduleRuleStatusInput,
  type SetCheckInScheduleRuleStatusResult,
  type GenerateCheckInScheduleRuleInput,
  type GenerateCheckInScheduleRuleResult,
  type CheckInScheduleRuleItem,
  type ProjectCheckInScheduleOccurrencesInput,
  type ProjectCheckInScheduleOccurrencesResult,
} from "./schedules";

export type CheckInSafeResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "denied"
        | "invalid_input"
        | "not_available"
        | "already_submitted"
        | "consent_missing"
        | "policy_not_configured"
        | "serialization_conflict"
        | "review_required"
        | "idempotency_conflict";
      message: string;
    };

const CLOSED_MESSAGES: Record<
  Extract<CheckInSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to this Check-In.",
  invalid_input: "The Check-In request wasn’t valid.",
  not_available: "This Check-In isn’t available.",
  already_submitted: "This Check-In was already submitted.",
  consent_missing: "Check-In isn’t available right now.",
  policy_not_configured: "Check-In isn’t available right now.",
  serialization_conflict: "The Check-In changed — please try again.",
  review_required:
    "This submission needs a review before feedback can be sent.",
  idempotency_conflict:
    "A different response was already sent with this request — check the thread before resending.",
};

function fail<T>(code: keyof typeof CLOSED_MESSAGES): CheckInSafeResult<T> {
  return sharedFail(CLOSED_MESSAGES, code);
}

function mapError<T>(error: unknown): CheckInSafeResult<T> {
  return sharedMapError(error, {
    denied: () => fail("denied"),
    domain: (e) => {
      if (!(e instanceof CheckInInstanceError)) return null;
      if (e.code === "instance_not_accessible") return fail("not_available");
      return fail(e.code);
    },
    fallback: () => fail("not_available"),
  });
}

async function guard<T>(
  env: { ENABLE_CHECK_INS?: string; APP_ENV?: string; NODE_ENV?: string },
  fn: () => Promise<T>,
): Promise<CheckInSafeResult<T>> {
  // Feature boundary FIRST — flag+trusted runtime before any session/DB
  // work in the actions; unknown/production fails closed.
  return sharedGuard(
    {
      enabled: isCheckInsEnabled(env),
      off: () => fail<T>("not_available"),
      map: (e) => mapError<T>(e),
    },
    fn,
  );
}

type Session = { user?: { id?: string } } | null | undefined;

export async function scheduleCheckInInstanceFromAction(
  session: Session,
  input: ScheduleCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<ScheduleCheckInInstanceResult>> {
  return guard(process.env, () =>
    scheduleCheckInInstance(session as never, input, deps),
  );
}

export async function cancelCheckInInstanceFromAction(
  session: Session,
  input: CancelCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<CancelCheckInInstanceResult>> {
  return guard(process.env, () =>
    cancelCheckInInstance(session as never, input, deps),
  );
}

export async function listStaffCheckInInstances(
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<{ items: StaffCheckInInstanceItem[] }>> {
  return guard(process.env, () =>
    listCheckInInstancesForClient(session as never, input, deps),
  );
}

export async function listSchedulableVersionsForClient(
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<{ options: ScheduleFormOption[] }>> {
  return guard(process.env, () =>
    listSchedulableFormVersions(session as never, input, deps),
  );
}

export async function listOwnCheckInInstances(
  session: Session,
  input: { workspaceId: string },
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<{ items: OwnCheckInInstanceItem[] }>> {
  return guard(process.env, () =>
    serviceListOwnCheckInInstances(session as never, input, deps),
  );
}

/**
 * FI-I4 (decision #107): earliest unfinished Check-In for the client
 * Home card. Feature gate first, own-scope rebinding inside the
 * service; `next` is null for the truthful no-pending state.
 */
export async function readOwnNextCheckInInstance(
  session: Session,
  input: { workspaceId: string },
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<{ next: OwnNextCheckInInstance | null }>> {
  return guard(process.env, async () => ({
    next: await serviceGetOwnNextCheckInInstance(session as never, input, deps),
  }));
}

export async function getOwnCheckInInstance(
  session: Session,
  input: GetOwnCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<OwnCheckInInstanceDetail>> {
  return guard(process.env, () =>
    serviceGetOwnCheckInInstance(session as never, input, deps),
  );
}

/**
 * P-025-D2 (decision 104): bounded-range calendar read for staff — the same
 * `checkinInstances` authorization/protocol as the header list; the
 * range is REQUIRED here (the unbounded list boundary is unchanged).
 */
export async function readStaffCheckInCalendar(
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    from: string;
    to: string;
  },
  deps: CheckInInstanceDeps = {},
): Promise<
  CheckInSafeResult<{ items: StaffCheckInInstanceItem[]; truncated?: boolean }>
> {
  return guard(process.env, () =>
    listCheckInInstancesForClient(
      session as never,
      {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        range: { from: input.from, to: input.to },
      },
      deps,
    ),
  );
}

/** P-025-D2 (decision 104): bounded-range calendar read for the owning client. */
export async function readOwnCheckInCalendar(
  session: Session,
  input: { workspaceId: string; from: string; to: string },
  deps: CheckInInstanceDeps = {},
): Promise<
  CheckInSafeResult<{ items: OwnCheckInInstanceItem[]; truncated?: boolean }>
> {
  return guard(process.env, () =>
    serviceListOwnCheckInInstances(
      session as never,
      {
        workspaceId: input.workspaceId,
        range: { from: input.from, to: input.to },
      },
      deps,
    ),
  );
}

export async function listStaffCheckInSubmissions(
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<{ items: StaffCheckInSubmissionItem[] }>> {
  return guard(process.env, () =>
    listCheckInSubmissionsForClient(session as never, input, deps),
  );
}

export async function readStaffCheckInSubmissionDetail(
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
  },
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<StaffCheckInSubmissionDetail>> {
  return guard(process.env, () =>
    readCheckInSubmissionDetail(session as never, input, deps),
  );
}

/**
 * FULL-PACKAGE SLICE of #171. Coach review-panel read: the audited
 * submission detail payload plus the same-form previous-submission
 * change summary in ONE call. The detail read remains the
 * authorization/consent/audit gate; a denied or foreign tuple maps to
 * the same closed vocabulary as the base detail read.
 */
export async function readCheckInReviewPanelFromAction(
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
  },
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<CheckInReviewPanelDetail>> {
  return guard(process.env, () =>
    readCheckInReviewPanel(session as never, input, deps),
  );
}

/**
 * P-025-D6 — explicit DailyEntry tracker context (decision #103). A
 * separate explicit action; one committed call writes exactly one
 * `READ daily_entry` audit. A missing entry maps to `not_available`
 * (non-disclosing empty state) — never a fallback date.
 */
export async function readCheckInReviewTrackerContextFromAction(
  session: Session,
  input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
    entryDate: string;
  },
  deps: CheckInTrackerContextDeps = {},
): Promise<CheckInSafeResult<CheckInTrackerContextResult>> {
  return guard(process.env, () =>
    readCheckInReviewTrackerContext(session as never, input, deps),
  );
}

/**
 * CHECK-IN-OVERVIEW-I1 — staff workspace-level awaiting-review queue.
 * The feature gate applies FIRST (same as every boundary): a disabled
 * flag maps to `not_available`, never an empty list. Denied scope maps
 * to `denied`, never "nothing pending."
 */
export async function listStaffCheckInReviewQueue(
  session: Session,
  input: { workspaceId: string; cursor?: string },
  deps: CheckInInstanceDeps = {},
): Promise<
  CheckInSafeResult<{
    items: StaffCheckInReviewQueueItem[];
    nextCursor: string | null;
  }>
> {
  return guard(process.env, () =>
    listCheckInReviewQueue(session as never, input, deps),
  );
}

export async function markCheckInSubmissionReviewedFromAction(
  session: Session,
  input: MarkCheckInSubmissionReviewedInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<MarkCheckInSubmissionReviewedResult>> {
  return guard(process.env, () =>
    markCheckInSubmissionReviewed(session as never, input, deps),
  );
}

/**
 * CHECK-IN-FEEDBACK-I1 — staff feedback send. The boundary maps the
 * service's closed vocabulary; `sent`/`already_sent` are success
 * statuses, `review_required`/`idempotency_conflict`/`consent_missing`
 * are honest failures.
 */
export async function sendCheckInFeedbackFromAction(
  session: Session,
  input: SendCheckInFeedbackInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<SendCheckInFeedbackResult>> {
  return guard(process.env, () =>
    sendCheckInFeedback(session as never, input, deps),
  );
}

/**
 * Recovery reconciliation read for the composer remount/reload path —
 * re-authorizes checkinFeedback/read + consent, scoped to the
 * authenticated author and the exact target.
 */
export async function resolveCheckInFeedbackSendFromAction(
  session: Session,
  input: ResolveCheckInFeedbackSendInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<ResolveCheckInFeedbackSendResult>> {
  return guard(process.env, () =>
    resolveCheckInFeedbackSend(session as never, input, deps),
  );
}

/** Bounded staff thread page — same protocol as the detail read. */
export async function listStaffCheckInFeedback(
  session: Session,
  input: ListCheckInFeedbackInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<CheckInFeedbackPage>> {
  return guard(process.env, () =>
    listCheckInFeedback(session as never, input, deps),
  );
}

/** Bounded own-scope client page — consent-gated like answers. */
export async function listOwnCheckInFeedbackItems(
  session: Session,
  input: ListOwnCheckInFeedbackInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<CheckInFeedbackPage>> {
  return guard(process.env, () =>
    listOwnCheckInFeedback(session as never, input, deps),
  );
}

export async function submitCheckInInstanceFromAction(
  session: Session,
  input: SubmitCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<SubmitCheckInInstanceResult>> {
  return guard(process.env, () =>
    submitCheckInInstance(session as never, input, deps),
  );
}

/**
 * CHECK-IN-RECURRENCE-I1 (decision #114) — bounded weekly schedule
 * rules. Every wrapper is a staff ACTION (explicit writes only); the
 * rules list is a mutation-free read under `checkinInstances/read`.
 * Lifecycle results (`paused`/`ended`/`generated`) pass through
 * truthfully; closed errors map to the same vocabulary as the rest of
 * the boundary.
 */
export async function createCheckInScheduleRuleFromAction(
  session: Session,
  input: CreateCheckInScheduleRuleInput,
  deps: CheckInScheduleDeps = {},
): Promise<CheckInSafeResult<CreateCheckInScheduleRuleResult>> {
  return guard(process.env, () =>
    createCheckInScheduleRule(session as never, input, deps),
  );
}

export async function setCheckInScheduleRuleStatusFromAction(
  session: Session,
  input: SetCheckInScheduleRuleStatusInput,
  deps: CheckInScheduleDeps = {},
): Promise<CheckInSafeResult<SetCheckInScheduleRuleStatusResult>> {
  return guard(process.env, () =>
    setCheckInScheduleRuleStatus(session as never, input, deps),
  );
}

export async function generateCheckInScheduleRuleInstancesFromAction(
  session: Session,
  input: GenerateCheckInScheduleRuleInput,
  deps: CheckInScheduleDeps = {},
): Promise<CheckInSafeResult<GenerateCheckInScheduleRuleResult>> {
  return guard(process.env, () =>
    generateCheckInScheduleRuleInstances(session as never, input, deps),
  );
}

export async function listCheckInScheduleRulesForClient(
  session: Session,
  input: { workspaceId: string; clientProfileId: string },
  deps: CheckInScheduleDeps = {},
): Promise<CheckInSafeResult<{ items: CheckInScheduleRuleItem[] }>> {
  return guard(process.env, () =>
    listCheckInScheduleRules(session as never, input, deps),
  );
}

/**
 * PR-M8 (D30) — the read-only occurrence projection for the calendar.
 * Returns recurring dates the ACTIVE rules have NOT materialized inside
 * a bounded local-date range (dates beyond the generated T+56 coverage
 * included). Pure SELECTs behind the same read authorization as the
 * rules list — a projection call never writes an instance.
 */
export async function projectStaffCheckInScheduleOccurrences(
  session: Session,
  input: ProjectCheckInScheduleOccurrencesInput,
  deps: CheckInScheduleDeps = {},
): Promise<CheckInSafeResult<ProjectCheckInScheduleOccurrencesResult>> {
  return guard(process.env, () =>
    projectCheckInScheduleOccurrences(session as never, input, deps),
  );
}

export type { CheckInInstanceState, StaffCheckInReviewQueueItem };
export { CheckInInstanceError, parseCheckInSubmissionParam };
