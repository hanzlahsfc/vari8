/**
 * DASHBOARD-I1 (decision 108) — feature resolver for persisted client
 * dashboard layouts. `ENABLE_CLIENT_DASHBOARD === "1"` is necessary but
 * never sufficient: the same trusted-runtime classification as the
 * Check-In resolver applies — production/unknown/missing fail closed.
 */

import { classifyCheckInRuntime } from "../checkin/forms-gate";

export type DashboardEnv = {
  APP_ENV?: string;
  NODE_ENV?: string;
  ENABLE_CLIENT_DASHBOARD?: string;
};

/** Flag AND trusted runtime, else closed. */
export function isClientDashboardEnabled(
  env: DashboardEnv = process.env,
): boolean {
  if (env.ENABLE_CLIENT_DASHBOARD !== "1") return false;
  return classifyCheckInRuntime(env) !== "production";
}
