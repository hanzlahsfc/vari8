import { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { writeAuditEvent } from "../audit";
import {
  AccessDeniedError,
  authorize,
  authorizeCollection,
  type CollectionContext,
  type SessionLike,
} from "../auth/guard";
import type { WorkspaceRole } from "../auth/rbac";
import { createPrismaAuthorizationRepo, type PrismaLike } from "./access";

/**
 * S1-C guarded client-ownership and assignment services.
 *
 * Every operation authorizes through the S1-B guard first; every query includes
 * workspace scope directly in its `where`. Assignment mutations write a
 * transaction-coupled audit event (S1-E) — a failed audit write rolls the
 * mutation back. No route/UI exposes these mutations (see
 * `assertAssignmentMutationsExternallyExposable`).
 */

export const CLIENT_LIST_DEFAULT_LIMIT = 25;
export const CLIENT_LIST_MAX_LIMIT = 100;

export type ServiceErrorCode =
  | "invalid_input"
  | "client_not_accessible"
  | "member_not_eligible"
  | "assignment_not_accessible"
  | "assignment_conflict"
  | "serialization_conflict"
  | "audit_not_wired_for_external_use";

export class WorkspaceServiceError extends Error {
  constructor(readonly code: ServiceErrorCode) {
    super(code);
    this.name = "WorkspaceServiceError";
  }
}

export type ClientProfileSummary = {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AssignmentSummary = {
  id: string;
  clientProfileId: string;
  coachMemberId: string;
  role: "PRIMARY" | "COACH";
  status: "ACTIVE" | "REMOVED";
  assignedAt: Date;
};

export type AssignmentMutationResult = {
  clientProfileId: string;
  coachMemberId: string;
  role: "PRIMARY" | "COACH";
  status: "ACTIVE" | "REMOVED";
  changed: boolean;
};

const PROFILE_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ASSIGNMENT_SELECT = {
  id: true,
  clientProfileId: true,
  coachMemberId: true,
  role: true,
  status: true,
  assignedAt: true,
} as const;

// --- pure helpers (unit-testable) -------------------------------------------

export function normalizeLimit(limit?: number): number {
  if (limit === undefined) return CLIENT_LIST_DEFAULT_LIMIT;
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    throw new WorkspaceServiceError("invalid_input");
  }
  return Math.min(CLIENT_LIST_MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

export function validateName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new WorkspaceServiceError("invalid_input");
  }
  return name.trim();
}

/** Builds the client-profile `where` from the resolved collection scope. */
export function buildClientProfileWhere(
  scope: CollectionContext["grantedScope"],
  ctx: { workspaceId: string; userId: string; workspaceMemberId: string },
): Prisma.ClientProfileWhereInput {
  const base: Prisma.ClientProfileWhereInput = { workspaceId: ctx.workspaceId };
  if (scope === "workspace") return base;
  if (scope === "own") return { ...base, userId: ctx.userId };
  return {
    ...base,
    assignments: {
      some: {
        workspaceId: ctx.workspaceId,
        coachMemberId: ctx.workspaceMemberId,
        status: "ACTIVE",
      },
    },
  };
}

/** Coach-capable target rules (pure). */
export function coachTargetRoleIsEligible(
  targetRole: WorkspaceRole,
  requestedRole: "PRIMARY" | "COACH",
): boolean {
  if (targetRole === "COACH") return true;
  // SOLO-COACH-I1 (decision 111): a WORKSPACE_OWNER may act as coach —
  // eligible for PRIMARY or COACH through explicit assignment only.
  if (targetRole === "WORKSPACE_OWNER") return true;
  if (targetRole === "ASSISTANT_COACH") return requestedRole === "COACH";
  return false;
}

// SOLO-COACH-I1: `assertAssignmentMutationsExternallyExposable` was removed —
// its fail-closed-by-non-exposure intent is discharged by the reviewed
// routing slice (app/workspace/[workspaceId]/clients/[clientProfileId]/
// coaches/), whose server actions re-authorize through these services on
// every call. Assignment mutations are now legitimately externally
// reachable under the action-layer contract.

// --- internal helpers -------------------------------------------------------

function mapPrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      throw new WorkspaceServiceError("assignment_conflict");
    if (error.code === "P2034")
      throw new WorkspaceServiceError("serialization_conflict");
  }
  throw error;
}

async function requireClientInWorkspace(
  client: PrismaLike,
  workspaceId: string,
  clientProfileId: string,
) {
  const row = await client.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: { id: true },
  });
  if (!row) throw new WorkspaceServiceError("client_not_accessible");
}

async function requireEligibleTarget(
  client: PrismaLike,
  workspaceId: string,
  coachMemberId: string,
  requestedRole: "PRIMARY" | "COACH",
) {
  const member = await client.workspaceMember.findFirst({
    where: { id: coachMemberId, workspaceId },
    select: {
      id: true,
      role: true,
      status: true,
      user: { select: { status: true } },
    },
  });
  if (
    !member ||
    member.status !== "ACTIVE" ||
    member.user.status !== "ACTIVE"
  ) {
    throw new WorkspaceServiceError("member_not_eligible");
  }
  if (!coachTargetRoleIsEligible(member.role, requestedRole)) {
    throw new WorkspaceServiceError("member_not_eligible");
  }
}

async function assertNoOtherActivePrimary(
  client: PrismaLike,
  workspaceId: string,
  clientProfileId: string,
  exceptMemberId: string,
) {
  const other = await client.clientAssignment.findFirst({
    where: {
      workspaceId,
      clientProfileId,
      role: "PRIMARY",
      status: "ACTIVE",
      coachMemberId: { not: exceptMemberId },
    },
    select: { id: true },
  });
  if (other) throw new WorkspaceServiceError("assignment_conflict");
}

// --- client profile services ------------------------------------------------

export async function listAccessibleClientProfiles(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  client: PrismaClient = prisma,
): Promise<{ items: ClientProfileSummary[]; nextCursor: string | null }> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "clientProfiles",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const take = normalizeLimit(input.limit);
  const where: Prisma.ClientProfileWhereInput = buildClientProfileWhere(
    ctx.grantedScope,
    {
      workspaceId: input.workspaceId,
      userId: ctx.userId,
      workspaceMemberId: ctx.workspaceMemberId,
    },
  );
  if (input.cursor) where.id = { gt: input.cursor };
  const rows = await client.clientProfile.findMany({
    where,
    orderBy: { id: "asc" },
    take: take + 1,
    select: PROFILE_SELECT,
  });
  const items = rows.slice(0, take);
  const nextCursor =
    rows.length > take ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}

export async function readClientProfile(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  client: PrismaClient = prisma,
): Promise<ClientProfileSummary> {
  await authorize(
    session,
    {
      resource: "clientProfiles",
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const row = await client.clientProfile.findFirst({
    where: { id: input.clientProfileId, workspaceId: input.workspaceId },
    select: PROFILE_SELECT,
  });
  if (!row) throw new WorkspaceServiceError("client_not_accessible");
  return row;
}

export async function createClientProfile(
  session: SessionLike,
  input: { workspaceId: string; name: unknown },
  client: PrismaClient = prisma,
): Promise<ClientProfileSummary> {
  const name = validateName(input.name);
  // Authorization + mutation in one Serializable transaction (no TOCTOU window).
  return client.$transaction(
    async (tx) => {
      await authorize(
        session,
        {
          resource: "clientProfiles",
          action: "write",
          workspaceId: input.workspaceId,
        },
        createPrismaAuthorizationRepo(tx),
      );
      return tx.clientProfile.create({
        data: { workspaceId: input.workspaceId, name },
        select: PROFILE_SELECT,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateClientProfileName(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string; name: unknown },
  client: PrismaClient = prisma,
): Promise<ClientProfileSummary> {
  const name = validateName(input.name);
  return client.$transaction(
    async (tx) => {
      await authorize(
        session,
        {
          resource: "clientProfiles",
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        },
        createPrismaAuthorizationRepo(tx),
      );
      // Only `name` is writable; workspace predicate prevents cross-workspace writes.
      const result = await tx.clientProfile.updateMany({
        where: { id: input.clientProfileId, workspaceId: input.workspaceId },
        data: { name },
      });
      if (result.count === 0)
        throw new WorkspaceServiceError("client_not_accessible");
      const row = await tx.clientProfile.findFirst({
        where: { id: input.clientProfileId, workspaceId: input.workspaceId },
        select: PROFILE_SELECT,
      });
      if (!row) throw new WorkspaceServiceError("client_not_accessible");
      return row;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

// --- assignment services ----------------------------------------------------

export async function listClientAssignments(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    limit?: number;
    cursor?: string;
  },
  client: PrismaClient = prisma,
): Promise<{ items: AssignmentSummary[]; nextCursor: string | null }> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "clientAssignments",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  // Assignments are owner-only; fail closed on any non-workspace collection scope.
  if (ctx.grantedScope !== "workspace") {
    throw new AccessDeniedError("role_denied", "clientAssignments", "read");
  }
  const take = normalizeLimit(input.limit);
  const where: Prisma.ClientAssignmentWhereInput = {
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
  };
  if (input.cursor) where.id = { gt: input.cursor };
  const rows = await client.clientAssignment.findMany({
    where,
    orderBy: { id: "asc" },
    take: take + 1,
    select: ASSIGNMENT_SELECT,
  });
  const items = rows.slice(0, take);
  const nextCursor =
    rows.length > take ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}

/**
 * SOLO-COACH-I1 (decision 111): bounded eligible-member listing for the
 * owner-managed assignment selector. Owner-only — gated on the same
 * `clientAssignments` read scope as `listClientAssignments` (which is
 * workspace-scope-only), so SUPPORT/CLIENT/non-member/inactive/cross-
 * workspace and dual-role PLATFORM_ADMIN callers all deny. Returns the
 * minimum selector payload — member id, display name, membership role —
 * for ACTIVE members whose role `coachTargetRoleIsEligible` admits for at
 * least one assignment role (WORKSPACE_OWNER, COACH, ASSISTANT_COACH;
 * SUPPORT and CLIENT are never assignable and never listed).
 */
export async function listAssignableCoachMembers(
  session: SessionLike,
  input: { workspaceId: string },
  client: PrismaClient = prisma,
): Promise<{ memberId: string; displayName: string; role: WorkspaceRole }[]> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "clientAssignments",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  if (ctx.grantedScope !== "workspace") {
    throw new AccessDeniedError("role_denied", "clientAssignments", "read");
  }
  const rows = await client.workspaceMember.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: "ACTIVE",
      role: { in: ["WORKSPACE_OWNER", "COACH", "ASSISTANT_COACH"] },
      user: { status: "ACTIVE" },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      role: true,
      user: { select: { name: true, email: true } },
    },
  });
  return rows.map((row) => ({
    memberId: row.id,
    displayName: row.user.name ?? row.user.email,
    role: row.role,
  }));
}

export async function assignCoach(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    coachMemberId: string;
    role?: "PRIMARY" | "COACH";
  },
  client: PrismaClient = prisma,
): Promise<AssignmentMutationResult> {
  const role = input.role ?? "COACH";
  if (role !== "PRIMARY" && role !== "COACH")
    throw new WorkspaceServiceError("invalid_input");
  try {
    return await client.$transaction(
      async (tx) => {
        const context = await authorize(
          session,
          {
            resource: "clientAssignments",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        await requireClientInWorkspace(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        await requireEligibleTarget(
          tx,
          input.workspaceId,
          input.coachMemberId,
          role,
        );

        const existing = await tx.clientAssignment.findUnique({
          where: {
            clientProfileId_coachMemberId: {
              clientProfileId: input.clientProfileId,
              coachMemberId: input.coachMemberId,
            },
          },
          select: { id: true, role: true, status: true },
        });

        if (!existing) {
          if (role === "PRIMARY") {
            await assertNoOtherActivePrimary(
              tx,
              input.workspaceId,
              input.clientProfileId,
              input.coachMemberId,
            );
          }
          const created = await tx.clientAssignment.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              coachMemberId: input.coachMemberId,
              role,
              status: "ACTIVE",
            },
            select: ASSIGNMENT_SELECT,
          });
          await writeAuditEvent(tx, context, {
            action: "ASSIGN",
            resourceType: "client_assignment",
            resourceId: created.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { role, status: "ACTIVE" },
          });
          return { ...toMutationResult(created), changed: true };
        }

        if (existing.status === "ACTIVE" && existing.role === role) {
          return {
            clientProfileId: input.clientProfileId,
            coachMemberId: input.coachMemberId,
            role,
            status: "ACTIVE" as const,
            changed: false,
          };
        }
        if (role === "PRIMARY") {
          await assertNoOtherActivePrimary(
            tx,
            input.workspaceId,
            input.clientProfileId,
            input.coachMemberId,
          );
        }
        const updated = await tx.clientAssignment.update({
          where: { id: existing.id },
          data: { role, status: "ACTIVE" },
          select: ASSIGNMENT_SELECT,
        });
        await writeAuditEvent(tx, context, {
          action: "ASSIGN",
          resourceType: "client_assignment",
          resourceId: updated.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { role, status: "ACTIVE" },
        });
        return { ...toMutationResult(updated), changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function setPrimaryCoach(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    coachMemberId: string;
  },
  client: PrismaClient = prisma,
): Promise<AssignmentMutationResult> {
  try {
    return await client.$transaction(
      async (tx) => {
        const context = await authorize(
          session,
          {
            resource: "clientAssignments",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        await requireClientInWorkspace(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        await requireEligibleTarget(
          tx,
          input.workspaceId,
          input.coachMemberId,
          "PRIMARY",
        );

        const existing = await tx.clientAssignment.findUnique({
          where: {
            clientProfileId_coachMemberId: {
              clientProfileId: input.clientProfileId,
              coachMemberId: input.coachMemberId,
            },
          },
          select: ASSIGNMENT_SELECT,
        });

        // No-op fast path: the requested coach is already PRIMARY+ACTIVE. The
        // `client_assignment_one_active_primary_key` partial unique index
        // guarantees no other ACTIVE PRIMARY can exist for this client, so no
        // state change is possible — return changed:false, write no audit
        // event, and skip the writes entirely (an update writing identical
        // values is not a state change).
        if (existing?.status === "ACTIVE" && existing.role === "PRIMARY") {
          return { ...toMutationResult(existing), changed: false };
        }

        // Demote the current different ACTIVE PRIMARY (to COACH, still active).
        await tx.clientAssignment.updateMany({
          where: {
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
            role: "PRIMARY",
            status: "ACTIVE",
            coachMemberId: { not: input.coachMemberId },
          },
          data: { role: "COACH" },
        });

        const row = existing
          ? await tx.clientAssignment.update({
              where: { id: existing.id },
              data: { role: "PRIMARY", status: "ACTIVE" },
              select: ASSIGNMENT_SELECT,
            })
          : await tx.clientAssignment.create({
              data: {
                workspaceId: input.workspaceId,
                clientProfileId: input.clientProfileId,
                coachMemberId: input.coachMemberId,
                role: "PRIMARY",
                status: "ACTIVE",
              },
              select: ASSIGNMENT_SELECT,
            });
        await writeAuditEvent(tx, context, {
          action: "UPDATE",
          resourceType: "client_assignment",
          resourceId: row.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { role: "PRIMARY", status: "ACTIVE" },
        });
        return { ...toMutationResult(row), changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function removeClientAssignment(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    coachMemberId: string;
  },
  client: PrismaClient = prisma,
): Promise<AssignmentMutationResult> {
  try {
    return await client.$transaction(
      async (tx) => {
        const context = await authorize(
          session,
          {
            resource: "clientAssignments",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        await requireClientInWorkspace(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        const existing = await tx.clientAssignment.findUnique({
          where: {
            clientProfileId_coachMemberId: {
              clientProfileId: input.clientProfileId,
              coachMemberId: input.coachMemberId,
            },
          },
          select: { id: true, role: true, status: true },
        });
        if (!existing)
          throw new WorkspaceServiceError("assignment_not_accessible");
        if (existing.status === "REMOVED") {
          return {
            clientProfileId: input.clientProfileId,
            coachMemberId: input.coachMemberId,
            role: existing.role,
            status: "REMOVED" as const,
            changed: false,
          };
        }
        const updated = await tx.clientAssignment.update({
          where: { id: existing.id },
          data: { status: "REMOVED" },
          select: ASSIGNMENT_SELECT,
        });
        await writeAuditEvent(tx, context, {
          action: "UPDATE",
          resourceType: "client_assignment",
          resourceId: updated.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { role: updated.role, status: "REMOVED" },
        });
        return { ...toMutationResult(updated), changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    mapPrismaError(error);
  }
}

function toMutationResult(
  row: AssignmentSummary,
): Omit<AssignmentMutationResult, "changed"> {
  return {
    clientProfileId: row.clientProfileId,
    coachMemberId: row.coachMemberId,
    role: row.role,
    status: row.status,
  };
}
