/**
 * TRAINING-I1A (PROMPT 244) — shared server-only training-plan feature
 * resolver, mirroring the reviewed meal-plan gate.
 *
 * `ENABLE_TRAINING_PLANS === "1"` is necessary but NEVER sufficient: the
 * resolver also requires a trusted development/test runtime
 * classification (explicit `APP_ENV` allowlist, else baked `NODE_ENV`).
 * Production, unknown, missing, or malformed classifications fail
 * closed — the flag set in production still cannot expose any
 * training-plan surface.
 *
 * This is the ONE resolver pages, server actions, and services share; it
 * is checked BEFORE session access, FormData binding, or database work.
 * It is a development control, never a substitute for the server-side
 * authorization every operation performs. Server-only: reads
 * process.env directly and is never exported to the client bundle.
 */
export type TrainingRuntimeClass = "development" | "test" | "production";

type RuntimeEnv = { APP_ENV?: string; NODE_ENV?: string };
export type TrainingPlansEnv = RuntimeEnv & { ENABLE_TRAINING_PLANS?: string };

export function classifyTrainingRuntime(
  env: RuntimeEnv = process.env,
): TrainingRuntimeClass {
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
export function isTrainingPlansEnabled(
  env: TrainingPlansEnv = process.env,
): boolean {
  if (env.ENABLE_TRAINING_PLANS !== "1") return false;
  return classifyTrainingRuntime(env) !== "production";
}
