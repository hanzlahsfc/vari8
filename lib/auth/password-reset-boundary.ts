import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";

import { prisma } from "../db";
import { normalizeEmail } from "../email";
import { mailDeliveryConfigured } from "../mail";
import { PasswordPolicyError, validatePasswordSetup } from "../password-policy";
import { auth } from "./server";

/**
 * PR-05 reset boundary — same public contract as the Phase 3.2 version, now
 * backed by Better Auth's `verification` table instead of the invite token
 * store.
 *
 * - `getResetLinkState` is a NON-consuming peek for rendering `/reset` only.
 *   The authoritative claim happens inside `POST /api/auth/reset-password`,
 *   which consumes the verification row atomically (single use) in the same
 *   transaction as the password write and session revocation.
 * - `requestPasswordResetFromForm` deliberately erases account existence: the
 *   public response is identical whether or not the account exists.
 * - The raw token is never returned, logged, or placed in errors.
 * - Every entry point fails closed while no mail delivery adapter is
 *   registered (`mailDeliveryConfigured()`); the `gate` option exists so
 *   tests can exercise the enabled path explicitly.
 */

export type ResetLinkState = { state: "ready" | "invalid" };

export type ResetGate = { deliveryAvailable?: boolean };

const deliveryAvailable = (gate?: ResetGate): boolean =>
  gate?.deliveryAvailable ?? mailDeliveryConfigured();

const RESET_IDENTIFIER_PREFIX = "reset-password:";

/**
 * Verification identifiers are stored hashed (`verification.storeIdentifier:
 * "hashed"` in `lib/auth/server.ts`): Better Auth stores SHA-256(identifier)
 * base64url-encoded, without padding. The peek hashes the same composite
 * identifier — the raw mailed token is never matched against a plain row.
 */
function storedResetIdentifier(rawToken: string): string {
  return createHash("sha256")
    .update(`${RESET_IDENTIFIER_PREFIX}${rawToken}`)
    .digest("base64url");
}

export interface VerificationLookup {
  verification: {
    findFirst: (args: {
      where: { identifier: string; expiresAt: { gt: Date } };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
}

export async function getResetLinkState(
  rawToken: unknown,
  client: VerificationLookup = prisma,
  gate?: ResetGate,
): Promise<ResetLinkState> {
  if (!deliveryAvailable(gate)) return { state: "invalid" };
  if (typeof rawToken !== "string" || rawToken.length === 0) {
    return { state: "invalid" };
  }
  try {
    const row = await client.verification.findFirst({
      where: {
        identifier: storedResetIdentifier(rawToken),
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return { state: row === null ? "invalid" : "ready" };
  } catch {
    // Storage/lookup failure → fail closed to the same safe state rather
    // than a 500; the atomic claim on submit is unaffected either way.
    return { state: "invalid" };
  }
}

export type ResetRequestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const REQUEST_SUCCESS =
  "If an account exists for that email, we've sent a password reset link. " +
  "Check your inbox.";
const UNAVAILABLE_MESSAGE = "Password reset is not currently available.";

export async function requestPasswordResetFromForm(
  email: unknown,
  gate?: ResetGate,
): Promise<ResetRequestResult> {
  if (!deliveryAvailable(gate)) {
    return { ok: false, message: UNAVAILABLE_MESSAGE };
  }
  const normalized = normalizeEmail(email);
  if (normalized.length === 0 || !normalized.includes("@")) {
    // Field-format error only — not an existence signal.
    return { ok: false, message: "Enter a valid email address." };
  }
  try {
    await auth.api.requestPasswordReset({
      body: { email: normalized },
      headers: await headers(),
    });
    return { ok: true, message: REQUEST_SUCCESS };
  } catch {
    return {
      ok: false,
      message: "Something went wrong. Please try again in a moment.",
    };
  }
}

export type ResetCompletionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function completePasswordReset(
  input: { rawToken: unknown; password: unknown },
  gate?: ResetGate,
): Promise<ResetCompletionResult> {
  if (!deliveryAvailable(gate)) {
    return { ok: false, message: UNAVAILABLE_MESSAGE };
  }
  try {
    // Policy check first so a policy violation on an unusable token reports
    // the policy problem the user can actually fix.
    const newPassword = validatePasswordSetup(input.password);
    await auth.api.resetPassword({
      body: {
        newPassword,
        token: typeof input.rawToken === "string" ? input.rawToken : "",
      },
      headers: await headers(),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: passwordResetMessage(error) };
  }
}

const INVALID_LINK_MESSAGE =
  "This password reset link is invalid or has expired. Request a new link.";
const GENERIC_FAILURE_MESSAGE =
  "Something went wrong. Please try again in a moment.";

/** Structural error → safe copy. Never echoes input, tokens, or internals. */
export function passwordResetMessage(error: unknown): string {
  if (error instanceof PasswordPolicyError) {
    switch (error.code) {
      case "password_too_short":
        return "Password must be at least 10 characters.";
      case "password_needs_digit":
        return "Password must contain at least one digit.";
      default:
        return "Enter a valid password.";
    }
  }
  if (error instanceof APIError) {
    // The single-use consume and expiry check collapse to INVALID_TOKEN;
    // policy codes surface through the before-hook as BAD_REQUEST + code.
    if (error.body?.code === "INVALID_TOKEN") return INVALID_LINK_MESSAGE;
    if (error.body?.code === "PASSWORD_TOO_SHORT") {
      return "Password must be at least 10 characters.";
    }
    if (error.body?.code === "PASSWORD_TOO_LONG") {
      return "Password must be at most 128 characters.";
    }
    if (
      error.status === "BAD_REQUEST" &&
      typeof error.body?.message === "string" &&
      error.body.message.startsWith("password_")
    ) {
      return passwordResetMessage(new PasswordPolicyError(
        error.body.message as PasswordPolicyError["code"],
      ));
    }
  }
  return GENERIC_FAILURE_MESSAGE;
}

/**
 * Route gate used by `/login`, `/reset-request`, and `/reset` — true only
 * when a real delivery adapter is registered (never an env flag alone).
 */
export function passwordResetDeliveryConfigured(): boolean {
  return mailDeliveryConfigured();
}
