/**
 * PR-W6 shared route plumbing for the check-in REST surface.
 *
 * Every `lib/checkin` boundary function returns `CheckInSafeResult`, a closed
 * union that never throws. The v1 helper speaks ApiError statuses, so this
 * module is the one place that translates a closed code into an HTTP status.
 * Nothing raw crosses: the body is always `{ error: { code } }`, the same shape
 * `components/canvas/data/http.ts` parses.
 */

import { ZodError, type ZodType } from "zod";

import { ApiError, type ApiViewer } from "@/lib/api/v1";
import type { CheckInSafeResult } from "@/lib/checkin/instances-boundary";

type FailureCode = Extract<CheckInSafeResult<never>, { ok: false }>["code"];

/**
 * Denied and not-available are both 403 so a caller cannot tell "not my
 * workspace" from "does not exist" (same rule as the v1 helper). Closed domain
 * outcomes that mean "the request cannot be applied to this state" are 409.
 */
const STATUS: Record<FailureCode, number> = {
  invalid_input: 400,
  denied: 403,
  not_available: 403,
  already_submitted: 409,
  consent_missing: 409,
  policy_not_configured: 409,
  serialization_conflict: 409,
  review_required: 409,
  idempotency_conflict: 409,
};

/** The session shape the check-in boundary accepts. */
export function sessionOf(viewer: ApiViewer): { user: { id: string } } {
  return { user: { id: viewer.userId } };
}

/** Unwrap a boundary result or throw the mapped ApiError. */
export function unwrap<T>(result: CheckInSafeResult<T>): T {
  if (result.ok) return result.value;
  throw new ApiError(STATUS[result.code], result.code);
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
