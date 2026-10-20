/**
 * PR-M3 (O7): tracker comments — the ONLY write surface staff have on a
 * client's tracker. Coaches never log entries on a client's behalf; they
 * comment. One comment per (client, entryDate, parameterId), matching the
 * canvas key `${date}:${parameterId}` and the table's unique constraint.
 *
 * Write semantics mirror the canvas `onSaveComment`: a non-empty trimmed
 * body upserts the single comment for the cell; an empty body deletes it.
 * No-op replays write no audit event.
 *
 * Reads: staff list any client of their workspace; the own-scope path
 * resolves the caller's own profile and never crosses it, so a client
 * sees only the comments on their own tracker days.
 *
 * Structural audit on changed mutations (ids + `changed` marker + the
 * declared comment date — never body text).
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import { writeAuditEvent } from "../audit";
import { AccessDeniedError, type AuthorizationContext } from "../auth/guard";
import type { WorkspaceRole } from "../auth/rbac";
import {
  prisma,
  withSerializedRetry as sharedWithSerializedRetry,
} from "../db";

export class TrackerCommentError extends Error {
  constructor(
    public code:
      "invalid_input" | "not_available" | "conflict" | "serialization_conflict",
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** See `NoteCaller` — the /api/v1 context, "workspace" for staff. */
export type TrackerCommentCaller = {
  userId: string;
  workspaceId: string;
  scope: "workspace" | "own";
};

type PrismaLike = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRawUnsafe"
  | "$executeRawUnsafe"
  | "trackerComment"
  | "clientProfile"
  | "parameterDefinition"
  | "workspaceMember"
  | "auditEvent"
>;

export type TrackerCommentDeps = { db?: PrismaLike };

const MAX_ATTEMPTS = 3;
const PAGE_FETCH = 101;
const PAGE_SIZE = 100;

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: MAX_ATTEMPTS,
    onExhausted: () => new TrackerCommentError("serialization_conflict"),
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
      "trackerComments",
      "write",
    );
  return member;
}

function auditCtx(member: LockedMember, caller: TrackerCommentCaller) {
  return {
    userId: caller.userId,
    platformRole: "USER",
    workspaceId: caller.workspaceId,
    workspaceMemberId: member.id,
    workspaceRole: member.role,
    grantedScope: "workspace",
  } as AuthorizationContext;
}

function requireStaff(caller: TrackerCommentCaller): void {
  if (caller.scope !== "workspace")
    throw new AccessDeniedError("role_denied", "trackerComments", "write");
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
      "trackerComments",
      "write",
    );
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Strict declared-date parse → canonical `YYYY-MM-DD` or null. Comments
 * name a tracker day, not a deadline — any real calendar date is valid,
 * no due-horizon bound (unlike `parseTaskDueDate`).
 */
export function parseCommentDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = DATE_RE.exec(input);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  )
    return null;
  return dt.toISOString().slice(0, 10);
}

function normalizeCommentBody(input: unknown): string {
  if (typeof input !== "string") throw new TrackerCommentError("invalid_input");
  // Empty after trim is meaningful: the canvas save deletes the comment.
  return input.trim();
}

export type TrackerCommentView = {
  id: string;
  clientProfileId: string;
  entryDate: string;
  parameterId: string;
  body: string;
  authorMemberId: string;
  createdAt: string;
  updatedAt: string;
};

const COMMENT_SELECT = {
  id: true,
  clientProfileId: true,
  entryDate: true,
  parameterId: true,
  body: true,
  authorMemberId: true,
  createdAt: true,
  updatedAt: true,
} as const;

type CommentRow = {
  id: string;
  clientProfileId: string;
  entryDate: Date;
  parameterId: string;
  body: string;
  authorMemberId: string;
  createdAt: Date;
  updatedAt: Date;
};

function toView(row: CommentRow): TrackerCommentView {
  return {
    id: row.id,
    clientProfileId: row.clientProfileId,
    entryDate: row.entryDate.toISOString().slice(0, 10),
    parameterId: row.parameterId,
    body: row.body,
    authorMemberId: row.authorMemberId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ---------------- save (upsert / delete-on-empty) ---------------- */

export async function saveTrackerComment(
  caller: TrackerCommentCaller,
  input: {
    clientProfileId: string;
    entryDate: unknown;
    parameterId: string;
    body: unknown;
  },
  deps: TrackerCommentDeps = {},
): Promise<{
  id: string | null;
  outcome: "created" | "updated" | "deleted" | "unchanged";
}> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  const entryDate = parseCommentDate(input.entryDate);
  if (!entryDate) throw new TrackerCommentError("invalid_input");
  const body = normalizeCommentBody(input.body);
  if (
    typeof input.parameterId !== "string" ||
    input.parameterId.length === 0 ||
    typeof input.clientProfileId !== "string" ||
    input.clientProfileId.length === 0
  )
    throw new TrackerCommentError("invalid_input");
  const clientProfileId = input.clientProfileId;
  const parameterId = input.parameterId;

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        await advisoryLock(
          tx,
          `tcomment:${caller.workspaceId}:${clientProfileId}:${entryDate}:${parameterId}`,
        );
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        await lockProfile(tx, caller.workspaceId, clientProfileId);
        // Same-workspace coherence is enforced by the composite FK; the
        // early check turns a foreign parameter id into the closed
        // not_available vocabulary instead of an integrity error.
        const parameter = await tx.parameterDefinition.findFirst({
          where: { id: parameterId, workspaceId: caller.workspaceId },
          select: { id: true },
        });
        if (!parameter) throw new TrackerCommentError("not_available");

        const existing = await tx.trackerComment.findFirst({
          where: {
            workspaceId: caller.workspaceId,
            clientProfileId,
            entryDate: new Date(`${entryDate}T00:00:00Z`),
            parameterId,
          },
        });

        if (body.length === 0) {
          if (!existing) return { id: null, outcome: "unchanged" as const };
          await tx.trackerComment.delete({ where: { id: existing.id } });
          await writeAuditEvent(tx, auditCtx(member, caller), {
            action: "DELETE",
            resourceType: "tracker_comment",
            resourceId: existing.id,
            subjectClientProfileId: clientProfileId,
            meta: { changed: true, date: entryDate },
          });
          return { id: existing.id, outcome: "deleted" as const };
        }

        if (existing && existing.body === body)
          return { id: existing.id, outcome: "unchanged" as const };

        if (existing) {
          await tx.trackerComment.update({
            where: { id: existing.id },
            data: { body, authorMemberId: member.id },
          });
          await writeAuditEvent(tx, auditCtx(member, caller), {
            action: "UPDATE",
            resourceType: "tracker_comment",
            resourceId: existing.id,
            subjectClientProfileId: clientProfileId,
            meta: { changed: true, date: entryDate },
          });
          return { id: existing.id, outcome: "updated" as const };
        }

        const row = await tx.trackerComment.create({
          data: {
            workspaceId: caller.workspaceId,
            clientProfileId,
            entryDate: new Date(`${entryDate}T00:00:00Z`),
            parameterId,
            body,
            authorMemberId: member.id,
          },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "CREATE",
          resourceType: "tracker_comment",
          resourceId: row.id,
          subjectClientProfileId: clientProfileId,
          meta: { changed: true, date: entryDate },
        });
        return { id: row.id, outcome: "created" as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- reads ---------------- */

/**
 * Staff list: every comment on one client of the workspace, optionally
 * bounded to a declared-date range (`from`/`to`, inclusive, YYYY-MM-DD).
 * Ordered by day then parameter — the order the tracker grid walks.
 */
export async function listTrackerComments(
  caller: TrackerCommentCaller,
  input: {
    clientProfileId: string;
    from?: string;
    to?: string;
  },
  deps: TrackerCommentDeps = {},
): Promise<{ comments: TrackerCommentView[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  const from = input.from === undefined ? null : parseCommentDate(input.from);
  const to = input.to === undefined ? null : parseCommentDate(input.to);
  if ((input.from !== undefined && !from) || (input.to !== undefined && !to))
    throw new TrackerCommentError("invalid_input");

  return db.$transaction(async (tx) => {
    await lockMember(tx, caller.workspaceId, caller.userId);
    await lockProfile(tx, caller.workspaceId, input.clientProfileId);
    const rows = (await tx.trackerComment.findMany({
      where: {
        workspaceId: caller.workspaceId,
        clientProfileId: input.clientProfileId,
        ...(from || to
          ? {
              entryDate: {
                ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
              },
            }
          : {}),
      },
      select: COMMENT_SELECT,
      orderBy: [{ entryDate: "asc" }, { parameterId: "asc" }, { id: "asc" }],
      take: PAGE_FETCH,
    })) as unknown as CommentRow[];
    return {
      comments: rows.slice(0, PAGE_SIZE).map(toView),
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}

/**
 * Client-visible read: comments on the caller's OWN profile only. A
 * foreign profile id can never resolve — the caller's profile is looked
 * up from their user id, never trusted from input.
 */
export async function listOwnTrackerComments(
  caller: TrackerCommentCaller,
  input: { from?: string; to?: string } = {},
  deps: TrackerCommentDeps = {},
): Promise<{ comments: TrackerCommentView[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  if (caller.scope !== "own")
    throw new AccessDeniedError("role_denied", "trackerComments", "read");
  const from = input.from === undefined ? null : parseCommentDate(input.from);
  const to = input.to === undefined ? null : parseCommentDate(input.to);
  if ((input.from !== undefined && !from) || (input.to !== undefined && !to))
    throw new TrackerCommentError("invalid_input");

  return db.$transaction(async (tx) => {
    await lockMember(tx, caller.workspaceId, caller.userId);
    const profile = await tx.clientProfile.findFirst({
      where: { workspaceId: caller.workspaceId, userId: caller.userId },
      select: { id: true },
    });
    if (!profile)
      throw new AccessDeniedError("not_owner", "trackerComments", "read");
    const rows = (await tx.trackerComment.findMany({
      where: {
        workspaceId: caller.workspaceId,
        clientProfileId: profile.id,
        ...(from || to
          ? {
              entryDate: {
                ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
              },
            }
          : {}),
      },
      select: COMMENT_SELECT,
      orderBy: [{ entryDate: "asc" }, { parameterId: "asc" }, { id: "asc" }],
      take: PAGE_FETCH,
    })) as unknown as CommentRow[];
    return {
      comments: rows.slice(0, PAGE_SIZE).map(toView),
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}
