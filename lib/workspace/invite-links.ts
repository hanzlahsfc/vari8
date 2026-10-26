import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { AccessDeniedError, type SessionLike } from "../auth/guard";
import {
  consumeRateLimit,
  resolveTrustedClientIp,
  type RateLimitRule,
} from "../auth/rate-limit";
import { prisma } from "../db";
import { hashAccessToken } from "../tokens/crypto";
import { WorkspaceServiceError } from "./clients";
import { createWorkspaceInvitation, InvitationError } from "./invitations";

/**
 * T3 route-facing seam for the invite-link flow.
 *
 * Two surfaces, both safe at the boundary:
 *
 * - `lookupInviteForRoute` backs the PUBLIC lookup route. It spends one unit
 *   of a fixed small budget (per trusted IP, falling back to per token
 *   material when no trusted IP header is configured), then returns only the
 *   invited workspace's display name. Malformed, unknown, expired, revoked,
 *   consumed, and wrong-purpose tokens - and an over-budget caller - all
 *   collapse to one identical not-found outcome. No oracle, no internals.
 * - `issueClientInviteLink` backs the coach-side client-setups action. It
 *   delegates every authorization, replacement, token, and audit decision to
 *   the reviewed `createWorkspaceInvitation` orchestration and maps its
 *   structural error codes to safe copy. The raw token appears only inside
 *   the returned link, delivered to the issuing coach once - it is never
 *   logged, audited, or echoed back in errors.
 *
 * `lookupInviteDisplayName` (no rate limit) is the server-side peek used by
 * the `/invite` acceptance page itself; the public route stays the only
 * externally reachable read.
 */

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const GENERIC = "Something went wrong. Please try again in a moment.";
const DENIED = "You don't have access to do that.";
const INVALID = "Check the details and try again.";

/**
 * Fixed small budget for the public lookup: enough for a handful of
 * legitimate page loads, tight enough to blunt token guessing.
 */
export const INVITE_LOOKUP_RULE: RateLimitRule = { window: 60, max: 8 };

const NOT_FOUND = { status: 404, body: { name: null } } as const;

export type InviteLookupOutcome =
  typeof NOT_FOUND | { status: 200; body: { name: string } };

/**
 * Limit key: per trusted client IP when one is configured and present;
 * otherwise per presented token material so unlimited guessing is still
 * bounded (a missing token shares one bucket - never a per-attempt pass).
 */
function lookupLimitKey(ip: string | null, rawToken: unknown): string {
  if (ip !== null) return `ip:invite-lookup:${sha256(`ip:${ip}`)}`;
  const material =
    typeof rawToken === "string" && rawToken.length > 0 ? rawToken : "missing";
  return `tok:invite-lookup:${sha256(material)}`;
}

/**
 * Validity predicates mirror `inspectAccessToken` (consumed, revoked,
 * expired, wrong purpose) but resolve the workspace display name in the same
 * single row read - no TOCTOU gap between a validity peek and a name fetch.
 */
export async function lookupInviteDisplayName(
  rawToken: unknown,
  client: PrismaClient = prisma,
): Promise<{ name: string } | null> {
  if (typeof rawToken !== "string" || rawToken.length === 0) return null;
  let tokenHash: string;
  try {
    tokenHash = hashAccessToken(rawToken);
  } catch {
    return null;
  }
  const row = await client.accessToken.findUnique({
    where: { tokenHash },
    select: {
      purpose: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
      workspace: { select: { name: true } },
    },
  });
  if (
    !row ||
    row.purpose !== "WORKSPACE_INVITE" ||
    row.consumedAt !== null ||
    row.revokedAt !== null ||
    row.expiresAt <= new Date() ||
    row.workspace === null
  ) {
    return null;
  }
  return { name: row.workspace.name };
}

/**
 * Public-route path: the budget is spent BEFORE any token work so probing
 * costs the caller, never the store. Over-budget returns the same
 * not-found outcome as every invalid token shape - the contract's
 * fail-closed shape.
 */
export async function lookupInviteForRoute(
  input: { rawToken: unknown; headers: Headers },
  client: PrismaClient = prisma,
): Promise<InviteLookupOutcome> {
  const budget = await consumeRateLimit(
    lookupLimitKey(resolveTrustedClientIp(input.headers), input.rawToken),
    INVITE_LOOKUP_RULE,
    client,
  );
  if (!budget.allowed) return NOT_FOUND;
  const found = await lookupInviteDisplayName(input.rawToken, client);
  if (found === null) return NOT_FOUND;
  return { status: 200, body: { name: found.name } };
}

export type IssueInviteLinkResult =
  { ok: true; link: string; expiresAt: Date } | { ok: false; message: string };

/**
 * Issue a CLIENT invitation and return the shareable link. Every reachable
 * service code is mapped - the `?? 500` anti-pattern has no place here.
 */
export async function issueClientInviteLink(
  session: SessionLike,
  input: { workspaceId: unknown; targetEmail: unknown },
  client: PrismaClient = prisma,
): Promise<IssueInviteLinkResult> {
  if (typeof input.workspaceId !== "string" || input.workspaceId.length === 0) {
    return { ok: false, message: INVALID };
  }
  try {
    const created = await createWorkspaceInvitation(
      session,
      {
        workspaceId: input.workspaceId,
        targetEmail: input.targetEmail,
        intendedRole: "CLIENT",
      },
      client,
    );
    const link =
      `/invite?workspace=${encodeURIComponent(created.delivery.workspaceId)}` +
      `&token=${encodeURIComponent(created.delivery.rawToken)}`;
    return { ok: true, link, expiresAt: created.delivery.expiresAt };
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { ok: false, message: DENIED };
    }
    if (error instanceof WorkspaceServiceError) {
      return { ok: false, message: INVALID };
    }
    if (error instanceof InvitationError) {
      switch (error.code) {
        case "invalid_input":
          return { ok: false, message: INVALID };
        case "account_ineligible":
        case "membership_conflict":
          return {
            ok: false,
            message: "That account can't be invited to this workspace.",
          };
        case "serialization_conflict":
          return { ok: false, message: "Please try again." };
        case "invalid_token":
        case "identity_required":
        case "identity_mismatch":
        case "invitation_failed":
        case "invitations_not_exposable":
        default:
          return { ok: false, message: GENERIC };
      }
    }
    return { ok: false, message: GENERIC };
  }
}
