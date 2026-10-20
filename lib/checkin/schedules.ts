/**
 * CHECK-IN-RECURRENCE-I1 (decision #114 — owner-approved bounded first
 * version; reviewed P3 contract + P3-R1 refinements).
 *
 * Weekly Check-In schedule rules: ONE weekday per week at a chosen
 * local time in the coach-CONFIRMED IANA timezone. This is bounded
 * recurring scheduling, NOT a scheduler:
 *   - occurrences exist ONLY after an explicit authorized staff
 *     generation action — never from a GET/RSC/prefetch/list/calendar
 *     read, never from cron, never under a hidden maintenance identity;
 *   - the horizon is T+56 inclusive in the rule's timezone (up to 9
 *     occurrences); later extension is another explicit action;
 *   - pause blocks generation; resume and inactivity NEVER backfill;
 *   - End is terminal and cancels still-unsubmitted generated
 *     occurrences; submitted/reviewed history is immutable;
 *   - schedule changes are end-and-replace (no in-place rule edits);
 *   - each generation pins the LATEST ACTIVE published form version;
 *     previously generated instances keep their pinned version;
 *   - `scheduledByMemberId` on generated instances is the CURRENT
 *     authorized generating actor — never the rule creator.
 *
 * Lock protocol mirrors instances.ts (client-scoped — chkin advisory):
 *   bounded answer-free pre-read → advisory `chkin:{ws}:{cp}:{formId}`
 *   → advisory `member:{ws}:{userId}` → member FOR UPDATE →
 *   in-transaction authorize(checkinInstances/write) → assigned branch
 *   re-resolves + locks the ACTIVE ClientAssignment → profile FOR UPDATE
 *   → rule FOR UPDATE → batch work → structural audits LAST → commit.
 * The chkin advisory key carries the rule's formId, so End's batch
 * cancel serializes against a concurrent submission on any generated
 * instance of the same (client, form) pair (P3-R1 P3-5).
 *
 * Batch classification (P3 §2 — three distinct outcomes, never
 * `skipDuplicates`): pre-query A maps occurrence identity
 * (originRuleId, occurrenceDate) → already-generated; pre-query B maps
 * the due-instant unique (ws, cp, formId, dueAt) over the remainder —
 * INCLUDING cancelled rows — → conflicts; the rest are inserted one
 * `create` + one CREATE audit each inside the single Serializable
 * transaction. A P2002 from either unique (concurrent writer) → one
 * bounded full-protocol re-enter; the winner's rows re-classify
 * truthfully. A second conflict → closed `serialization_conflict`.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  prisma as defaultPrisma,
  withSerializedRetry as sharedWithSerializedRetry,
} from "../db";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import {
  isValidIanaTimeZone,
  localDateInZone,
  resolveLocalInstant,
  CHECKIN_TZ_LIMITS,
} from "./timezone";
import { CheckInInstanceError } from "./instances";

export { CheckInInstanceError };

// ── Bounds + pure helpers ──────────────────────────────────────────────

export const CHECKIN_SCHEDULE_LIMITS = {
  idMax: 128,
  /** Inclusive horizon: occurrences may exist through local T+56 —
   * up to NINE weekly dates (P3-R1 P3-1). Never "about eight rows." */
  horizonDays: 56,
} as const;

export const CHECKIN_SCHEDULE_HORIZON_DAYS =
  CHECKIN_SCHEDULE_LIMITS.horizonDays;

/** JS getUTCDay order — weekday of a local date is zone-independent. */
const WEEKDAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;
export type CheckInRuleWeekday = (typeof WEEKDAYS)[number];

export function parseCheckInScheduleWeekday(
  raw: unknown,
): CheckInRuleWeekday | null {
  return typeof raw === "string" &&
    (WEEKDAYS as readonly string[]).includes(raw)
    ? (raw as CheckInRuleWeekday)
    : null;
}

export function parseCheckInScheduleLocalTimeMinutes(
  raw: unknown,
): number | null {
  return typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= 1439
    ? raw
    : null;
}

/** Strict YYYY-MM-DD within the supported zone range; else null. */
export function parseCheckInScheduleLocalDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y] = raw.split("-").map(Number);
  if (y < CHECKIN_TZ_LIMITS.minIsoYear || y > CHECKIN_TZ_LIMITS.maxIsoYear)
    return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw
    ? raw
    : null;
}

function addDaysToLocalDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure occurrence enumeration — the exact reviewed horizon:
 * every `weekday` date `d` with `max(startDate, todayLocal) ≤ d ≤
 * min(todayLocal + 56d, endDate ?? ∞)`. Inclusive bound → up to 9
 * occurrences. Dates before rule-local today are unreachable (no
 * backfill); the due-instant < now exclusion happens downstream.
 */
export function enumerateRuleOccurrenceDates(input: {
  weekday: CheckInRuleWeekday;
  startDate: string;
  endDate: string | null;
  todayLocal: string;
}): string[] {
  const out: string[] = [];
  const lo =
    input.startDate > input.todayLocal ? input.startDate : input.todayLocal;
  const hi0 = addDaysToLocalDate(
    input.todayLocal,
    CHECKIN_SCHEDULE_HORIZON_DAYS,
  );
  const hi =
    input.endDate !== null && input.endDate < hi0 ? input.endDate : hi0;
  if (lo > hi) return out;
  // First `weekday` ≥ lo — weekday of a local date is zone-independent.
  const target = WEEKDAYS.indexOf(input.weekday);
  const first = new Date(`${lo}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() + ((target - first.getUTCDay() + 7) % 7));
  for (
    let d = first.toISOString().slice(0, 10);
    d <= hi;
    d = addDaysToLocalDate(d, 7)
  )
    out.push(d);
  return out;
}

// ── Serialization helpers (reviewed conventions, shared with the
//    sibling modules' private copies) ──────────────────────────────────

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: 8,
    backoffBaseMs: 15,
    backoffCapMs: 250,
    onExhausted: () => new CheckInInstanceError("serialization_conflict"),
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

export type CheckInScheduleDeps = {
  db?: PrismaLike;
  /** Injectable clock for deterministic tests; defaults to now. */
  now?: () => Date;
};

type PrismaLike = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRawUnsafe"
  | "checkInScheduleRule"
  | "checkInInstance"
  | "checkInSubmission"
  | "checkInForm"
  | "checkInFormVersion"
  | "clientProfile"
  | "workspaceMember"
  | "clientAssignment"
  | "auditEvent"
>;

// ── Shared locked-authorization helpers (same protocol as instances.ts) ─

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
    resource: "checkinInstances";
    action: "read" | "write";
    workspaceId: string;
    clientProfileId: string;
  },
  chkinFormId: string,
) {
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError(
      "unauthenticated",
      request.resource,
      request.action,
    );
  await advisoryLock(
    tx,
    `chkin:${request.workspaceId}:${request.clientProfileId}:${chkinFormId}`,
  );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const member = await lockMember(tx, request.workspaceId, userId);
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError(
      "role_denied",
      request.resource,
      request.action,
    );
  const ctx = await authorize(
    session,
    request,
    createPrismaAuthorizationRepo(tx),
  );
  if (ctx.workspaceMemberId !== member.id)
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      request.resource,
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
    throw new AccessDeniedError("not_assigned", "checkinInstances", "write");
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
    throw new AccessDeniedError("not_assigned", "checkinInstances", "write");
}

async function lockProfile(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<{ id: string } | null> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "client_profile"
     WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    clientProfileId,
    workspaceId,
  );
  return rows[0] ?? null;
}

type LockedRuleRow = {
  id: string;
  formId: string;
  status: string;
};

async function lockRule(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  ruleId: string,
): Promise<LockedRuleRow | null> {
  const rows = await tx.$queryRawUnsafe<LockedRuleRow[]>(
    `SELECT id, form_id AS "formId", status
     FROM "checkin_schedule_rule"
     WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
     FOR UPDATE`,
    ruleId,
    workspaceId,
    clientProfileId,
  );
  return rows[0] ?? null;
}

function validId(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= CHECKIN_SCHEDULE_LIMITS.idMax
  );
}

/**
 * End-time batch cancel: every generated instance of the rule that is
 * still unsubmitted and uncancelled gets paired cancellation
 * provenance + an UPDATE audit — submitted/reviewed rows are never
 * touched. Callers hold the chkin advisory for the rule's formId, so a
 * concurrent submission serializes (P3-R1 P3-5).
 */
async function cancelPendingGenerated(
  tx: Prisma.TransactionClient,
  ctx: Parameters<typeof writeAuditEvent>[1],
  input: { workspaceId: string; clientProfileId: string; ruleId: string },
  memberId: string,
  now: Date,
): Promise<number> {
  const pending = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT i.id FROM "checkin_instance" i
     WHERE i.origin_rule_id = $1
       AND i.workspace_id = $2
       AND i.client_profile_id = $3
       AND i.cancelled_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM "checkin_submission" s
         WHERE s.instance_id = i.id AND s.workspace_id = i.workspace_id
       )
     ORDER BY i.due_at, i.id
     FOR UPDATE OF i`,
    input.ruleId,
    input.workspaceId,
    input.clientProfileId,
  );
  for (const row of pending) {
    await tx.checkInInstance.update({
      where: { id: row.id },
      data: { cancelledAt: now, cancelledByMemberId: memberId },
    });
    await writeAuditEvent(tx, ctx, {
      action: "UPDATE",
      resourceType: "checkin_instance",
      resourceId: row.id,
      subjectClientProfileId: input.clientProfileId,
      meta: { changed: true },
    });
  }
  return pending.length;
}

/** Terminal END transition shared by `end` and replacement. */
async function endRuleInTx(
  tx: Prisma.TransactionClient,
  ctx: Parameters<typeof writeAuditEvent>[1],
  input: {
    workspaceId: string;
    clientProfileId: string;
    ruleId: string;
    replacedByRuleId?: string;
  },
  memberId: string,
  now: Date,
): Promise<number> {
  await tx.checkInScheduleRule.update({
    where: { id: input.ruleId },
    data: {
      status: "ENDED",
      endedAt: now,
      endedByMemberId: memberId,
      ...(input.replacedByRuleId
        ? { replacedByRuleId: input.replacedByRuleId }
        : {}),
    },
  });
  const cancelledCount = await cancelPendingGenerated(
    tx,
    ctx,
    input,
    memberId,
    now,
  );
  await writeAuditEvent(tx, ctx, {
    action: "UPDATE",
    resourceType: "checkin_schedule_rule",
    resourceId: input.ruleId,
    subjectClientProfileId: input.clientProfileId,
    meta: { changed: true },
  });
  return cancelledCount;
}

// ── Staff: create rule (optionally atomic end-and-replace) ────────────

export type CreateCheckInScheduleRuleInput = {
  workspaceId: string;
  clientProfileId: string;
  formId: string;
  weekday: string;
  localTimeMinutes: number;
  timezone: string;
  startDate: string;
  endDate?: string | null;
  /** End-and-replace: ends this rule (cancelling its still-unsubmitted
   * generated occurrences) and links it to the new rule — atomically. */
  replacesRuleId?: string;
};

export type CreateCheckInScheduleRuleResult =
  | { status: "created"; ruleId: string }
  | { status: "replaced"; ruleId: string; endedRuleId: string };

export async function createCheckInScheduleRule(
  session: SessionLike,
  input: CreateCheckInScheduleRuleInput,
  deps: CheckInScheduleDeps = {},
): Promise<CreateCheckInScheduleRuleResult> {
  const db = deps.db ?? defaultPrisma;
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.formId) ||
    (input.replacesRuleId !== undefined && !validId(input.replacesRuleId))
  )
    throw new CheckInInstanceError("invalid_input");
  const weekday = parseCheckInScheduleWeekday(input.weekday);
  const localTimeMinutes = parseCheckInScheduleLocalTimeMinutes(
    input.localTimeMinutes,
  );
  const startDate = parseCheckInScheduleLocalDate(input.startDate);
  const endDate =
    input.endDate === undefined || input.endDate === null
      ? null
      : parseCheckInScheduleLocalDate(input.endDate);
  if (input.endDate !== undefined && input.endDate !== null && endDate === null)
    throw new CheckInInstanceError("invalid_input");
  if (
    weekday === null ||
    localTimeMinutes === null ||
    startDate === null ||
    (endDate !== null && endDate < startDate) ||
    !isValidIanaTimeZone(input.timezone)
  )
    throw new CheckInInstanceError("invalid_input");

  const attempt = (): Promise<CreateCheckInScheduleRuleResult> =>
    withSerializedRetry(() =>
      db.$transaction(
        async (tx) => {
          // 1. Bounded pre-read — foreign/missing profile or non-ACTIVE
          // form fails non-disclosingly BEFORE any advisory.
          const [profile, form] = await Promise.all([
            tx.clientProfile.findFirst({
              where: {
                id: input.clientProfileId,
                workspaceId: input.workspaceId,
              },
              select: { id: true },
            }),
            tx.checkInForm.findFirst({
              where: { id: input.formId, workspaceId: input.workspaceId },
              select: { status: true },
            }),
          ]);
          if (!profile || !form || form.status !== "ACTIVE")
            throw new CheckInInstanceError("not_available");

          // 2–5. Advisories → member lock → in-transaction authorize.
          const { ctx, member } = await lockedAuthorize(
            tx,
            session,
            {
              resource: "checkinInstances",
              action: "write",
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            input.formId,
          );
          if (
            ctx.grantedScope !== "workspace" &&
            ctx.grantedScope !== "assigned"
          )
            throw new AccessDeniedError(
              "role_denied",
              "checkinInstances",
              "write",
            );
          if (ctx.grantedScope === "assigned")
            await lockAssignmentForScope(
              tx,
              input.workspaceId,
              input.clientProfileId,
              member.id,
            );

          // 6. Profile lock — the client-scoped mutation anchor.
          const lockedProfile = await lockProfile(
            tx,
            input.workspaceId,
            input.clientProfileId,
          );
          if (!lockedProfile) throw new CheckInInstanceError("not_available");

          const now = new Date();

          // 7. Optional atomic replacement: the old rule must exist in
          // this scope and not already be ENDED. It ends FIRST (with
          // the reviewed pending-cancel + audit), then the new rule is
          // created and linked back.
          if (input.replacesRuleId !== undefined) {
            const old = await lockRule(
              tx,
              input.workspaceId,
              input.clientProfileId,
              input.replacesRuleId,
            );
            if (!old || old.status === "ENDED")
              throw new CheckInInstanceError("not_available");
            const fresh = await tx.checkInScheduleRule.create({
              data: {
                workspaceId: input.workspaceId,
                clientProfileId: input.clientProfileId,
                formId: input.formId,
                weekday,
                localTimeMinutes,
                timezone: input.timezone,
                startDate: new Date(`${startDate}T00:00:00Z`),
                endDate:
                  endDate === null ? null : new Date(`${endDate}T00:00:00Z`),
                createdByMemberId: member.id,
              },
              select: { id: true },
            });
            await endRuleInTx(
              tx,
              ctx,
              {
                workspaceId: input.workspaceId,
                clientProfileId: input.clientProfileId,
                ruleId: old.id,
                replacedByRuleId: fresh.id,
              },
              member.id,
              now,
            );
            await writeAuditEvent(tx, ctx, {
              action: "CREATE",
              resourceType: "checkin_schedule_rule",
              resourceId: fresh.id,
              subjectClientProfileId: input.clientProfileId,
              meta: { changed: true },
            });
            return {
              status: "replaced",
              ruleId: fresh.id,
              endedRuleId: old.id,
            } satisfies CreateCheckInScheduleRuleResult;
          }

          const rule = await tx.checkInScheduleRule.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              formId: input.formId,
              weekday,
              localTimeMinutes,
              timezone: input.timezone,
              startDate: new Date(`${startDate}T00:00:00Z`),
              endDate:
                endDate === null ? null : new Date(`${endDate}T00:00:00Z`),
              createdByMemberId: member.id,
            },
            select: { id: true },
          });
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "checkin_schedule_rule",
            resourceId: rule.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { changed: true },
          });
          return {
            status: "created",
            ruleId: rule.id,
          } satisfies CreateCheckInScheduleRuleResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

  try {
    return await attempt();
  } catch (error) {
    // P2002 — e.g. a concurrent replacement claimed replaced_by_rule_id.
    // Re-enter the COMPLETE protocol once; second conflict → closed error.
    if (!isUniqueViolation(error)) throw error;
    try {
      return await attempt();
    } catch (second) {
      if (isUniqueViolation(second))
        throw new CheckInInstanceError("serialization_conflict");
      throw second;
    }
  }
}

// ── Staff: pause / resume / end ────────────────────────────────────────

export type SetCheckInScheduleRuleStatusInput = {
  workspaceId: string;
  clientProfileId: string;
  ruleId: string;
  action: "pause" | "resume" | "end";
};

export type SetCheckInScheduleRuleStatusResult =
  | { status: "paused" }
  | { status: "resumed" }
  | { status: "ended"; cancelledCount: number };

export async function setCheckInScheduleRuleStatus(
  session: SessionLike,
  input: SetCheckInScheduleRuleStatusInput,
  deps: CheckInScheduleDeps = {},
): Promise<SetCheckInScheduleRuleStatusResult> {
  const db = deps.db ?? defaultPrisma;
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.ruleId) ||
    !["pause", "resume", "end"].includes(input.action)
  )
    throw new CheckInInstanceError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // 1. Scoped pre-read — the rule's formId derives the chkin key.
        const pre = await tx.checkInScheduleRule.findFirst({
          where: {
            id: input.ruleId,
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          select: { formId: true },
        });
        if (!pre) throw new CheckInInstanceError("not_available");

        // 2–5. Advisories (the rule's formId — submissions on its
        // generated instances serialize on the SAME key) → member lock
        // → in-transaction authorize.
        const { ctx, member } = await lockedAuthorize(
          tx,
          session,
          {
            resource: "checkinInstances",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          pre.formId,
        );
        if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
          throw new AccessDeniedError(
            "role_denied",
            "checkinInstances",
            "write",
          );
        if (ctx.grantedScope === "assigned")
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
          );
        const lockedProfile = await lockProfile(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        if (!lockedProfile) throw new CheckInInstanceError("not_available");
        const rule = await lockRule(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.ruleId,
        );
        if (!rule || rule.status === "ENDED")
          throw new CheckInInstanceError("not_available");

        const now = new Date();
        switch (input.action) {
          case "pause": {
            if (rule.status === "PAUSED") return { status: "paused" };
            await tx.checkInScheduleRule.update({
              where: { id: rule.id },
              data: {
                status: "PAUSED",
                pausedAt: now,
                pausedByMemberId: member.id,
              },
            });
            await writeAuditEvent(tx, ctx, {
              action: "UPDATE",
              resourceType: "checkin_schedule_rule",
              resourceId: rule.id,
              subjectClientProfileId: input.clientProfileId,
              meta: { changed: true },
            });
            return { status: "paused" };
          }
          case "resume": {
            if (rule.status === "ACTIVE") return { status: "resumed" };
            await tx.checkInScheduleRule.update({
              where: { id: rule.id },
              data: { status: "ACTIVE" },
            });
            await writeAuditEvent(tx, ctx, {
              action: "UPDATE",
              resourceType: "checkin_schedule_rule",
              resourceId: rule.id,
              subjectClientProfileId: input.clientProfileId,
              meta: { changed: true },
            });
            return { status: "resumed" };
          }
          case "end": {
            const cancelledCount = await endRuleInTx(
              tx,
              ctx,
              {
                workspaceId: input.workspaceId,
                clientProfileId: input.clientProfileId,
                ruleId: rule.id,
              },
              member.id,
              now,
            );
            return { status: "ended", cancelledCount };
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

// ── Staff: explicit bounded generation ─────────────────────────────────

export type GenerateCheckInScheduleRuleInput = {
  workspaceId: string;
  clientProfileId: string;
  ruleId: string;
};

export type GenerateCheckInScheduleRuleResult =
  | {
      status: "generated";
      /** Local date the horizon was examined through — reported
       * regardless of skips; never a claim that every date exists. */
      examinedThrough: string | null;
      created: number;
      alreadyGenerated: number;
      /** Occurrence dates whose due instant is occupied by a manual,
       * other-rule, or cancelled instance — reported, never absorbed. */
      skippedConflicts: string[];
      /** Occurrence dates the zone transition made unrepresentable
       * (whole-day skips). */
      unrepresentable: string[];
    }
  | { status: "paused" }
  | { status: "ended" };

export async function generateCheckInScheduleRuleInstances(
  session: SessionLike,
  input: GenerateCheckInScheduleRuleInput,
  deps: CheckInScheduleDeps = {},
): Promise<GenerateCheckInScheduleRuleResult> {
  const db = deps.db ?? defaultPrisma;
  const now = deps.now?.() ?? new Date();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.ruleId)
  )
    throw new CheckInInstanceError("invalid_input");

  const attempt = (): Promise<GenerateCheckInScheduleRuleResult> =>
    withSerializedRetry(() =>
      db.$transaction(
        async (tx) => {
          // 1. Scoped pre-read — rule + its form, before any advisory.
          const pre = await tx.checkInScheduleRule.findFirst({
            where: {
              id: input.ruleId,
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            select: { formId: true },
          });
          if (!pre) throw new CheckInInstanceError("not_available");

          // 2–5. chkin advisories on the rule's formId → member lock →
          // in-transaction authorize.
          const { ctx, member } = await lockedAuthorize(
            tx,
            session,
            {
              resource: "checkinInstances",
              action: "write",
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            pre.formId,
          );
          if (
            ctx.grantedScope !== "workspace" &&
            ctx.grantedScope !== "assigned"
          )
            throw new AccessDeniedError(
              "role_denied",
              "checkinInstances",
              "write",
            );
          if (ctx.grantedScope === "assigned")
            await lockAssignmentForScope(
              tx,
              input.workspaceId,
              input.clientProfileId,
              member.id,
            );
          const lockedProfile = await lockProfile(
            tx,
            input.workspaceId,
            input.clientProfileId,
          );
          if (!lockedProfile) throw new CheckInInstanceError("not_available");

          const rule = await tx.checkInScheduleRule.findFirst({
            where: {
              id: input.ruleId,
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            select: {
              id: true,
              status: true,
              weekday: true,
              localTimeMinutes: true,
              timezone: true,
              startDate: true,
              endDate: true,
              form: { select: { status: true } },
            },
          });
          if (!rule) throw new CheckInInstanceError("not_available");
          // Truthful lifecycle results — never disguised as empty.
          if (rule.status === "PAUSED") return { status: "paused" };
          if (rule.status === "ENDED") return { status: "ended" };
          if (rule.form.status !== "ACTIVE")
            throw new CheckInInstanceError("not_available");

          // 6. Latest ACTIVE published version — pinned at generation.
          const latest = await tx.checkInFormVersion.findFirst({
            where: {
              workspaceId: input.workspaceId,
              formId: pre.formId,
            },
            orderBy: { versionSeq: "desc" },
            select: { id: true },
          });
          if (!latest) throw new CheckInInstanceError("not_available");

          // 7. Enumerate candidates in the rule's own timezone.
          const todayLocal = localDateInZone(now, rule.timezone);
          if (todayLocal === null)
            throw new CheckInInstanceError("not_available");
          const startDate = rule.startDate.toISOString().slice(0, 10);
          const endDate =
            rule.endDate === null
              ? null
              : rule.endDate.toISOString().slice(0, 10);
          const horizonEnd = addDaysToLocalDate(
            todayLocal,
            CHECKIN_SCHEDULE_HORIZON_DAYS,
          );
          const examinedThrough =
            endDate !== null && endDate < horizonEnd ? endDate : horizonEnd;
          const candidates = enumerateRuleOccurrenceDates({
            weekday: rule.weekday,
            startDate,
            endDate,
            todayLocal,
          });

          // 8. Resolve instants — past due instants are excluded by
          // construction (never backfill); whole-day-skipped dates are
          // reported unrepresentable.
          const planned: { occurrenceDate: string; dueAt: Date }[] = [];
          const unrepresentable: string[] = [];
          for (const d of candidates) {
            const r = resolveLocalInstant(
              rule.timezone,
              d,
              rule.localTimeMinutes,
            );
            if (r.status === "unrepresentable") {
              unrepresentable.push(d);
              continue;
            }
            if (r.status !== "ok")
              throw new CheckInInstanceError("invalid_input");
            if (r.instant.getTime() < now.getTime()) continue; // past
            planned.push({ occurrenceDate: d, dueAt: r.instant });
          }

          // 9. Pre-query A — occurrence identity: dates this rule
          // already generated (idempotent no-op; cancelled generated
          // rows still occupy their occurrence identity).
          const generated = await tx.checkInInstance.findMany({
            where: {
              originRuleId: rule.id,
              occurrenceDate: {
                in: planned.map(
                  (p) => new Date(`${p.occurrenceDate}T00:00:00Z`),
                ),
              },
            },
            select: { occurrenceDate: true },
          });
          const existingDates = new Set(
            generated.map((g) => g.occurrenceDate!.toISOString().slice(0, 10)),
          );
          const novel = planned.filter(
            (p) => !existingDates.has(p.occurrenceDate),
          );

          // 10. Pre-query B — due-instant uniqueness over the remainder:
          // manual, other-rule, AND cancelled rows all occupy the tuple.
          const conflicts =
            novel.length === 0
              ? []
              : await tx.checkInInstance.findMany({
                  where: {
                    workspaceId: input.workspaceId,
                    clientProfileId: input.clientProfileId,
                    formId: pre.formId,
                    dueAt: { in: novel.map((p) => p.dueAt) },
                  },
                  select: { dueAt: true },
                });
          const conflictInstants = new Set(
            conflicts.map((c) => c.dueAt.getTime()),
          );
          const insertable = novel.filter(
            (p) => !conflictInstants.has(p.dueAt.getTime()),
          );
          const skippedConflicts = novel
            .filter((p) => conflictInstants.has(p.dueAt.getTime()))
            .map((p) => p.occurrenceDate);

          // 11. Insert the remainder — one create + one CREATE audit
          // each, audits last; the batch is atomic.
          for (const p of insertable) {
            const instance = await tx.checkInInstance.create({
              data: {
                workspaceId: input.workspaceId,
                clientProfileId: input.clientProfileId,
                formId: pre.formId,
                formVersionId: latest.id,
                dueAt: p.dueAt,
                dueTz: rule.timezone,
                originRuleId: rule.id,
                occurrenceDate: new Date(`${p.occurrenceDate}T00:00:00Z`),
                scheduledByMemberId: member.id, // CURRENT actor — never
                // the rule creator borrowed as authority.
              },
              select: { id: true },
            });
            await writeAuditEvent(tx, ctx, {
              action: "CREATE",
              resourceType: "checkin_instance",
              resourceId: instance.id,
              subjectClientProfileId: input.clientProfileId,
              meta: { changed: true },
            });
          }

          return {
            status: "generated",
            examinedThrough,
            created: insertable.length,
            alreadyGenerated: planned.length - novel.length,
            skippedConflicts,
            unrepresentable,
          } satisfies GenerateCheckInScheduleRuleResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

  try {
    return await attempt();
  } catch (error) {
    // P2002 from either unique (concurrent writer won) → ONE bounded
    // full-protocol re-enter; the winner's rows re-classify truthfully
    // as alreadyGenerated/skippedConflicts. Second → closed error.
    if (!isUniqueViolation(error)) throw error;
    try {
      return await attempt();
    } catch (second) {
      if (isUniqueViolation(second))
        throw new CheckInInstanceError("serialization_conflict");
      throw second;
    }
  }
}

// ── Staff: rule list (read-only — zero writes/audits) ─────────────────

export type CheckInScheduleRuleItem = {
  ruleId: string;
  formId: string;
  formName: string;
  weekday: CheckInRuleWeekday;
  localTimeMinutes: number;
  timezone: string;
  startDate: string;
  endDate: string | null;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  /** Latest generated occurrence date — the truthful coverage bound,
   * or null when nothing has been generated yet. */
  generatedThrough: string | null;
  createdByMemberId: string;
  replacesRuleId: string | null;
};

export async function listCheckInScheduleRules(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: CheckInScheduleDeps = {},
): Promise<{ items: CheckInScheduleRuleItem[] }> {
  const db = deps.db ?? defaultPrisma;
  if (!validId(input.workspaceId) || !validId(input.clientProfileId))
    throw new CheckInInstanceError("invalid_input");

  return db.$transaction(async (tx) => {
    const { ctx, member } = await lockedAuthorize(
      tx,
      session,
      {
        resource: "checkinInstances",
        action: "read",
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      },
      "*",
    );
    if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
      throw new AccessDeniedError("role_denied", "checkinInstances", "read");
    if (ctx.grantedScope === "assigned")
      await lockAssignmentForScope(
        tx,
        input.workspaceId,
        input.clientProfileId,
        member.id,
      );
    const profile = await lockProfile(
      tx,
      input.workspaceId,
      input.clientProfileId,
    );
    if (!profile) throw new CheckInInstanceError("not_available");

    const rules = await tx.checkInScheduleRule.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      },
      select: {
        id: true,
        formId: true,
        weekday: true,
        localTimeMinutes: true,
        timezone: true,
        startDate: true,
        endDate: true,
        status: true,
        createdByMemberId: true,
        replacedByRule: { select: { id: true } },
        form: { select: { name: true } },
        instances: {
          select: { occurrenceDate: true },
          orderBy: { occurrenceDate: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return {
      items: rules.map((r) => ({
        ruleId: r.id,
        formId: r.formId,
        formName: r.form.name,
        weekday: r.weekday as CheckInRuleWeekday,
        localTimeMinutes: r.localTimeMinutes,
        timezone: r.timezone,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate:
          r.endDate === null ? null : r.endDate.toISOString().slice(0, 10),
        status: r.status,
        generatedThrough:
          r.instances[0]?.occurrenceDate?.toISOString().slice(0, 10) ?? null,
        createdByMemberId: r.createdByMemberId,
        replacesRuleId: r.replacedByRule?.id ?? null,
      })),
    };
  });
}
