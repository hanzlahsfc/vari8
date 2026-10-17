/**
 * TRAINING-I1A (PROMPT 244) — trusted development/test consent-policy
 * resolution for the training-program flow, mirroring the reviewed
 * meal-plan resolver.
 *
 * The feature flag alone NEVER activates the synthetic `BASE_CONSENTS`
 * registry. The shared resolver requires BOTH
 * `ENABLE_TRAINING_PLANS === "1"` AND a trusted development/test runtime
 * classification. Production, unknown, missing, or malformed
 * classifications resolve to the unconfigured fail-closed policy — so
 * `ENABLE_TRAINING_PLANS=1` in production still cannot configure consent
 * or read/write program data.
 *
 * Server-only: reads process.env directly; pages, actions, and services
 * consume this single resolver — no site picks a registry.
 */
import {
  createStaticConsentPolicy,
  unconfiguredConsentPolicy,
  type ConsentPolicyRegistry,
} from "../consent";
import { classifyTrainingRuntime, isTrainingPlansEnabled } from "./gate";

/** Dev/test-only consent version strings — synthetic values that exist
 * only in seeded test data; production clients never hold them. */
export const TRAINING_DEV_CONSENT = {
  PRIVACY_NOTICE: "training-plan-dev-privacy-v1",
  HEALTH_DATA: "training-plan-dev-health-v1",
} as const;

type ResolverEnv = {
  ENABLE_TRAINING_PLANS?: string;
  APP_ENV?: string;
  NODE_ENV?: string;
};

/** The ONE shared consent-policy resolver for training routes, actions,
 * and boundaries. */
export function resolveTrainingConsentPolicy(
  env: ResolverEnv = process.env,
): ConsentPolicyRegistry {
  if (!isTrainingPlansEnabled(env)) return unconfiguredConsentPolicy;
  if (classifyTrainingRuntime(env) === "production")
    return unconfiguredConsentPolicy;
  return createStaticConsentPolicy({
    PRIVACY_NOTICE: TRAINING_DEV_CONSENT.PRIVACY_NOTICE,
    HEALTH_DATA: TRAINING_DEV_CONSENT.HEALTH_DATA,
  });
}
