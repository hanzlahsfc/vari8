/**
 * Shared email normalization — canonical form is trimmed + lowercased.
 * Moved out of the deleted Auth.js credentials module in PR-05.
 */
export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
