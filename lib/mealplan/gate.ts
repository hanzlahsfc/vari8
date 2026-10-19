/**
 * MEAL-PLAN-I1 (decision #115) — shared server-only meal-plan feature
 * resolver, mirroring the reviewed Check-In forms gate.
 *
 * `ENABLE_MEAL_PLANS === "1"` is necessary but NEVER sufficient: the
 * resolver also requires a trusted development/test runtime
 * classification (explicit `APP_ENV` allowlist, else baked `NODE_ENV`).
 * Production, unknown, missing, or malformed classifications fail
 * closed — the flag set in production still cannot expose any meal-plan
 * surface.
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

export type MealPlanRuntimeClass = RuntimeClass;

export type MealPlansEnv = RuntimeEnv & { ENABLE_MEAL_PLANS?: string };

/**
 * Trusted runtime classification — the reviewed P-023/P-025 resolver
 * shape: an explicit `APP_ENV` wins when set and is allowlisted to
 * exactly `development`/`test`; every other explicit value is
 * production. With `APP_ENV` unset the baked-in `NODE_ENV` signal
 * applies the same allowlist — `next start` is always
 * `NODE_ENV=production`, so a disposable test/proof server must set
 * `APP_ENV=test`. Missing or unknown values resolve production-safe.
 * Shared implementation lives in `lib/runtime.ts` (PR-04).
 */
export const classifyMealPlanRuntime: (
  env?: RuntimeEnv,
) => MealPlanRuntimeClass = classifyRuntime;

/** The shared enablement decision — flag AND trusted runtime, else closed. */
export function isMealPlansEnabled(env: MealPlansEnv = process.env): boolean {
  return devFlagEnabled(env.ENABLE_MEAL_PLANS, env);
}
