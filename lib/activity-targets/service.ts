/**
 * Issue #169 (Stage 5 card 07): day-effective activity target versions.
 * Reviewed protocol: `atarget:{ws}:{client}` advisory BEFORE
 * `member:{ws}:{user}` (same slot convention as ctask), member FOR UPDATE,
 * in-tx authorize. Writes run the pure planner (model.ts) inside the
 * transaction: a same-day row turns the write into an in-place replace that
 * needs the confirm flag and bumps the revision; earlier days are never
 * rewritten. Management requires workspace|assigned scope; own reads
 * require grantedScope === "own" AND the caller's own client profile.
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import { writeAuditEvent } from "../audit";
import { AccessDeniedError, authorize } from "../auth/guard";
import {
  prisma,
  withSerializedRetry as sharedWithSerializedRetry,
} from "../db";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import {
  type ActivityMetric,
  type ActivityTargetKind,
  type ActivityTargetRow,
  type ActivityTargetWrite,
  isActivityMetric,
  isLocalCalendarDate,
  planActivityTargetWrite,
} from "./model";

export class ActivityTargetError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "confirmation_required"
      | "conflict"
      | "serialization_conflict",
    message?: string,
  ) {
    super(message ?? code);
  }
}

type SessionLike = { user?: { id?: string } } | null | undefined;

type PrismaLike = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRawUnsafe"
  | "$executeRawUnsafe"
  | "activityTarget"
  | "clientProfile"
  | "workspaceMember"
  | "clientAssignment"
  | "auditEvent"
  | "user"
  | "workspace"
>;

export type ActivityTargetDeps = { db?: PrismaLike };

const MAX_ATTEMPTS = 3;
const RESOURCE = "activityTargets";

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: MAX_ATTEMPTS,
    onExhausted: () => new ActivityTargetError("serialization_conflict"),
  });
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
    throw new AccessDeniedError("unauthenticated", RESOURCE, request.action);
  await advisoryLock(
    tx,
    `atarget:${request.workspaceId}:${request.clientProfileId}`,
  );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const member = await lockMember(tx, request.workspaceId, userId);
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      RESOURCE,
      request.action,
    );
  const ctx = await authorize(
    session,
    {
      resource: RESOURCE,
      action: request.action,
      workspaceId: request.workspaceId,
      clientProfileId: request.clientProfileId,
    },
    createPrismaAuthorizationRepo(tx),
  );
  if (ctx.workspaceMemberId !== member.id)
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      RESOURCE,
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
  if (!resolved) throw new AccessDeniedError("not_assigned", RESOURCE, "write");
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
    throw new AccessDeniedError("not_assigned", RESOURCE, "write");
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
    throw new AccessDeniedError("client_outside_workspace", RESOURCE, "write");
}

/* ---------------- views ---------------- */

export type ActivityTargetVersionView = {
  id: string;
  metric: ActivityMetric;
  kind: ActivityTargetKind | null;
  stepMin: number | null;
  stepMax: number | null;
  sessionsPerWeek: number | null;
  minutesPerSession: number | null;
  effectiveFrom: string;
  stoppedAt: string | null;
  revision: number;
};

export type ActivityTargetsView = {
  clientProfileId: string;
  versions: ActivityTargetVersionView[];
};

type StoredRow = {
  id: string;
  metric: string;
  kind: ActivityTargetKind | null;
  stepMin: number | null;
  stepMax: number | null;
  sessionsPerWeek: number | null;
  minutesPerSession: Prisma.Decimal | number | null;
  effectiveFrom: Date;
  stoppedAt: Date | null;
  revision: number;
};

const toRow = (row: StoredRow): ActivityTargetRow => ({
  id: row.id,
  metric: row.metric as ActivityMetric,
  kind: row.kind,
  stepMin: row.stepMin,
  stepMax: row.stepMax,
  sessionsPerWeek: row.sessionsPerWeek,
  minutesPerSession:
    row.minutesPerSession === null ? null : Number(row.minutesPerSession),
  effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
  revision: row.revision,
});

const toView = (row: StoredRow): ActivityTargetVersionView => ({
  ...toRow(row),
  stoppedAt: row.stoppedAt?.toISOString() ?? null,
});

async function listVersions(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<ActivityTargetVersionView[]> {
  const rows = (await tx.activityTarget.findMany({
    where: { workspaceId, clientProfileId },
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
  })) as unknown as StoredRow[];
  return rows.map(toView);
}

/* ---------------- reads ---------------- */

/** Staff read: a client's versions for the coach editor and timeline. */
export async function readStaffActivityTargets(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: ActivityTargetDeps = {},
): Promise<ActivityTargetsView> {
  const db = deps.db ?? prisma;
  return db.$transaction(async (tx) => {
    const { ctx } = await lockedAuthorize(tx, session, {
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    });
    if (ctx.grantedScope === "own")
      throw new AccessDeniedError("role_denied", RESOURCE, "read");
    return {
      clientProfileId: input.clientProfileId,
      versions: await listVersions(
        tx,
        input.workspaceId,
        input.clientProfileId,
      ),
    };
  });
}

/** Own read: the caller's versions for the client tracker and timeline. */
export async function readOwnActivityTargets(
  session: SessionLike,
  input: { workspaceId: string },
  deps: ActivityTargetDeps = {},
): Promise<ActivityTargetsView> {
  const db = deps.db ?? prisma;
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", RESOURCE, "read");
  return db.$transaction(async (tx) => {
    const profile = await tx.clientProfile.findFirst({
      where: { workspaceId: input.workspaceId, userId },
      select: { id: true },
    });
    if (!profile) throw new AccessDeniedError("not_owner", RESOURCE, "read");
    const { ctx } = await lockedAuthorize(tx, session, {
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: profile.id,
    });
    if (ctx.grantedScope !== "own")
      throw new AccessDeniedError("role_denied", RESOURCE, "read");
    return {
      clientProfileId: profile.id,
      versions: await listVersions(tx, input.workspaceId, profile.id),
    };
  });
}

/* ---------------- write ---------------- */

/**
 * Write one day-effective version (prescription or stop). `target: null` is
 * the stop write, it stores a kind-null row stamped `stopped_at` so the
 * resolver shows no target from `effectiveFrom` onward while earlier days
 * keep their prescription. A row already stored for (client, metric,
 * effectiveFrom) makes the write an in-place replace: refused without the
 * confirm flag, applied as revision + 1 with it.
 */
export async function writeActivityTarget(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    metric: unknown;
    effectiveFrom: unknown;
    target: unknown;
    confirmSameDay?: unknown;
  },
  deps: ActivityTargetDeps = {},
): Promise<{ id: string; revision: number }> {
  const db = deps.db ?? prisma;
  const metric = input.metric;
  const effectiveFrom = input.effectiveFrom;
  const confirmSameDay = input.confirmSameDay === true;
  if (!isActivityMetric(metric)) throw new ActivityTargetError("invalid_input");
  if (typeof effectiveFrom !== "string" || !isLocalCalendarDate(effectiveFrom))
    throw new ActivityTargetError("invalid_input");
  const target = input.target as ActivityTargetWrite;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, member } = await lockedAuthorize(tx, session, {
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        if (ctx.grantedScope === "own")
          throw new AccessDeniedError("role_denied", RESOURCE, "write");
        if (ctx.grantedScope === "assigned")
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
          );
        await lockProfile(tx, input.workspaceId, input.clientProfileId);
        const stored = (await tx.activityTarget.findMany({
          where: {
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
            metric,
          },
          orderBy: [{ effectiveFrom: "asc" }],
        })) as unknown as StoredRow[];
        const plan = planActivityTargetWrite({
          rows: stored.map(toRow),
          metric,
          effectiveFrom,
          target,
          id: crypto.randomUUID(),
          confirmSameDay,
        });
        if (plan.kind === "invalid")
          throw new ActivityTargetError("invalid_input", plan.errors.join(" "));
        if (plan.kind === "confirmation-required")
          throw new ActivityTargetError("confirmation_required");
        const columns = {
          kind: plan.targetKind,
          stepMin: plan.stepMin,
          stepMax: plan.stepMax,
          sessionsPerWeek: plan.sessionsPerWeek,
          minutesPerSession: plan.minutesPerSession,
          stoppedAt: plan.targetKind === null ? new Date() : null,
        };
        if (plan.kind === "insert") {
          const row = await tx.activityTarget.create({
            data: {
              id: plan.id,
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              metric,
              ...columns,
              effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`),
              revision: 1,
              createdByMemberId: member.id,
            },
            select: { id: true, revision: true },
          });
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "activity_target",
            resourceId: row.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { changed: true },
          });
          return row;
        }
        // In-place same-day replace: CAS on the revision the planner saw so a
        // concurrent replace fails closed instead of silently losing a write.
        const updated = await tx.activityTarget.updateMany({
          where: { id: plan.id, revision: plan.revision - 1 },
          data: { ...columns, revision: plan.revision },
        });
        if (updated.count !== 1)
          throw new ActivityTargetError("serialization_conflict");
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "activity_target",
          resourceId: plan.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true },
        });
        return { id: plan.id, revision: plan.revision };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
