/**
 * W2-A4 coach to-do surface over the CoachTask model. A row is a coach's
 * own reminder: scoped to the workspace, optionally pinned to one client
 * profile (clientProfileId null = workspace-level to-do). The creator is
 * the calling member; the completer is recorded on completion.
 *
 * There is no coachTasks RBAC resource, so staff binding mirrors the
 * messages service: the caller must hold an ACTIVE workspace membership in
 * a staff role (WORKSPACE_OWNER or COACH). The route capability check
 * (tasks.manage) supplies the workspace scope.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { AccessDeniedError } from "../auth/guard";

export class CoachTaskError extends Error {
  constructor(
    public code: "invalid_input" | "not_available" | "conflict",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CoachTaskError";
  }
}

type SessionLike = { user?: { id?: string } } | null | undefined;

type PrismaLike = Pick<
  PrismaClient,
  "clientProfile" | "coachTask" | "workspaceMember"
>;

export type CoachTaskDeps = { db?: PrismaLike };

export type CoachTaskView = {
  id: string;
  clientProfileId: string | null;
  title: string;
  completedAt: string | null;
  completedByMemberId: string | null;
  createdByMemberId: string;
  revision: number;
};

const MAX_ID = 128;
const MAX_TITLE = 120;
/** Soft-deleted rows stay restorable for this window. */
const RESTORE_DAYS = 7;

const STAFF_ROLES = ["WORKSPACE_OWNER", "COACH"] as const;

function userIdOf(session: SessionLike): string {
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "coachTasks", "read");
  return userId;
}

function checkId(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length > MAX_ID
  )
    throw new CoachTaskError("invalid_input");
  return raw;
}

function normalizeTitle(raw: unknown): string {
  if (typeof raw !== "string") throw new CoachTaskError("invalid_input");
  const title = raw.trim();
  if (title.length === 0 || title.length > MAX_TITLE)
    throw new CoachTaskError("invalid_input");
  return title;
}

function checkRevision(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0)
    throw new CoachTaskError("invalid_input");
  return raw;
}

async function staffMember(
  db: PrismaLike,
  workspaceId: string,
  userId: string,
  action: "read" | "write",
): Promise<{ id: string }> {
  checkId(workspaceId);
  const member = await db.workspaceMember.findFirst({
    where: {
      workspaceId,
      userId,
      status: "ACTIVE",
      role: { in: [...STAFF_ROLES] },
    },
    select: { id: true },
  });
  if (!member)
    throw new AccessDeniedError("role_denied", "coachTasks", action);
  return member;
}

type CoachTaskRow = {
  id: string;
  clientProfileId: string | null;
  title: string;
  completedAt: Date | null;
  completedByMemberId: string | null;
  createdByMemberId: string;
  revision: number;
  deletedAt: Date | null;
};

function toView(row: CoachTaskRow): CoachTaskView {
  return {
    id: row.id,
    clientProfileId: row.clientProfileId,
    title: row.title,
    completedAt: row.completedAt?.toISOString() ?? null,
    completedByMemberId: row.completedByMemberId,
    createdByMemberId: row.createdByMemberId,
    revision: row.revision,
  };
}

const ROW_SELECT = {
  id: true,
  clientProfileId: true,
  title: true,
  completedAt: true,
  completedByMemberId: true,
  createdByMemberId: true,
  revision: true,
  deletedAt: true,
} as const;

async function liveTask(
  db: PrismaLike,
  workspaceId: string,
  coachTaskId: string,
): Promise<CoachTaskRow> {
  const row = await db.coachTask.findFirst({
    where: { id: coachTaskId, workspaceId, deletedAt: null },
    select: ROW_SELECT,
  });
  if (!row) throw new CoachTaskError("not_available");
  return row;
}

/**
 * List non-deleted to-dos. clientProfileId undefined reads the workspace
 * list (null rows); a supplied id reads that client's list.
 */
export async function listCoachTasks(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId?: string },
  deps: CoachTaskDeps = {},
): Promise<{ coachTasks: CoachTaskView[] }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  await staffMember(db, input.workspaceId, userId, "read");
  const clientProfileId =
    input.clientProfileId === undefined
      ? null
      : checkId(input.clientProfileId);
  const rows = await db.coachTask.findMany({
    where: {
      workspaceId: input.workspaceId,
      clientProfileId,
      deletedAt: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: ROW_SELECT,
  });
  return { coachTasks: rows.map(toView) };
}

/** Create a to-do; optional clientProfileId pins it to one client. */
export async function createCoachTask(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId?: unknown;
    title: unknown;
  },
  deps: CoachTaskDeps = {},
): Promise<{ coachTask: CoachTaskView }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  const title = normalizeTitle(input.title);
  const member = await staffMember(db, input.workspaceId, userId, "write");
  let clientProfileId: string | null = null;
  if (input.clientProfileId !== undefined && input.clientProfileId !== null) {
    clientProfileId = checkId(input.clientProfileId);
    const profile = await db.clientProfile.findFirst({
      where: { id: clientProfileId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!profile) throw new CoachTaskError("not_available");
  }
  const row = await db.coachTask.create({
    data: {
      workspaceId: input.workspaceId,
      clientProfileId,
      title,
      createdByMemberId: member.id,
    },
    select: ROW_SELECT,
  });
  return { coachTask: toView(row) };
}

/** Complete or reopen a to-do; records the completer member. */
export async function setCoachTaskCompleted(
  session: SessionLike,
  input: {
    workspaceId: string;
    coachTaskId: string;
    completed: unknown;
    expectedRevision?: unknown;
  },
  deps: CoachTaskDeps = {},
): Promise<{ coachTask: CoachTaskView }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  if (typeof input.completed !== "boolean")
    throw new CoachTaskError("invalid_input");
  const expectedRevision = checkRevision(input.expectedRevision);
  const member = await staffMember(db, input.workspaceId, userId, "write");
  const row = await liveTask(db, input.workspaceId, input.coachTaskId);
  if (expectedRevision !== undefined && row.revision !== expectedRevision)
    throw new CoachTaskError("conflict");
  const done = row.completedAt !== null;
  if (done === input.completed) return { coachTask: toView(row) };
  const updated = await db.coachTask.update({
    where: { id: row.id },
    data: input.completed
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
    select: ROW_SELECT,
  });
  return { coachTask: toView(updated) };
}

/** Soft delete: sets deletedAt and the restoreUntil window. */
export async function deleteCoachTask(
  session: SessionLike,
  input: {
    workspaceId: string;
    coachTaskId: string;
    expectedRevision?: unknown;
  },
  deps: CoachTaskDeps = {},
): Promise<{ coachTask: CoachTaskView }> {
  const db = deps.db ?? prisma;
  const userId = userIdOf(session);
  const expectedRevision = checkRevision(input.expectedRevision);
  await staffMember(db, input.workspaceId, userId, "write");
  const row = await liveTask(db, input.workspaceId, input.coachTaskId);
  if (expectedRevision !== undefined && row.revision !== expectedRevision)
    throw new CoachTaskError("conflict");
  const now = new Date();
  const updated = await db.coachTask.update({
    where: { id: row.id },
    data: {
      deletedAt: now,
      restoreUntil: new Date(now.getTime() + RESTORE_DAYS * 86400000),
      revision: { increment: 1 },
    },
    select: ROW_SELECT,
  });
  return { coachTask: toView(updated) };
}
