// FULL-PACKAGE SLICE of #173
/**
 * Card 09 (#173): NutritionLog daily macro actuals over daily entries.
 *
 * The save path mirrors `saveDailyEntry` step for step: Serializable
 * transaction, the same advisory keys, locked member row, in-transaction
 * `authorize` for the caller's own scope, consent in kind order, the
 * daily_entry create-or-lock, then the log upsert and the audit write.
 * The log pins to the day entry, never to a template pin or nutrition
 * mode, so switching a client between meal plan and macro counting keeps
 * earlier entries.
 *
 * Each macro is an independent nullable value: `null` is not recorded,
 * never zero. An all-null save clears the row back to the empty-day
 * state. Calories are never stored or accepted - they derive at read
 * time through `caloriesFromMacros` (4/4/9) in lib/nutrition/math.
 */

import { Prisma } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import { unconfiguredConsentPolicy } from "../consent";
import { DailyEntryError } from "./gate";
import {
  advisoryLock,
  checkRequiredConsent,
  lockRow,
  parseDeclaredDate,
  resolveOwnClient,
  withSerializedRetry,
  type DailyEntryDeps,
} from "./service";

export { DailyEntryError } from "./gate";

/** Gram bound shared by the three macro CHECKs and service validation. */
export const MAX_MACRO_GRAMS = 10000;

/** Days the own surface returns alongside the selected day. */
export const NUTRITION_LOG_HISTORY_LIMIT = 30;

/** Days the staff range read may span at most. */
export const STAFF_NUTRITION_LOG_MAX_SPAN_DAYS = 366;

export type NutritionMacroValues = {
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

export type SaveNutritionLogInput = {
  workspaceId: string;
  entryDate: string;
  macros: NutritionMacroValues;
};

export type SaveNutritionLogResult = { status: "saved" | "no_op" };

function validMacro(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= MAX_MACRO_GRAMS)
  );
}

function macrosEqual(
  stored: { protein: unknown; carbohydrate: unknown; fat: unknown },
  next: NutritionMacroValues,
): boolean {
  return (
    (stored.protein === null
      ? next.protein === null
      : Number(stored.protein) === next.protein) &&
    (stored.carbohydrate === null
      ? next.carbohydrate === null
      : Number(stored.carbohydrate) === next.carbohydrate) &&
    (stored.fat === null ? next.fat === null : Number(stored.fat) === next.fat)
  );
}

/**
 * Saves the caller's own macro actuals for one declared date. The write
 * creates the day entry when none exists; the log row hangs 1:1 off it.
 * Identical re-saves are `no_op`; an all-null input deletes the row.
 */
export async function saveNutritionLog(
  session: SessionLike,
  input: SaveNutritionLogInput,
  deps: DailyEntryDeps = {},
): Promise<SaveNutritionLogResult> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? unconfiguredConsentPolicy;
  const entryDate = parseDeclaredDate(input.entryDate);
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "dailyTracking", "write");
  if (
    typeof input.workspaceId !== "string" ||
    input.workspaceId.length === 0 ||
    input.workspaceId.length > 128 ||
    input.macros === null ||
    typeof input.macros !== "object" ||
    !validMacro(input.macros.protein) ||
    !validMacro(input.macros.carbohydrate) ||
    !validMacro(input.macros.fat)
  )
    throw new DailyEntryError("invalid_input");
  const macros = input.macros;

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const profile = await resolveOwnClient(tx, input.workspaceId, userId);
        if (!profile)
          throw new AccessDeniedError("not_owner", "dailyTracking", "write");

        await advisoryLock(tx, `csetup:${input.workspaceId}:${profile.id}`);
        await advisoryLock(tx, `member:${input.workspaceId}:${userId}`);

        const memberRows = await tx.$queryRawUnsafe<
          { id: string; role: string; status: string }[]
        >(
          `SELECT id, role, status FROM "workspace_member"
           WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE`,
          input.workspaceId,
          userId,
        );
        const member = memberRows[0];
        if (!member || member.status !== "ACTIVE" || member.role !== "CLIENT")
          throw new AccessDeniedError("role_denied", "dailyTracking", "write");

        const ctx = await authorize(
          session,
          {
            resource: "dailyTracking",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: profile.id,
          },
          createPrismaAuthorizationRepo(tx),
        );
        if (ctx.grantedScope !== "own")
          throw new AccessDeniedError("role_denied", "dailyTracking", "write");

        await lockRow(
          tx,
          `SELECT id FROM "client_profile" WHERE id = $1 FOR UPDATE`,
          profile.id,
        );
        await checkRequiredConsent(tx, profile.id, registry, true);

        const entryDateObj = new Date(`${entryDate}T00:00:00Z`);
        let entry = await tx.dailyEntry.findUnique({
          where: {
            workspaceId_clientProfileId_entryDate: {
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
              entryDate: entryDateObj,
            },
          },
          select: { id: true },
        });
        if (!entry) {
          entry = await tx.dailyEntry.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
              entryDate: entryDateObj,
              createdByMemberId: member.id,
            },
            select: { id: true },
          });
        } else {
          await lockRow(
            tx,
            `SELECT id FROM "daily_entry" WHERE id = $1 FOR UPDATE`,
            entry.id,
          );
        }

        const existing = await tx.nutritionLog.findUnique({
          where: { dailyEntryId: entry.id },
          select: { id: true, protein: true, carbohydrate: true, fat: true },
        });

        const allAbsent =
          macros.protein === null &&
          macros.carbohydrate === null &&
          macros.fat === null;
        if (allAbsent) {
          if (!existing) return { status: "no_op" };
          await tx.nutritionLog.delete({ where: { id: existing.id } });
          await writeAuditEvent(tx, ctx, {
            action: "DELETE",
            resourceType: "nutrition_log",
            resourceId: existing.id,
            subjectClientProfileId: profile.id,
            meta: { changed: true },
          });
          return { status: "saved" };
        }

        if (existing && macrosEqual(existing, macros))
          return { status: "no_op" };

        const row = {
          protein:
            macros.protein === null ? null : new Prisma.Decimal(macros.protein),
          carbohydrate:
            macros.carbohydrate === null
              ? null
              : new Prisma.Decimal(macros.carbohydrate),
          fat: macros.fat === null ? null : new Prisma.Decimal(macros.fat),
        };
        const log = existing
          ? await tx.nutritionLog.update({
              where: { id: existing.id },
              data: { ...row, updatedByMemberId: member.id },
              select: { id: true },
            })
          : await tx.nutritionLog.create({
              data: {
                dailyEntryId: entry.id,
                workspaceId: input.workspaceId,
                clientProfileId: profile.id,
                entryDate: entryDateObj,
                ...row,
                createdByMemberId: member.id,
                updatedByMemberId: member.id,
              },
              select: { id: true },
            });
        await writeAuditEvent(tx, ctx, {
          action: existing ? "UPDATE" : "CREATE",
          resourceType: "nutrition_log",
          resourceId: log.id,
          subjectClientProfileId: profile.id,
          meta: { changed: true },
        });
        return { status: "saved" };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

// ── Reads ──────────────────────────────────────────────────────────────

export type NutritionLogDay = {
  entryDate: string;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

export type NutritionLogSurface =
  | {
      state: "ready";
      entryDate: string;
      /** The selected day's log; `null` is the empty-day state. */
      log: Omit<NutritionLogDay, "entryDate"> | null;
      history: NutritionLogDay[];
    }
  | { state: "not_applicable" }
  | { state: "consent_missing" };

function toDay(row: {
  entryDate: Date;
  protein: unknown;
  carbohydrate: unknown;
  fat: unknown;
}): NutritionLogDay {
  return {
    entryDate: row.entryDate.toISOString().slice(0, 10),
    protein: row.protein === null ? null : Number(row.protein),
    carbohydrate: row.carbohydrate === null ? null : Number(row.carbohydrate),
    fat: row.fat === null ? null : Number(row.fat),
  };
}

/**
 * Loads the caller's own nutrition surface for one day (or today) plus
 * recent history. Unlocked read, display only; mirrors the own-scope
 * resolution of `loadDailyEntrySurface` minus the template pin, which the
 * log never depends on.
 */
export async function loadNutritionLogSurface(
  session: SessionLike,
  input: { workspaceId: string; entryDate?: string },
  deps: DailyEntryDeps = {},
): Promise<NutritionLogSurface> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? unconfiguredConsentPolicy;
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "dailyTracking", "read");
  if (
    typeof input.workspaceId !== "string" ||
    input.workspaceId.length === 0 ||
    input.workspaceId.length > 128
  )
    throw new DailyEntryError("invalid_input");
  const entryDate = input.entryDate
    ? parseDeclaredDate(input.entryDate)
    : new Date().toISOString().slice(0, 10);

  const profile = await db.clientProfile.findFirst({
    where: { workspaceId: input.workspaceId, userId },
    select: { id: true },
  });
  if (!profile) return { state: "not_applicable" };
  const ctx = await authorize(
    session,
    {
      resource: "dailyTracking",
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: profile.id,
    },
    createPrismaAuthorizationRepo(db),
  );
  if (ctx.grantedScope !== "own") return { state: "not_applicable" };

  const member = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId,
      },
    },
    select: { id: true, role: true, status: true },
  });
  if (!member || member.status !== "ACTIVE" || member.role !== "CLIENT")
    return { state: "not_applicable" };

  try {
    await checkRequiredConsent(db, profile.id, registry, false);
  } catch (error) {
    if (error instanceof DailyEntryError) return { state: "consent_missing" };
    throw error;
  }

  const entryDateObj = new Date(`${entryDate}T00:00:00Z`);
  const entry = await db.dailyEntry.findUnique({
    where: {
      workspaceId_clientProfileId_entryDate: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
        entryDate: entryDateObj,
      },
    },
    select: {
      nutritionLog: {
        select: { protein: true, carbohydrate: true, fat: true },
      },
    },
  });
  const logRow = entry?.nutritionLog ?? null;

  const historyRows = await db.nutritionLog.findMany({
    where: { workspaceId: input.workspaceId, clientProfileId: profile.id },
    orderBy: { entryDate: "desc" },
    take: NUTRITION_LOG_HISTORY_LIMIT,
    select: { entryDate: true, protein: true, carbohydrate: true, fat: true },
  });

  return {
    state: "ready",
    entryDate,
    log:
      logRow === null
        ? null
        : {
            protein: logRow.protein === null ? null : Number(logRow.protein),
            carbohydrate:
              logRow.carbohydrate === null ? null : Number(logRow.carbohydrate),
            fat: logRow.fat === null ? null : Number(logRow.fat),
          },
    history: historyRows.map(toDay),
  };
}

// ── Staff range read ───────────────────────────────────────────────────

export type StaffNutritionLogListResult =
  | {
      state: "ready";
      clientName: string;
      items: NutritionLogDay[];
    }
  | { state: "consent_missing" };

function parseRangeDate(raw: unknown): string {
  try {
    return parseDeclaredDate(raw);
  } catch {
    throw new DailyEntryError("invalid_input");
  }
}

/**
 * Coach review: the client's recorded macro days inside a declared date
 * range (newest first). Re-authorizes `dailyTracking/read` for the
 * selected client - workspace and assigned scopes only; `own` and every
 * denied scope throw. `from`/`to` default to the last 30 days.
 */
export async function listStaffNutritionLogs(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    from?: string;
    to?: string;
  },
  deps: DailyEntryDeps = {},
): Promise<StaffNutritionLogListResult> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? unconfiguredConsentPolicy;
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "dailyTracking", "read");
  if (
    typeof input.workspaceId !== "string" ||
    input.workspaceId.length === 0 ||
    input.workspaceId.length > 128 ||
    typeof input.clientProfileId !== "string" ||
    input.clientProfileId.length === 0 ||
    input.clientProfileId.length > 128
  )
    throw new DailyEntryError("invalid_input");

  const today = new Date().toISOString().slice(0, 10);
  const to = input.to === undefined ? today : parseRangeDate(input.to);
  const from =
    input.from === undefined
      ? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000)
          .toISOString()
          .slice(0, 10)
      : parseRangeDate(input.from);
  if (from > to) throw new DailyEntryError("invalid_input");
  const spanDays =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86400000;
  if (spanDays > STAFF_NUTRITION_LOG_MAX_SPAN_DAYS)
    throw new DailyEntryError("invalid_input");

  const ctx = await authorize(
    session,
    {
      resource: "dailyTracking",
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    },
    createPrismaAuthorizationRepo(db),
  );
  if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
    throw new AccessDeniedError("role_denied", "dailyTracking", "read");

  const profile = await db.clientProfile.findFirst({
    where: { id: input.clientProfileId, workspaceId: input.workspaceId },
    select: { name: true },
  });
  if (!profile)
    throw new AccessDeniedError(
      "client_outside_workspace",
      "dailyTracking",
      "read",
    );

  try {
    await checkRequiredConsent(db, input.clientProfileId, registry, false);
  } catch (error) {
    if (error instanceof DailyEntryError) return { state: "consent_missing" };
    throw error;
  }

  const rows = await db.nutritionLog.findMany({
    where: {
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      entryDate: {
        gte: new Date(`${from}T00:00:00Z`),
        lte: new Date(`${to}T00:00:00Z`),
      },
    },
    orderBy: { entryDate: "desc" },
    select: { entryDate: true, protein: true, carbohydrate: true, fat: true },
  });
  return {
    state: "ready",
    clientName: profile.name,
    items: rows.map(toDay),
  };
}
