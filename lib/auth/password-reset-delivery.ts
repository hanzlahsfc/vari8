import type { ResetDeliveryPayload } from "./password-reset";

/**
 * Phase 3.2 — password-reset delivery seam + availability gate.
 *
 * No email provider, sender identity, or application base URL exists yet
 * (product decision pending), so the public reset surface must fail closed.
 *
 * Capability model (deliberately NOT an env flag):
 *
 * - `PASSWORD_RESET_DELIVERY_ADAPTER` only SELECTS a delivery adapter by name.
 * - `ADAPTERS` is the registry of REAL provider adapters. It is empty today,
 *   so no env value — including "1" or a plausible provider name — can make
 *   `passwordResetDeliveryAvailable` return true. An env flag alone can never
 *   expose the UI while the sink is a no-op.
 * - Activation path when a provider lands: implement the adapter module
 *   (secrets/config as required), register it in `ADAPTERS` under a stable
 *   name, set `PASSWORD_RESET_DELIVERY_ADAPTER` to that name. The gate flips
 *   because a real adapter exists — not because a flag was set.
 *
 * Two hard constraints:
 * - `deliverPasswordResetToken` must never throw while no adapter is
 *   registered: `requestPasswordReset` maps a thrown sink error to
 *   `reset_failed`, which surfaces ONLY for existing accounts and would
 *   reintroduce the enumeration signal the public response erases. (Once a
 *   real adapter exists, a delivery failure honestly reporting
 *   `reset_failed` is acceptable — the UI treats it as a generic error.)
 * - `payload.rawToken` and `payload.to` must never be logged, returned, or
 *   stored by this seam.
 */

export const RESET_DELIVERY_ADAPTER_ENV = "PASSWORD_RESET_DELIVERY_ADAPTER";

export type ResetDeliveryAdapter = (
  payload: ResetDeliveryPayload,
) => void | Promise<void>;

/**
 * Registry of real delivery adapters, keyed by the env-selectable name.
 * EMPTY BY DESIGN until a provider integration lands — that is what makes
 * the capability check fail closed no matter what the env contains.
 */
const ADAPTERS: Readonly<Record<string, ResetDeliveryAdapter>> = Object.freeze(
  {},
);

/** True only when the env names a REGISTERED real adapter. */
export function passwordResetDeliveryAvailable(
  env: string | undefined,
): boolean {
  if (typeof env !== "string") return false;
  const name = env.trim();
  if (name.length === 0) return false;
  return Object.hasOwn(ADAPTERS, name);
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
  const name = process.env[RESET_DELIVERY_ADAPTER_ENV]?.trim() ?? "";
  const adapter = Object.hasOwn(ADAPTERS, name) ? ADAPTERS[name] : undefined;
  if (!adapter) {
    // Deliberate no-op while no provider exists: the token is issued,
    // sibling-revoked, and audited — then its only raw copy is discarded
    // here. Nothing pretends a message was sent.
    void payload;
    return;
  }
  await adapter(payload);
}
