import type { PrismaClient } from "@prisma/client";

import type { SessionLike } from "../auth/guard";
import { PasswordPolicyError } from "../password-policy";
import { prisma } from "../db";
import { inspectAccessToken } from "../tokens/store";
import { WorkspaceServiceError } from "./clients";
import { acceptWorkspaceInvitation, InvitationError } from "./invitations";

/**
 * Phase 3.1 — route-facing boundary for invitation acceptance.
 *
 * The reviewed S1-F2C service (`lib/workspace/invitations.ts`) and the token
 * store must never be imported by `app/**` files (pinned by
 * `tests/unit/invitations.test.ts`); this module is the only route-facing
 * seam. It adds exactly two things on top of the service:
 *
 * - `getInviteLinkState` — a NON-CONSUMING validity peek for page rendering.
 *   Invalid, expired, revoked, consumed, wrong-purpose, and malformed links
 *   all collapse to the same `{ state: "invalid" }` — no oracle. The real
 *   claim still happens inside the service's Serializable transaction; this
 *   peek is display-only and TOCTOU-safe by construction.
 * - `acceptInvitationFromLink` — calls the service and maps its structural
 *   error codes to safe user-facing copy via `acceptInvitationMessage`.
 *   Raw tokens, invited emails, hashes, ids, and internals never appear in
 *   returned messages.
 *
 * This slice exposes ACCEPTANCE only. Invitation creation/list/revoke remain
 * internal services with no route — `assertInvitationOrchestrationExternallyExposable`
 * still fails closed for them.
 */

export type InviteLinkState = { state: "ready" } | { state: "invalid" };

/**
 * Non-consuming peek. Both link parameters are required and structurally
 * checked before any database read; a bad shape never touches the database.
 */
export async function getInviteLinkState(
  input: { workspaceId: unknown; rawToken: unknown },
  client: PrismaClient = prisma,
): Promise<InviteLinkState> {
  if (
    typeof input.workspaceId !== "string" ||
    input.workspaceId.length === 0 ||
    typeof input.rawToken !== "string" ||
    input.rawToken.length === 0
  ) {
    return { state: "invalid" };
  }
  // PR-05 sec pass F14: the peek binds the requested workspace — a token
  // minted for workspace A renders "invalid" under workspace B, same as every
  // other invalid shape (no cross-workspace validity oracle).
  const peek = await inspectAccessToken(client, input.rawToken, {
    workspaceId: input.workspaceId,
  });
  if (!peek.valid || peek.purpose !== "WORKSPACE_INVITE") {
    return { state: "invalid" };
  }
  return { state: "ready" };
}

export type InviteAcceptanceResult =
  { ok: true } | { ok: false; message: string };

/**
 * Accept an invitation from the `/invite` form. Passes the caller's session
 * (possibly anonymous — the new-user path) straight to the reviewed service;
 * the result is either success or a single safe message. Nothing else leaks:
 * no codes intended for operators, no echoed input.
 */
export async function acceptInvitationFromLink(
  session: SessionLike,
  input: {
    workspaceId: unknown;
    rawToken: unknown;
    name?: unknown;
    password?: unknown;
  },
  client: PrismaClient = prisma,
): Promise<InviteAcceptanceResult> {
  // A missing/malformed workspace binding is an invalid link, not an input
  // error — same safe message the service's `invalid_token` produces.
  if (typeof input.workspaceId !== "string" || input.workspaceId.length === 0) {
    return {
      ok: false,
      message: acceptInvitationMessage(new InvitationError("invalid_token")),
    };
  }
  try {
    await acceptWorkspaceInvitation(
      session,
      {
        workspaceId: input.workspaceId,
        rawToken: input.rawToken,
        // FormData.get() yields null for absent fields; the service treats
        // only `undefined` as "not provided" (existing-user path ignores
        // name/password — a null would fail validateName).
        name: input.name === null ? undefined : input.name,
        password: input.password === null ? undefined : input.password,
      },
      client,
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, message: acceptInvitationMessage(error) };
  }
}

/**
 * Structural-code → safe UI copy. Every invalid-token shape (malformed,
 * expired, revoked, consumed, wrong purpose/workspace, lost claim race)
 * collapses to the same message. Non-Error and unknown values get the generic
 * failure copy — never an echo of the thrown message.
 */
export function acceptInvitationMessage(error: unknown): string {
  if (error instanceof PasswordPolicyError) {
    switch (error.code) {
      case "password_too_short":
        return "Password must be at least 10 characters.";
      case "password_too_long":
        return "Password must be at most 128 characters.";
      case "password_needs_digit":
        return "Password must include at least one digit (0–9).";
    }
  }
  if (error instanceof WorkspaceServiceError) {
    return "Check the details and try again.";
  }
  if (error instanceof InvitationError) {
    switch (error.code) {
      case "invalid_token":
        return "This invitation link is invalid or has already been used. Ask the workspace owner for a new invitation.";
      case "identity_required":
        return "This invitation is for an existing account. Sign in, then open the invitation link again.";
      case "identity_mismatch":
        return "This invitation belongs to a different account. Sign out, then open the invitation link again.";
      case "invalid_input":
        return "Check the details and try again.";
      case "account_ineligible":
      case "membership_conflict":
        return "This invitation can't be accepted for this account.";
      default:
        return "The invitation could not be completed. Please try again.";
    }
  }
  return "Something went wrong accepting the invitation. Please try again.";
}
