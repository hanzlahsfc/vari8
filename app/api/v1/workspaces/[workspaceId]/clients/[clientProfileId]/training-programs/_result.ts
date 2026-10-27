// W2-A2 route plumbing for the staff training-program surface: the
// training service throws `TrainingError` (string code) and
// `AccessDeniedError`, the v1 helper only speaks ApiError, so this
// module translates the codes.
//
// Mapping: invalid input 400; not found 404; policy-not-configured 403;
// service-unavailable 503; every domain state conflict 409. The code
// set below is the complete TrainingError vocabulary reachable from the
// five fronted service functions (readStaffTrainingPrograms,
// readStaffTrainingProgram, readStaffTrainingProgramVersion,
// saveTrainingProgramDraft, publishTrainingProgramVersion) plus the
// shared write/read preludes; an unmapped code rethrows and surfaces as
// the wrapper's generic 500 rather than a mislabeled status.

import { ZodError, type ZodType } from "zod";

import { ApiError, type ApiViewer } from "@/lib/api/v1";
import { AccessDeniedError } from "@/lib/auth/guard";
import { TrainingError } from "@/lib/trainingprogram/payload";

const STATUS: Record<string, number> = {
  invalid_input: 400,
  not_found: 404,
  policy_not_configured: 403,
  service_unavailable: 503,
  already_taken_over: 409,
  booking_conflict: 409,
  booking_date_bounds: 409,
  confirmation_required: 409,
  consent_missing: 409,
  effective_bounds: 409,
  has_successor: 409,
  history_conflict: 409,
  no_governing_version: 409,
  not_a_replacement: 409,
  nothing_published: 409,
  past_handover: 409,
  past_week_locked: 409,
  program_cancelled: 409,
  program_ended: 409,
  program_superseded: 409,
  publish_incomplete: 409,
  replacement_start: 409,
  revision_already_published: 409,
  serialization_conflict: 409,
  stale_revision: 409,
  start_anchor_locked: 409,
  state_conflict: 409,
  superseded_by_pending_replacement: 409,
  timezone_required: 409,
  unrepresentable_date: 409,
};

export function sessionOf(viewer: ApiViewer): { user: { id: string } } {
  return { user: { id: viewer.userId } };
}

export async function unwrapTraining<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof TrainingError) {
      const status = STATUS[error.code];
      // Unmapped code: rethrow so the v1 wrapper reports an honest
      // internal error instead of a guessed status.
      if (status === undefined) throw error;
      throw new ApiError(status, error.code);
    }
    if (error instanceof AccessDeniedError)
      throw new ApiError(403, "forbidden");
    throw error;
  }
}

/** Parse a JSON body; malformed JSON is a 400, never a 500. */
export async function readBody<S>(request: Request, schema: ZodType<S>) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new ApiError(400, "invalid_input");
  }
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) throw new ApiError(400, "invalid_input");
    throw error;
  }
}
