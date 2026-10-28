import { Prisma, PrismaClient } from "@prisma/client";

import { writeAuditEvent } from "../audit";
import {
  AccessDeniedError,
  authorize,
  authorizeCollection,
  type SessionLike,
} from "../auth/guard";
import { normalizeEmail } from "../email";
import { mailDeliveryConfigured } from "../mail";
import { hashPassword } from "../password";
import { validatePasswordSetup } from "../password-policy";
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
 *   SUSPENDED/REMOVED members. Under owner ruling O6 (2026-10-20) acceptance
 *   creates only the user account and the membership for a CLIENT invite —
 *   the submitted onboarding form creates the client record, so no
 *   `ClientProfile` is written here. Staff invites still create the
 *   `CoachProfile` on acceptance.
 *
 * The raw token leaves the service exactly once — inside the
 * `InvitationDeliveryPayload` returned after commit. It is never stored,
 * logged, audited, or included in errors. PR-SV4 routed create/list/revoke
 * through `/api/v1` (`lib/workspace/invitation-api.ts`); the exposure gate
 * `assertInvitationOrchestrationExternallyExposable` still fails closed —
 * it throws while no mail delivery adapter is registered.
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

function normalizedEmail(value: unknown): string {
  const email = normalizeEmail(value);
  if (!email || email.length > MAX_TARGET_EMAIL_LENGTH)
    throw new InvitationError("invalid_input");
  return email;
}

/**
 * Expected acceptance races — the ONLY P2002 shapes that may be retried.
 * Pinned against observed Prisma metadata (raw column-name targets):
 *   User            ["email"]                       concurrent user create
 *   WorkspaceMember ["workspace_id","user_id"]      concurrent member create
 *   ClientProfile   ["workspace_id","user_id"]      concurrent client profile
 *   CoachProfile    ["workspace_member_id"]         concurrent coach profile
 * Any other P2002 (e.g. AccessToken.token_hash, unknown/missing/malformed
 * metadata) is NOT a serialization artifact — it maps to `invitation_failed`.
 */
const EXPECTED_P2002: ReadonlyArray<{ model: string; target: string[] }> = [
  { model: "User", target: ["email"] },
  { model: "WorkspaceMember", target: ["workspace_id", "user_id"] },
  { model: "ClientProfile", target: ["workspace_id", "user_id"] },
  { model: "CoachProfile", target: ["workspace_member_id"] },
];

/** Exported for unit tests pinning observed Prisma P2002 metadata. */
export function isExpectedUniqueRace(
  error: Prisma.PrismaClientKnownRequestError,
) {
  const meta = error.meta;
  if (
    !meta ||
    typeof meta.modelName !== "string" ||
    !Array.isArray(meta.target)
  )
    return false;
  const keys = Object.keys(meta).sort();
  if (keys.join(",") !== "modelName,target") return false;
  const target = meta.target;
  return EXPECTED_P2002.some(
    ({ model, target: expected }) =>
      meta.modelName === model &&
      target.length === expected.length &&
      expected.every((t, i) => target[i] === t),
  );
}

/** SQLSTATEs that are genuine serialization artifacts when surfaced through
 * raw SQL (Prisma wraps those as P2010 rather than P2034). */
const RAW_SERIALIZATION_SQLSTATES = new Set(["40001", "40P01"]);

function isSerializationFailure(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
  if (error.code === "P2034") return true;
  // Raw-query path: serialization failure / deadlock arrive as P2010.
  if (error.code === "P2010") {
    const meta = error.meta;
    return (
      !!meta &&
      typeof meta === "object" &&
      typeof (meta as { code?: unknown }).code === "string" &&
      RAW_SERIALIZATION_SQLSTATES.has((meta as { code: string }).code)
    );
  }
  return false;
}

function isRetryableConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (isSerializationFailure(error)) return true;
  return error.code === "P2002" && isExpectedUniqueRace(error);
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
          const repo = createPrismaAuthorizationRepo(tx);
          const authReq = {
            resource,
            action: "write" as const,
            workspaceId: input.workspaceId,
          };
          // 1. Authorize BEFORE acquiring the tuple lock — an unauthorized
          //    caller must never wait on or hold the lock.
          const ctx = await authorize(session, authReq, repo);
          // 2. Serialize concurrent replacements of the same tuple
          //    deterministically (transaction-scoped advisory lock).
          await tx.$executeRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            `${input.workspaceId}|${targetEmail}|${intendedRole}`,
          );
          // 3. Post-lock freshness barrier. Under Serializable the tx
          //    snapshot is fixed at first read, so a plain re-authorize can
          //    miss a revocation committed while we waited on the advisory
          //    lock. Take a row lock on EVERY authorization row — actor user,
          //    workspace, actor membership — in this fixed global order (the
          //    only multi-row locking order in the codebase; single-row
          //    writers cannot form a deadlock cycle with it). A concurrent
          //    committed change to any of them forces 40001 (P2010 → bounded
          //    retry → fresh snapshot → deny); an unchanged row returns our
          //    snapshot version; a missing row is impossible to authorize.
          //    THEN the real guard re-runs on visible-current state.
          const actorUserId = ctx.userId;
          await tx.$queryRawUnsafe(
            `SELECT "id" FROM "users" WHERE "id" = $1 FOR UPDATE`,
            actorUserId,
          );
          await tx.$queryRawUnsafe(
            `SELECT "id" FROM "workspace" WHERE "id" = $1 FOR UPDATE`,
            input.workspaceId,
          );
          await tx.$queryRawUnsafe(
            `SELECT "id" FROM "workspace_member"
             WHERE "workspace_id" = $1 AND "user_id" = $2 FOR UPDATE`,
            input.workspaceId,
            actorUserId,
          );
          await authorize(session, authReq, repo);
          // 4. Snapshot the target membership's CURRENT state generation
          //    inside this serialized tx — causal freshness, no clocks.
          const targetUser = await tx.user.findUnique({
            where: { email: targetEmail },
            select: { id: true },
          });
          const targetMember = targetUser
            ? await tx.workspaceMember.findUnique({
                where: {
                  workspaceId_userId: {
                    workspaceId: input.workspaceId,
                    userId: targetUser.id,
                  },
                },
                select: { stateVersion: true },
              })
            : null;
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
            targetMemberStateVersion: targetMember?.stateVersion ?? null,
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

          // Issuer re-authorization through the REVIEWED S1-B guard + the
          // transaction-bound repo — the issuer must still be able to issue
          // this exact invitation type right now (user ACTIVE, workspace
          // ACTIVE, membership ACTIVE, current role grants the resource).
          // Any denial/failure maps to the generic invalid_token surface so
          // token holders cannot inspect issuer state.
          const issuerId = token.createdByUserId;
          if (typeof issuerId !== "string" || issuerId.length === 0)
            throw new InvitationError("invalid_token");
          try {
            await authorize(
              { user: { id: issuerId } },
              {
                resource: invitationResource(intendedRole),
                action: "write",
                workspaceId: input.workspaceId,
              },
              createPrismaAuthorizationRepo(tx),
            );
          } catch {
            throw new InvitationError("invalid_token");
          }
          // The claim constrained the token to input.workspaceId; the guard's
          // workspace re-read above is the ACTIVE check.
          const workspace = { id: input.workspaceId };

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
            // Invite password setup uses the confirmed stricter policy (≥10
            // chars + ≥1 digit); structural codes cover missing/non-string
            // input. The existing-user path never touches `input.password`.
            const passwordHash = await hashPassword(
              validatePasswordSetup(input.password),
            );
            user = await tx.user.create({
              data: {
                email: targetEmail,
                passwordHash,
                name,
                status: "ACTIVE",
                // PR-05: invite acceptance counts as email verification (#20) —
                // the link reached the invited mailbox.
                emailVerified: true,
              },
              select: { id: true, name: true, platformRole: true },
            });
            // PR-05: Better Auth authenticates against the credential account
            // row (providerId "credential", accountId = user id), carrying the
            // same scrypt hash.
            await tx.account.create({
              data: {
                userId: user.id,
                accountId: user.id,
                providerId: "credential",
                password: passwordHash,
              },
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
            select: { id: true, role: true, status: true, stateVersion: true },
          });
          // CAUSAL freshness — no clocks. The invitation carries the
          // membership generation snapshot taken at issuance (NULL = the
          // member row did not exist then). If the member's current
          // state_version differs — a status/role transition happened since —
          // the invitation is stale and dies as `invalid_token`. This applies
          // to every existing-member branch, so a pre-suspension invite can
          // never restore and a pre-activation invite can't activate a member
          // that was re-shaped meanwhile.
          const snapshot = token.targetMemberStateVersion;
          if (member) {
            if (snapshot !== member.stateVersion)
              throw new InvitationError("invalid_token");
          } else if (snapshot !== null) {
            throw new InvitationError("invalid_token");
          }

          // Profile coherence gate — checked BEFORE any membership mutation.
          // A role-class change may never produce a member holding an
          // incompatible opposite-class profile, and both profile types may
          // never coexist (no deletion/migration policy is approved).
          const clientProfile = await tx.clientProfile.findFirst({
            where: { workspaceId: workspace.id, userId: user.id },
            select: { id: true },
          });
          const coachProfile = member
            ? await tx.coachProfile.findUnique({
                where: { workspaceMemberId: member.id },
                select: { id: true },
              })
            : null;
          if (intendedRole === "CLIENT" ? coachProfile : clientProfile)
            throw new InvitationError("membership_conflict");

          let acceptedAs:
            | "NEW_USER"
            | "JOINED"
            | "ALREADY_MEMBER"
            | "ACTIVATED"
            | "RESTORED" = byEmail === null ? "NEW_USER" : "JOINED";
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
            acceptedAs = "ACTIVATED";
          } else if (member.status === "ACTIVE") {
            if (member.role !== intendedRole)
              throw new InvitationError("membership_conflict");
            outcome = "already_member";
            acceptedAs = "ALREADY_MEMBER";
            membershipId = member.id;
          } else {
            // SUSPENDED/REMOVED: the snapshot check above already proves this
            // invitation was issued at the member's CURRENT generation — i.e.
            // a fresh explicit re-invitation after the state change.
            await tx.workspaceMember.update({
              where: { id: member.id },
              data: { status: "ACTIVE", role: intendedRole },
            });
            membershipId = member.id;
            acceptedAs = "RESTORED";
          }

          // Ensure at most one coherent profile type. O6 (owner, 2026-10-20):
          // for a CLIENT invite acceptance creates NO ClientProfile — the
          // submitted onboarding form creates the client record. Staff
          // invites still create the CoachProfile on acceptance; never
          // overwrite an existing displayName (idempotent accept).
          if (intendedRole !== "CLIENT" && !coachProfile) {
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

          // Bind the consumed token to the accepting user (S1-F1 CHECK only
          // permits user_id on a consumed row).
          await tx.accessToken.update({
            where: { id: token.id },
            data: { userId: user.id },
          });
          // Truthful acceptance event: the consumed invitation is the
          // resource; the accepted user (DB-derived) is the actor; meta names
          // only the structural outcome — never names/emails/tokens.
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
              action: "INVITE",
              resourceType: "access_token",
              resourceId: token.id,
              meta: { targetRole: intendedRole, acceptedAs },
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
  // Retries exhausted: only genuine serialization failures earn this code.
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    isSerializationFailure(error)
  )
    throw new InvitationError("serialization_conflict");
  // Unrelated P2002 (incl. unknown/missing metadata) and every other database
  // failure map to the accurate generic structural code.
  throw new InvitationError("invitation_failed");
}

/**
 * Fail-closed exposure gate. The PR-SV4 routing slice added the reviewed
 * `/api/v1` routes, the PR-05 mail delivery port and a per-issuer rate
 * limit. What remains fail-closed is delivery configuration: while no mail
 * adapter is registered (production without `MAIL_DELIVERY_ADAPTER`), the
 * create path must refuse — an invitation that cannot be delivered is never
 * minted. Not a no-op auditor: the API boundary calls this before creating.
 */
export function assertInvitationOrchestrationExternallyExposable(): void {
  if (!mailDeliveryConfigured()) {
    throw new InvitationError("invitations_not_exposable");
  }
}
