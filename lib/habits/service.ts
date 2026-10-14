/**
 * HABITS-I1 (decision 110): staff-configured client habits + client
 * own-profile log marks. Reviewed protocol — `habit:{ws}:{client}`
 * advisory BEFORE `member:{ws}:{user}` (same slot convention as ctask),
 * member FOR UPDATE, in-tx authorize, client profile FOR UPDATE on
 * mutations.
 *
 * Operation split enforced INSIDE the transaction after scope
 * resolution: management ops (create/edit/archive/staff reads) require
 * workspace|assigned; log ops require grantedScope === "own" AND the
 * habit's client profile bound to the caller's identity. A generic RBAC
 * "write" cell is never the operation authority; caller-supplied
 * role/mode fields are ignored.
 *
 * Schedule boundaries are effective-dated and server-computed: creation
 * writes the declared startDate row (today or later — never past);
 * edits/archive upsert at server-UTC tomorrow, or at the habit's
 * earliest boundary when that boundary is still in the future (a
 * pending schedule is revised, never started early). Past boundary rows
 * are never mutated — historical denominators resolve from the row in
 * force on each date, never from current mutable fields.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { AccessDeniedError, authorize } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import {
  ARCHIVE_WEEKDAY_MASK,
  habitPeriodDays,
  maskCoversDate,
  parseHabitEndDate,
  parseHabitStartDate,
  parseWeekdayMask,
  serverTodayUtc,
  shiftDateUtc,
} from "./date";

export class HabitError extends Error {
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
  | "habit"
  | "habitSchedule"
  | "habitLog"
  | "clientProfile"
  | "workspaceMember"
  | "clientAssignment"
  | "auditEvent"
  | "user"
  | "workspace"
>;

export type HabitDeps = { db?: PrismaLike; now?: Date };

const MAX_ATTEMPTS = 3;
const PAGE_FETCH = 21;
const PAGE_SIZE = 20;
const FIELDS_MAX = 8;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type HabitView = {
  id: string;
  name: string;
  target: string;
  archived: boolean;
  revision: number;
  /** Latest declared boundary (the editable, not-yet-past schedule). */
  schedule: { weekdays: number; endDate: string | null } | null;
};

export type TodayHabitView = {
  id: string;
  name: string;
  target: string;
  /** Current stored log state for today. */
  status: "DONE" | "SKIPPED" | "NONE";
};

export type HabitConsistencyRow = {
  habitId: string;
  name: string;
  target: string;
  scheduled: number;
  done: number;
  skipped: number;
  missing: number;
};

export type HabitConsistencyResult = {
  period: string;
  from: string;
  to: string;
  rows: HabitConsistencyRow[];
  totals: { scheduled: number; done: number; skipped: number; missing: number };
};

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
  throw new HabitError("serialization_conflict");
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
    throw new AccessDeniedError("unauthenticated", "habits", request.action);
  await advisoryLock(
    tx,
    `habit:${request.workspaceId}:${request.clientProfileId}`,
  );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const member = await lockMember(tx, request.workspaceId, userId);
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "habits",
      request.action,
    );
  const ctx = await authorize(
    session,
    {
      resource: "habits",
      action: request.action,
      workspaceId: request.workspaceId,
      clientProfileId: request.clientProfileId,
    },
    createPrismaAuthorizationRepo(tx),
  );
  if (ctx.workspaceMemberId !== member.id)
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "habits",
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
  if (!resolved) throw new AccessDeniedError("not_assigned", "habits", "write");
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
    throw new AccessDeniedError("not_assigned", "habits", "write");
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
    throw new AccessDeniedError("client_outside_workspace", "habits", "write");
}

/** Management ops (create/edit/archive) — workspace or assigned only. */
function requireManagementScope(
  ctx: { grantedScope: string },
  action: "read" | "write",
): void {
  if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
    throw new AccessDeniedError("role_denied", "habits", action);
}

function normalizeBoundedText(input: unknown): string {
  if (typeof input !== "string") throw new HabitError("invalid_input");
  const value = input.trim();
  if (value.length === 0 || value.length > 120)
    throw new HabitError("invalid_input");
  return value;
}

/** Strict declared-date grammar check (bounds handled by callers). */
function strictDate(input: unknown): string | null {
  if (typeof input !== "string" || !DATE_RE.test(input)) return null;
  const [y, m, d] = input.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    return null;
  return dt.toISOString().slice(0, 10);
}

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

type HabitRow = {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  name: string;
  target: string;
  revision: number;
  archivedAt: Date | null;
  createdAt: Date;
};

function mapHabitRow(row: Record<string, unknown>): HabitRow {
  return {
    id: row["id"] as string,
    workspaceId: row["workspace_id"] as string,
    clientProfileId: row["client_profile_id"] as string,
    name: row["name"] as string,
    target: row["target"] as string,
    revision: row["revision"] as number,
    archivedAt: row["archived_at"]
      ? new Date(row["archived_at"] as never)
      : null,
    createdAt: new Date(row["created_at"] as never),
  };
}

async function lockHabitForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  habitId: string,
): Promise<HabitRow> {
  const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "habits"
     WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
     FOR UPDATE`,
    habitId,
    workspaceId,
    clientProfileId,
  );
  const row = rows[0];
  if (!row) throw new HabitError("not_available");
  return mapHabitRow(row);
}

type Boundary = {
  effectiveFrom: string;
  weekdays: number;
  endDate: string | null;
};

function mapBoundary(row: {
  effectiveFrom: Date;
  weekdays: number;
  endDate: Date | null;
}): Boundary {
  return {
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    weekdays: row.weekdays,
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
  };
}

/**
 * The boundary in force on a declared date: the latest row with
 * effectiveFrom <= date (boundary rows are effective-dated history —
 * never rewritten after the fact).
 */
function boundaryInForce(
  boundaries: Boundary[],
  date: string,
): Boundary | null {
  let inForce: Boundary | null = null;
  for (const b of boundaries) {
    if (b.effectiveFrom <= date) inForce = b;
    else break;
  }
  return inForce;
}

/** Scheduled on `date` iff an in-force boundary covers its weekday and range. */
function scheduledOn(boundaries: Boundary[], date: string): boolean {
  const b = boundaryInForce(boundaries, date);
  if (!b || b.weekdays === ARCHIVE_WEEKDAY_MASK) return false;
  if (b.endDate !== null && date > b.endDate) return false;
  return maskCoversDate(b.weekdays, date);
}

async function boundariesOf(
  tx: Prisma.TransactionClient,
  habitIds: string[],
): Promise<Map<string, Boundary[]>> {
  const map = new Map<string, Boundary[]>();
  if (habitIds.length === 0) return map;
  const rows = await tx.habitSchedule.findMany({
    where: { habitId: { in: habitIds } },
    orderBy: { effectiveFrom: "asc" },
  });
  for (const r of rows) {
    const list = map.get(r.habitId) ?? [];
    list.push(mapBoundary(r));
    map.set(r.habitId, list);
  }
  return map;
}

function validateFields(fields: unknown): string[] | null {
  if (fields === undefined || fields === null) return null;
  if (!Array.isArray(fields) || fields.length > FIELDS_MAX)
    throw new HabitError("invalid_input");
  const out: string[] = [];
  for (const f of fields) {
    if (typeof f !== "string" || f.length === 0 || f.length > 64)
      throw new HabitError("invalid_input");
    if (!out.includes(f)) out.push(f);
  }
  // Empty/deduped-to-empty selects the full authorized cohort — a layout
  // stores `fields: []` when no subset was picked.
  return out.length === 0 ? null : out;
}

/** Resolve the caller's own client profile in the workspace. */
async function ownProfile(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
): Promise<{ id: string }> {
  const profile = await tx.clientProfile.findFirst({
    where: { workspaceId, userId },
    select: { id: true },
  });
  if (!profile) throw new AccessDeniedError("not_owner", "habits", "read");
  return profile;
}

/* ---------------- create ---------------- */

export async function createHabit(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    name: unknown;
    target: unknown;
    startDate: unknown;
    weekdays: unknown;
    endDate?: unknown;
  },
  deps: HabitDeps = {},
): Promise<{ id: string; revision: number }> {
  const db = deps.db ?? prisma;
  const today = serverTodayUtc(deps.now ?? new Date());
  const name = normalizeBoundedText(input.name);
  const target = normalizeBoundedText(input.target);
  const startDate = parseHabitStartDate(input.startDate, { today });
  if (!startDate) throw new HabitError("invalid_input");
  const weekdays = parseWeekdayMask(input.weekdays);
  if (weekdays === null) throw new HabitError("invalid_input");
  let endDate: string | null = null;
  if (input.endDate !== undefined && input.endDate !== null) {
    endDate = parseHabitEndDate(input.endDate, { startDate, today });
    if (!endDate) throw new HabitError("invalid_input");
  }
  const schedule = { weekdays, endDate };

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

        const row = await tx.habit.create({
          data: {
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
            name,
            target,
            // The declared start date is the initial effective boundary —
            // the only boundary that may equal today.
            schedules: {
              create: {
                effectiveFrom: utcDate(startDate),
                weekdays: schedule.weekdays,
                endDate: schedule.endDate ? utcDate(schedule.endDate) : null,
              },
            },
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "CREATE",
          resourceType: "habit",
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

/* ---------------- edit ---------------- */

export async function editHabit(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    habitId: string;
    name?: unknown;
    target?: unknown;
    schedule?: { weekdays?: unknown; endDate?: unknown };
    expectedRevision: number;
  },
  deps: HabitDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  const today = serverTodayUtc(deps.now ?? new Date());
  const tomorrow = shiftDateUtc(today, 1);
  const name =
    input.name === undefined ? undefined : normalizeBoundedText(input.name);
  const target =
    input.target === undefined ? undefined : normalizeBoundedText(input.target);
  let schedule: { weekdays: number; endDate: string | null } | undefined;
  if (input.schedule !== undefined) {
    const weekdays = parseWeekdayMask(input.schedule.weekdays);
    if (weekdays === null) throw new HabitError("invalid_input");
    let endDate: string | null = null;
    const rawEnd = input.schedule.endDate;
    if (rawEnd !== undefined && rawEnd !== null) {
      endDate = parseHabitEndDate(rawEnd, { startDate: tomorrow, today });
      if (!endDate) throw new HabitError("invalid_input");
    }
    schedule = { weekdays, endDate };
  }

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

        const row = await lockHabitForUpdate(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.habitId,
        );
        if (row.revision !== input.expectedRevision)
          throw new HabitError("conflict");
        if (row.archivedAt) throw new HabitError("not_available");

        const nextName = name ?? row.name;
        const nextTarget = target ?? row.target;
        let scheduleChanged = false;

        if (schedule !== undefined) {
          // Boundary date: tomorrow, unless the habit's earliest boundary
          // is still in the future — a pending schedule is revised at its
          // own boundary, never started early.
          const boundaries = await boundariesOf(tx, [row.id]);
          const list = boundaries.get(row.id) ?? [];
          const earliest = list[0]?.effectiveFrom;
          const boundaryDate =
            earliest && earliest > tomorrow ? earliest : tomorrow;
          // Compare against what would govern from that boundary forward.
          const current =
            list.find((b) => b.effectiveFrom === boundaryDate) ??
            boundaryInForce(list, boundaryDate);
          scheduleChanged =
            !current ||
            current.weekdays !== schedule.weekdays ||
            current.endDate !== schedule.endDate;
          if (scheduleChanged)
            await tx.habitSchedule.upsert({
              where: {
                habitId_effectiveFrom: {
                  habitId: row.id,
                  effectiveFrom: utcDate(boundaryDate),
                },
              },
              create: {
                habitId: row.id,
                effectiveFrom: utcDate(boundaryDate),
                weekdays: schedule.weekdays,
                endDate: schedule.endDate ? utcDate(schedule.endDate) : null,
              },
              update: {
                weekdays: schedule.weekdays,
                endDate: schedule.endDate ? utcDate(schedule.endDate) : null,
              },
            });
        }

        if (
          nextName === row.name &&
          nextTarget === row.target &&
          !scheduleChanged
        )
          return { revision: row.revision, changed: false };

        await tx.habit.update({
          where: { id: row.id },
          data: {
            name: nextName,
            target: nextTarget,
            revision: { increment: 1 },
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "habit",
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

/* ---------------- archive ---------------- */

export async function archiveHabit(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    habitId: string;
    expectedRevision: number;
  },
  deps: HabitDeps = {},
): Promise<{ revision: number; changed: boolean }> {
  const db = deps.db ?? prisma;
  const today = serverTodayUtc(deps.now ?? new Date());
  const tomorrow = shiftDateUtc(today, 1);

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

        const row = await lockHabitForUpdate(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.habitId,
        );
        if (row.revision !== input.expectedRevision)
          throw new HabitError("conflict");
        if (row.archivedAt) return { revision: row.revision, changed: false };

        // Zero boundary at tomorrow — or at the habit's earliest future
        // boundary if it never started. History stays intact: rows before
        // the boundary still resolve as scheduled.
        const boundaries = await boundariesOf(tx, [row.id]);
        const list = boundaries.get(row.id) ?? [];
        const earliest = list[0]?.effectiveFrom;
        const boundaryDate =
          earliest && earliest > tomorrow ? earliest : tomorrow;
        await tx.habitSchedule.upsert({
          where: {
            habitId_effectiveFrom: {
              habitId: row.id,
              effectiveFrom: utcDate(boundaryDate),
            },
          },
          create: {
            habitId: row.id,
            effectiveFrom: utcDate(boundaryDate),
            weekdays: ARCHIVE_WEEKDAY_MASK,
            endDate: null,
          },
          update: { weekdays: ARCHIVE_WEEKDAY_MASK, endDate: null },
        });
        await tx.habit.update({
          where: { id: row.id },
          data: { archivedAt: new Date(), revision: { increment: 1 } },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "habit",
          resourceId: row.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true, status: "ARCHIVED" },
        });
        return { revision: row.revision + 1, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- setHabitLog (client own only) ---------------- */

export async function setHabitLog(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    habitId: string;
    date: unknown;
    desired: "DONE" | "CLEARED";
  },
  deps: HabitDeps = {},
): Promise<{ status: "DONE" | "NONE"; changed: boolean }> {
  const db = deps.db ?? prisma;
  const today = serverTodayUtc(deps.now ?? new Date());
  if (input.desired !== "DONE" && input.desired !== "CLEARED")
    throw new HabitError("invalid_input");
  const date = strictDate(input.date);
  if (!date || date > today) throw new HabitError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, userId } = await lockedAuthorize(tx, session, {
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        // Operation split: ONLY the owning client's own-scope may write a
        // log — staff roles resolve higher scopes and are rejected here
        // even when they also own a clientProfile.
        if (ctx.grantedScope !== "own")
          throw new AccessDeniedError("role_denied", "habits", "write");
        const client = await tx.clientProfile.findUnique({
          where: { id: input.clientProfileId },
          select: { userId: true },
        });
        if (!client || client.userId !== userId)
          throw new AccessDeniedError("not_owner", "habits", "write");

        const habit = await lockHabitForUpdate(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.habitId,
        );
        const boundaries = await boundariesOf(tx, [habit.id]);
        const list = boundaries.get(habit.id) ?? [];
        // Pre-enrollment or unscheduled date — the day never existed as
        // an opportunity; reject rather than fabricate a row.
        if (!scheduledOn(list, date)) throw new HabitError("not_available");

        const existing = await tx.habitLog.findUnique({
          where: { habitId_date: { habitId: habit.id, date: utcDate(date) } },
        });

        if (input.desired === "DONE") {
          if (existing?.status === "DONE")
            return { status: "DONE", changed: false };
          await tx.habitLog.upsert({
            where: { habitId_date: { habitId: habit.id, date: utcDate(date) } },
            create: {
              habitId: habit.id,
              date: utcDate(date),
              status: "DONE",
              loggedByUserId: userId,
            },
            update: { status: "DONE", loggedByUserId: userId },
          });
          await writeAuditEvent(tx, ctx, {
            action: "UPDATE",
            resourceType: "habit_log",
            resourceId: habit.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { changed: true, date, logStatus: "DONE" },
          });
          return { status: "DONE", changed: true };
        }

        // desired === "CLEARED" — undo removes the row.
        if (!existing) return { status: "NONE", changed: false };
        await tx.habitLog.delete({ where: { id: existing.id } });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "habit_log",
          resourceId: habit.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true, date, logStatus: "CLEARED" },
        });
        return { status: "NONE", changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/* ---------------- reads ---------------- */

async function latestBoundaries(
  tx: Prisma.TransactionClient,
  habitIds: string[],
): Promise<Map<string, { weekdays: number; endDate: string | null }>> {
  const map = new Map<string, { weekdays: number; endDate: string | null }>();
  const boundaries = await boundariesOf(tx, habitIds);
  for (const [id, list] of boundaries)
    if (list.length > 0)
      map.set(id, {
        weekdays: list[list.length - 1].weekdays,
        endDate: list[list.length - 1].endDate,
      });
  return map;
}

/** Staff management list — bounded, truthful hasMore. */
export async function listStaffHabits(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: HabitDeps = {},
): Promise<{ habits: HabitView[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  return db.$transaction(async (tx) => {
    const { ctx } = await lockedAuthorize(tx, session, {
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    });
    requireManagementScope(ctx, "read");
    const rows = (await tx.habit.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: PAGE_FETCH,
    })) as unknown as HabitRow[];
    const page = rows.slice(0, PAGE_SIZE);
    const latest = await latestBoundaries(
      tx,
      page.map((r) => r.id),
    );
    return {
      habits: page.map((r) => ({
        id: r.id,
        name: r.name,
        target: r.target,
        archived: r.archivedAt !== null,
        revision: r.revision,
        schedule: latest.get(r.id) ?? null,
      })),
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}

/** Editor habit picker — non-archived choices only, bounded. */
export async function listHabitChoices(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: HabitDeps = {},
): Promise<{ choices: { id: string; name: string }[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  return db.$transaction(async (tx) => {
    const { ctx } = await lockedAuthorize(tx, session, {
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    });
    requireManagementScope(ctx, "read");
    const rows = (await tx.habit.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        archivedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: PAGE_FETCH,
    })) as unknown as HabitRow[];
    return {
      choices: rows
        .slice(0, PAGE_SIZE)
        .map((r) => ({ id: r.id, name: r.name })),
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}

/**
 * TL21 — the client's current scheduled list: non-archived habits whose
 * in-force boundary covers TODAY. `fields` (<=8) selects a subset;
 * foreign/missing IDs drop silently.
 */
export async function listTodayHabits(
  session: SessionLike,
  input: { workspaceId: string; fields?: unknown },
  deps: HabitDeps = {},
): Promise<{ habits: TodayHabitView[]; hasMore: boolean }> {
  const db = deps.db ?? prisma;
  const today = serverTodayUtc(deps.now ?? new Date());
  const fields = validateFields(input.fields);
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "habits", "read");

  return db.$transaction(async (tx) => {
    const profile = await ownProfile(tx, input.workspaceId, userId);
    const { ctx } = await lockedAuthorize(tx, session, {
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: profile.id,
    });
    if (ctx.grantedScope !== "own")
      throw new AccessDeniedError("role_denied", "habits", "read");

    // Eligibility is computed before the page bound — all non-archived
    // habits' boundaries are resolved, then the fields filter applies,
    // then the bound. An eligible row can never hide behind the limit.
    const candidates = (await tx.habit.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
        archivedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })) as unknown as HabitRow[];
    const boundaries = await boundariesOf(
      tx,
      candidates.map((c) => c.id),
    );
    let eligible = candidates.filter((c) =>
      scheduledOn(boundaries.get(c.id) ?? [], today),
    );
    if (fields !== null)
      eligible = eligible.filter((c) => fields.includes(c.id));

    const page = eligible.slice(0, PAGE_SIZE);
    const logs = await tx.habitLog.findMany({
      where: { habitId: { in: page.map((h) => h.id) }, date: utcDate(today) },
    });
    const logByHabit = new Map(logs.map((l) => [l.habitId, l.status]));
    return {
      habits: page.map((h) => ({
        id: h.id,
        name: h.name,
        target: h.target,
        status: logByHabit.get(h.id) ?? "NONE",
      })),
      hasMore: eligible.length > PAGE_SIZE,
    };
  });
}

/**
 * TL22 — historical consistency over the FULL authorized cohort (never
 * bounded by the list page). Window [today-(days-1), today]; scheduled
 * denominators resolve per-day from the boundary in force on each date —
 * never from current mutable fields. Archived habits keep their history.
 */
export async function habitConsistency(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId?: string;
    period: unknown;
    fields?: unknown;
  },
  deps: HabitDeps = {},
): Promise<HabitConsistencyResult> {
  const db = deps.db ?? prisma;
  const today = serverTodayUtc(deps.now ?? new Date());
  const days =
    typeof input.period === "string" ? habitPeriodDays(input.period) : null;
  if (!days) throw new HabitError("invalid_input");
  const from = shiftDateUtc(today, -(days - 1));
  const fields = validateFields(input.fields);
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "habits", "read");

  return db.$transaction(async (tx) => {
    let clientProfileId: string;
    if (input.clientProfileId !== undefined) {
      // Staff path — management read scope, or the owner reading their
      // own profile explicitly.
      const { ctx } = await lockedAuthorize(tx, session, {
        action: "read",
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      });
      if (ctx.grantedScope === "own") {
        const client = await tx.clientProfile.findUnique({
          where: { id: input.clientProfileId },
          select: { userId: true },
        });
        if (!client || client.userId !== userId)
          throw new AccessDeniedError("not_owner", "habits", "read");
      } else requireManagementScope(ctx, "read");
      clientProfileId = input.clientProfileId;
    } else {
      const profile = await ownProfile(tx, input.workspaceId, userId);
      const { ctx } = await lockedAuthorize(tx, session, {
        action: "read",
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      });
      if (ctx.grantedScope !== "own")
        throw new AccessDeniedError("role_denied", "habits", "read");
      clientProfileId = profile.id;
    }

    const cohort = (await tx.habit.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId,
        ...(fields !== null ? { id: { in: fields } } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })) as unknown as HabitRow[];

    const ids = cohort.map((h) => h.id);
    const boundaries = await boundariesOf(tx, ids);
    const logs = await tx.habitLog.findMany({
      where: {
        habitId: { in: ids },
        date: { gte: utcDate(from), lte: utcDate(today) },
      },
    });
    const logsByHabitDay = new Map<string, string>();
    for (const l of logs)
      logsByHabitDay.set(
        `${l.habitId}:${l.date.toISOString().slice(0, 10)}`,
        l.status,
      );

    const rows: HabitConsistencyRow[] = [];
    const totals = { scheduled: 0, done: 0, skipped: 0, missing: 0 };
    for (const habit of cohort) {
      const list = boundaries.get(habit.id) ?? [];
      const row = {
        habitId: habit.id,
        name: habit.name,
        target: habit.target,
        scheduled: 0,
        done: 0,
        skipped: 0,
        missing: 0,
      };
      for (let i = 0; i < days; i++) {
        const date = shiftDateUtc(from, i);
        if (!scheduledOn(list, date)) continue;
        row.scheduled++;
        const status = logsByHabitDay.get(`${habit.id}:${date}`);
        if (status === "DONE") row.done++;
        else if (status === "SKIPPED") row.skipped++;
        else row.missing++;
      }
      rows.push(row);
      totals.scheduled += row.scheduled;
      totals.done += row.done;
      totals.skipped += row.skipped;
      totals.missing += row.missing;
    }
    return {
      period: input.period as string,
      from,
      to: today,
      rows,
      totals,
    };
  });
}
