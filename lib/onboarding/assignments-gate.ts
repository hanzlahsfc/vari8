/**
 * P-013 staff-only onboarding-form assignments — dev gate + shared contract.
 *
 * The feature exists ONLY behind `ENABLE_ONBOARDING_ASSIGNMENTS=1` (exact
 * match — unset, empty, malformed, or any other value keeps it closed). The
 * gate is checked at the route and boundary layers BEFORE any user-controlled
 * input is bound; it is a development control, never a substitute for the
 * server-side authorization every operation performs.
 *
 * Error codes are structural vocabulary only — they never carry client data,
 * form content, or internals.
 */

import { devFlagEnabled, type RuntimeEnv } from "../runtime";

export function isOnboardingAssignmentsEnabled(
  flag: string | undefined,
  env: RuntimeEnv = process.env,
): boolean {
  return devFlagEnabled(flag, env);
}

export const ASSIGNMENT_LIMITS = {
  idMax: 128,
  listDefaultLimit: 25,
  listMaxLimit: 100,
} as const;

export type OnboardingAssignmentErrorCode =
  | "invalid_input"
  | "assignment_not_accessible"
  | "assignment_not_active"
  | "client_not_eligible"
  | "form_not_eligible"
  | "assignment_conflict"
  | "serialization_conflict";

export class OnboardingAssignmentError extends Error {
  constructor(readonly code: OnboardingAssignmentErrorCode) {
    super(code);
    this.name = "OnboardingAssignmentError";
  }
}
