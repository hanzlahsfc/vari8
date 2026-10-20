/**
 * TRAINING-I1A (PROMPT 244) — training-program boundary: the ONLY
 * module the app layer touches. Every service-domain error maps to a
 * closed, non-disclosing safe vocabulary; nothing raw escapes to the
 * client. Denied/unavailable/timeout are never collapsed into "no
 * program" (A1 §4 E12 contract).
 */

import {
  fail as sharedFail,
  guard as sharedGuard,
  mapError as sharedMapError,
} from "../boundary";
import { isTrainingPlansEnabled, type TrainingPlansEnv } from "./gate";
import {
  bookTrainingSession,
  cancelTrainingProgram,
  cancelTrainingSessionBooking,
  moveTrainingSessionBooking,
  publishTrainingProgramVersion,
  readOwnTrainingBookingHistory,
  readOwnTrainingHistory,
  readOwnTrainingProgram,
  readOwnTrainingProgramVersions,
  readOwnTrainingVersion,
  readStaffTrainingBookings,
  readStaffTrainingProgram,
  readStaffTrainingProgramVersion,
  readStaffTrainingPrograms,
  saveTrainingProgramDraft,
  setTrainingProgramTimezone,
  TrainingError,
  type ClientBookingHistoryPage,
  type ClientHistoryPage,
  type ClientVersionsPage,
  type OwnTrainingView,
  type OwnVersionDetail,
  type StaffBookingsPage,
  type StaffProgramDetail,
  type StaffProgramList,
  type StaffVersionDetail,
  type TrainingDeps,
} from "./service";

export type TrainingSafeResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "denied"
        | "invalid_input"
        | "not_found"
        | "conflict"
        | "consent_missing"
        | "policy_not_configured"
        | "service_unavailable"
        | "serialization_conflict"
        | "timezone_required"
        | "unrepresentable_date"
        | "publish_incomplete"
        | "program_cancelled"
        | "program_superseded"
        | "superseded_by_pending_replacement"
        | "state_conflict"
        | "effective_bounds"
        | "program_ended"
        | "replacement_start"
        | "past_week_locked"
        | "start_anchor_locked"
        | "history_conflict"
        | "not_a_replacement"
        | "nothing_published"
        | "has_successor"
        | "already_taken_over"
        | "confirmation_required"
        | "revision_already_published"
        | "booking_conflict"
        | "booking_date_bounds"
        | "past_handover"
        | "no_governing_version"
        | "internal_error";
      message: string;
      detail?: Record<string, unknown>;
    };

const CLOSED_MESSAGES: Record<
  Extract<TrainingSafeResult<never>, { ok: false }>["code"],
  string
> = {
  denied: "You don’t have access to this training program.",
  invalid_input: "The training program request wasn’t valid.",
  not_found: "This training program isn’t available.",
  conflict: "The training program changed — refresh and try again.",
  consent_missing: "Training programs aren’t available right now.",
  policy_not_configured: "Training programs aren’t available right now.",
  service_unavailable:
    "The training program couldn’t be loaded — please try again.",
  serialization_conflict: "The training program changed — please try again.",
  timezone_required: "Confirm the client’s timezone before publishing.",
  unrepresentable_date: "That date doesn’t exist in the confirmed timezone.",
  publish_incomplete: "The draft isn’t complete enough to publish.",
  program_cancelled: "This training program was cancelled.",
  program_superseded: "This training program was replaced.",
  superseded_by_pending_replacement:
    "A scheduled replacement already covers that date.",
  state_conflict: "The training program changed — refresh and try again.",
  effective_bounds:
    "That effective date is outside the program’s editable range.",
  program_ended: "This training program has ended.",
  replacement_start: "A replacement must start on its program start date.",
  past_week_locked: "Weeks that already passed can’t be changed.",
  start_anchor_locked: "The program start date is locked after publishing.",
  history_conflict:
    "Past weeks must match the published program — refresh and try again.",
  not_a_replacement: "Only a replacement program can be cancelled.",
  nothing_published: "Only a published replacement can be cancelled.",
  has_successor: "This program already has a replacement.",
  already_taken_over:
    "This replacement has already started and can’t be cancelled.",
  confirmation_required:
    "This replacement takes over immediately and cannot be cancelled afterward.",
  revision_already_published:
    "That draft revision was already published — refresh to see it.",
  booking_conflict: "That session is already booked on this date.",
  booking_date_bounds:
    "That booking date is outside the program’s bookable range.",
  past_handover:
    "That date is after the replacement takes over — book on the new program.",
  no_governing_version: "No published program covers that booking date.",
  internal_error: "The training program couldn’t be loaded — please try again.",
};

function fail<T>(
  code: keyof typeof CLOSED_MESSAGES,
  detail?: Record<string, unknown>,
): TrainingSafeResult<T> {
  return sharedFail(CLOSED_MESSAGES, code, detail);
}

function mapError<T>(error: unknown): TrainingSafeResult<T> {
  return sharedMapError(error, {
    denied: () => fail("denied"),
    consent: (e) =>
      e.code === "consent_missing"
        ? fail("consent_missing")
        : fail("policy_not_configured"),
    domain: (e) => {
      if (!(e instanceof TrainingError)) return null;
      switch (e.code) {
        case "not_found":
          return fail("not_found");
        case "stale_revision":
          return fail("conflict", e.detail);
        case "service_unavailable":
          return fail("service_unavailable");
        case "internal_error":
          return fail("internal_error");
        default:
          return fail(e.code as keyof typeof CLOSED_MESSAGES, e.detail);
      }
    },
    fallback: () => fail("service_unavailable"),
  });
}

/** Feature boundary FIRST — flag + trusted runtime before any session
 * or database work; unknown/production fails closed. */
async function guard<T>(
  env: TrainingPlansEnv,
  fn: () => Promise<T>,
): Promise<TrainingSafeResult<T>> {
  return sharedGuard(
    {
      enabled: isTrainingPlansEnabled(env),
      off: () => fail<T>("not_found"),
      map: (e) => mapError<T>(e),
    },
    fn,
  );
}

type Session = { user?: { id?: string } } | null | undefined;

export async function saveTrainingProgramDraftFromAction(
  session: Session,
  input: Parameters<typeof saveTrainingProgramDraft>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<{ programId: string; revision: number }>> {
  return guard(process.env, () =>
    saveTrainingProgramDraft(session, input, deps),
  );
}

export async function setTrainingProgramTimezoneFromAction(
  session: Session,
  input: Parameters<typeof setTrainingProgramTimezone>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<{ programId: string }>> {
  return guard(process.env, () =>
    setTrainingProgramTimezone(session, input, deps),
  );
}

export async function publishTrainingProgramVersionFromAction(
  session: Session,
  input: Parameters<typeof publishTrainingProgramVersion>[1],
  deps: TrainingDeps = {},
): Promise<
  TrainingSafeResult<{
    versionId: string;
    versionSeq: number;
    programState: "cancelled" | "superseded" | "pending" | "current";
    replayed: boolean;
  }>
> {
  return guard(process.env, () =>
    publishTrainingProgramVersion(session, input, deps),
  );
}

export async function cancelTrainingProgramFromAction(
  session: Session,
  input: Parameters<typeof cancelTrainingProgram>[1],
  deps: TrainingDeps = {},
): Promise<
  TrainingSafeResult<{ programId: string; alreadyCancelled: boolean }>
> {
  return guard(process.env, () => cancelTrainingProgram(session, input, deps));
}

export async function readStaffTrainingProgramsFromAction(
  session: Session,
  input: Parameters<typeof readStaffTrainingPrograms>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<StaffProgramList>> {
  return guard(process.env, () =>
    readStaffTrainingPrograms(session, input, deps),
  );
}

export async function readStaffTrainingProgramFromAction(
  session: Session,
  input: Parameters<typeof readStaffTrainingProgram>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<StaffProgramDetail>> {
  return guard(process.env, () =>
    readStaffTrainingProgram(session, input, deps),
  );
}

export async function readStaffTrainingProgramVersionFromAction(
  session: Session,
  input: Parameters<typeof readStaffTrainingProgramVersion>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<StaffVersionDetail>> {
  return guard(process.env, () =>
    readStaffTrainingProgramVersion(session, input, deps),
  );
}

export async function readOwnTrainingProgramFromAction(
  session: Session,
  input: { workspaceId: string },
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<OwnTrainingView>> {
  return guard(process.env, () => readOwnTrainingProgram(session, input, deps));
}

export async function readOwnTrainingHistoryFromAction(
  session: Session,
  input: Parameters<typeof readOwnTrainingHistory>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<ClientHistoryPage>> {
  return guard(process.env, () => readOwnTrainingHistory(session, input, deps));
}

export async function readOwnTrainingProgramVersionsFromAction(
  session: Session,
  input: Parameters<typeof readOwnTrainingProgramVersions>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<ClientVersionsPage>> {
  return guard(process.env, () =>
    readOwnTrainingProgramVersions(session, input, deps),
  );
}

export async function readOwnTrainingVersionFromAction(
  session: Session,
  input: Parameters<typeof readOwnTrainingVersion>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<OwnVersionDetail>> {
  return guard(process.env, () => readOwnTrainingVersion(session, input, deps));
}

export async function bookTrainingSessionFromAction(
  session: Session,
  input: Parameters<typeof bookTrainingSession>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<{ bookingId: string; replayed: boolean }>> {
  return guard(process.env, () => bookTrainingSession(session, input, deps));
}

export async function moveTrainingSessionBookingFromAction(
  session: Session,
  input: Parameters<typeof moveTrainingSessionBooking>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<{ bookingId: string }>> {
  return guard(process.env, () =>
    moveTrainingSessionBooking(session, input, deps),
  );
}

export async function cancelTrainingSessionBookingFromAction(
  session: Session,
  input: Parameters<typeof cancelTrainingSessionBooking>[1],
  deps: TrainingDeps = {},
): Promise<
  TrainingSafeResult<{ bookingId: string; alreadyCancelled: boolean }>
> {
  return guard(process.env, () =>
    cancelTrainingSessionBooking(session, input, deps),
  );
}

export async function readStaffTrainingBookingsFromAction(
  session: Session,
  input: Parameters<typeof readStaffTrainingBookings>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<StaffBookingsPage>> {
  return guard(process.env, () =>
    readStaffTrainingBookings(session, input, deps),
  );
}

export async function readOwnTrainingBookingHistoryFromAction(
  session: Session,
  input: Parameters<typeof readOwnTrainingBookingHistory>[1],
  deps: TrainingDeps = {},
): Promise<TrainingSafeResult<ClientBookingHistoryPage>> {
  return guard(process.env, () =>
    readOwnTrainingBookingHistory(session, input, deps),
  );
}
