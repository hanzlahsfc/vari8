/**
 * P-016 C1 staff-only client setup / template assignments — dev gate +
 * shared contract (product-decisions #49–#57).
 *
 * The feature exists ONLY behind `ENABLE_CLIENT_SETUP=1` (exact match —
 * unset, empty, malformed, or any other value keeps it closed). The gate is
 * checked at the route and boundary layers BEFORE any user-controlled input
 * is bound; it is a development control, never a substitute for the
 * server-side authorization every operation performs.
 *
 * Error codes are structural vocabulary only — they never carry client data,
 * template content, or internals.
 */

export function isClientSetupEnabled(env: string | undefined): boolean {
  return env === "1";
}

export const CLIENT_SETUP_LIMITS = {
  idMax: 128,
  listDefaultLimit: 25,
  listMaxLimit: 100,
  /** Hard ceiling on positional list indices submitted by the browser. */
  indexMax: 100_000,
} as const;

export type ClientSetupErrorCode =
  | "invalid_input"
  | "assignment_not_accessible"
  | "assignment_not_active"
  | "client_not_eligible"
  | "template_not_eligible"
  | "assignment_conflict"
  | "serialization_conflict"
  | "stale_selection";

export class ClientSetupError extends Error {
  constructor(readonly code: ClientSetupErrorCode) {
    super(code);
    this.name = "ClientSetupError";
  }
}
