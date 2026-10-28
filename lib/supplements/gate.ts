/**
 * PR-SUPP — shared server-only supplement-plan feature resolver,
 * mirroring the reviewed meal-plan/check-in gates.
 *
 * `ENABLE_SUPPLEMENTS === "1"` is necessary but NEVER sufficient: the
 * resolver also requires a trusted development/test runtime
 * classification (explicit `APP_ENV` allowlist, else baked `NODE_ENV`).
 * Production, unknown, missing, or malformed classifications fail
 * closed — the flag set in production still cannot expose any
 * supplement-plan surface.
 *
 * This is the ONE resolver pages, server actions, and services share; it
 * is checked BEFORE session access, FormData binding, or database work.
 * It is a development control, never a substitute for the server-side
 * authorization every operation performs. Server-only: reads
 * process.env directly and is never exported to the client bundle.
 */

import {
  classifyRuntime,
  devFlagEnabled,
  type RuntimeClass,
  type RuntimeEnv,
} from "../runtime";

export type SupplementsRuntimeClass = RuntimeClass;

export type SupplementsEnv = RuntimeEnv & { ENABLE_SUPPLEMENTS?: string };

/**
 * Trusted runtime classification — explicit `APP_ENV` wins when set and
 * is allowlisted to exactly `development`/`test`; every other explicit
 * value is production. With `APP_ENV` unset the baked-in `NODE_ENV`
 * signal applies the same allowlist. Missing or unknown values resolve
 * production-safe.
 */
export const classifySupplementsRuntime: (
  env?: RuntimeEnv,
) => SupplementsRuntimeClass = classifyRuntime;

/** The shared enablement decision — flag AND trusted runtime, else closed. */
export function isSupplementsEnabled(
  env: SupplementsEnv = process.env,
): boolean {
  return devFlagEnabled(env.ENABLE_SUPPLEMENTS, env);
}
