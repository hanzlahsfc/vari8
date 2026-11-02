/**
 * Card 05a route plumbing for the client-tasks surface. `lib/tasks/service.ts`
 * throws `TaskError` and `AccessDeniedError`; the v1 helper maps only
 * ApiError and ZodError, so the closed codes are translated here.
 *
 * Card mapping: invalid input 400; denied and not available 403; conflict
 * and serialization conflicts 409. Never 404.
 */

import { ZodError, type ZodType } from "zod";

import { ApiError, type ApiViewer } from "@/lib/api/v1";
import { AccessDeniedError } from "@/lib/auth/guard";
import { TaskError } from "@/lib/tasks/service";

const STATUS = {
  invalid_input: 400,
  not_available: 403,
  conflict: 409,
  serialization_conflict: 409,
} as const;

export function sessionOf(viewer: ApiViewer): { user: { id: string } } {
  return { user: { id: viewer.userId } };
}

export async function unwrapTask<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof TaskError)
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
