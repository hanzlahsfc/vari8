// FULL-PACKAGE SLICE of #175
/**
 * Card 10 (#175) route plumbing for the IIFYM macro-target surface, the
 * same role `daily-entries/_result.ts` plays for the daily-entry
 * boundary: the iifym service throws `IifymError` and
 * `AccessDeniedError`, the v1 helper only speaks ApiError, so this
 * module translates the closed codes.
 *
 * Mapping (mirrors the card 09 R3-B1 convention): invalid input 400;
 * denied, not available and policy-not-configured 403; state conflicts
 * (stale revision, missing consent, unconfirmed timezone,
 * unrepresentable date, incomplete draft, serialization) 409. Never 404.
 */

import { ZodError, type ZodType } from "zod";

import { ApiError, type ApiViewer } from "@/lib/api/v1";
import { AccessDeniedError } from "@/lib/auth/guard";
import { IifymError } from "@/lib/iifym/service";

const STATUS = {
  invalid_input: 400,
  plan_not_accessible: 403,
  policy_not_configured: 403,
  stale_revision: 409,
  consent_missing: 409,
  timezone_required: 409,
  unrepresentable_date: 409,
  publish_incomplete: 409,
  serialization_conflict: 409,
} as const;

export function sessionOf(viewer: ApiViewer): { user: { id: string } } {
  return { user: { id: viewer.userId } };
}

export async function unwrapIifym<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof IifymError)
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
