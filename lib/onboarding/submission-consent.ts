/**
 * P-023 (decisions #83–#85, repair R2-A) — trusted development/test
 * consent-policy resolution for the onboarding submission flow.
 *
 * The feature flag alone NEVER activates the synthetic `BASE_CONSENTS`
 * registry. The shared resolver requires BOTH the flag AND a trusted
 * development/test runtime classification. Production, unknown, missing,
 * or malformed classifications resolve to the unconfigured fail-closed
 * policy — so `ENABLE_ONBOARDING_SUBMISSION=1` in production still cannot
 * configure consent or collect answers.
 *
 * Server-only: reads process.env directly; both the page and the server
 * action consume this single resolver — neither may pick a registry.
 */

import {
  createStaticConsentPolicy,
  unconfiguredConsentPolicy,
  type ConsentPolicyRegistry,
} from "../consent";
import { isOnboardingSubmissionEnabled } from "./submission-gate";

/** Dev/test-only consent version strings — synthetic values that exist
 * only in seeded test data; production clients never hold them. */
export const ONBOARDING_SUBMISSION_DEV_CONSENT = {
  PRIVACY_NOTICE: "onboarding-submission-dev-privacy-v1",
  HEALTH_DATA: "onboarding-submission-dev-health-v1",
} as const;

export type SubmissionRuntimeClass = "development" | "test" | "production";

type RuntimeEnv = { APP_ENV?: string; NODE_ENV?: string };
type ResolverEnv = RuntimeEnv & { ENABLE_ONBOARDING_SUBMISSION?: string };

/**
 * Trusted runtime classification. An explicit `APP_ENV` wins when set and
 * is allowlisted to exactly `development`/`test`; every other explicit
 * value is production. With `APP_ENV` unset, the baked-in `NODE_ENV`
 * signal applies the same allowlist — `next start` is always
 * `NODE_ENV=production`, so a test/proof server must set `APP_ENV=test`.
 * Missing or unknown values resolve production-safe.
 */
export function classifySubmissionRuntime(
  env: RuntimeEnv = process.env,
): SubmissionRuntimeClass {
  const explicit = env.APP_ENV;
  if (explicit !== undefined)
    return explicit === "development" || explicit === "test"
      ? explicit
      : "production";
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv === "development" || nodeEnv === "test") return nodeEnv;
  return "production";
}

/**
 * The ONE shared consent-policy resolver for the submission routes,
 * actions, and boundary defaults. `unconfiguredConsentPolicy` unless the
 * feature flag is exactly on AND the runtime classifies as a trusted
 * development/test environment.
 */
export function resolveOnboardingSubmissionConsentPolicy(
  env: ResolverEnv = process.env,
): ConsentPolicyRegistry {
  if (!isOnboardingSubmissionEnabled(env.ENABLE_ONBOARDING_SUBMISSION))
    return unconfiguredConsentPolicy;
  if (classifySubmissionRuntime(env) === "production")
    return unconfiguredConsentPolicy;
  return createStaticConsentPolicy({
    PRIVACY_NOTICE: ONBOARDING_SUBMISSION_DEV_CONSENT.PRIVACY_NOTICE,
    HEALTH_DATA: ONBOARDING_SUBMISSION_DEV_CONSENT.HEALTH_DATA,
  });
}
