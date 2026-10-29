/**
 * Card 05a route plumbing for the daily-entry surface, the same role
 * `checkins/_result.ts` plays for the check-in boundary: the daily-entry
 * service throws `DailyEntryError` and `AccessDeniedError`, the v1 helper
 * only speaks ApiError, so this module translates the closed codes.
 *
 * Card mapping (R3-B1): invalid input 400; denied, not available and
 * policy-not-configured 403; state conflicts (stale form, missing consent,
 * ineligible, missing setup, serialization) 409. Never 404.
 */

import { ZodError, type ZodType } from "zod";

import { ApiError, type ApiViewer } from "@/lib/api/v1";
import { AccessDeniedError } from "@/lib/auth/guard";
import { DailyEntryError } from "@/lib/daily-entry/service";

const STATUS = {
  invalid_input: 400,
  not_available: 403,
  policy_not_configured: 403,
  stale_form: 409,
  consent_missing: 409,
  ineligible: 409,
  no_active_setup: 409,
  serialization_conflict: 409,
} as const;

export function sessionOf(viewer: ApiViewer): { user: { id: string } } {
  return { user: { id: viewer.userId } };
}

export async function unwrapDailyEntry<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof DailyEntryError)
      throw new ApiError(STATUS[error.code], error.code);
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
