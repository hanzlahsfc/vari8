/**
 * P-025-A — shared server-only Check-In feature resolver.
 *
 * `ENABLE_CHECK_INS === "1"` is necessary but NEVER sufficient: the resolver
 * also requires a trusted development/test runtime classification (explicit
 * `APP_ENV` allowlist, else baked `NODE_ENV`). Production, unknown, missing,
 * or malformed classifications fail closed — the flag set in production
 * still cannot expose any Check-In surface.
 *
 * This is the ONE resolver pages, server actions, and services share; it is
 * checked BEFORE session access, FormData binding, or database work. It is
 * a development control, never a substitute for the server-side
 * authorization every operation performs. Server-only: reads process.env
 * directly and is never exported to the client bundle.
 */

export type CheckInRuntimeClass = "development" | "test" | "production";

type RuntimeEnv = { APP_ENV?: string; NODE_ENV?: string };
export type CheckInsEnv = RuntimeEnv & { ENABLE_CHECK_INS?: string };

/**
 * Trusted runtime classification — mirrors the reviewed P-023 resolver:
 * an explicit `APP_ENV` wins when set and is allowlisted to exactly
 * `development`/`test`; every other explicit value is production. With
 * `APP_ENV` unset the baked-in `NODE_ENV` signal applies the same
 * allowlist — `next start` is always `NODE_ENV=production`, so a
 * disposable test/proof server must set `APP_ENV=test`. Missing or
 * unknown values resolve production-safe.
 */
export function classifyCheckInRuntime(
  env: RuntimeEnv = process.env,
): CheckInRuntimeClass {
  const explicit = env.APP_ENV;
  if (explicit !== undefined)
    return explicit === "development" || explicit === "test"
      ? explicit
      : "production";
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv === "development" || nodeEnv === "test") return nodeEnv;
  return "production";
}

/** The shared enablement decision — flag AND trusted runtime, else closed. */
export function isCheckInsEnabled(env: CheckInsEnv = process.env): boolean {
  if (env.ENABLE_CHECK_INS !== "1") return false;
  return classifyCheckInRuntime(env) !== "production";
}
