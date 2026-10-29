/**
 * Card 10 (#175) — shared server-only IIFYM (macro target) feature
 * resolver, mirroring the reviewed meal-plan gate exactly.
 *
 * `ENABLE_IIFYM_PLANS === "1"` is necessary but NEVER sufficient: the
 * resolver also requires a trusted development/test runtime
 * classification (explicit `APP_ENV` allowlist, else baked `NODE_ENV`).
 * Production, unknown, missing, or malformed classifications fail
 * closed — the flag set in production still cannot expose any
 * macro-target surface.
 *
 * This is the ONE resolver pages, routes, and services share; it is
 * checked BEFORE session access, FormData binding, or database work.
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

export type IifymRuntimeClass = RuntimeClass;

export type IifymPlansEnv = RuntimeEnv & { ENABLE_IIFYM_PLANS?: string };

export const classifyIifymRuntime: (env?: RuntimeEnv) => IifymRuntimeClass =
  classifyRuntime;

/** The shared enablement decision — flag AND trusted runtime, else closed. */
export function isIifymPlansEnabled(env: IifymPlansEnv = process.env): boolean {
  return devFlagEnabled(env.ENABLE_IIFYM_PLANS, env);
}
