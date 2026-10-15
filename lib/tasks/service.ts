/**
 * CLIENT-TASKS-I1 (decision 109): staff-assigned client tasks. Reviewed
 * protocol — `ctask:{ws}:{client}` advisory BEFORE `member:{ws}:{user}`
 * (same slot convention as cdash), member FOR UPDATE, in-tx authorize.
 *
 * Operation split enforced INSIDE the transaction after scope
 * resolution: management ops require workspace|assigned; completion
 * requires grantedScope === "own" AND the task's client profile bound to
 * the caller's identity. A generic RBAC "write" cell is never the
 * operation authority; caller-supplied role/mode fields are ignored.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { isSerializationConflict, prisma } from "../db";
import { AccessDeniedError, authorize } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import {
  parseTaskDueDate,
  serverTodayUtc,
  taskDueState,
  type TaskDueState,
} from "./date";

export class TaskError extends Error {
  constructor(
    public code:
      "invalid_input" | "not_available" | "conflict" | "serialization_conflict",
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
  | "clientTask"
  | "clientProfile"
  | "workspaceMember"
  | "clientAssignment"
  | "auditEvent"
  | "user"
  | "workspace"
>;

export type TaskDeps = { db?: PrismaLike };

const MAX_ATTEMPTS = 3;
const PAGE_FETCH = 21;
const PAGE_SIZE = 20;

export type TaskView = {
  id: string;
  title: string;
  dueDate: string;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  dueState: TaskDueState;
  completedAt: string | null;
  assignedByMemberId: string;
  revision: number;
};

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (isSerializationConflict(error)) {
        if (attempt < MAX_ATTEMPTS) continue;
        throw new TaskError("serialization_conflict");
      }
      throw error;
    }
  }
  throw new TaskError("serialization_conflict");
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
    throw new AccessDeniedError(
      "unauthenticated",
      "clientTasks",
      request.action,
    );
  await advisoryLock(
    tx,
    `ctask:${request.workspaceId}:${request.clientProfileId}`,
  );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const member = await lockMember(tx, request.workspaceId, userId);
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "clientTasks",
      request.action,
    );
  const ctx = await authorize(
    session,
    {
      resource: "clientTasks",
      action: request.action,
      workspaceId: request.workspaceId,
      clientProfileId: request.clientProfileId,
    },
    createPrismaAuthorizationRepo(tx),
  );
  if (ctx.workspaceMemberId !== member.id)
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "clientTasks",
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
    throw new AccessDeniedError("not_assigned", "clientTasks", "write");
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
    throw new AccessDeniedError("not_assigned", "clientTasks", "write");
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
      "clientTasks",
      "write",
    );
}

/** Management ops (assign/edit/cancel) — workspace or assigned only. */
function requireManagementScope(
  ctx: { grantedScope: string },
  action: "read" | "write",
): void {
  if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
    throw new AccessDeniedError("role_denied", "clientTasks", action);
}

function normalizeTitle(input: unknown): string {
  if (typeof input !== "string") throw new TaskError("invalid_input");
  const title = input.trim();
  if (title.length === 0 || title.length > 120)
    throw new TaskError("invalid_input");
  return title;
}

type TaskRow = {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  title: string;
  dueDate: Date;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  revision: number;
  assignedByMemberId: string;
  completedByUserId: string | null;
  completedAt: Date | null;
  cancelledByMemberId: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
};

function toView(row: TaskRow, today: string): TaskView {
  const dueDate = row.dueDate.toISOString().slice(0, 10);
  return {
    id: row.id,
    title: row.title,
    dueDate,
    status: row.status,
    dueState: row.status === "OPEN" ? taskDueState(dueDate, today) : "upcoming",
    completedAt: row.completedAt?.toISOString() ?? null,
    assignedByMemberId: row.assignedByMemberId,
    revision: row.revision,
  };
}

/* ---------------- assign ---------------- */

export async function assignClientTask(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    title: unknown;
    dueDate: unknown;
  },
  deps: TaskDeps = {},
): Promise<{ id: string; revision: number }> {
  const db = deps.db ?? prisma;
  const title = normalizeTitle(input.title);
  const dueDate = parseTaskDueDate(input.dueDate);
  if (!dueDate) throw new TaskError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, member } = await lockedAuthorize(tx, session, {
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        requireManagementScope(ctx, "write");
        if (ctx.grantedScope === "assigned")
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
          );
        await lockProfile(tx, input.workspaceId, input.clientProfileId);

        const row = await tx.clientTask.create({
          data: {
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
            title,
            dueDate: new Date(`${dueDate}T00:00:00Z`),
            assignedByMemberId: member.id,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "CREATE",
          resourceType: "client_task",
          resourceId: row.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true },
        });
        return { id: row.id, revision: row.revision };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- edit (OPEN only) ---------------- */

export async function editClientTask(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    taskId: string;
    title?: unknown;
    dueDate?: unknown;
    expectedRevision: number;
  },
  deps: TaskDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  const title =
    input.title === undefined ? undefined : normalizeTitle(input.title);
  const dueDate =
    input.dueDate === undefined ? undefined : parseTaskDueDate(input.dueDate);
  if (input.dueDate !== undefined && !dueDate)
    throw new TaskError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, member } = await lockedAuthorize(tx, session, {
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        requireManagementScope(ctx, "write");
        if (ctx.grantedScope === "assigned")
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
          );
        await lockProfile(tx, input.workspaceId, input.clientProfileId);

        const row = await lockTaskForUpdate(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.taskId,
        );
        if (row.revision !== input.expectedRevision)
          throw new TaskError("conflict");
        if (row.status !== "OPEN") throw new TaskError("not_available");

        const nextTitle = title ?? row.title;
        const nextDue = dueDate ?? row.dueDate.toISOString().slice(0, 10);
        if (
          nextTitle === row.title &&
          nextDue === row.dueDate.toISOString().slice(0, 10)
        )
          return { revision: row.revision, changed: false };

        await tx.clientTask.update({
          where: { id: row.id },
          data: {
            title: nextTitle,
            dueDate: new Date(`${nextDue}T00:00:00Z`),
            revision: { increment: 1 },
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "client_task",
          resourceId: row.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true },
        });
        return { revision: row.revision + 1, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- cancel (OPEN only, terminal) ---------------- */

export async function cancelClientTask(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    taskId: string;
    expectedRevision: number;
  },
  deps: TaskDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, member } = await lockedAuthorize(tx, session, {
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        requireManagementScope(ctx, "write");
        if (ctx.grantedScope === "assigned")
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
          );
        await lockProfile(tx, input.workspaceId, input.clientProfileId);

        const row = await lockTaskForUpdate(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.taskId,
        );
        if (row.revision !== input.expectedRevision)
          throw new TaskError("conflict");
        if (row.status === "CANCELLED")
          return { revision: row.revision, changed: false };
        if (row.status !== "OPEN") throw new TaskError("not_available");

        await tx.clientTask.update({
          where: { id: row.id },
          data: {
            status: "CANCELLED",
            cancelledByMemberId: member.id,
            cancelledAt: new Date(),
            revision: { increment: 1 },
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "client_task",
          resourceId: row.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true },
        });
        return { revision: row.revision + 1, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- setCompletion (client own only) ---------------- */

export async function setClientTaskCompletion(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    taskId: string;
    desired: "COMPLETED" | "OPEN";
    expectedRevision: number;
  },
  deps: TaskDeps = {},
): Promise<{
  revision: number;
  status: "OPEN" | "COMPLETED";
  changed: boolean;
}> {
  const db = deps.db ?? prisma;
  if (input.desired !== "COMPLETED" && input.desired !== "OPEN")
    throw new TaskError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, userId } = await lockedAuthorize(tx, session, {
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        // Operation split: ONLY the owning client's own-scope may
        // transition completion — staff roles resolve higher scopes and
        // are rejected here even when they also own a clientProfile.
        if (ctx.grantedScope !== "own")
          throw new AccessDeniedError("role_denied", "clientTasks", "write");
        const client = await tx.clientProfile.findUnique({
          where: { id: input.clientProfileId },
          select: { userId: true },
        });
        if (!client || client.userId !== userId)
          throw new AccessDeniedError("not_owner", "clientTasks", "write");

        const row = await lockTaskForUpdate(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.taskId,
        );
        if (row.revision !== input.expectedRevision)
          throw new TaskError("conflict");
        if (row.status === "CANCELLED") throw new TaskError("not_available");
        if (row.status === input.desired)
          return { revision: row.revision, status: row.status, changed: false };

        await tx.clientTask.update({
          where: { id: row.id },
          data:
            input.desired === "COMPLETED"
              ? {
                  status: "COMPLETED",
                  completedByUserId: userId,
                  completedAt: new Date(),
                  revision: { increment: 1 },
                }
              : {
                  status: "OPEN",
                  completedByUserId: null,
                  completedAt: null,
                  revision: { increment: 1 },
                },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "client_task",
          resourceId: row.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true },
        });
        return {
          revision: row.revision + 1,
          status: input.desired,
          changed: true,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- reads ---------------- */

async function lockTaskForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  taskId: string,
): Promise<TaskRow> {
  const rows = await tx.$queryRawUnsafe<TaskRow[]>(
    `SELECT * FROM "client_task"
     WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
     FOR UPDATE`,
    taskId,
    workspaceId,
    clientProfileId,
  );
  const row = rows[0];
  if (!row) throw new TaskError("not_available");
  // Prisma returns snake_case columns via raw — map them.
  return {
    id: (row as never)["id"],
    workspaceId: (row as never)["workspace_id"],
    clientProfileId: (row as never)["client_profile_id"],
    title: (row as never)["title"],
    dueDate: new Date((row as never)["due_date"]),
    status: (row as never)["status"],
    revision: (row as never)["revision"],
    assignedByMemberId: (row as never)["assigned_by_member_id"],
    completedByUserId: (row as never)["completed_by_user_id"],
    completedAt: (row as never)["completed_at"]
      ? new Date((row as never)["completed_at"])
      : null,
    cancelledByMemberId: (row as never)["cancelled_by_member_id"],
    cancelledAt: (row as never)["cancelled_at"]
      ? new Date((row as never)["cancelled_at"])
      : null,
    createdAt: new Date((row as never)["created_at"]),
  };
}

export async function listStaffClientTasks(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: TaskDeps = {},
): Promise<{ tasks: TaskView[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  return db.$transaction(async (tx) => {
    const { ctx } = await lockedAuthorize(tx, session, {
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    });
    requireManagementScope(ctx, "read");
    const rows = (await tx.clientTask.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: PAGE_FETCH,
    })) as unknown as TaskRow[];
    const today = serverTodayUtc();
    return {
      tasks: rows.slice(0, PAGE_SIZE).map((r) => toView(r, today)),
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}

export async function listOwnClientTasks(
  session: SessionLike,
  input: {
    workspaceId: string;
    option?: "open" | "completed" | "both";
  },
  deps: TaskDeps = {},
): Promise<{ tasks: TaskView[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "clientTasks", "read");
  return db.$transaction(async (tx) => {
    const profile = await tx.clientProfile.findFirst({
      where: { workspaceId: input.workspaceId, userId },
      select: { id: true },
    });
    if (!profile)
      throw new AccessDeniedError("not_owner", "clientTasks", "read");
    const { ctx } = await lockedAuthorize(tx, session, {
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: profile.id,
    });
    if (ctx.grantedScope !== "own")
      throw new AccessDeniedError("role_denied", "clientTasks", "read");
    const option = input.option ?? "both";
    const rows = (await tx.clientTask.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
        // All filters in SQL before the LIMIT — an eligible row can
        // never hide behind the bound.
        status:
          option === "open"
            ? "OPEN"
            : option === "completed"
              ? "COMPLETED"
              : { not: "CANCELLED" },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: PAGE_FETCH,
    })) as unknown as TaskRow[];
    const today = serverTodayUtc();
    return {
      tasks: rows.slice(0, PAGE_SIZE).map((r) => toView(r, today)),
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}
