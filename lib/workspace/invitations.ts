import { Prisma, PrismaClient, type MemberRole } from "@prisma/client";

import { writeAuditEvent } from "../audit";
import {
  AccessDeniedError,
  authorize,
  authorizeCollection,
  type SessionLike,
} from "../auth/guard";
import { normalizeEmail } from "../credentials";
import { hashPassword } from "../password";
import { validatePasswordPolicy } from "../password-policy";
import type { RawAccessToken } from "../tokens/crypto";
import {
  claimAccessToken,
  issueWorkspaceInviteToken,
  revokeMatchingInviteTokens,
} from "../tokens/store";
import { prisma } from "../db";
import { createPrismaAuthorizationRepo, type PrismaLike } from "./access";
import { normalizeLimit, validateName } from "./clients";

/**
 * S1-F2C — workspace invitation orchestration (internal services only).
 *
 * Every mutation runs inside ONE Serializable transaction that re-reads
 * authorization state through a transaction-bound repo — no TOCTOU window
 * between authorization and mutation. Audit writes are transaction-coupled:
 * a failed audit rolls back the business mutation (no audit ⇒ no mutation).
 *
 * - `createWorkspaceInvitation` replaces only the exact active
 *   (workspace, email, role) tuple, then issues a 12-hour hash-only token.
 *   A per-tuple `pg_advisory_xact_lock` serializes concurrent replacements so
 *   at most one active matching invitation survives.
 * - `revokeWorkspaceInvitation`/`listWorkspaceInvitations` are owner-only
 *   (`membersInvitations` matrix cells; a coach cannot list or revoke).
 * - `acceptWorkspaceInvitation` claims atomically (exactly one concurrent
 *   winner), re-authorizes the issuer's CURRENT membership, and drives the
 *   membership state machine — including fresh-vs-stale restoration for
 *   SUSPENDED/REMOVED members.
 *
 * The raw token leaves the service exactly once — inside the
 * `InvitationDeliveryPayload` returned after commit. It is never stored,
 * logged, audited, or included in errors. No email provider, URL, route, or
 * UI exists; `assertInvitationOrchestrationExternallyExposable` fails closed.
 */

const MAX_TARGET_EMAIL_LENGTH = 254;

export type InvitableRole = "COACH" | "ASSISTANT_COACH" | "CLIENT";

export type InvitationErrorCode =
  | "invalid_input"
  | "invalid_token"
  | "identity_required"
  | "identity_mismatch"
  | "account_ineligible"
  | "membership_conflict"
  | "serialization_conflict"
  | "invitation_failed"
  | "invitations_not_exposable";

export class InvitationError extends Error {
  constructor(readonly code: InvitationErrorCode) {
    super(code);
    this.name = "InvitationError";
  }
}

// --- pure helpers ------------------------------------------------------------

export function isInvitableRole(value: unknown): value is InvitableRole {
  return value === "COACH" || value === "ASSISTANT_COACH" || value === "CLIENT";
}

/**
 * The RBAC resource for an invite's intended role. CLIENT invitations use the
 * dedicated `clientInvitations` resource so a coach's client-invite grant can
 * never widen staff-invitation permission.
 */
export function invitationResource(
  intendedRole: InvitableRole,
): "membersInvitations" | "clientInvitations" {
  return intendedRole === "CLIENT" ? "clientInvitations" : "membersInvitations";
}

/** Roles still authorized to have issued an invitation of `intendedRole`. */
function issuerRolesFor(intendedRole: InvitableRole): readonly MemberRole[] {
  return intendedRole === "CLIENT"
    ? ["WORKSPACE_OWNER", "COACH"]
    : ["WORKSPACE_OWNER"];
}

function normalizedEmail(value: unknown): string {
  const email = normalizeEmail(value);
  if (!email || email.length > MAX_TARGET_EMAIL_LENGTH)
    throw new InvitationError("invalid_input");
  return email;
}

function isRetryableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

/** At most two attempts — never an unbounded retry loop. */
const MAX_ATTEMPTS = 2;

// --- create / replace ---------------------------------------------------------

/** Minimal provider-neutral delivery output — post-commit only. */
export type InvitationDeliveryPayload = {
  kind: "workspace_invite";
  to: string;
  rawToken: RawAccessToken;
  expiresAt: Date;
  workspaceId: string;
};

export type CreatedInvitation = {
  invitationId: string;
  expiresAt: Date;
  delivery: InvitationDeliveryPayload;
};

/**
 * Create (or atomically replace) a workspace invitation. Authorization runs
 * inside the same Serializable transaction as every mutation; revocation of
 * any previous matching invitation rolls back if issuance or audit fails.
 */
export async function createWorkspaceInvitation(
  session: SessionLike,
  input: { workspaceId: string; targetEmail: unknown; intendedRole: unknown },
  client: PrismaClient = prisma,
): Promise<CreatedInvitation> {
  if (typeof input.workspaceId !== "string" || input.workspaceId.length === 0)
    throw new InvitationError("invalid_input");
  const targetEmail = normalizedEmail(input.targetEmail);
  if (!isInvitableRole(input.intendedRole))
    throw new InvitationError("invalid_input");
  const intendedRole = input.intendedRole;
  const resource = invitationResource(intendedRole);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.$transaction(
        async (tx) => {
          // Serialize concurrent replacements of the same tuple deterministically.
          await tx.$executeRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            `${input.workspaceId}|${targetEmail}|${intendedRole}`,
          );
          const ctx = await authorize(
            session,
            {
              resource,
              action: "write",
              workspaceId: input.workspaceId,
            },
            createPrismaAuthorizationRepo(tx),
          );
          await revokeMatchingInviteTokens(tx, {
            workspaceId: input.workspaceId,
            targetEmail,
            intendedRole,
          });
          const issued = await issueWorkspaceInviteToken(tx, {
            workspaceId: input.workspaceId,
            targetEmail,
            intendedRole,
            createdByUserId: ctx.userId,
          });
          await writeAuditEvent(tx, ctx, {
            action: "INVITE",
            resourceType: "access_token",
            resourceId: issued.tokenId,
            meta: { targetRole: intendedRole },
          });
          return {
            invitationId: issued.tokenId,
            expiresAt: issued.expiresAt,
            delivery: {
              kind: "workspace_invite",
              to: targetEmail,
              rawToken: issued.rawToken,
              expiresAt: issued.expiresAt,
              workspaceId: input.workspaceId,
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isRetryableConflict(error) && attempt < MAX_ATTEMPTS) continue;
      throw mapInvitationError(error);
    }
  }
  throw new InvitationError("serialization_conflict");
}

// --- list (owner only) --------------------------------------------------------

export type InvitationStatus = "active" | "consumed" | "revoked" | "expired";

export type InvitationSummary = {
  id: string;
  targetEmail: string;
  intendedRole: InvitableRole;
  expiresAt: Date;
  status: InvitationStatus;
};

/**
 * Owner-only bounded listing. The `membersInvitations` read cell is workspace
 * scope only for WORKSPACE_OWNER; any other resolved scope fails closed —
 * including coaches (who may create CLIENT invites but cannot enumerate).
 * Never returns token hash, bound user id, or issuer identity.
 */
export async function listWorkspaceInvitations(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  client: PrismaLike = prisma,
): Promise<{ items: InvitationSummary[]; nextCursor: string | null }> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "membersInvitations",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  if (ctx.grantedScope !== "workspace")
    throw new AccessDeniedError("role_denied", "membersInvitations", "read");

  const take = normalizeLimit(input.limit);
  const where: Prisma.AccessTokenWhereInput = {
    workspaceId: input.workspaceId,
    purpose: "WORKSPACE_INVITE",
  };
  if (input.cursor) where.id = { gt: input.cursor };
  const rows = await client.accessToken.findMany({
    where,
    orderBy: { id: "asc" },
    take: take + 1,
    select: {
      id: true,
      targetEmail: true,
      intendedRole: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
    },
  });
  const now = new Date();
  const items: InvitationSummary[] = rows.slice(0, take).map((row) => ({
    id: row.id,
    targetEmail: row.targetEmail as string,
    intendedRole: row.intendedRole as InvitableRole,
    expiresAt: row.expiresAt,
    status: row.consumedAt
      ? "consumed"
      : row.revokedAt
        ? "revoked"
        : row.expiresAt <= now
          ? "expired"
          : "active",
  }));
  const nextCursor =
    rows.length > take ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}

// --- revoke (owner only) ------------------------------------------------------

/**
 * Explicit owner-only revocation. Only an active, unconsumed, unrevoked,
 * unexpired row in the exact workspace changes; every other shape returns the
 * same structural `{changed:false}`. Audit failure rolls the revocation back.
 */
export async function revokeWorkspaceInvitation(
  session: SessionLike,
  input: { workspaceId: string; invitationId: unknown },
  client: PrismaClient = prisma,
): Promise<{ changed: boolean }> {
  if (
    typeof input.workspaceId !== "string" ||
    input.workspaceId.length === 0 ||
    typeof input.invitationId !== "string" ||
    input.invitationId.length === 0
  )
    throw new InvitationError("invalid_input");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.$transaction(
        async (tx) => {
          const ctx = await authorize(
            session,
            {
              resource: "membersInvitations",
              action: "write",
              workspaceId: input.workspaceId,
            },
            createPrismaAuthorizationRepo(tx),
          );
          const now = new Date();
          const result = await tx.accessToken.updateMany({
            where: {
              id: input.invitationId as string,
              workspaceId: input.workspaceId,
              purpose: "WORKSPACE_INVITE",
              consumedAt: null,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: { revokedAt: now },
          });
          if (result.count === 0) return { changed: false };
          await writeAuditEvent(tx, ctx, {
            action: "REVOKE",
            resourceType: "access_token",
            resourceId: input.invitationId as string,
          });
          return { changed: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isRetryableConflict(error) && attempt < MAX_ATTEMPTS) continue;
      throw mapInvitationError(error);
    }
  }
  throw new InvitationError("serialization_conflict");
}

// --- accept -------------------------------------------------------------------

export type AcceptanceOutcome = "accepted" | "already_member";

export type AcceptanceResult = {
  outcome: AcceptanceOutcome;
  userId: string;
  membershipId: string;
  workspaceId: string;
};

/**
 * Accept a workspace invitation. One Serializable transaction: atomic claim →
 * workspace + issuer re-authorization → identity binding → membership/profile
 * state machine → token-user binding → audit → commit. Every token failure —
 * malformed, missing, wrong purpose/workspace, expired, revoked, consumed,
 * losing a concurrent claim — is the same structural `invalid_token`.
 *
 * Existing users must hold a session for the EXACT invited identity; new users
 * supply their own name + policy-valid password (invite possession = email
 * verification; no separate verification token).
 */
export async function acceptWorkspaceInvitation(
  session: SessionLike,
  input: {
    workspaceId: string;
    rawToken: unknown;
    name?: unknown;
    password?: unknown;
  },
  client: PrismaClient = prisma,
): Promise<AcceptanceResult> {
  if (typeof input.workspaceId !== "string" || input.workspaceId.length === 0)
    throw new InvitationError("invalid_input");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.$transaction(
        async (tx) => {
          const claim = await claimAccessToken(tx, {
            rawToken: input.rawToken,
            purpose: "WORKSPACE_INVITE",
            workspaceId: input.workspaceId,
          });
          if (!claim.ok) throw new InvitationError("invalid_token");
          const token = claim.token;
          const intendedRole = token.intendedRole as InvitableRole;

          // Re-read workspace + issuer state — the issuer must STILL be able
          // to have issued this invitation (fresh DB read at consumption).
          const workspace = await tx.workspace.findUnique({
            where: { id: token.workspaceId as string },
            select: { id: true, status: true },
          });
          if (!workspace || workspace.status !== "ACTIVE")
            throw new InvitationError("invalid_token");
          const issuer = await tx.workspaceMember.findFirst({
            where: {
              workspaceId: workspace.id,
              userId: token.createdByUserId as string,
              status: "ACTIVE",
              role: { in: [...issuerRolesFor(intendedRole)] },
            },
            select: { id: true },
          });
          if (!issuer) throw new InvitationError("invalid_token");

          const targetEmail = normalizeEmail(token.targetEmail);
          const byEmail = await tx.user.findUnique({
            where: { email: targetEmail },
            select: {
              id: true,
              email: true,
              name: true,
              status: true,
              platformRole: true,
            },
          });

          // Session identity — re-read inside this transaction, never trusted
          // from the session object alone.
          const sessionUserId = session?.user?.id ?? null;
          const sessionUser = sessionUserId
            ? await tx.user.findUnique({
                where: { id: sessionUserId },
                select: { id: true, email: true, status: true },
              })
            : null;

          let user: {
            id: string;
            name: string | null;
            platformRole: "USER" | "PLATFORM_ADMIN";
          };
          if (byEmail) {
            // Existing-user path: signed in as the exact invited identity.
            if (!sessionUser) throw new InvitationError("identity_required");
            if (sessionUser.id !== byEmail.id)
              throw new InvitationError("identity_mismatch");
            if (byEmail.status !== "ACTIVE")
              throw new InvitationError("account_ineligible");
            user = byEmail;
          } else {
            // New-user path: a session for a DIFFERENT existing identity can
            // never silently create another account under this invite.
            if (sessionUser) throw new InvitationError("identity_mismatch");
            const name = validateName(input.name);
            // Structural `password_too_short` covers missing/non-string input;
            // the existing-user path never touches `input.password`.
            const passwordHash = await hashPassword(
              validatePasswordPolicy(input.password),
            );
            user = await tx.user.create({
              data: {
                email: targetEmail,
                passwordHash,
                name,
                status: "ACTIVE",
              },
              select: { id: true, name: true, platformRole: true },
            });
          }

          // Membership state machine (workspaceId+userId is unique).
          const member = await tx.workspaceMember.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId: workspace.id,
                userId: user.id,
              },
            },
            select: { id: true, role: true, status: true, updatedAt: true },
          });
          const tokenCreatedAt = token.createdAt;
          let outcome: AcceptanceOutcome = "accepted";
          let membershipId: string;
          if (!member) {
            const created = await tx.workspaceMember.create({
              data: {
                workspaceId: workspace.id,
                userId: user.id,
                role: intendedRole,
                status: "ACTIVE",
              },
              select: { id: true },
            });
            membershipId = created.id;
          } else if (member.status === "INVITED") {
            await tx.workspaceMember.update({
              where: { id: member.id },
              data: { status: "ACTIVE", role: intendedRole },
            });
            membershipId = member.id;
          } else if (member.status === "ACTIVE") {
            if (member.role !== intendedRole)
              throw new InvitationError("membership_conflict");
            outcome = "already_member";
            membershipId = member.id;
          } else {
            // SUSPENDED/REMOVED may return to ACTIVE only through a FRESH
            // explicit re-invitation: the token must have been issued after
            // the membership's last state change. An older invite is dead.
            if (!(tokenCreatedAt > member.updatedAt))
              throw new InvitationError("invalid_token");
            await tx.workspaceMember.update({
              where: { id: member.id },
              data: { status: "ACTIVE", role: intendedRole },
            });
            membershipId = member.id;
          }

          // Exactly one profile type per invite; never overwrite an existing
          // profile's name/displayName (idempotent accept).
          if (intendedRole === "CLIENT") {
            const existing = await tx.clientProfile.findFirst({
              where: { workspaceId: workspace.id, userId: user.id },
              select: { id: true },
            });
            if (!existing) {
              const name =
                input.name !== undefined ? validateName(input.name) : user.name;
              if (!name) throw new InvitationError("invalid_input");
              await tx.clientProfile.create({
                data: { workspaceId: workspace.id, userId: user.id, name },
                select: { id: true },
              });
            }
          } else {
            const existing = await tx.coachProfile.findUnique({
              where: { workspaceMemberId: membershipId },
              select: { id: true },
            });
            if (!existing) {
              const name =
                input.name !== undefined ? validateName(input.name) : user.name;
              if (!name) throw new InvitationError("invalid_input");
              await tx.coachProfile.create({
                data: {
                  workspaceMemberId: membershipId,
                  displayName: name,
                },
                select: { id: true },
              });
            }
          }

          // Bind the consumed token to the accepting user (S1-F1 CHECK only
          // permits user_id on a consumed row).
          await tx.accessToken.update({
            where: { id: token.id },
            data: { userId: user.id },
          });
          await writeAuditEvent(
            tx,
            {
              userId: user.id,
              platformRole: user.platformRole,
              workspaceId: workspace.id,
              workspaceMemberId: membershipId,
              workspaceRole: intendedRole,
              grantedScope: "workspace",
            },
            {
              action: "CREATE",
              resourceType: "user",
              resourceId: user.id,
              meta: { targetRole: intendedRole, status: "ACTIVE" },
            },
          );
          return {
            outcome,
            userId: user.id,
            membershipId,
            workspaceId: workspace.id,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isRetryableConflict(error) && attempt < MAX_ATTEMPTS) continue;
      throw mapInvitationError(error);
    }
  }
  throw new InvitationError("serialization_conflict");
}

// --- internals ----------------------------------------------------------------

const STRUCTURAL_ERRORS = new Set([
  "InvitationError",
  "AccessDeniedError",
  "PasswordPolicyError",
  "TokenError",
  "TokenStoreError",
  "WorkspaceServiceError",
  "AuditError",
]);

/** Structural codes only — never a raw Prisma/SQL message or input echo. */
function mapInvitationError(error: unknown): never {
  if (error instanceof Error && STRUCTURAL_ERRORS.has(error.name)) throw error;
  if (isRetryableConflict(error))
    throw new InvitationError("serialization_conflict");
  throw new InvitationError("invitation_failed");
}

/**
 * Fail-closed exposure assertion. The orchestration is internal-only until the
 * routing slice adds reviewed routes/actions, real delivery configuration, and
 * rate limiting — and passes independent review. Not a no-op auditor.
 */
export function assertInvitationOrchestrationExternallyExposable(): never {
  throw new InvitationError("invitations_not_exposable");
}
