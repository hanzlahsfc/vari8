/**
 * P-025-B — trusted development/test consent-policy resolution for the
 * Check-In instance/submission flow (plan §14, mirroring P-023).
 *
 * The feature flag alone NEVER activates the synthetic `BASE_CONSENTS`
 * registry. The shared resolver requires BOTH `ENABLE_CHECK_INS === "1"`
 * AND a trusted development/test runtime classification (the shared
 * forms-gate classifier). Production, unknown, missing, or malformed
 * classifications resolve to the unconfigured fail-closed policy — so
 * `ENABLE_CHECK_INS=1` in production still cannot configure consent or
 * collect answers.
 *
 * Server-only: reads process.env directly; pages, actions, and services
 * consume this single resolver — no site picks a registry.
 */

import {
  createStaticConsentPolicy,
  unconfiguredConsentPolicy,
  type ConsentPolicyRegistry,
} from "../consent";
import { classifyCheckInRuntime, isCheckInsEnabled } from "./forms-gate";

/** Dev/test-only consent version strings — synthetic values that exist
 * only in seeded test data; production clients never hold them. */
export const CHECKIN_DEV_CONSENT = {
  PRIVACY_NOTICE: "check-in-dev-privacy-v1",
  HEALTH_DATA: "check-in-dev-health-v1",
} as const;

type ResolverEnv = {
  ENABLE_CHECK_INS?: string;
  APP_ENV?: string;
  NODE_ENV?: string;
};

/**
 * The ONE shared consent-policy resolver for Check-In instance/submission
 * routes, actions, and boundaries. `unconfiguredConsentPolicy` unless the
 * feature flag is exactly on AND the runtime classifies as trusted
 * development/test.
 */
export function resolveCheckInConsentPolicy(
  env: ResolverEnv = process.env,
): ConsentPolicyRegistry {
  if (!isCheckInsEnabled(env)) return unconfiguredConsentPolicy;
  if (classifyCheckInRuntime(env) === "production")
    return unconfiguredConsentPolicy;
  return createStaticConsentPolicy({
    PRIVACY_NOTICE: CHECKIN_DEV_CONSENT.PRIVACY_NOTICE,
    HEALTH_DATA: CHECKIN_DEV_CONSENT.HEALTH_DATA,
  });
}
