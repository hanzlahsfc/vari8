import type { ResetDeliveryPayload } from "./password-reset";

/**
 * Phase 3.2 — password-reset delivery seam.
 *
 * `requestPasswordReset` requires a delivery sink: it is invoked exactly once,
 * post-commit, outside the transaction. No email provider, sender identity,
 * or application base URL exists yet (product decision pending), so this is a
 * deliberate no-op: the token is issued, siblings revoked, and the REQUESTED
 * audit written — then the single raw copy is discarded server-side.
 *
 * This is an operational limitation, not a fake sender: nothing pretends a
 * message was sent. When the provider decision lands, this one function
 * becomes the SMTP/API call.
 *
 * Two hard constraints:
 * - It must never throw for a committed issuance. `requestPasswordReset` maps
 *   a thrown sink error to `reset_failed`, which would surface as an error
 *   ONLY for existing accounts — reintroducing the enumeration signal the
 *   public response deliberately erases.
 * - `payload.rawToken` and `payload.to` must never be logged, returned, or
 *   stored by this seam.
 */
export async function deliverPasswordResetToken(
  payload: ResetDeliveryPayload,
): Promise<void> {
  void payload;
}
