/**
 * PR-M3 (D26): private coach to-dos — staff-only, never ClientTask and
 * never client-visible. A null clientProfileId is a workspace-level to-do
 * (the canvas Notes workspace "Workspace" owner), a set one is bound to
 * that client.
 *
 * Completion is explicit desired-state (`complete: true|false`), not a
 * blind toggle: completed rows carry the paired provenance
 * (completed_at + completed_by_member_id, schema CHECK
 * `coach_task_completion_pairing_check`), reopening clears both.
 *
 * Deletes are soft (D24): the canvas shows an Undo toast on remove, so
 * the row keeps `deletedAt` + `restoreUntil` for `RESTORE_WINDOW_MS` and
 * can be restored inside the window only. Structural audit on changed
 * mutations (ids + `changed` marker, never title text).
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import { writeAuditEvent } from "../audit";
import { AccessDeniedError, type AuthorizationContext } from "../auth/guard";
import type { WorkspaceRole } from "../auth/rbac";
import {
  prisma,
  withSerializedRetry as sharedWithSerializedRetry,
} from "../db";

export class CoachTaskError extends Error {
  constructor(
    public code:
      "invalid_input" | "not_available" | "conflict" | "serialization_conflict",
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** See `NoteCaller` — the /api/v1 context, "workspace" for staff. */
export type CoachTaskCaller = {
  userId: string;
  workspaceId: string;
  scope: "workspace" | "own";
};

type PrismaLike = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRawUnsafe"
  | "$executeRawUnsafe"
  | "coachTask"
  | "clientProfile"
  | "workspaceMember"
  | "auditEvent"
>;

export type CoachTaskDeps = { db?: PrismaLike };

const MAX_ATTEMPTS = 3;
const PAGE_FETCH = 51;
const PAGE_SIZE = 50;
const TITLE_MAX = 120; // VarChar(120) in the schema.
/** See lib/notes/service.ts — the shared D24 undo bound. */
export const RESTORE_WINDOW_MS = 30_000;

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: MAX_ATTEMPTS,
    onExhausted: () => new CoachTaskError("serialization_conflict"),
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

type LockedMember = { id: string; role: WorkspaceRole; status: string };

async function lockMember(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
): Promise<LockedMember> {
  await advisoryLock(tx, `member:${workspaceId}:${userId}`);
  const rows = await tx.$queryRawUnsafe<LockedMember[]>(
    `SELECT id, role, status FROM "workspace_member"
     WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE`,
    workspaceId,
    userId,
  );
  const member = rows[0];
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "coachTasks",
      "write",
    );
  return member;
}

function auditCtx(member: LockedMember, caller: CoachTaskCaller) {
  return {
    userId: caller.userId,
    platformRole: "USER",
    workspaceId: caller.workspaceId,
    workspaceMemberId: member.id,
    workspaceRole: member.role,
    grantedScope: "workspace",
  } as AuthorizationContext;
}

function requireStaff(caller: CoachTaskCaller): void {
  if (caller.scope !== "workspace")
    throw new AccessDeniedError("role_denied", "coachTasks", "write");
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
  // A client outside the caller's workspace is a missing resource, not a
  // role denial — closed not_available, never a disclosing reason.
  if (!rows[0]) throw new CoachTaskError("not_available");
}

export function normalizeTaskTitle(input: unknown): string {
  if (typeof input !== "string") throw new CoachTaskError("invalid_input");
  const title = input.trim();
  if (title.length === 0 || title.length > TITLE_MAX)
    throw new CoachTaskError("invalid_input");
  return title;
}

type TaskRow = {
  id: string;
  workspaceId: string;
  clientProfileId: string | null;
  title: string;
  completedAt: Date | null;
  completedByMemberId: string | null;
  createdByMemberId: string;
  revision: number;
  deletedAt: Date | null;
  restoreUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CoachTaskView = {
  id: string;
  clientProfileId: string | null;
  title: string;
  complete: boolean;
  completedAt: string | null;
  completedByMemberId: string | null;
  createdByMemberId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

function toView(row: TaskRow): CoachTaskView {
  return {
    id: row.id,
    clientProfileId: row.clientProfileId,
    title: row.title,
    complete: row.completedAt !== null,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedByMemberId: row.completedByMemberId,
    createdByMemberId: row.createdByMemberId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const TASK_SELECT = {
  id: true,
  workspaceId: true,
  clientProfileId: true,
  title: true,
  completedAt: true,
  completedByMemberId: true,
  createdByMemberId: true,
  revision: true,
  deletedAt: true,
  restoreUntil: true,
  createdAt: true,
  updatedAt: true,
} as const;

/* ---------------- create ---------------- */

export async function createCoachTask(
  caller: CoachTaskCaller,
  input: { clientProfileId?: string | null; title: unknown },
  deps: CoachTaskDeps = {},
): Promise<{ id: string; revision: number }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  const title = normalizeTaskTitle(input.title);
  const clientProfileId = input.clientProfileId ?? null;

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        if (clientProfileId !== null)
          await advisoryLock(
            tx,
            `ctodo:${caller.workspaceId}:${clientProfileId}`,
          );
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        if (clientProfileId !== null)
          await lockProfile(tx, caller.workspaceId, clientProfileId);

        const row = await tx.coachTask.create({
          data: {
            workspaceId: caller.workspaceId,
            clientProfileId,
            title,
            createdByMemberId: member.id,
          },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "CREATE",
          resourceType: "coach_task",
          resourceId: row.id,
          subjectClientProfileId: clientProfileId,
          meta: { changed: true },
        });
        return { id: row.id, revision: row.revision };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- shared row lock ---------------- */

async function lockTaskForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  taskId: string,
): Promise<TaskRow> {
  const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "coach_task"
     WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    taskId,
    workspaceId,
  );
  const row = rows[0];
  if (!row) throw new CoachTaskError("not_available");
  return {
    id: row["id"] as string,
    workspaceId: row["workspace_id"] as string,
    clientProfileId: (row["client_profile_id"] as string | null) ?? null,
    title: row["title"] as string,
    completedAt: row["completed_at"]
      ? new Date(row["completed_at"] as string)
      : null,
    completedByMemberId:
      (row["completed_by_member_id"] as string | null) ?? null,
    createdByMemberId: row["created_by_member_id"] as string,
    revision: row["revision"] as number,
    deletedAt: row["deleted_at"] ? new Date(row["deleted_at"] as string) : null,
    restoreUntil: row["restore_until"]
      ? new Date(row["restore_until"] as string)
      : null,
    createdAt: new Date(row["created_at"] as string),
    updatedAt: new Date(row["updated_at"] as string),
  };
}

/* ---------------- update title ---------------- */

export async function updateCoachTaskTitle(
  caller: CoachTaskCaller,
  input: { taskId: string; title: unknown; expectedRevision: number },
  deps: CoachTaskDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  const title = normalizeTaskTitle(input.title);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
    throw new CoachTaskError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        const row = await lockTaskForUpdate(
          tx,
          caller.workspaceId,
          input.taskId,
        );
        if (row.deletedAt) throw new CoachTaskError("not_available");
        if (row.revision !== input.expectedRevision)
          throw new CoachTaskError("conflict");
        if (row.title === title)
          return { revision: row.revision, changed: false };

        await tx.coachTask.update({
          where: { id: row.id },
          data: { title, revision: { increment: 1 } },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "UPDATE",
          resourceType: "coach_task",
          resourceId: row.id,
          subjectClientProfileId: row.clientProfileId,
          meta: { changed: true },
        });
        return { revision: row.revision + 1, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- completion (explicit desired state) ---------------- */

export async function setCoachTaskCompletion(
  caller: CoachTaskCaller,
  input: {
    taskId: string;
    complete: boolean;
    expectedRevision: number;
  },
  deps: CoachTaskDeps = {},
): Promise<{ revision: number; complete: boolean; changed: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  if (typeof input.complete !== "boolean")
    throw new CoachTaskError("invalid_input");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
    throw new CoachTaskError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        const row = await lockTaskForUpdate(
          tx,
          caller.workspaceId,
          input.taskId,
        );
        if (row.deletedAt) throw new CoachTaskError("not_available");
        if (row.revision !== input.expectedRevision)
          throw new CoachTaskError("conflict");
        const isComplete = row.completedAt !== null;
        if (isComplete === input.complete)
          return {
            revision: row.revision,
            complete: isComplete,
            changed: false,
          };

        await tx.coachTask.update({
          where: { id: row.id },
          data: input.complete
            ? {
                completedAt: new Date(),
                completedByMemberId: member.id,
                revision: { increment: 1 },
              }
            : {
                completedAt: null,
                completedByMemberId: null,
                revision: { increment: 1 },
              },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "UPDATE",
          resourceType: "coach_task",
          resourceId: row.id,
          subjectClientProfileId: row.clientProfileId,
          meta: { changed: true },
        });
        return {
          revision: row.revision + 1,
          complete: input.complete,
          changed: true,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- delete + restore (D24) ---------------- */

export async function deleteCoachTask(
  caller: CoachTaskCaller,
  input: { taskId: string; expectedRevision: number },
  deps: CoachTaskDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
    throw new CoachTaskError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        const row = await lockTaskForUpdate(
          tx,
          caller.workspaceId,
          input.taskId,
        );
        if (row.revision !== input.expectedRevision)
          throw new CoachTaskError("conflict");
        if (row.deletedAt) return { revision: row.revision, changed: false };

        const now = new Date();
        await tx.coachTask.update({
          where: { id: row.id },
          data: {
            deletedAt: now,
            restoreUntil: new Date(now.getTime() + RESTORE_WINDOW_MS),
            revision: { increment: 1 },
          },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "DELETE",
          resourceType: "coach_task",
          resourceId: row.id,
          subjectClientProfileId: row.clientProfileId,
          meta: { changed: true },
        });
        return { revision: row.revision + 1, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

export async function restoreCoachTask(
  caller: CoachTaskCaller,
  input: { taskId: string },
  deps: CoachTaskDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        const row = await lockTaskForUpdate(
          tx,
          caller.workspaceId,
          input.taskId,
        );
        if (!row.deletedAt) return { revision: row.revision, changed: false };
        if (!row.restoreUntil || row.restoreUntil.getTime() <= Date.now())
          throw new CoachTaskError("not_available");

        await tx.coachTask.update({
          where: { id: row.id },
          data: {
            deletedAt: null,
            restoreUntil: null,
            revision: { increment: 1 },
          },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "UPDATE",
          resourceType: "coach_task",
          resourceId: row.id,
          subjectClientProfileId: row.clientProfileId,
          meta: { changed: true },
        });
        return { revision: row.revision + 1, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- read ---------------- */

/**
 * Staff list: every live to-do in the workspace, or one client's to-dos
 * when `clientProfileId` is given. Coach tasks are staff-only (D26) —
 * there is deliberately no own-scope path.
 */
export async function listCoachTasks(
  caller: CoachTaskCaller,
  input: { clientProfileId?: string | null; workspaceOnly?: boolean } = {},
  deps: CoachTaskDeps = {},
): Promise<{ tasks: CoachTaskView[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  return db.$transaction(async (tx) => {
    await lockMember(tx, caller.workspaceId, caller.userId);
    if (input.clientProfileId)
      await lockProfile(tx, caller.workspaceId, input.clientProfileId);
    const rows = (await tx.coachTask.findMany({
      where: {
        workspaceId: caller.workspaceId,
        deletedAt: null,
        ...(input.clientProfileId
          ? { clientProfileId: input.clientProfileId }
          : input.workspaceOnly
            ? { clientProfileId: null }
            : {}),
      },
      select: TASK_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: PAGE_FETCH,
    })) as unknown as TaskRow[];
    return {
      tasks: rows.slice(0, PAGE_SIZE).map(toView),
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}

/**
 * Single live to-do view by id, staff locked in the read transaction. The
 * route adapter uses it to answer with the full row after a create, and to
 * resolve the current revision when a canvas caller cannot supply one.
 */
export async function readCoachTask(
  caller: CoachTaskCaller,
  input: { taskId: string },
  deps: CoachTaskDeps = {},
): Promise<CoachTaskView> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  return db.$transaction(async (tx) => {
    await lockMember(tx, caller.workspaceId, caller.userId);
    const row = (await tx.coachTask.findFirst({
      where: {
        id: input.taskId,
        workspaceId: caller.workspaceId,
        deletedAt: null,
      },
      select: TASK_SELECT,
    })) as unknown as TaskRow | null;
    if (!row) throw new CoachTaskError("not_available");
    return toView(row);
  });
}
