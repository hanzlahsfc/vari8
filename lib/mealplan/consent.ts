/**
 * MEAL-PLAN-I1 (decision #115) — trusted development/test consent-policy
 * resolution for the meal-plan flow, mirroring the reviewed Check-In
 * resolver (instances-consent.ts).
 *
 * The feature flag alone NEVER activates the synthetic `BASE_CONSENTS`
 * registry. The shared resolver requires BOTH `ENABLE_MEAL_PLANS === "1"`
 * AND a trusted development/test runtime classification. Production,
 * unknown, missing, or malformed classifications resolve to the
 * unconfigured fail-closed policy — so `ENABLE_MEAL_PLANS=1` in
 * production still cannot configure consent or read/write plan data.
 *
 * Server-only: reads process.env directly; pages, actions, and services
 * consume this single resolver — no site picks a registry.
 */

import {
  createStaticConsentPolicy,
  unconfiguredConsentPolicy,
  type ConsentPolicyRegistry,
} from "../consent";
import { classifyMealPlanRuntime, isMealPlansEnabled } from "./gate";

/** Dev/test-only consent version strings — synthetic values that exist
 * only in seeded test data; production clients never hold them. */
export const MEALPLAN_DEV_CONSENT = {
  PRIVACY_NOTICE: "meal-plan-dev-privacy-v1",
  HEALTH_DATA: "meal-plan-dev-health-v1",
} as const;

type ResolverEnv = {
  ENABLE_MEAL_PLANS?: string;
  APP_ENV?: string;
  NODE_ENV?: string;
};

/**
 * The ONE shared consent-policy resolver for meal-plan routes, actions,
 * and boundaries. `unconfiguredConsentPolicy` unless the feature flag is
 * exactly on AND the runtime classifies as trusted development/test.
 */
export function resolveMealPlanConsentPolicy(
  env: ResolverEnv = process.env,
): ConsentPolicyRegistry {
  if (!isMealPlansEnabled(env)) return unconfiguredConsentPolicy;
  if (classifyMealPlanRuntime(env) === "production")
    return unconfiguredConsentPolicy;
  return createStaticConsentPolicy({
    PRIVACY_NOTICE: MEALPLAN_DEV_CONSENT.PRIVACY_NOTICE,
    HEALTH_DATA: MEALPLAN_DEV_CONSENT.HEALTH_DATA,
  });
}
