/**
 * P-023 — client onboarding submission: dev gate + shared contract
 * (decisions #82–#85).
 *
 * `ENABLE_ONBOARDING_SUBMISSION === "1"` enables the client submission
 * routes and server action. The gate is checked at the route and boundary
 * layers BEFORE session access, FormData binding, or database work; it is
 * a development control, never a substitute for the server-side
 * authorization every operation performs. Production consent registry
 * stays unconfigured, so the feature fails closed there even if the flag
 * were set.
 *
 * Error codes are structural vocabulary only — they never carry answer
 * content, field labels, or internals.
 */

import { FORM_LIMITS } from "./forms";
import { ASSIGNMENT_LIMITS } from "./assignments-gate";

export function isOnboardingSubmissionEnabled(
  env: string | undefined,
): boolean {
  return env === "1";
}

export const SUBMISSION_LIMITS = {
  /** Reused opaque-ID bound (also governs fieldId/optionId strings). */
  idMax: ASSIGNMENT_LIMITS.idMax,
  /** Reused definition payload bound — answersJson ≤64 KiB UTF-8. */
  answersJsonMaxBytes: FORM_LIMITS.definitionMaxBytes,
  /** Reused field-count bound — array length ≤100. */
  maxAnswers: FORM_LIMITS.maxFields,
  /** Engineering safety bounds (P-023-R3 §12 — labeled, not product rules). */
  shortTextMaxChars: 1000,
  shortTextMaxBytes: 4096,
  longTextMaxChars: 10000,
  longTextMaxBytes: 40 * 1024,
  numberPattern: /^-?\d{1,15}(\.\d{1,6})?$/,
  dateMin: "1900-01-01",
  dateMax: "2100-12-31",
  multiMaxSelections: FORM_LIMITS.maxOptions,
  multiJsonMaxBytes: 8192,
} as const;

export type OnboardingSubmissionErrorCode =
  | "invalid_input"
  // Single non-disclosing surface for missing, foreign, wrong-workspace,
  // denied, terminal, and otherwise-unavailable targets.
  | "not_available"
  | "consent_missing"
  | "policy_not_configured"
  | "serialization_conflict";

export class OnboardingSubmissionError extends Error {
  constructor(readonly code: OnboardingSubmissionErrorCode) {
    super(code);
    this.name = "OnboardingSubmissionError";
  }
}
