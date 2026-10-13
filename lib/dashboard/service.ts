/**
 * DASHBOARD-I1 (decision 108): persisted coach-configured client
 * dashboard layouts. Config-only storage; the reviewed protocol:
 * `cdash:{ws}:{client}` advisory BEFORE `member:{ws}:{user}` (the
 * client-scoped-then-member convention — same slot as chkin/csetup),
 * member FOR UPDATE, in-tx authorize, assigned path re-resolves +
 * FOR UPDATEs the ACTIVE ClientAssignment, profile FOR UPDATE,
 * bounded validation, atomic revision CAS, structural WRITE audit
 * only on real change.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { AccessDeniedError, authorize } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import {
  validateDashboardConfig,
  projectClientDashboardConfig,
  canonicalizeDashboardConfig,
  type DashboardConfig,
} from "./config-schema";

export class DashboardError extends Error {
  constructor(
    public code:
      "invalid_input" | "not_available" | "conflict" | "serialization_conflict",
    message?: string,
  ) {
    super(message ?? code);
  }
}

type SessionLike = { user?: { id?: string } } | null | undefined;
export type DashboardDeps = { db?: PrismaLike };

type PrismaLike = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRawUnsafe"
  | "$executeRawUnsafe"
  | "clientDashboardLayout"
  | "clientProfile"
  | "workspaceMember"
  | "clientAssignment"
  | "auditEvent"
  | "user"
  | "workspace"
>;

const MAX_ATTEMPTS = 3;

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < MAX_ATTEMPTS
      )
        continue;
      throw error;
    }
  }
  throw new DashboardError("serialization_conflict");
}

async function advisoryLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    key,
  );
}

type LockedMember = { id: string; role: string; status: string };

async function lockMember(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
): Promise<LockedMember | null> {
  const rows = await tx.$queryRawUnsafe<LockedMember[]>(
    `SELECT id, role, status FROM "workspace_member"
     WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE`,
    workspaceId,
    userId,
  );
  return rows[0] ?? null;
}

/**
 * cdash advisory (client-scoped, pre-member slot) → member advisory →
 * member FOR UPDATE → in-transaction authorize. Shared by read+write.
 */
async function lockedAuthorize(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  request: {
    action: "read" | "write";
    workspaceId: string;
    clientProfileId: string;
  },
) {
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError(
      "unauthenticated",
      "clientDashboards",
      request.action,
    );
  await advisoryLock(
    tx,
    `cdash:${request.workspaceId}:${request.clientProfileId}`,
  );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const member = await lockMember(tx, request.workspaceId, userId);
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "clientDashboards",
      request.action,
    );
  const ctx = await authorize(
    session,
    {
      resource: "clientDashboards",
      action: request.action,
      workspaceId: request.workspaceId,
      clientProfileId: request.clientProfileId,
    },
    createPrismaAuthorizationRepo(tx),
  );
  if (ctx.workspaceMemberId !== member.id)
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "clientDashboards",
      request.action,
    );
  return { ctx, member, userId };
}

async function lockAssignmentForScope(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  memberId: string,
): Promise<void> {
  const resolved = await tx.clientAssignment.findFirst({
    where: {
      workspaceId,
      clientProfileId,
      coachMemberId: memberId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!resolved)
    throw new AccessDeniedError("not_assigned", "clientDashboards", "write");
  const rows = await tx.$queryRawUnsafe<{ status: string }[]>(
    `SELECT status FROM "client_assignment"
     WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
       AND coach_member_id = $4 FOR UPDATE`,
    resolved.id,
    workspaceId,
    clientProfileId,
    memberId,
  );
  if (!rows[0] || rows[0].status !== "ACTIVE")
    throw new AccessDeniedError("not_assigned", "clientDashboards", "write");
}

async function lockProfile(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<void> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "client_profile"
     WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    clientProfileId,
    workspaceId,
  );
  if (!rows[0])
    throw new AccessDeniedError(
      "client_outside_workspace",
      "clientDashboards",
      "write",
    );
}

export type StaffDashboardLayout = {
  layoutId: string;
  revision: number;
  configVersion: number;
  config: DashboardConfig;
  updatedByMemberId: string | null;
  updatedAt: string;
};

type LayoutRow = {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  config: unknown;
  configVersion: number;
  revision: number;
  updatedByMemberId: string | null;
  updatedAt: Date;
};

function parseRow(row: LayoutRow): StaffDashboardLayout {
  const validated = validateDashboardConfig(row.config);
  if (!validated.ok)
    throw new DashboardError("invalid_input", validated.reason);
  return {
    layoutId: row.id,
    revision: row.revision,
    configVersion: row.configVersion,
    config: validated.config,
    updatedByMemberId: row.updatedByMemberId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Staff read — full config (headers only; no widget data). */
export async function readStaffDashboardLayout(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: DashboardDeps = {},
): Promise<{ layout: StaffDashboardLayout | null }> {
  const db = deps.db ?? prisma;
  return db.$transaction(async (tx) => {
    const { ctx } = await lockedAuthorize(tx, session, {
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    });
    if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
      throw new AccessDeniedError("role_denied", "clientDashboards", "read");
    const row = await tx.clientDashboardLayout.findUnique({
      where: {
        workspaceId_clientProfileId: {
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        },
      },
    });
    return { layout: row ? parseRow(row as unknown as LayoutRow) : null };
  });
}

/**
 * Client read — own-profile rebinding, own scope, then the
 * server-filtered subset (staff widgets/settings/rects removed,
 * geometry reconciled; provenance excluded).
 */
export async function readOwnDashboardLayout(
  session: SessionLike,
  input: { workspaceId: string },
  deps: DashboardDeps = {},
): Promise<{
  layout: Omit<
    StaffDashboardLayout,
    "updatedByMemberId" | "configVersion" | "revision"
  > | null;
}> {
  const db = deps.db ?? prisma;
  return db.$transaction(async (tx) => {
    const userId = session?.user?.id;
    if (typeof userId !== "string" || userId.length === 0)
      throw new AccessDeniedError(
        "unauthenticated",
        "clientDashboards",
        "read",
      );
    const profile = await tx.clientProfile.findFirst({
      where: { workspaceId: input.workspaceId, userId },
      select: { id: true },
    });
    if (!profile)
      throw new AccessDeniedError("not_owner", "clientDashboards", "read");
    const { ctx } = await lockedAuthorize(tx, session, {
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: profile.id,
    });
    if (ctx.grantedScope !== "own")
      throw new AccessDeniedError("role_denied", "clientDashboards", "read");
    const row = await tx.clientDashboardLayout.findUnique({
      where: {
        workspaceId_clientProfileId: {
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        },
      },
    });
    if (!row) return { layout: null };
    const parsed = parseRow(row as unknown as LayoutRow);
    return {
      layout: {
        layoutId: parsed.layoutId,
        config: projectClientDashboardConfig(parsed.config),
        updatedAt: parsed.updatedAt,
      },
    };
  });
}

export type UpdateDashboardInput = {
  workspaceId: string;
  clientProfileId: string;
  config: unknown;
  expectedRevision: number;
};

/**
 * Atomic CAS save. `expectedRevision` guards against concurrent coaches;
 * a byte-identical canonical config is a no-op (no write, no audit).
 */
export async function updateClientDashboardLayout(
  session: SessionLike,
  input: UpdateDashboardInput,
  deps: DashboardDeps = {},
): Promise<{ revision: number; config: DashboardConfig }> {
  const db = deps.db ?? prisma;
  const validated = validateDashboardConfig(input.config);
  if (!validated.ok)
    throw new DashboardError("invalid_input", validated.reason);
  const canonical = canonicalizeDashboardConfig(validated.config);
  if (canonical.length > 24 * 1024)
    throw new DashboardError("invalid_input", "payload_too_large");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, member } = await lockedAuthorize(tx, session, {
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        if (ctx.grantedScope === "assigned")
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
          );
        else if (ctx.grantedScope !== "workspace")
          throw new AccessDeniedError(
            "role_denied",
            "clientDashboards",
            "write",
          );
        await lockProfile(tx, input.workspaceId, input.clientProfileId);

        const existing = await tx.clientDashboardLayout.findUnique({
          where: {
            workspaceId_clientProfileId: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
          },
        });
        const currentRevision = existing?.revision ?? 0;
        if (input.expectedRevision !== currentRevision)
          throw new DashboardError("conflict");

        // Truthful no-op: canonical-equal content writes nothing.
        if (existing) {
          const current = parseRow(existing as unknown as LayoutRow);
          if (canonicalizeDashboardConfig(current.config) === canonical)
            return { revision: current.revision, config: current.config };
        }

        const configJson = JSON.parse(canonical) as Prisma.InputJsonValue;
        let row;
        if (!existing) {
          row = await tx.clientDashboardLayout.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              config: configJson,
              revision: 1,
              updatedByMemberId: member.id,
            },
          });
        } else {
          row = await tx.clientDashboardLayout.update({
            where: { id: existing.id },
            data: {
              config: configJson,
              revision: { increment: 1 },
              updatedByMemberId: member.id,
            },
          });
        }

        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "client_dashboard_layout",
          resourceId: row.id,
          subjectClientProfileId: input.clientProfileId,
          meta: {
            changed: true,
            count: validated.config.widgets.length,
          },
        });
        return {
          revision: row.revision,
          config: parseRow(row as unknown as LayoutRow).config,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
