/**
 * PR-M10 (#176) route plumbing for the training session/set log surface —
 * the same role `daily-entries/_result.ts` plays for the client store seam:
 * the service throws `TrainingError` and `AccessDeniedError`, the v1 helper
 * only speaks ApiError, so this module translates the closed codes.
 *
 * Mapping: invalid input and unrepresentable dates 400; denied and
 * availability/policy failures 403; not found 404; every state conflict
 * (stale revision, terminal session, superseded program, serialization)
 * 409. An unknown code is a server bug and stays 500.
 */

import { ZodError, type ZodType } from "zod";

import { ApiError, type ApiViewer } from "@/lib/api/v1";
import { AccessDeniedError } from "@/lib/auth/guard";
import { TrainingError } from "@/lib/trainingprogram/payload";

const STATUS: Record<string, number> = {
  invalid_input: 400,
  unrepresentable_date: 400,
  not_available: 403,
  policy_not_configured: 403,
  not_found: 404,
  consent_missing: 409,
  nothing_published: 409,
  no_governing_version: 409,
  past_handover: 409,
  publish_incomplete: 409,
  program_cancelled: 409,
  program_ended: 409,
  program_superseded: 409,
  stale_revision: 409,
  revision_already_published: 409,
  state_conflict: 409,
  serialization_conflict: 409,
  service_unavailable: 503,
};

export function sessionOf(viewer: ApiViewer): { user: { id: string } } {
  return { user: { id: viewer.userId } };
}

export async function unwrapTraining<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof TrainingError)
      throw new ApiError(STATUS[error.code] ?? 500, error.code);
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
