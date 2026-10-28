/**
 * PR-M3 (D26, O13): staff coach notes.
 *
 * Two kinds, one table (CoachNoteVisibility): PRIVATE notes are staff-only
 * and may be workspace-level (clientProfileId null — the canvas Notes
 * workspace) or bound to a client; GENERAL notes are readable by the
 * client they name (O13) and therefore always carry a clientProfileId —
 * the database CHECK `coach_note_visibility_client_check` enforces the
 * same rule, the service rejects earlier with `invalid_input`.
 *
 * Authorization context comes from the /api/v1 route helper (capability
 * `notes.write`: staff workspace scope, client deny). The service still
 * re-reads the caller's membership FOR UPDATE inside the transaction, so
 * a suspended or removed member loses access on the next call. Write ops
 * require scope "workspace"; the own-scope read path returns only GENERAL
 * notes on the caller's own profile (client-visible surface, O13).
 *
 * Deletes are soft (D24): the canvas shows an Undo toast on remove, so the
 * row keeps `deletedAt` + `restoreUntil` for `RESTORE_WINDOW_MS` and can be
 * restored inside the window only. Structural audit on changed mutations
 * (ids + `changed` marker, never body text).
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import { writeAuditEvent } from "../audit";
import { AccessDeniedError, type AuthorizationContext } from "../auth/guard";
import type { WorkspaceRole } from "../auth/rbac";
import {
  prisma,
  withSerializedRetry as sharedWithSerializedRetry,
} from "../db";

export class NoteError extends Error {
  constructor(
    public code:
      "invalid_input" | "not_available" | "conflict" | "serialization_conflict",
    message?: string,
  ) {
    super(message ?? code);
  }
}

/**
 * Typed caller context — the /api/v1 route helper resolves membership,
 * workspace status and capability scope before the service runs.
 * `scope` is "workspace" for staff, "own" for a client caller.
 */
export type NoteCaller = {
  userId: string;
  workspaceId: string;
  scope: "workspace" | "own";
};

type PrismaLike = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRawUnsafe"
  | "$executeRawUnsafe"
  | "coachNote"
  | "clientProfile"
  | "workspaceMember"
  | "auditEvent"
>;

export type NoteDeps = { db?: PrismaLike };

const MAX_ATTEMPTS = 3;
const PAGE_FETCH = 51;
const PAGE_SIZE = 50;

/**
 * D24 undo bound. The canvas toast is dismiss-driven (no auto-timeout),
 * so "toast lifetime" has no measurable upper bound; the server keeps a
 * fixed window long enough for a real undo click, after which the delete
 * is terminal — an engineering interpretation, flagged in the PR report.
 */
export const RESTORE_WINDOW_MS = 30_000;

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: MAX_ATTEMPTS,
    onExhausted: () => new NoteError("serialization_conflict"),
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

/** Re-resolve + FOR UPDATE the caller's ACTIVE membership. */
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
      "coachNotes",
      "write",
    );
  return member;
}

function auditCtx(member: LockedMember, caller: NoteCaller) {
  return {
    userId: caller.userId,
    platformRole: "USER",
    workspaceId: caller.workspaceId,
    workspaceMemberId: member.id,
    workspaceRole: member.role,
    grantedScope: "workspace",
  } as AuthorizationContext;
}

function requireStaff(caller: NoteCaller): void {
  if (caller.scope !== "workspace")
    throw new AccessDeniedError("role_denied", "coachNotes", "write");
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
      "coachNotes",
      "write",
    );
}

type NoteRow = {
  id: string;
  workspaceId: string;
  clientProfileId: string | null;
  visibility: "PRIVATE" | "GENERAL";
  body: string;
  authorMemberId: string;
  revision: number;
  deletedAt: Date | null;
  restoreUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toView(row: NoteRow): NoteView {
  return {
    id: row.id,
    clientProfileId: row.clientProfileId,
    visibility: row.visibility,
    body: row.body,
    authorMemberId: row.authorMemberId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type NoteView = {
  id: string;
  clientProfileId: string | null;
  visibility: "PRIVATE" | "GENERAL";
  body: string;
  authorMemberId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

const NOTE_SELECT = {
  id: true,
  workspaceId: true,
  clientProfileId: true,
  visibility: true,
  body: true,
  authorMemberId: true,
  revision: true,
  deletedAt: true,
  restoreUntil: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function normalizeNoteBody(input: unknown): string {
  if (typeof input !== "string") throw new NoteError("invalid_input");
  const body = input.trim();
  // The schema CHECK (btrim(body) <> '') is the only contract bound.
  if (body.length === 0) throw new NoteError("invalid_input");
  return body;
}

export function normalizeVisibility(input: unknown): "PRIVATE" | "GENERAL" {
  if (input !== "PRIVATE" && input !== "GENERAL")
    throw new NoteError("invalid_input");
  return input;
}

/* ---------------- create ---------------- */

export async function createCoachNote(
  caller: NoteCaller,
  input: {
    clientProfileId?: string | null;
    visibility: unknown;
    body: unknown;
  },
  deps: NoteDeps = {},
): Promise<{ id: string; revision: number }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  const visibility = normalizeVisibility(input.visibility);
  const body = normalizeNoteBody(input.body);
  const clientProfileId = input.clientProfileId ?? null;
  // Canvas rule (and schema CHECK): a GENERAL note always names a client;
  // only PRIVATE notes may be workspace-level.
  if (visibility === "GENERAL" && clientProfileId === null)
    throw new NoteError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        if (clientProfileId !== null)
          await advisoryLock(
            tx,
            `cnote:${caller.workspaceId}:${clientProfileId}`,
          );
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        if (clientProfileId !== null)
          await lockProfile(tx, caller.workspaceId, clientProfileId);

        const row = await tx.coachNote.create({
          data: {
            workspaceId: caller.workspaceId,
            clientProfileId,
            visibility,
            body,
            authorMemberId: member.id,
          },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "CREATE",
          resourceType: "coach_note",
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

async function lockNoteForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  noteId: string,
): Promise<NoteRow> {
  const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "coach_note"
     WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    noteId,
    workspaceId,
  );
  const row = rows[0];
  if (!row) throw new NoteError("not_available");
  return {
    id: row["id"] as string,
    workspaceId: row["workspace_id"] as string,
    clientProfileId: (row["client_profile_id"] as string | null) ?? null,
    visibility: row["visibility"] as "PRIVATE" | "GENERAL",
    body: row["body"] as string,
    authorMemberId: row["author_member_id"] as string,
    revision: row["revision"] as number,
    deletedAt: row["deleted_at"] ? new Date(row["deleted_at"] as string) : null,
    restoreUntil: row["restore_until"]
      ? new Date(row["restore_until"] as string)
      : null,
    createdAt: new Date(row["created_at"] as string),
    updatedAt: new Date(row["updated_at"] as string),
  };
}

/* ---------------- update body ---------------- */

export async function updateCoachNoteBody(
  caller: NoteCaller,
  input: { noteId: string; body: unknown; expectedRevision: number },
  deps: NoteDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  const body = normalizeNoteBody(input.body);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
    throw new NoteError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        const row = await lockNoteForUpdate(
          tx,
          caller.workspaceId,
          input.noteId,
        );
        if (row.deletedAt) throw new NoteError("not_available");
        if (row.revision !== input.expectedRevision)
          throw new NoteError("conflict");
        if (row.body === body)
          return { revision: row.revision, changed: false };

        await tx.coachNote.update({
          where: { id: row.id },
          data: { body, revision: { increment: 1 } },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "UPDATE",
          resourceType: "coach_note",
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

/* ---------------- delete + restore (D24) ---------------- */

export async function deleteCoachNote(
  caller: NoteCaller,
  input: { noteId: string; expectedRevision: number },
  deps: NoteDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)
    throw new NoteError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        const row = await lockNoteForUpdate(
          tx,
          caller.workspaceId,
          input.noteId,
        );
        if (row.revision !== input.expectedRevision)
          throw new NoteError("conflict");
        if (row.deletedAt) return { revision: row.revision, changed: false };

        const now = new Date();
        await tx.coachNote.update({
          where: { id: row.id },
          data: {
            deletedAt: now,
            restoreUntil: new Date(now.getTime() + RESTORE_WINDOW_MS),
            revision: { increment: 1 },
          },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "DELETE",
          resourceType: "coach_note",
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

export async function restoreCoachNote(
  caller: NoteCaller,
  input: { noteId: string },
  deps: NoteDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const member = await lockMember(tx, caller.workspaceId, caller.userId);
        const row = await lockNoteForUpdate(
          tx,
          caller.workspaceId,
          input.noteId,
        );
        if (!row.deletedAt) return { revision: row.revision, changed: false };
        if (!row.restoreUntil || row.restoreUntil.getTime() <= Date.now())
          throw new NoteError("not_available");

        await tx.coachNote.update({
          where: { id: row.id },
          data: {
            deletedAt: null,
            restoreUntil: null,
            revision: { increment: 1 },
          },
        });
        await writeAuditEvent(tx, auditCtx(member, caller), {
          action: "UPDATE",
          resourceType: "coach_note",
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

/* ---------------- reads ---------------- */

/**
 * Staff list: every live note in the workspace, or one client's notes when
 * `clientProfileId` is given (workspace-scoped check enforced). Matches the
 * canvas Notes workspace, which merges workspace-level and per-client
 * notes in one list.
 */
export async function listCoachNotes(
  caller: NoteCaller,
  input: { clientProfileId?: string | null } = {},
  deps: NoteDeps = {},
): Promise<{ notes: NoteView[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  requireStaff(caller);
  return db.$transaction(async (tx) => {
    await lockMember(tx, caller.workspaceId, caller.userId);
    if (input.clientProfileId)
      await lockProfile(tx, caller.workspaceId, input.clientProfileId);
    const rows = (await tx.coachNote.findMany({
      where: {
        workspaceId: caller.workspaceId,
        deletedAt: null,
        ...(input.clientProfileId
          ? { clientProfileId: input.clientProfileId }
          : {}),
      },
      select: NOTE_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: PAGE_FETCH,
    })) as unknown as NoteRow[];
    return {
      notes: rows.slice(0, PAGE_SIZE).map(toView),
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}

/**
 * Client-visible read (O13): GENERAL notes only, and only on the caller's
 * own client profile. A foreign profile id — or any PRIVATE content —
 * can never leak through this path. No route exposes it yet; the wiring
 * PR binds it to a client-readable capability.
 */
export async function listClientVisibleNotes(
  caller: NoteCaller,
  input: { clientProfileId?: string | null } = {},
  deps: NoteDeps = {},
): Promise<{ notes: NoteView[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  if (caller.scope !== "own")
    throw new AccessDeniedError("role_denied", "coachNotes", "read");
  return db.$transaction(async (tx) => {
    const member = await lockMember(tx, caller.workspaceId, caller.userId);
    void member;
    const profile = await tx.clientProfile.findFirst({
      where: { workspaceId: caller.workspaceId, userId: caller.userId },
      select: { id: true },
    });
    if (!profile)
      throw new AccessDeniedError("not_owner", "coachNotes", "read");
    if (input.clientProfileId && input.clientProfileId !== profile.id)
      throw new AccessDeniedError("not_owner", "coachNotes", "read");
    const rows = (await tx.coachNote.findMany({
      where: {
        workspaceId: caller.workspaceId,
        clientProfileId: profile.id,
        visibility: "GENERAL",
        deletedAt: null,
      },
      select: NOTE_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: PAGE_FETCH,
    })) as unknown as NoteRow[];
    return {
      notes: rows.slice(0, PAGE_SIZE).map(toView),
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}
