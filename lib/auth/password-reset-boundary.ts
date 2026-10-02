import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { PasswordPolicyError } from "../password-policy";
import { inspectAccessToken } from "../tokens/store";
import {
  deliverPasswordResetToken,
  passwordResetDeliveryConfigured,
} from "./password-reset-delivery";
import {
  PasswordResetError,
  requestPasswordReset,
  resetPasswordWithToken,
} from "./password-reset";

/**
 * Phase 3.2 — reviewed route boundary for the password-reset flow.
 *
 * `app/**` files are forbidden from importing `auth/password-reset` or
 * `tokens/store` directly (test-pinned), so the routes reach the reviewed
 * orchestration exclusively through this module.
 *
 * - `getResetLinkState` is a NON-consuming peek for rendering the `/reset`
 *   page only — the authoritative claim happens inside
 *   `resetPasswordWithToken`'s Serializable transaction.
 * - `requestPasswordResetFromForm` deliberately erases the service's
 *   existence outcome: the public response is identical whether or not the
 *   account exists (the Phase 3.2 instruction supersedes the §24 accepted
 *   enumeration risk at the UI layer; the internal outcome still drives
 *   delivery decisions).
 * - The raw token is never returned, logged, or placed in errors.
 * - Every entry point fails closed while no real delivery adapter is
 *   registered: the default `deliveryAvailable` resolves through the adapter
 *   registry (never an env flag alone), and when unavailable NOTHING below
 *   touches the database — no issuance, inspection, or claim. The `gate`
 *   option exists so tests can exercise the enabled path explicitly; an env
 *   var cannot inject it.
 */

export type ResetLinkState = { state: "ready" | "invalid" };

export type ResetGate = { deliveryAvailable?: boolean };

const deliveryAvailable = (gate?: ResetGate): boolean =>
  gate?.deliveryAvailable ?? passwordResetDeliveryConfigured();

export async function getResetLinkState(
  rawToken: unknown,
  client: PrismaClient = prisma,
  gate?: ResetGate,
): Promise<ResetLinkState> {
  if (!deliveryAvailable(gate)) return { state: "invalid" };
  if (typeof rawToken !== "string" || rawToken.length === 0) {
    return { state: "invalid" };
  }
  try {
    const peek = await inspectAccessToken(client, rawToken);
    if (!peek.valid || peek.purpose !== "PASSWORD_RESET") {
      return { state: "invalid" };
    }
    return { state: "ready" };
  } catch {
    // Storage/lookup failure → fail closed to the same safe state rather
    // than a 500; the atomic claim on submit is unaffected either way.
    return { state: "invalid" };
  }
}

export type ResetRequestResult =
  { ok: true; message: string } | { ok: false; message: string };

const REQUEST_SUCCESS =
  "If an account exists for that email, we've sent a password reset link. " +
  "Check your inbox.";

/**
 * Request a reset for the submitted email. The response is intentionally
 * identical for existing and missing accounts. The delivery seam must not
 * throw for existing accounts (that would reintroduce the signal), so any
 * service-side failure is reported as a generic, non-distinguishing retry
 * message.
 */
const UNAVAILABLE_MESSAGE = "Password reset is not currently available.";

export async function requestPasswordResetFromForm(
  email: unknown,
  client: PrismaClient = prisma,
  gate?: ResetGate,
): Promise<ResetRequestResult> {
  if (!deliveryAvailable(gate)) {
    return { ok: false, message: UNAVAILABLE_MESSAGE };
  }
  try {
    await requestPasswordReset(
      { email },
      { deliver: deliverPasswordResetToken },
      client,
    );
    return { ok: true, message: REQUEST_SUCCESS };
  } catch (error) {
    if (error instanceof PasswordResetError && error.code === "invalid_input") {
      // Field-format error only — not an existence signal.
      return { ok: false, message: "Enter a valid email address." };
    }
    return {
      ok: false,
      message: "Something went wrong. Please try again in a moment.",
    };
  }
}

export type ResetCompletionResult =
  { ok: true } | { ok: false; message: string };

export async function completePasswordReset(
  input: { rawToken: unknown; password: unknown },
  client: PrismaClient = prisma,
  gate?: ResetGate,
): Promise<ResetCompletionResult> {
  if (!deliveryAvailable(gate)) {
    return { ok: false, message: UNAVAILABLE_MESSAGE };
  }
  try {
    await resetPasswordWithToken(input, client);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: passwordResetMessage(error) };
  }
}

const INVALID_LINK_MESSAGE =
  "This password reset link is invalid or has expired. Request a new link.";

/** Structural error → safe copy. Never echoes input, tokens, or internals. */
export function passwordResetMessage(error: unknown): string {
  if (error instanceof PasswordPolicyError) {
    switch (error.code) {
      case "password_too_short":
        return "Password must be at least 10 characters.";
      case "password_needs_digit":
        return "Password must include at least one digit (0–9).";
      case "password_too_long":
        return "Password must be at most 128 characters.";
    }
  }
  if (error instanceof PasswordResetError) {
    switch (error.code) {
      case "invalid_token":
      case "account_ineligible":
        return INVALID_LINK_MESSAGE;
      case "invalid_input":
        return "Check the details and try again.";
      default:
        return "Something went wrong. Please try again in a moment.";
    }
  }
  return "Something went wrong. Please try again in a moment.";
}
