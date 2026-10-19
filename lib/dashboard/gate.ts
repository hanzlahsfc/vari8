/**
 * DASHBOARD-I1 (decision 108) — feature resolver for persisted client
 * dashboard layouts. `ENABLE_CLIENT_DASHBOARD === "1"` is necessary but
 * never sufficient: the same trusted-runtime classification as the
 * Check-In resolver applies — production/unknown/missing fail closed.
 */

import { devFlagEnabled, type RuntimeEnv } from "../runtime";

export type DashboardEnv = RuntimeEnv & {
  ENABLE_CLIENT_DASHBOARD?: string;
};

/** Flag AND trusted runtime, else closed. */
export function isClientDashboardEnabled(
  env: DashboardEnv = process.env,
): boolean {
  return devFlagEnabled(env.ENABLE_CLIENT_DASHBOARD, env);
}
