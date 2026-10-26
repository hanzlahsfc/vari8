// W2-A2 route plumbing for the staff meal-plan surface: the meal-plan
// service throws `MealPlanError` and `AccessDeniedError`, the v1 helper
// only speaks ApiError, so this module translates the closed codes.
//
// Mapping (mirrors the iifym-plans convention): invalid input 400;
// denied, not accessible and policy-not-configured 403; state conflicts
// (stale revision, missing consent, unconfirmed timezone,
// unrepresentable date, incomplete draft, serialization) 409. Never 404
// for the plan itself: a foreign or missing plan reads as denied.

import { ZodError, type ZodType } from "zod";

import { ApiError, type ApiViewer } from "@/lib/api/v1";
import { AccessDeniedError } from "@/lib/auth/guard";
import { MealPlanError } from "@/lib/mealplan/service";

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

export async function unwrapMealPlan<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof MealPlanError)
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
