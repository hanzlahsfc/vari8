/**
 * S1-F2B password policy (Aleks's approved decision, 2026-09-30).
 *
 * - Minimum 10 Unicode code points, maximum 128 — counted by code-point
 *   iteration, never `String.length` (UTF-16 units miscount astral chars).
 * - No composition requirements; spaces (incl. leading/trailing) and any
 *   printable characters are allowed; nothing is trimmed or case-folded.
 * - NFC normalization before counting AND before the returned value is hashed
 *   (NFKC is deliberately not used — it folds look-alikes and changes intent).
 *
 * Recorded risk: 10 is below the current 15-char recommendation for
 * password-only auth — an explicit product decision, not overridden here.
 * Errors are structural codes only; the password never appears in a message,
 * property, log line, or audit row.
 */
export type PasswordPolicyErrorCode =
  "password_too_short" | "password_too_long" | "password_needs_digit";

export class PasswordPolicyError extends Error {
  constructor(readonly code: PasswordPolicyErrorCode) {
    super(code);
    this.name = "PasswordPolicyError";
  }
}

export const PASSWORD_MIN_CODE_POINTS = 10;
export const PASSWORD_MAX_CODE_POINTS = 128;

function codePointCount(value: string): number {
  // Spreading iterates by code point (not UTF-16 unit), then takes length.
  return [...value].length;
}

/**
 * Validate the policy and return the NFC-normalized password for hashing.
 * Non-string input is treated as failing the minimum — same structural error,
 * never echoing the value.
 */
export function validatePasswordPolicy(candidate: unknown): string {
  const normalized =
    typeof candidate === "string" ? candidate.normalize("NFC") : "";
  const length = codePointCount(normalized);
  if (length < PASSWORD_MIN_CODE_POINTS) {
    throw new PasswordPolicyError("password_too_short");
  }
  if (length > PASSWORD_MAX_CODE_POINTS) {
    throw new PasswordPolicyError("password_too_long");
  }
  return normalized;
}

/**
 * Phase 3.1 — invite password setup (Aleks's confirmed policy, relayed
 * 2026-10-01): the shared length bounds PLUS at least one ASCII digit. No
 * uppercase or symbol requirement.
 *
 * Applies only to the invitation-acceptance account-creation path; the shared
 * `validatePasswordPolicy` (and the password-reset flow that uses it) keep the
 * no-composition-rule decision. Errors remain structural codes.
 */
export function validateInvitePassword(candidate: unknown): string {
  const normalized = validatePasswordPolicy(candidate);
  if (!/[0-9]/.test(normalized)) {
    throw new PasswordPolicyError("password_needs_digit");
  }
  return normalized;
}
