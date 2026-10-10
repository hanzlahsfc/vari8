/**
 * P-025-B Check-In instance/submission boundary — the ONLY module the app
 * layer touches. Every service-domain error is mapped to a closed,
 * non-disclosing safe vocabulary; nothing raw escapes to the client.
 */

import { AccessDeniedError } from "../auth/guard";
import { isCheckInsEnabled } from "./forms-gate";
import {
  CheckInInstanceError,
  type CheckInInstanceDeps,
  type CheckInInstanceState,
  listCheckInInstancesForClient,
  listOwnCheckInInstances as serviceListOwnCheckInInstances,
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
  type SubmitCheckInInstanceInput,
  type SubmitCheckInInstanceResult,
} from "./instances";

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
        | "serialization_conflict";
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
};

function fail<T>(code: keyof typeof CLOSED_MESSAGES): CheckInSafeResult<T> {
  return { ok: false, code, message: CLOSED_MESSAGES[code] };
}

function mapError<T>(error: unknown): CheckInSafeResult<T> {
  if (error instanceof AccessDeniedError) return fail("denied");
  if (error instanceof CheckInInstanceError) {
    if (error.code === "instance_not_accessible") return fail("not_available");
    return fail(error.code);
  }
  return fail("not_available");
}

async function guard<T>(
  env: { ENABLE_CHECK_INS?: string; APP_ENV?: string; NODE_ENV?: string },
  fn: () => Promise<T>,
): Promise<CheckInSafeResult<T>> {
  // Feature boundary FIRST — flag+trusted runtime before any session/DB
  // work in the actions; unknown/production fails closed.
  if (!isCheckInsEnabled(env)) return fail("not_available");
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return mapError(error);
  }
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

export async function getOwnCheckInInstance(
  session: Session,
  input: GetOwnCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInSafeResult<OwnCheckInInstanceDetail>> {
  return guard(process.env, () =>
    serviceGetOwnCheckInInstance(session as never, input, deps),
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

export type { CheckInInstanceState };
export { CheckInInstanceError };
