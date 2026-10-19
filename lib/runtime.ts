/**
 * PR-04 (V3-H4-02, D19) — shared trusted-runtime classification and the
 * development-flag contract every `ENABLE_*` gate follows.
 *
 * Trusted runtime classification. An explicit `APP_ENV` wins when set and is
 * allowlisted to exactly `development`/`test`; every other explicit value is
 * production. With `APP_ENV` unset the baked-in `NODE_ENV` signal applies the
 * same allowlist — `next start` is always `NODE_ENV=production`, so a
 * disposable test/proof server must set `APP_ENV=test`. Missing or unknown
 * values resolve production-safe.
 *
 * Flag contract (V3-H4-02): an `ENABLE_*` flag counts ONLY when it is exactly
 * "1" AND the runtime classifies as trusted development/test. A flag set in a
 * production runtime stays off — no feature gate may key on the raw flag
 * alone. These are development controls, never a substitute for the
 * server-side authorization every operation performs.
 *
 * Consent contract (D19): consent and health-data gates read
 * `ENABLE_CONSENT_GATES`, unset (off) in every environment. With the flag off
 * a gate allows the operation and writes no consent record. Set to "1" the
 * parked S1-D machinery enforces exactly as before; the test environment sets
 * it so those suites keep covering the parked code until PR-T2 removes them.
 */

export type RuntimeClass = "development" | "test" | "production";

export type RuntimeEnv = { APP_ENV?: string; NODE_ENV?: string };

export type ConsentGateEnv = RuntimeEnv & { ENABLE_CONSENT_GATES?: string };

/** Trusted runtime classification (the reviewed P-023 resolver shape). */
export function classifyRuntime(env: RuntimeEnv = process.env): RuntimeClass {
  const explicit = env.APP_ENV;
  if (explicit !== undefined)
    return explicit === "development" || explicit === "test"
      ? explicit
      : "production";
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv === "development" || nodeEnv === "test") return nodeEnv;
  return "production";
}

/** True only in a trusted development/test runtime. */
export function isDevRuntime(env: RuntimeEnv = process.env): boolean {
  return classifyRuntime(env) !== "production";
}

/**
 * An exact-"1" development flag counts only in a trusted development/test
 * runtime (V3-H4-02). Unset, empty, malformed, or any other value — or a
 * production classification — keeps the gate closed.
 */
export function devFlagEnabled(
  flag: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  return flag === "1" && isDevRuntime(env);
}

/**
 * D19 — the one flag every parked consent and health-data gate reads.
 * `ENABLE_CONSENT_GATES === "1"` counts only in a trusted development/test
 * runtime (same contract as every other exact-1 flag). Off allows.
 */
export function consentGatesEnabled(
  env: ConsentGateEnv = process.env,
): boolean {
  return devFlagEnabled(env.ENABLE_CONSENT_GATES, env);
}
