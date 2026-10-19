import type { ResetDeliveryPayload } from "./password-reset";

/**
 * Phase 3.2 — password-reset delivery seam + availability gate.
 *
 * No email provider, sender identity, or application base URL exists yet
 * (product decision pending), so the public reset surface fails closed:
 * `passwordResetDeliveryAvailable` is always false and
 * `deliverPasswordResetToken` is a deliberate no-op. PR-04 (BACKEND-REDUCTION
 * F12) inlined the empty adapter registry — no env value, including "1" or a
 * plausible provider name, can make the gate true while no adapter code
 * exists. When a provider lands this seam grows the real adapter (its own
 * secrets/config) and `PASSWORD_RESET_DELIVERY_ADAPTER` selects it by name.
 *
 * Two hard constraints (unchanged):
 * - `deliverPasswordResetToken` must never throw while no adapter exists:
 *   `requestPasswordReset` maps a thrown sink error to `reset_failed`, which
 *   surfaces ONLY for existing accounts and would reintroduce the enumeration
 *   signal the public response erases.
 * - `payload.rawToken` and `payload.to` must never be logged, returned, or
 *   stored by this seam.
 */

export const RESET_DELIVERY_ADAPTER_ENV = "PASSWORD_RESET_DELIVERY_ADAPTER";

export type ResetDeliveryAdapter = (
  payload: ResetDeliveryPayload,
) => void | Promise<void>;

/** False while no delivery adapter exists — the env name alone grants nothing. */
export function passwordResetDeliveryAvailable(
  env: string | undefined,
): boolean {
  void env;
  return false;
}

/**
 * Server-side convenience wrapper for the current process environment.
 * Routes and the boundary call this; unit tests inject the boolean directly.
 */
export function passwordResetDeliveryConfigured(): boolean {
  return passwordResetDeliveryAvailable(
    process.env[RESET_DELIVERY_ADAPTER_ENV],
  );
}

export async function deliverPasswordResetToken(
  payload: ResetDeliveryPayload,
): Promise<void> {
  // Deliberate no-op while no provider exists: the token is issued,
  // sibling-revoked, and audited — then its only raw copy is discarded
  // here. Nothing pretends a message was sent.
  void payload;
}
