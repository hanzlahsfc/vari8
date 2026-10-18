/**
 * TRAINING-I1A (PROMPT 244 — reviewed P9 + A1 + A2 + A3 contract with
 * S/G corrections) — guarded training-program persistence service.
 *
 * Workflow: assigned staff (coach OR explicitly assigned owner) author a
 * shared override-boundary draft under `draftRevision` CAS → publish
 * immutable effective-dated versions → the client views prescribed
 * weeks/sessions. Programs form a published-only replacement chain per
 * (workspace, client): at most one non-cancelled published root and one
 * non-cancelled successor claim per predecessor (raw partial uniques).
 *
 * Lock protocol (client-scoped — reviewed order, meal-plan precedent):
 *   advisory `tprog:{workspaceId}:{clientProfileId}`
 *   → advisory `member:{workspaceId}:{userId}`
 *   → workspace_member FOR UPDATE
 *   → in-transaction authorize(trainingPlansLogs/*)
 *   → ACTIVE ClientAssignment FOR UPDATE (assigned scope only)
 *   → client_profile FOR UPDATE
 *   → consent rows FOR UPDATE in deterministic kind order
 *   → training_program FOR UPDATE → mutation → structural audit LAST.
 *
 * Serializable + bounded retry on genuine serialization failures
 * (P2034, P2010 carrying 40001/40P01) and on the two publication
 * uniques; `training_program_single_root` / `live_successor` P2002s map
 * to `state_conflict` and are never retried.
 *
 * Reads run inside the audited writable Serializable transaction (A2
 * Clause B — NO READ ONLY: the reviewed prelude takes FOR UPDATE locks
 * and writes structural audit rows), with `set_config` transaction-local
 * `statement_timeout` as the first statement, explicit Prisma
 * `maxWait`/`timeout`, and a cooperative application deadline checked
 * before each walk step and each page — no Promise.race around
 * in-flight database work; rollback is awaited before connection
 * release. 57014/55P03/P2028/P2024 → retryable `service_unavailable`
 * OUTSIDE the serialization retry.
 *
 * Anchor: `anchorTz(P)` = seq-1 `effectiveTimezone`, immutable; all week
 * boundaries/ceiling/samples use it (P9 §3). `confirmedTimezone` is
 * mutable and resolves only NEW publication instants and "today" for
 * bounds. Activation instants are stored immutably and never retimed.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import {
  hasExactActiveConsent,
  requiredConsentsFor,
  type ConsentPolicyRegistry,
} from "../consent";
import { resolveLocalInstant } from "../checkin/timezone";
import { resolveTrainingConsentPolicy } from "./consent";
import { TRAINING_LIMITS } from "./limits";
import {
  canonicalDraftContent,
  canonicalJson,
  emptyTrainingDraft,
  materializeWeeks,
  normalizeFieldConfig,
  normalizeTrainingDraft,
  projectForClient,
  validatePublishCompleteness,
  TrainingError,
  type MaterializedProgram,
  type TrainingDraft,
  type TrainingFieldConfig,
} from "./payload";
import {
  addDays,
  boundaryInstant,
  ceiling,
  governedSpan,
  gvAt,
  isShadowed,
  localDateOf,
  parseLocalDate,
  weekEndInstant,
  weekIndex,
  weekMarker,
  weekStartInstant,
  type VersionInstant,
} from "./weeks";

export { TrainingError } from "./payload";
export type {
  MaterializedExercise,
  MaterializedProgram,
  MaterializedSession,
  MaterializedWeek,
  TrainingDraft,
  TrainingFieldConfig,
} from "./payload";
export { TRAINING_FIELD_KEYS } from "./payload";

export type TrainingDeps = {
  db?: PrismaClient;
  registry?: ConsentPolicyRegistry;
  now?: Date;
};

// ── Effective-date parsing + activation resolution ───────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseEffectiveDate(raw: unknown, now: Date): string {
  if (typeof raw !== "string" || !DATE_RE.test(raw))
    throw new TrainingError("invalid_input");
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    throw new TrainingError("invalid_input");
  if (y < 2000 || y > 2100) throw new TrainingError("invalid_input");
  const [ty, tm, td] = now.toISOString().slice(0, 10).split("-").map(Number);
  const limit = new Date(
    Date.UTC(ty, tm - 1, td + TRAINING_LIMITS.effectiveDateAheadDays),
  )
    .toISOString()
    .slice(0, 10);
  if (raw >= limit) throw new TrainingError("invalid_input");
  return raw;
}

export function resolveTrainingActivation(
  zone: string,
  effectiveDate: string,
):
  | { status: "ok"; instant: Date }
  | { status: "unrepresentable" }
  | { status: "invalid" } {
  return resolveLocalInstant(zone, effectiveDate, 0);
}

function validTimezone(zone: string): boolean {
  return resolveTrainingActivation(zone, "2000-01-01").status !== "invalid";
}

// ── Concurrency protocol (reviewed convention) ───────────────────────────

const RAW_SERIALIZATION_SQLSTATES = new Set(["40001", "40P01"]);
const READ_UNAVAILABLE_SQLSTATES = new Set(["57014", "55P03"]);
const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 10;
const BACKOFF_CAP_MS = 50;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryableSerialization(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code === "P2010") {
    const meta = error.meta as { code?: unknown } | undefined;
    return (
      typeof meta?.code === "string" &&
      RAW_SERIALIZATION_SQLSTATES.has(meta.code)
    );
  }
  return false;
}

/**
 * Timeout/pool errors mapped to retryable `service_unavailable` OUTSIDE
 * the serialization retry (A2 §2.3): retrying them inside would
 * multiply load and could be mistaken for "no program".
 */
function mapTimeoutPoolError(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2028" || error.code === "P2024")
      throw new TrainingError("service_unavailable");
    if (error.code === "P2010") {
      const meta = error.meta as { code?: unknown } | undefined;
      if (
        typeof meta?.code === "string" &&
        READ_UNAVAILABLE_SQLSTATES.has(meta.code)
      )
        throw new TrainingError("service_unavailable");
    }
  }
}

/**
 * P2002 classification by constraint identity (A1 §3.5): the two
 * publication uniques are whole-transaction retryable; the chain-slot
 * raw partial uniques are genuine `state_conflict`s (never retried —
 * a re-run would hit the same claim); anything else is a generic
 * conflict and never misclassified.
 */
const PUBLISH_RETRYABLE_UNIQUE_KEYS = [
  "version_seq",
  "publish_origin_revision",
] as const;
const STATE_CONFLICT_INDEXES = [
  "training_program_single_root",
  "training_program_live_successor",
] as const;

function p2002Identity(error: unknown): string[] {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  )
    return [];
  const meta = error.meta as
    { target?: unknown; constraint?: unknown } | undefined;
  return [meta?.target, meta?.constraint]
    .flat()
    .filter((v): v is string => typeof v === "string");
}

function classifyPublishP2002(
  error: unknown,
): "retryable" | "state_conflict" | null {
  const fields = p2002Identity(error);
  if (fields.length === 0) return null;
  if (STATE_CONFLICT_INDEXES.some((idx) => fields.some((f) => f.includes(idx))))
    return "state_conflict";
  if (
    PUBLISH_RETRYABLE_UNIQUE_KEYS.every((k) =>
      fields.some((f) => f === k || f.includes(k)),
    )
  )
    return "retryable";
  return null;
}

async function withSerializedRetry<T>(
  fn: () => Promise<T>,
  retryPublishUniques = false,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (retryPublishUniques) {
        const cls = classifyPublishP2002(error);
        if (cls === "state_conflict") throw new TrainingError("state_conflict");
        if (cls === "retryable" && ++attempt < MAX_ATTEMPTS) {
          await sleep(Math.min(BACKOFF_BASE_MS * attempt, BACKOFF_CAP_MS));
          continue;
        }
        if (cls === "retryable")
          throw new TrainingError("serialization_conflict");
      }
      if (isRetryableSerialization(error) && ++attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(BACKOFF_BASE_MS * attempt, BACKOFF_CAP_MS));
        continue;
      }
      if (isRetryableSerialization(error))
        throw new TrainingError("serialization_conflict");
      mapTimeoutPoolError(error);
      throw error;
    }
  }
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
      "trainingPlansLogs",
      request.action,
    );
  await advisoryLock(
    tx,
    `tprog:${request.workspaceId}:${request.clientProfileId}`,
  );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const member = await lockMember(tx, request.workspaceId, userId);
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError(
      "role_denied",
      "trainingPlansLogs",
      request.action,
    );
  const ctx = await authorize(
    session,
    {
      resource: "trainingPlansLogs",
      action: request.action,
      workspaceId: request.workspaceId,
      clientProfileId: request.clientProfileId,
    },
    createPrismaAuthorizationRepo(tx),
  );
  if (ctx.workspaceMemberId !== member.id)
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "trainingPlansLogs",
      request.action,
    );
  return { ctx, member, userId };
}

async function lockAssignmentForScope(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  memberId: string,
  action: "read" | "write",
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
    throw new AccessDeniedError("not_assigned", "trainingPlansLogs", action);
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
    throw new AccessDeniedError("not_assigned", "trainingPlansLogs", action);
}

async function lockProfile(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<{ id: string; userId: string | null } | null> {
  const rows = await tx.$queryRawUnsafe<
    { id: string; userId: string | null }[]
  >(
    `SELECT id, user_id AS "userId" FROM "client_profile"
     WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    clientProfileId,
    workspaceId,
  );
  return rows[0] ?? null;
}

type LockedProgramRow = {
  id: string;
  workspace_id: string;
  client_profile_id: string;
  title: string;
  start_date: Date;
  week_count: number;
  field_config: unknown;
  confirmed_timezone: string | null;
  draft: unknown;
  draft_revision: number;
  replaces_program_id: string | null;
  first_published_at: Date | null;
  cancelled_at: Date | null;
  locked_week_high_water: number;
};

/** Row lock scoped to the verified (workspace, client, program) triple —
 * never a foreign row. */
async function lockProgram(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  programId: string,
): Promise<LockedProgramRow | null> {
  const rows = await tx.$queryRawUnsafe<LockedProgramRow[]>(
    `SELECT id, workspace_id, client_profile_id, title, start_date,
            week_count, field_config, confirmed_timezone, draft,
            draft_revision, replaces_program_id, first_published_at,
            cancelled_at, locked_week_high_water
     FROM "training_program"
     WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
     FOR UPDATE`,
    programId,
    workspaceId,
    clientProfileId,
  );
  return rows[0] ?? null;
}

async function checkRequiredConsent(
  tx: Prisma.TransactionClient,
  clientProfileId: string,
  registry: ConsentPolicyRegistry,
  forUpdate: boolean,
): Promise<void> {
  const required = requiredConsentsFor("trainingPlansLogs") ?? [];
  for (const kind of required) {
    const version = registry.currentVersion(kind);
    if (version === null) throw new TrainingError("policy_not_configured");
    const rows = forUpdate
      ? (
          await tx.$queryRawUnsafe<
            { kind: string; version: string; revoked_at: Date | null }[]
          >(
            `SELECT kind, version, revoked_at
             FROM "consent_record"
             WHERE client_profile_id = $1
               AND kind = CAST($2 AS "public"."ConsentKind")
             FOR UPDATE`,
            clientProfileId,
            kind,
          )
        ).map((r) => ({
          kind: r.kind,
          version: r.version,
          revokedAt: r.revoked_at,
        }))
      : await tx.consentRecord.findMany({
          where: { clientProfileId, kind },
          select: { kind: true, version: true, revokedAt: true },
        });
    if (!hasExactActiveConsent(rows, kind, version))
      throw new TrainingError("consent_missing");
  }
}

// ── Validation helpers ───────────────────────────────────────────────────

function validId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 128;
}

function cleanTitle(v: unknown): string {
  if (typeof v !== "string") throw new TrainingError("invalid_input");
  const t = v.trim();
  if (t.length < 1 || t.length > TRAINING_LIMITS.titleMax)
    throw new TrainingError("invalid_input");
  return t;
}

function cleanWeekCount(v: unknown): number {
  if (
    typeof v !== "number" ||
    !Number.isInteger(v) ||
    v < TRAINING_LIMITS.weekCountMin ||
    v > TRAINING_LIMITS.weekCountMax
  )
    throw new TrainingError("invalid_input");
  return v;
}

function cleanStartDate(v: unknown): string {
  if (typeof v !== "string" || !DATE_RE.test(v))
    throw new TrainingError("invalid_input");
  parseLocalDate(v); // validates real calendar date
  return v;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type VersionRow = {
  id: string;
  versionSeq: number;
  effectiveDate: Date;
  effectiveTimezone: string;
  activationInstant: Date;
  publishedAt: Date;
  publishOriginRevision: number;
  payload: unknown;
  fieldConfig: unknown;
};

async function programVersions(
  tx: Prisma.TransactionClient,
  programId: string,
): Promise<VersionRow[]> {
  return tx.trainingProgramVersion.findMany({
    where: { programId },
    orderBy: { versionSeq: "asc" },
    select: {
      id: true,
      versionSeq: true,
      effectiveDate: true,
      effectiveTimezone: true,
      activationInstant: true,
      publishedAt: true,
      publishOriginRevision: true,
      payload: true,
      fieldConfig: true,
    },
  });
}

function toVersionInstant(v: VersionRow): VersionInstant {
  return {
    id: v.id,
    versionSeq: v.versionSeq,
    effectiveDate: isoDate(v.effectiveDate),
    effectiveTimezone: v.effectiveTimezone,
    activationInstant: v.activationInstant,
    publishedAt: v.publishedAt,
  };
}

/** Live (non-cancelled) successor row + its seq-1 activation, if any. */
async function liveSuccessor(
  tx: Prisma.TransactionClient,
  programId: string,
): Promise<{ id: string; takeover: Date } | null> {
  const rows = await tx.$queryRawUnsafe<{ id: string; takeover: Date }[]>(
    `SELECT s.id, sv.activation_instant AS takeover
     FROM "training_program" s
     JOIN "training_program_version" sv
       ON sv.program_id = s.id AND sv.version_seq = 1
     WHERE s.replaces_program_id = $1 AND s.cancelled_at IS NULL
     LIMIT 1`,
    programId,
  );
  return rows[0] ?? null;
}

/** Program state derived at response time (P9 §5 — a replay never
 * asserts the program is active). */
function deriveProgramState(
  program: { cancelled_at: Date | null },
  takeover: Date | null,
  successorTakeover: Date | null,
  t: Date,
): "cancelled" | "superseded" | "pending" | "current" {
  if (program.cancelled_at !== null) return "cancelled";
  if (successorTakeover !== null && successorTakeover.getTime() <= t.getTime())
    return "superseded";
  if (takeover !== null && takeover.getTime() <= t.getTime()) return "current";
  return "pending";
}

// ── Shared write prelude ─────────────────────────────────────────────────

async function writePrelude(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  registry: ConsentPolicyRegistry,
) {
  const { ctx, member } = await lockedAuthorize(tx, session, {
    action: "write",
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
  });
  // Write cells are `assigned` for coach AND owner — anything else never
  // reaches here (authorize throws first); asserted anyway. A CLIENT
  // "own" write cell exists only for the FUTURE logging surface (I1b+) —
  // program-management ops reject it explicitly (PROMPT 244 §6).
  if (ctx.grantedScope !== "assigned")
    throw new AccessDeniedError("role_denied", "trainingPlansLogs", "write");
  await lockAssignmentForScope(
    tx,
    input.workspaceId,
    input.clientProfileId,
    member.id,
    "write",
  );
  const profile = await lockProfile(
    tx,
    input.workspaceId,
    input.clientProfileId,
  );
  if (!profile) throw new TrainingError("not_found");
  await checkRequiredConsent(tx, profile.id, registry, true);
  return { ctx, member, profile };
}

async function readPrelude(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  registry: ConsentPolicyRegistry,
) {
  const { ctx, member } = await lockedAuthorize(tx, session, {
    action: "read",
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
  });
  if (
    ctx.grantedScope !== "workspace" &&
    ctx.grantedScope !== "assigned" &&
    ctx.grantedScope !== "own"
  )
    throw new AccessDeniedError("role_denied", "trainingPlansLogs", "read");
  if (ctx.grantedScope === "assigned")
    await lockAssignmentForScope(
      tx,
      input.workspaceId,
      input.clientProfileId,
      member.id,
      "read",
    );
  const profile = await lockProfile(
    tx,
    input.workspaceId,
    input.clientProfileId,
  );
  if (!profile) throw new TrainingError("not_found");
  await checkRequiredConsent(tx, profile.id, registry, true);
  return { ctx, member, profile };
}

// ── Locked-week boundary equality (P4 §4) ────────────────────────────────

function boundaryEntriesUpTo(
  draft: TrainingDraft,
  maxWeek: number,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  const collect = (prefix: string, bm: Record<string, unknown>) => {
    for (const [wk, v] of Object.entries(bm)) {
      if (Number(wk) <= maxWeek) (out[prefix] ??= {})[wk] = v;
    }
  };
  collect("sessionOrder", draft.sessionOrder);
  for (const [k, bm] of Object.entries(draft.exerciseOrder))
    collect(`exerciseOrder/${k}`, bm);
  for (const [k, bm] of Object.entries(draft.sessionPresence))
    collect(`sessionPresence/${k}`, bm);
  for (const [k, bm] of Object.entries(draft.exercisePresence))
    collect(`exercisePresence/${k}`, bm);
  for (const [k, bm] of Object.entries(draft.sessionNames))
    collect(`sessionNames/${k}`, bm);
  for (const [k, bm] of Object.entries(draft.fieldCells))
    collect(`fieldCells/${k}`, bm);
  return out;
}

/**
 * Every boundary entry at a locked week must be byte-identical to the
 * stored draft — new/altered/removed entries at locked weeks reject the
 * WHOLE save with `past_week_locked` (P4 §4).
 */
function assertLockedWeeksUnchanged(
  stored: TrainingDraft,
  incoming: TrainingDraft,
  lockedWeeks: number,
): void {
  if (lockedWeeks <= 0) return;
  const a = boundaryEntriesUpTo(stored, lockedWeeks);
  const b = boundaryEntriesUpTo(incoming, lockedWeeks);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const offending = new Set<number>();
  for (const k of keys) {
    const ea = a[k] ?? {};
    const eb = b[k] ?? {};
    for (const wk of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
      if (canonicalJson(ea[wk]) !== canonicalJson(eb[wk]))
        offending.add(Number(wk));
    }
  }
  if (offending.size > 0)
    throw new TrainingError("past_week_locked", {
      weeks: [...offending].sort((x, y) => x - y),
    });
}

// ── Write operations ─────────────────────────────────────────────────────

/**
 * Save the shared boundary draft. `expectedRevision === 0` CREATES a new
 * program container (title/startDate/weekCount/fieldConfig required);
 * otherwise the row's `draft_revision` must match exactly (CAS — a lost
 * save response retries to `stale_revision`; the UI resyncs before
 * publishing). Every ACCEPTED save bumps `draftRevision` and writes one
 * structural audit event with `meta: {changed}` computed over the
 * complete canonical draft INCLUDING confirmedTimezone (A1 §1.3 + G).
 *
 * Locked-week protection: boundary entries at weeks ≤ ceiling (anchor
 * calendar) must be identical to the stored draft — atomic rejection.
 * `startDate` is immutable after first publish (`start_anchor_locked`).
 */
export async function saveTrainingProgramDraft(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    programId?: string;
    expectedRevision: number;
    title?: string;
    startDate?: string;
    weekCount?: number;
    fieldConfig?: unknown;
    timezone?: string;
    draft: unknown;
  },
  deps: TrainingDeps = {},
): Promise<{ programId: string; revision: number }> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    (input.programId !== undefined && !validId(input.programId)) ||
    typeof input.expectedRevision !== "number" ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw new TrainingError("invalid_input");
  if (input.timezone !== undefined && !validTimezone(input.timezone))
    throw new TrainingError("invalid_input");
  const draft = normalizeTrainingDraft(input.draft);
  const now = deps.now ?? new Date();
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx } = await writePrelude(tx, session, input, registry);
        const memberId = ctx.workspaceMemberId as string;

        if (input.expectedRevision === 0) {
          // CREATE — container + first boundary draft.
          const title = cleanTitle(input.title);
          const startDate = cleanStartDate(input.startDate);
          const weekCount = cleanWeekCount(input.weekCount);
          const fieldConfig = normalizeFieldConfig(input.fieldConfig);
          const created = await tx.trainingProgram.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              title,
              startDate: new Date(`${startDate}T00:00:00Z`),
              weekCount,
              fieldConfig: fieldConfig as unknown as Prisma.InputJsonValue,
              ...(input.timezone === undefined
                ? {}
                : {
                    confirmedTimezone: input.timezone,
                    timezoneSetByMemberId: memberId,
                    timezoneSetAt: now,
                  }),
              draft: draft as unknown as Prisma.InputJsonValue,
              draftRevision: 1,
              draftSavedByMemberId: memberId,
              draftUpdatedAt: now,
              createdByMemberId: memberId,
            },
            select: { id: true },
          });
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "training_program",
            resourceId: created.id,
            subjectClientProfileId: input.clientProfileId,
          });
          return { programId: created.id, revision: 1 };
        }

        if (!validId(input.programId)) throw new TrainingError("invalid_input");
        const program = await lockProgram(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.programId,
        );
        if (!program) throw new TrainingError("not_found");
        if (program.cancelled_at !== null)
          throw new TrainingError("program_cancelled");
        const succ = await liveSuccessor(tx, program.id);
        if (succ !== null && succ.takeover.getTime() <= now.getTime())
          throw new TrainingError("program_superseded");
        if (program.draft_revision !== input.expectedRevision)
          throw new TrainingError("stale_revision", {
            currentRevision: program.draft_revision,
          });

        const anchorTz =
          program.first_published_at !== null
            ? (
                await tx.trainingProgramVersion.findUniqueOrThrow({
                  where: {
                    programId_versionSeq: {
                      programId: program.id,
                      versionSeq: 1,
                    },
                  },
                  select: { effectiveTimezone: true },
                })
              ).effectiveTimezone
            : null;
        const lockedWeeks =
          anchorTz !== null
            ? ceiling(
                anchorTz,
                isoDate(program.start_date),
                program.week_count,
                program.locked_week_high_water,
                now,
              )
            : 0;
        const storedDraft = normalizeTrainingDraft(program.draft);
        assertLockedWeeksUnchanged(storedDraft, draft, lockedWeeks);

        const startDateStored = isoDate(program.start_date);
        const startDate =
          input.startDate === undefined
            ? startDateStored
            : cleanStartDate(input.startDate);
        if (
          program.first_published_at !== null &&
          startDate !== startDateStored
        )
          throw new TrainingError("start_anchor_locked");
        const weekCount =
          input.weekCount === undefined
            ? program.week_count
            : cleanWeekCount(input.weekCount);
        const fieldConfig =
          input.fieldConfig === undefined
            ? normalizeFieldConfig(program.field_config)
            : normalizeFieldConfig(input.fieldConfig);
        const title =
          input.title === undefined ? program.title : cleanTitle(input.title);
        const timezone =
          input.timezone === undefined
            ? program.confirmed_timezone
            : input.timezone;

        const changed =
          canonicalDraftContent({
            title,
            startDate,
            weekCount,
            fieldConfig,
            confirmedTimezone: timezone,
            draft,
          }) !==
          canonicalDraftContent({
            title: program.title,
            startDate: startDateStored,
            weekCount: program.week_count,
            fieldConfig: normalizeFieldConfig(program.field_config),
            confirmedTimezone: program.confirmed_timezone,
            draft: storedDraft,
          });

        const nextRevision = program.draft_revision + 1;
        const timezoneChanged = timezone !== program.confirmed_timezone;
        await tx.trainingProgram.update({
          where: { id: program.id },
          data: {
            title,
            startDate: new Date(`${startDate}T00:00:00Z`),
            weekCount,
            fieldConfig: fieldConfig as unknown as Prisma.InputJsonValue,
            ...(timezoneChanged
              ? {
                  confirmedTimezone: timezone,
                  timezoneSetByMemberId: memberId,
                  timezoneSetAt: now,
                }
              : {}),
            draft: draft as unknown as Prisma.InputJsonValue,
            draftRevision: nextRevision,
            draftSavedByMemberId: memberId,
            draftUpdatedAt: now,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "training_program",
          resourceId: program.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed },
        });
        return { programId: program.id, revision: nextRevision };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/**
 * Explicitly confirm/change the program-scoped timezone. Mutable — it
 * resolves only NEW publication instants; the anchor and every stored
 * snapshot never move (P9 §3.2). Published programs defensively advance
 * `lockedWeekHighWater` under the anchor before the zone changes. Same
 * write authorization + consent protocol as every program mutation.
 */
export async function setTrainingProgramTimezone(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    programId: string;
    timezone: string;
  },
  deps: TrainingDeps = {},
): Promise<{ programId: string }> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.programId) ||
    !validTimezone(input.timezone)
  )
    throw new TrainingError("invalid_input");
  const now = deps.now ?? new Date();
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx } = await writePrelude(tx, session, input, registry);
        const program = await lockProgram(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.programId,
        );
        if (!program) throw new TrainingError("not_found");
        if (program.cancelled_at !== null)
          throw new TrainingError("program_cancelled");
        const succ = await liveSuccessor(tx, program.id);
        if (succ !== null && succ.takeover.getTime() <= now.getTime())
          throw new TrainingError("program_superseded");
        if (program.confirmed_timezone === input.timezone)
          return { programId: program.id }; // idempotent — no write, no audit
        const v1 =
          program.first_published_at !== null
            ? await tx.trainingProgramVersion.findUnique({
                where: {
                  programId_versionSeq: {
                    programId: program.id,
                    versionSeq: 1,
                  },
                },
                select: { effectiveTimezone: true },
              })
            : null;
        const highWater =
          v1 !== null
            ? ceiling(
                v1.effectiveTimezone,
                isoDate(program.start_date),
                program.week_count,
                program.locked_week_high_water,
                now,
              )
            : program.locked_week_high_water;
        await tx.trainingProgram.update({
          where: { id: program.id },
          data: {
            confirmedTimezone: input.timezone,
            timezoneSetByMemberId: ctx.workspaceMemberId as string,
            timezoneSetAt: now,
            lockedWeekHighWater: highWater,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "training_program",
          resourceId: program.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true },
        });
        return { programId: program.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/**
 * Publish the CURRENT shared draft as an immutable effective-dated
 * version. `expectedRevision` is required: a committed version minted
 * from it resolves the replay BEFORE any guard (identical retry →
 * original result, no write/audit; same-revision parameter mismatch →
 * `revision_already_published` carrying the committed coordinates). The
 * predecessor claim is compared only for `versionSeq = 1`; non-first
 * publications carrying a claim are `invalid_input`.
 *
 * New-publication guards (post-locks, post-replay): cancelled/superseded
 * → state errors; v1 chain claim (root slot OR tail-only predecessor);
 * effective-date bounds + `program_ended` + `replacement_start`; the
 * A3-E activation floor (`activationInstant ≥ takeoverInstant(P)` for
 * v≥2); pending-successor cutoff; the P9 §3.4 anchor instant check;
 * wholly-past-week history invariant vs the governing baseline; and the
 * pre-commit `confirmation_required` immediate-takeover gate.
 */
export async function publishTrainingProgramVersion(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    programId: string;
    expectedRevision: number;
    effectiveDate: string;
    expectedPredecessor?: string | null;
    acknowledgeImmediateTakeover?: boolean;
  },
  deps: TrainingDeps = {},
): Promise<{
  versionId: string;
  versionSeq: number;
  programState: "cancelled" | "superseded" | "pending" | "current";
  replayed: boolean;
}> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  const now = deps.now ?? new Date();
  const effectiveDate = parseEffectiveDate(input.effectiveDate, now);
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.programId) ||
    typeof input.expectedRevision !== "number" ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 1 ||
    (input.expectedPredecessor !== undefined &&
      input.expectedPredecessor !== null &&
      !validId(input.expectedPredecessor))
  )
    throw new TrainingError("invalid_input");
  return withSerializedRetry(
    () =>
      db.$transaction(
        async (tx) => {
          const { ctx } = await writePrelude(tx, session, input, registry);
          const program = await lockProgram(
            tx,
            input.workspaceId,
            input.clientProfileId,
            input.programId,
          );
          if (!program) throw new TrainingError("not_found");

          const versions = await programVersions(tx, program.id);
          const seq1 = versions.find((v) => v.versionSeq === 1) ?? null;
          const takeover = seq1?.activationInstant ?? null;
          const succ = await liveSuccessor(tx, program.id);
          const programState = () =>
            deriveProgramState(program, takeover, succ?.takeover ?? null, now);

          // ── Replay authority FIRST (P9 §5 + A1 §1.2 + A2 §1) ──
          const replay = await tx.trainingProgramVersion.findFirst({
            where: {
              programId: program.id,
              publishOriginRevision: input.expectedRevision,
            },
            select: {
              id: true,
              versionSeq: true,
              effectiveDate: true,
            },
          });
          if (replay) {
            const sameDate = isoDate(replay.effectiveDate) === effectiveDate;
            const sameClaim =
              replay.versionSeq === 1
                ? (program.replaces_program_id ?? null) ===
                  (input.expectedPredecessor ?? null)
                : (input.expectedPredecessor ?? null) === null;
            if (!sameDate || !sameClaim)
              throw new TrainingError("revision_already_published", {
                versionSeq: replay.versionSeq,
                effectiveDate: isoDate(replay.effectiveDate),
                replacesProgramId: program.replaces_program_id,
              });
            return {
              versionId: replay.id,
              versionSeq: replay.versionSeq,
              programState: programState(),
              replayed: true,
            };
          }

          // ── State guards ──
          if (program.cancelled_at !== null)
            throw new TrainingError("program_cancelled");
          if (succ !== null && succ.takeover.getTime() <= now.getTime())
            throw new TrainingError("program_superseded");
          if (program.draft === null || program.draft === undefined)
            throw new TrainingError("publish_incomplete");
          if (program.draft_revision !== input.expectedRevision)
            throw new TrainingError("stale_revision", {
              currentRevision: program.draft_revision,
            });
          if (
            versions.length > 0 &&
            (input.expectedPredecessor ?? null) !== null
          )
            throw new TrainingError("invalid_input");
          if (program.confirmed_timezone === null)
            throw new TrainingError("timezone_required");

          const activation = resolveTrainingActivation(
            program.confirmed_timezone,
            effectiveDate,
          );
          if (activation.status === "invalid")
            throw new TrainingError("invalid_input");
          if (activation.status === "unrepresentable")
            throw new TrainingError("unrepresentable_date");

          const anchorTz = seq1?.effectiveTimezone ?? null;
          const startDate = isoDate(program.start_date);
          const lockCeiling =
            anchorTz !== null
              ? ceiling(
                  anchorTz,
                  startDate,
                  program.week_count,
                  program.locked_week_high_water,
                  now,
                )
              : 0;

          // ── v1 chain claim ──
          const isFirst = versions.length === 0;
          if (isFirst) {
            const claim = input.expectedPredecessor ?? null;
            if (claim === null) {
              const otherRoot = await tx.trainingProgram.findFirst({
                where: {
                  workspaceId: input.workspaceId,
                  clientProfileId: input.clientProfileId,
                  replacesProgramId: null,
                  firstPublishedAt: { not: null },
                  cancelledAt: null,
                },
                select: { id: true },
              });
              if (otherRoot) throw new TrainingError("state_conflict");
            } else {
              const pred = await lockProgram(
                tx,
                input.workspaceId,
                input.clientProfileId,
                claim,
              );
              if (!pred || pred.first_published_at === null)
                throw new TrainingError("state_conflict");
              const predSucc = await liveSuccessor(tx, pred.id);
              if (predSucc !== null) throw new TrainingError("state_conflict");
              // Replacement start rule: effectiveDate == startDate AND
              // startDate ≥ lowerBound (evaluated under the pending
              // program's own confirmed zone for "today").
              const todayConfirmed = localDateOf(
                now,
                program.confirmed_timezone,
              );
              const lb =
                todayConfirmed > startDate ? todayConfirmed : startDate;
              if (effectiveDate !== startDate || lb > startDate)
                throw new TrainingError("replacement_start");
            }
          }

          // ── Bounds (P7 §5.5 + P9 §3.4 + A3 §2) ──
          // A first version's activation IS the program takeover: it
          // must occur exactly at the immutable start date — backdated
          // starts are permitted because no published history exists to
          // protect yet. Later versions are bounded by [today,
          // firstDay(ceiling+1)] so they cannot rewrite locked weeks.
          const todayConfirmed = localDateOf(now, program.confirmed_timezone);
          const firstOpen = addDays(startDate, 7 * lockCeiling);
          const lowerBound = isFirst
            ? startDate
            : todayConfirmed > firstOpen
              ? todayConfirmed
              : firstOpen;
          const upperBound = addDays(startDate, 7 * program.week_count - 1);
          if (lowerBound > upperBound) throw new TrainingError("program_ended");
          if (effectiveDate < lowerBound || effectiveDate > upperBound)
            throw new TrainingError("effective_bounds");
          if (isFirst && effectiveDate !== startDate)
            throw new TrainingError("effective_bounds");
          // A3 Clause E: non-first publications may not activate before
          // the program's own immutable takeover instant (instants, not
          // dates). Equality is permitted.
          if (!isFirst && activation.instant.getTime() < takeover!.getTime())
            throw new TrainingError("effective_bounds");
          // P9 §3.4 instant check: the anchor calendar and the date check
          // can disagree by ~a day after a tz change — the instant bound
          // is what actually protects locked weeks.
          if (anchorTz !== null) {
            const openStart = weekStartInstant(
              anchorTz,
              startDate,
              lockCeiling + 1,
            );
            if (activation.instant.getTime() < openStart.getTime())
              throw new TrainingError("effective_bounds");
          }
          // Pending-successor cutoff (P7 §4.4): a version activating
          // at/after the successor takeover is born with an empty span.
          if (
            succ !== null &&
            activation.instant.getTime() >= succ.takeover.getTime()
          )
            throw new TrainingError("superseded_by_pending_replacement");

          // ── Materialize + publish completeness + history invariant ──
          const draft = normalizeTrainingDraft(program.draft);
          const materialized = materializeWeeks(
            draft,
            startDate,
            program.week_count,
          );
          const fieldConfig = normalizeFieldConfig(program.field_config);
          validatePublishCompleteness(materialized, fieldConfig);
          if (lockCeiling > 0) {
            const cutoff = succ?.takeover ?? null;
            const vinstants = versions.map(toVersionInstant);
            for (let w = 1; w <= lockCeiling; w++) {
              const end = boundaryInstant(
                anchorTz as string,
                addDays(startDate, 7 * w),
              );
              const baseline = gvAt(
                vinstants,
                new Date(
                  Math.min(
                    end.getTime() - 1,
                    cutoff !== null ? cutoff.getTime() - 1 : end.getTime() - 1,
                  ),
                ),
                cutoff,
              );
              const baselineWeek =
                baseline !== null
                  ? (
                      (
                        await tx.trainingProgramVersion.findUniqueOrThrow({
                          where: { id: baseline.id },
                          select: { payload: true },
                        })
                      ).payload as MaterializedProgram
                    ).weeks.find((x) => x.week === w)
                  : null;
              const newWeek = materialized.weeks.find((x) => x.week === w);
              const norm = (x: unknown) => canonicalJson(x ?? null);
              if (baselineWeek === undefined || baselineWeek === null) {
                // Unestablished past week — no invented history: the new
                // version must carry no sessions there.
                if (newWeek !== undefined && newWeek.sessions.length > 0)
                  throw new TrainingError("history_conflict");
              } else if (norm(baselineWeek) !== norm(newWeek)) {
                throw new TrainingError("history_conflict");
              }
            }
          }

          // ── Pre-commit immediate-takeover acknowledgement (A1 §3.3) ──
          if (
            isFirst &&
            (input.expectedPredecessor ?? null) !== null &&
            activation.instant.getTime() <= now.getTime() &&
            input.acknowledgeImmediateTakeover !== true
          )
            throw new TrainingError("confirmation_required", {
              resolvesAt: activation.instant.toISOString(),
            });

          // ── Commit ──
          const versionSeq = versions.length + 1;
          const clockRows = await tx.$queryRawUnsafe<{ t: Date }[]>(
            `SELECT clock_timestamp() AS t`,
          );
          const committedAt = clockRows[0]?.t ?? now;
          const created = await tx.trainingProgramVersion.create({
            data: {
              workspaceId: program.workspace_id,
              programId: program.id,
              clientProfileId: program.client_profile_id,
              versionSeq,
              effectiveDate: new Date(`${effectiveDate}T00:00:00Z`),
              effectiveTimezone: program.confirmed_timezone,
              activationInstant: activation.instant,
              payload: materialized as unknown as Prisma.InputJsonValue,
              fieldConfig: fieldConfig as unknown as Prisma.InputJsonValue,
              publishOriginRevision: program.draft_revision,
              publishedByMemberId: ctx.workspaceMemberId as string,
            },
            select: { id: true },
          });
          if (isFirst) {
            await tx.trainingProgram.update({
              where: { id: program.id },
              data: {
                replacesProgramId: input.expectedPredecessor ?? null,
                firstPublishedAt: committedAt,
              },
            });
          }
          // Defensive monotone bound: once a week is completed it can
          // never unlock, regardless of future clock/zone changes. The
          // stored high-water is advanced under the immutable anchor at
          // every publication.
          const newHighWater = ceiling(
            anchorTz ?? program.confirmed_timezone,
            startDate,
            program.week_count,
            program.locked_week_high_water,
            now,
          );
          if (newHighWater > program.locked_week_high_water) {
            await tx.trainingProgram.update({
              where: { id: program.id },
              data: { lockedWeekHighWater: newHighWater },
            });
          }
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "training_program_version",
            resourceId: created.id,
            subjectClientProfileId: program.client_profile_id,
            meta: {
              version: String(versionSeq),
              date: effectiveDate,
              status: "PUBLISHED",
            },
          });
          return {
            versionId: created.id,
            versionSeq,
            programState: programState(),
            replayed: false,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    true,
  );
}

/**
 * Pending-leaf cancellation (P7 §4.5 + G): only a PUBLISHED,
 * not-yet-in-force REPLACEMENT program with no live successor may be
 * cancelled. Guards in order: not a replacement → `not_a_replacement`;
 * already cancelled → `{already: true}` idempotent replay with NO
 * second audit; unpublished → `nothing_published`; live successor →
 * `has_successor`; takeover ≤ now → `already_taken_over`. Committed
 * cancellation is irreversible; the freed successor slot is claimable.
 * Audit: one `UPDATE` on `training_program` with `meta: {changed:true}`.
 */
export async function cancelTrainingProgram(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    programId: string;
  },
  deps: TrainingDeps = {},
): Promise<{ programId: string; alreadyCancelled: boolean }> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.programId)
  )
    throw new TrainingError("invalid_input");
  const now = deps.now ?? new Date();
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx } = await writePrelude(tx, session, input, registry);
        const program = await lockProgram(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.programId,
        );
        if (!program) throw new TrainingError("not_found");
        if (program.replaces_program_id === null)
          throw new TrainingError("not_a_replacement");
        if (program.cancelled_at !== null)
          return { programId: program.id, alreadyCancelled: true };
        const v1 = await tx.trainingProgramVersion.findUnique({
          where: {
            programId_versionSeq: {
              programId: program.id,
              versionSeq: 1,
            },
          },
          select: { activationInstant: true },
        });
        if (!v1) throw new TrainingError("nothing_published");
        const succ = await liveSuccessor(tx, program.id);
        if (succ !== null) throw new TrainingError("has_successor");
        // Pre-takeover guard uses the operation clock (same `now` the
        // rest of the contract resolves against); the recorded
        // cancellation provenance uses the authoritative post-lock
        // clock_timestamp(), matching firstPublishedAt.
        if (v1.activationInstant.getTime() <= now.getTime())
          throw new TrainingError("already_taken_over");
        const clockRows = await tx.$queryRawUnsafe<{ t: Date }[]>(
          `SELECT clock_timestamp() AS t`,
        );
        const t = clockRows[0]?.t ?? now;
        await tx.trainingProgram.update({
          where: { id: program.id },
          data: {
            cancelledAt: t,
            cancelledByMemberId: ctx.workspaceMemberId as string,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "training_program",
          resourceId: program.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true },
        });
        return { programId: program.id, alreadyCancelled: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

// ── Read operations (A2 Clause B audited transaction) ────────────────────

/** One read transaction: txn-local statement_timeout FIRST, then the
 * reviewed prelude; cooperative deadline throughout. */
const TX_OPTS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5000,
  timeout: TRAINING_LIMITS.prismaTxTimeoutMs,
} as const;

function checkDeadline(deadline: number): void {
  if (Date.now() > deadline) throw new TrainingError("service_unavailable");
}

async function beginRead(tx: Prisma.TransactionClient): Promise<number> {
  await tx.$queryRawUnsafe(
    `SELECT set_config('statement_timeout', $1::text, true)`,
    String(TRAINING_LIMITS.stmtTimeoutMs),
  );
  return Date.now() + TRAINING_LIMITS.readBudgetMs;
}

/** Chain node for the bounded walk (P9 §4.2 Q3). */
type ChainNode = {
  id: string;
  replaces_program_id: string | null;
  first_published_at: Date | null;
  cancelled_at: Date | null;
  takeover: Date | null;
};

async function chainNode(
  tx: Prisma.TransactionClient,
  programId: string,
): Promise<ChainNode | null> {
  const rows = await tx.$queryRawUnsafe<ChainNode[]>(
    `SELECT p.id, p.replaces_program_id, p.first_published_at,
            p.cancelled_at, v.activation_instant AS takeover
     FROM "training_program" p
     LEFT JOIN "training_program_version" v
       ON v.program_id = p.id AND v.version_seq = 1
     WHERE p.id = $1`,
    programId,
  );
  return rows[0] ?? null;
}

/**
 * selectCurrent (P9 §4.2): indexed tail candidate → live-successor
 * verify (anti-join fallback) → predecessor PK walk to the first
 * in-force node. Work is independent of history length; pending = the
 * non-in-force nodes visited ABOVE current only.
 */
async function selectCurrent(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  t: Date,
  deadline: number,
): Promise<{ current: ChainNode | null; pending: ChainNode[] }> {
  const tails = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "training_program"
     WHERE workspace_id = $1 AND client_profile_id = $2
       AND first_published_at IS NOT NULL AND cancelled_at IS NULL
     ORDER BY first_published_at DESC, id DESC LIMIT 1`,
    workspaceId,
    clientProfileId,
  );
  let tailId = tails[0]?.id ?? null;
  if (tailId !== null) {
    checkDeadline(deadline);
    const successors = await tx.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "training_program"
       WHERE replaces_program_id = $1 AND cancelled_at IS NULL LIMIT 1`,
      tailId,
    );
    if (successors.length > 0) {
      // Clock anomaly fallback: anti-join tail — O(N) rare path.
      const anti = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT p.id FROM "training_program" p
         WHERE p.workspace_id = $1 AND p.client_profile_id = $2
           AND p.first_published_at IS NOT NULL AND p.cancelled_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM "training_program" s
             WHERE s.replaces_program_id = p.id AND s.cancelled_at IS NULL)
         ORDER BY p.first_published_at DESC, p.id DESC LIMIT 1`,
        workspaceId,
        clientProfileId,
      );
      tailId = anti[0]?.id ?? null;
    }
  }
  if (tailId === null) return { current: null, pending: [] };

  const pending: ChainNode[] = [];
  let node = await chainNode(tx, tailId);
  while (node !== null) {
    checkDeadline(deadline);
    if (
      node.cancelled_at === null &&
      node.takeover !== null &&
      node.takeover.getTime() <= t.getTime()
    )
      return { current: node, pending };
    pending.push(node);
    if (node.replaces_program_id === null) break;
    node = await chainNode(tx, node.replaces_program_id);
  }
  return { current: null, pending };
}

// ── Staff reads ──────────────────────────────────────────────────────────

export type TrainingProgramListItem = {
  programId: string;
  title: string;
  startDate: string;
  weekCount: number;
  firstPublishedAt: string | null;
  cancelledAt: string | null;
  /** Truthful lifecycle label for staff (S correction). */
  state: "draft" | "pending" | "current" | "superseded" | "dead" | "cancelled";
};

export type StaffProgramList = {
  programs: TrainingProgramListItem[];
  nextCursor: { createdAt: string; id: string } | null;
  /** Advisory write capability — the write path independently
   * re-authorizes under locks; this only shapes the UI. */
  canWrite: boolean;
};

/**
 * Staff program list — lifecycle-UNFILTERED over the authorized
 * (workspace, client) scope: drafts, pending, cancelled, dead and
 * superseded programs are all returned with truthful labels (S).
 * Keyset by (createdAt, id); N+1 for a truthful hasMore.
 */
export async function readStaffTrainingPrograms(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    cursor?: { createdAt: string; id: string };
  },
  deps: TrainingDeps = {},
): Promise<StaffProgramList> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  const now = deps.now ?? new Date();
  if (!validId(input.workspaceId) || !validId(input.clientProfileId))
    throw new TrainingError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(async (tx) => {
      const deadline = await beginRead(tx);
      const { ctx, member } = await readPrelude(tx, session, input, registry);
      if (ctx.grantedScope === "own")
        throw new AccessDeniedError("role_denied", "trainingPlansLogs", "read");
      const cursorTs =
        input.cursor !== undefined ? new Date(input.cursor.createdAt) : null;
      const rows = await tx.$queryRawUnsafe<
        {
          id: string;
          title: string;
          start_date: Date;
          week_count: number;
          first_published_at: Date | null;
          cancelled_at: Date | null;
          created_at: Date;
          takeover: Date | null;
          succ_takeover: Date | null;
        }[]
      >(
        `SELECT p.id, p.title, p.start_date, p.week_count,
                  p.first_published_at, p.cancelled_at, p.created_at,
                  v1.activation_instant AS takeover,
                  (SELECT sv.activation_instant
                     FROM "training_program" s
                     JOIN "training_program_version" sv
                       ON sv.program_id = s.id AND sv.version_seq = 1
                    WHERE s.replaces_program_id = p.id
                      AND s.cancelled_at IS NULL
                    LIMIT 1) AS succ_takeover
           FROM "training_program" p
           LEFT JOIN "training_program_version" v1
             ON v1.program_id = p.id AND v1.version_seq = 1
           WHERE p.workspace_id = $1 AND p.client_profile_id = $2
             AND ($3::timestamptz IS NULL
                  OR (p.created_at, p.id) < ($3::timestamptz, $4::text))
           ORDER BY p.created_at DESC, p.id DESC
           LIMIT $5`,
        input.workspaceId,
        input.clientProfileId,
        cursorTs,
        input.cursor?.id ?? "",
        TRAINING_LIMITS.programPageSize + 1,
      );
      const page = rows.slice(0, TRAINING_LIMITS.programPageSize);
      const last = page[page.length - 1];
      checkDeadline(deadline);
      const writeAssignment =
        member.role === "COACH" || member.role === "WORKSPACE_OWNER"
          ? await tx.clientAssignment.findFirst({
              where: {
                workspaceId: input.workspaceId,
                clientProfileId: input.clientProfileId,
                coachMemberId: member.id,
                status: "ACTIVE",
              },
              select: { id: true },
            })
          : null;
      await writeAuditEvent(tx, ctx, {
        action: "READ",
        resourceType: "training_program",
        resourceId: input.clientProfileId,
        subjectClientProfileId: input.clientProfileId,
      });
      return {
        programs: page.map((p) => {
          const state: TrainingProgramListItem["state"] =
            p.cancelled_at !== null
              ? "cancelled"
              : p.first_published_at === null
                ? "draft"
                : p.succ_takeover !== null &&
                    p.takeover !== null &&
                    p.succ_takeover.getTime() <= p.takeover.getTime()
                  ? "dead"
                  : p.succ_takeover !== null &&
                      p.succ_takeover.getTime() <= now.getTime()
                    ? "superseded"
                    : p.takeover !== null &&
                        p.takeover.getTime() <= now.getTime()
                      ? "current"
                      : "pending";
          return {
            programId: p.id,
            title: p.title,
            startDate: isoDate(p.start_date),
            weekCount: p.week_count,
            firstPublishedAt: p.first_published_at?.toISOString() ?? null,
            cancelledAt: p.cancelled_at?.toISOString() ?? null,
            state,
          };
        }),
        nextCursor:
          rows.length > TRAINING_LIMITS.programPageSize && last
            ? { createdAt: last.created_at.toISOString(), id: last.id }
            : null,
        canWrite: writeAssignment !== null,
      };
    }, TX_OPTS),
  );
}

export type StaffProgramDetail = {
  program: {
    id: string;
    title: string;
    startDate: string;
    weekCount: number;
    fieldConfig: TrainingFieldConfig;
    confirmedTimezone: string | null;
    anchorTimezone: string | null;
    draftRevision: number;
    draft: TrainingDraft;
    replacesProgramId: string | null;
    firstPublishedAt: string | null;
    /** Committed draft revision consumed by version 1 — lets an
     * authorized editor reproduce the original first-publication
     * request (including its predecessor claim) when retrying at the
     * same revision after a lost response or remount (F1). */
    firstPublishOriginRevision: number | null;
    cancelledAt: string | null;
    ceiling: number;
    currentWeekIndex: number | null;
    state: TrainingProgramListItem["state"];
  };
  versions: {
    id: string;
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
    activationInstant: string;
    publishedAt: string;
    label: "current" | "scheduled" | "past" | "shadowed" | "beyond_cutoff";
  }[];
  nextVersionCursor: number | null;
  /** Advisory write capability — the write path independently
   * re-authorizes under locks; this only shapes the UI. */
  canWrite: boolean;
};

/**
 * Staff program detail — draft + bounded version page + derived state.
 * Version listing is lifecycle-unfiltered (S): every committed version
 * is returned with a truthful label — future, shadowed, beyond-cutoff
 * and cancelled-program records included.
 */
export async function readStaffTrainingProgram(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    programId: string;
    versionCursor?: number;
  },
  deps: TrainingDeps = {},
): Promise<StaffProgramDetail> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  const now = deps.now ?? new Date();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.programId) ||
    (input.versionCursor !== undefined &&
      (!Number.isInteger(input.versionCursor) || input.versionCursor < 1))
  )
    throw new TrainingError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(async (tx) => {
      await beginRead(tx);
      const { ctx, member } = await readPrelude(tx, session, input, registry);
      if (ctx.grantedScope === "own")
        throw new AccessDeniedError("role_denied", "trainingPlansLogs", "read");
      const program = await lockProgram(
        tx,
        input.workspaceId,
        input.clientProfileId,
        input.programId,
      );
      if (!program) throw new TrainingError("not_found");
      const versions = await programVersions(tx, program.id);
      const seq1 = versions.find((v) => v.versionSeq === 1) ?? null;
      const anchorTz = seq1?.effectiveTimezone ?? null;
      const succ = await liveSuccessor(tx, program.id);
      const cutoff = succ?.takeover ?? null;
      const startDate = isoDate(program.start_date);

      const cursor = input.versionCursor;
      const pageRows = versions
        .filter((v) => cursor === undefined || v.versionSeq > cursor)
        .slice(0, TRAINING_LIMITS.versionPageSize + 1);
      const page = pageRows.slice(0, TRAINING_LIMITS.versionPageSize);
      const vinstants = versions.map(toVersionInstant);
      const labelled = page.map((v) => {
        const vi = toVersionInstant(v);
        const shadowed = isShadowed(vinstants, vi);
        const beyondCutoff =
          cutoff !== null && v.activationInstant.getTime() >= cutoff.getTime();
        const label: StaffProgramDetail["versions"][number]["label"] = shadowed
          ? "shadowed"
          : beyondCutoff
            ? "beyond_cutoff"
            : v.activationInstant.getTime() > now.getTime()
              ? "scheduled"
              : gvAt(vinstants, now, cutoff)?.id === v.id
                ? "current"
                : "past";
        return {
          id: v.id,
          versionSeq: v.versionSeq,
          effectiveDate: isoDate(v.effectiveDate),
          effectiveTimezone: v.effectiveTimezone,
          activationInstant: v.activationInstant.toISOString(),
          publishedAt: v.publishedAt.toISOString(),
          label,
        };
      });

      const lockCeiling =
        anchorTz !== null
          ? ceiling(
              anchorTz,
              startDate,
              program.week_count,
              program.locked_week_high_water,
              now,
            )
          : 0;
      const currentWeek =
        anchorTz !== null
          ? Math.min(
              program.week_count,
              Math.max(1, weekIndex(startDate, localDateOf(now, anchorTz))),
            )
          : null;
      const writeAssignment =
        member.role === "COACH" || member.role === "WORKSPACE_OWNER"
          ? await tx.clientAssignment.findFirst({
              where: {
                workspaceId: input.workspaceId,
                clientProfileId: input.clientProfileId,
                coachMemberId: member.id,
                status: "ACTIVE",
              },
              select: { id: true },
            })
          : null;
      await writeAuditEvent(tx, ctx, {
        action: "READ",
        resourceType: "training_program",
        resourceId: program.id,
        subjectClientProfileId: input.clientProfileId,
      });
      return {
        program: {
          id: program.id,
          title: program.title,
          startDate,
          weekCount: program.week_count,
          fieldConfig: normalizeFieldConfig(program.field_config),
          confirmedTimezone: program.confirmed_timezone,
          anchorTimezone: anchorTz,
          draftRevision: program.draft_revision,
          draft:
            (program.draft as TrainingDraft | null) ?? emptyTrainingDraft(),
          replacesProgramId: program.replaces_program_id,
          firstPublishedAt: program.first_published_at?.toISOString() ?? null,
          firstPublishOriginRevision: seq1?.publishOriginRevision ?? null,
          cancelledAt: program.cancelled_at?.toISOString() ?? null,
          ceiling: lockCeiling,
          currentWeekIndex: currentWeek,
          state:
            deriveProgramState(
              program,
              seq1?.activationInstant ?? null,
              succ?.takeover ?? null,
              now,
            ) === "pending" &&
            succ !== null &&
            seq1 !== null &&
            succ.takeover.getTime() <= seq1.activationInstant.getTime()
              ? "dead"
              : program.first_published_at === null
                ? "draft"
                : deriveProgramState(
                    program,
                    seq1?.activationInstant ?? null,
                    succ?.takeover ?? null,
                    now,
                  ),
        },
        versions: labelled,
        nextVersionCursor:
          pageRows.length > TRAINING_LIMITS.versionPageSize
            ? (page[page.length - 1]?.versionSeq ?? null)
            : null,
        canWrite: writeAssignment !== null,
      };
    }, TX_OPTS),
  );
}

export type StaffVersionDetail = {
  id: string;
  programId: string;
  versionSeq: number;
  effectiveDate: string;
  effectiveTimezone: string;
  activationInstant: string;
  fieldConfig: TrainingFieldConfig;
  payload: MaterializedProgram;
  publishedAt: string;
  /** S: truthful lifecycle labels — never silently absent. */
  labels: {
    shadowed: boolean;
    beyondCutoff: boolean;
    scheduled: boolean;
    programCancelled: boolean;
    programDead: boolean;
  };
};

/**
 * Staff version detail — exact-id, scoped to the verified
 * (workspace, client, program) triple. ALL published versions are
 * readable with truthful labels; client visibility filters are never
 * applied to staff history (S).
 */
export async function readStaffTrainingProgramVersion(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    programId: string;
    versionId: string;
  },
  deps: TrainingDeps = {},
): Promise<StaffVersionDetail> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  const now = deps.now ?? new Date();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.programId) ||
    !validId(input.versionId)
  )
    throw new TrainingError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(async (tx) => {
      await beginRead(tx);
      const { ctx } = await readPrelude(tx, session, input, registry);
      if (ctx.grantedScope === "own")
        throw new AccessDeniedError("role_denied", "trainingPlansLogs", "read");
      const program = await lockProgram(
        tx,
        input.workspaceId,
        input.clientProfileId,
        input.programId,
      );
      if (!program) throw new TrainingError("not_found");
      const version = await tx.trainingProgramVersion.findFirst({
        where: {
          id: input.versionId,
          programId: program.id,
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        },
      });
      if (!version) throw new TrainingError("not_found");
      const versions = (await programVersions(tx, program.id)).map(
        toVersionInstant,
      );
      const vi = toVersionInstant(version as VersionRow);
      const succ = await liveSuccessor(tx, program.id);
      const seq1 = versions.find((v) => v.versionSeq === 1) ?? null;
      await writeAuditEvent(tx, ctx, {
        action: "READ",
        resourceType: "training_program_version",
        resourceId: version.id,
        subjectClientProfileId: input.clientProfileId,
      });
      return {
        id: version.id,
        programId: program.id,
        versionSeq: version.versionSeq,
        effectiveDate: isoDate(version.effectiveDate),
        effectiveTimezone: version.effectiveTimezone,
        activationInstant: version.activationInstant.toISOString(),
        fieldConfig: normalizeFieldConfig(version.fieldConfig),
        payload: version.payload as MaterializedProgram,
        publishedAt: version.publishedAt.toISOString(),
        labels: {
          shadowed: isShadowed(versions, vi),
          beyondCutoff:
            succ !== null &&
            version.activationInstant.getTime() >= succ.takeover.getTime(),
          scheduled: version.activationInstant.getTime() > now.getTime(),
          programCancelled: program.cancelled_at !== null,
          programDead:
            succ !== null &&
            seq1 !== null &&
            succ.takeover.getTime() <= seq1.activationInstant.getTime(),
        },
      };
    }, TX_OPTS),
  );
}

// ── Client reads ─────────────────────────────────────────────────────────

export type OwnTrainingView = {
  state: "none" | "upcoming" | "active" | "completed";
  current: {
    programId: string;
    title: string;
    versionSeq: number;
    weekIndex: number;
    weekCount: number;
    startDate: string;
    anchorTimezone: string;
    marker: { label: "updated" | "updates"; effectiveDate: string } | null;
    week: {
      week: number;
      sessions: MaterializedProgram["weeks"][number]["sessions"];
    } | null;
  } | null;
  upcoming: {
    programId: string;
    title: string;
    startDate: string;
    takeoverInstant: string;
  } | null;
};

/**
 * Client own-scope read — the current program's governing version,
 * projected through that version's snapshotted fieldConfig. Pending
 * replacements are never disclosed (the current program renders until
 * actual takeover); dead and cancelled programs are invisible; a sole
 * future-start published root renders as `upcoming`.
 */
export async function readOwnTrainingProgram(
  session: SessionLike,
  input: { workspaceId: string },
  deps: TrainingDeps = {},
): Promise<OwnTrainingView> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  const now = deps.now ?? new Date();
  if (!validId(input.workspaceId)) throw new TrainingError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(async (tx) => {
      const deadline = await beginRead(tx);
      const userId = session?.user?.id;
      if (typeof userId !== "string" || userId.length === 0)
        throw new AccessDeniedError(
          "unauthenticated",
          "trainingPlansLogs",
          "read",
        );
      const profile = await tx.clientProfile.findFirst({
        where: { workspaceId: input.workspaceId, userId },
        select: { id: true },
      });
      if (!profile)
        throw new AccessDeniedError("not_owner", "trainingPlansLogs", "read");
      const { ctx } = await readPrelude(
        tx,
        session,
        { workspaceId: input.workspaceId, clientProfileId: profile.id },
        registry,
      );
      if (ctx.grantedScope !== "own")
        throw new AccessDeniedError("role_denied", "trainingPlansLogs", "read");

      const sel = await selectCurrent(
        tx,
        input.workspaceId,
        profile.id,
        now,
        deadline,
      );
      if (sel.current === null) {
        // Upcoming: the sole published non-cancelled pending root.
        const up = sel.pending.find(
          (n) => n.replaces_program_id === null && sel.pending.length === 1,
        );
        const upRow = up
          ? await tx.trainingProgram.findUniqueOrThrow({
              where: { id: up.id },
              select: { title: true, startDate: true },
            })
          : null;
        return {
          state: up ? "upcoming" : "none",
          current: null,
          upcoming:
            up && upRow
              ? {
                  programId: up.id,
                  title: upRow.title,
                  startDate: isoDate(upRow.startDate),
                  takeoverInstant: up.takeover!.toISOString(),
                }
              : null,
        };
      }
      checkDeadline(deadline);
      const programRow = await tx.trainingProgram.findUniqueOrThrow({
        where: { id: sel.current.id },
        select: { title: true, startDate: true, weekCount: true },
      });
      const versions = (await programVersions(tx, sel.current.id)).map((v) => ({
        ...v,
        vi: toVersionInstant(v),
      }));
      const succ = await liveSuccessor(tx, sel.current.id);
      const cutoff = succ?.takeover ?? null;
      const vinstants = versions.map((v) => v.vi);
      const anchorTz =
        vinstants.find((v) => v.versionSeq === 1)?.effectiveTimezone ?? "UTC";
      const startDate = isoDate(programRow.startDate);
      const idx = Math.min(
        programRow.weekCount,
        Math.max(1, weekIndex(startDate, localDateOf(now, anchorTz))),
      );
      // Lifecycle state derives from the real end boundary (exclusive
      // start of the week AFTER the last one under the immutable anchor
      // calendar) — never from the clamped display index: the final week
      // stays current through its final valid instant.
      const endInstant = weekEndInstant(
        anchorTz,
        startDate,
        programRow.weekCount,
      );
      const governing = gvAt(vinstants, now, cutoff);
      const govRow = governing
        ? versions.find((v) => v.vi.id === governing.id)
        : undefined;
      const projected =
        govRow !== undefined
          ? projectForClient(
              govRow.payload as MaterializedProgram,
              normalizeFieldConfig(govRow.fieldConfig),
            )
          : null;
      const week = projected?.weeks.find((w) => w.week === idx) ?? null;
      const marker = weekMarker(vinstants, anchorTz, startDate, idx, now);
      await writeAuditEvent(tx, ctx, {
        action: "READ",
        resourceType: "training_program_version",
        resourceId: governing?.id ?? sel.current.id,
        subjectClientProfileId: profile.id,
      });
      return {
        state: now.getTime() >= endInstant.getTime() ? "completed" : "active",
        current: {
          programId: sel.current.id,
          title: programRow.title,
          versionSeq: governing?.versionSeq ?? 0,
          weekIndex: idx,
          weekCount: programRow.weekCount,
          startDate,
          anchorTimezone: anchorTz,
          marker,
          week: week ? { week: week.week, sessions: week.sessions } : null,
        },
        upcoming: null,
      };
    }, TX_OPTS),
  );
}

export type ClientHistoryPage = {
  programs: {
    programId: string;
    startDate: string;
    takeoverInstant: string;
    superseded: boolean;
  }[];
  nextCursor: { firstPublishedAt: string; id: string } | null;
};

/**
 * Client history — LEVEL 1 (A2 §3 + A3 §1): published, non-cancelled,
 * in-force, not-dead programs that governed or govern, keyset by
 * (firstPublishedAt, id). N+1 truthful hasMore; no whole-history load.
 */
export async function readOwnTrainingHistory(
  session: SessionLike,
  input: {
    workspaceId: string;
    cursor?: { firstPublishedAt: string; id: string };
  },
  deps: TrainingDeps = {},
): Promise<ClientHistoryPage> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  const now = deps.now ?? new Date();
  if (!validId(input.workspaceId)) throw new TrainingError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(async (tx) => {
      await beginRead(tx);
      const userId = session?.user?.id;
      if (typeof userId !== "string" || userId.length === 0)
        throw new AccessDeniedError(
          "unauthenticated",
          "trainingPlansLogs",
          "read",
        );
      const profile = await tx.clientProfile.findFirst({
        where: { workspaceId: input.workspaceId, userId },
        select: { id: true },
      });
      if (!profile)
        throw new AccessDeniedError("not_owner", "trainingPlansLogs", "read");
      const { ctx } = await readPrelude(
        tx,
        session,
        { workspaceId: input.workspaceId, clientProfileId: profile.id },
        registry,
      );
      if (ctx.grantedScope !== "own")
        throw new AccessDeniedError("role_denied", "trainingPlansLogs", "read");

      const cursorTs =
        input.cursor !== undefined
          ? new Date(input.cursor.firstPublishedAt)
          : null;
      const rows = await tx.$queryRawUnsafe<
        {
          id: string;
          start_date: Date;
          first_published_at: Date;
          takeover: Date;
          succ_takeover: Date | null;
        }[]
      >(
        `SELECT p.id, p.start_date, p.first_published_at,
                  v1.activation_instant AS takeover,
                  (SELECT sv.activation_instant
                     FROM "training_program" s
                     JOIN "training_program_version" sv
                       ON sv.program_id = s.id AND sv.version_seq = 1
                    WHERE s.replaces_program_id = p.id
                      AND s.cancelled_at IS NULL
                    LIMIT 1) AS succ_takeover
           FROM "training_program" p
           JOIN "training_program_version" v1
             ON v1.program_id = p.id AND v1.version_seq = 1
           WHERE p.workspace_id = $1 AND p.client_profile_id = $2
             AND p.first_published_at IS NOT NULL AND p.cancelled_at IS NULL
             AND v1.activation_instant <= $3
             AND NOT EXISTS (
               SELECT 1 FROM "training_program" s
               JOIN "training_program_version" sv
                 ON sv.program_id = s.id AND sv.version_seq = 1
               WHERE s.replaces_program_id = p.id AND s.cancelled_at IS NULL
                 AND sv.activation_instant <= v1.activation_instant)
             AND ($4::timestamptz IS NULL
                  OR (p.first_published_at, p.id) < ($4::timestamptz, $5::text))
           ORDER BY p.first_published_at DESC, p.id DESC
           LIMIT $6`,
        input.workspaceId,
        profile.id,
        now,
        cursorTs,
        input.cursor?.id ?? "",
        TRAINING_LIMITS.programPageSize + 1,
      );
      const page = rows.slice(0, TRAINING_LIMITS.programPageSize);
      const last = page[page.length - 1];
      await writeAuditEvent(tx, ctx, {
        action: "READ",
        resourceType: "training_program",
        resourceId: profile.id,
        subjectClientProfileId: profile.id,
      });
      return {
        programs: page.map((p) => ({
          programId: p.id,
          startDate: isoDate(p.start_date),
          takeoverInstant: p.takeover.toISOString(),
          superseded:
            p.succ_takeover !== null &&
            p.succ_takeover.getTime() <= now.getTime(),
        })),
        nextCursor:
          rows.length > TRAINING_LIMITS.programPageSize && last
            ? {
                firstPublishedAt: last.first_published_at.toISOString(),
                id: last.id,
              }
            : null,
      };
    }, TX_OPTS),
  );
}

export type ClientVersionsPage = {
  programId: string;
  versions: {
    id: string;
    versionSeq: number;
    effectiveDate: string;
    activationInstant: string;
  }[];
  nextCursor: number | null;
};

/**
 * Client history — LEVEL 2 (A3 §1 scoped preamble + A2 §3 query):
 * inside the reviewed transaction, resolve the EXACT
 * (id, workspace, client) triple with the client program-visibility
 * predicates — zero authorized/visible rows is `not_found`, never an
 * empty successful history. Then the unchanged keyset page of
 * in-force, non-shadowed, pre-cutoff versions for that ONE program.
 * The preamble runs on every page request.
 */
export async function readOwnTrainingProgramVersions(
  session: SessionLike,
  input: {
    workspaceId: string;
    programId: string;
    cursorSeq?: number;
  },
  deps: TrainingDeps = {},
): Promise<ClientVersionsPage> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  const now = deps.now ?? new Date();
  if (
    !validId(input.workspaceId) ||
    !validId(input.programId) ||
    (input.cursorSeq !== undefined &&
      (!Number.isInteger(input.cursorSeq) || input.cursorSeq < 1))
  )
    throw new TrainingError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(async (tx) => {
      await beginRead(tx);
      const userId = session?.user?.id;
      if (typeof userId !== "string" || userId.length === 0)
        throw new AccessDeniedError(
          "unauthenticated",
          "trainingPlansLogs",
          "read",
        );
      const profile = await tx.clientProfile.findFirst({
        where: { workspaceId: input.workspaceId, userId },
        select: { id: true },
      });
      if (!profile)
        throw new AccessDeniedError("not_owner", "trainingPlansLogs", "read");
      const { ctx } = await readPrelude(
        tx,
        session,
        { workspaceId: input.workspaceId, clientProfileId: profile.id },
        registry,
      );
      if (ctx.grantedScope !== "own")
        throw new AccessDeniedError("role_denied", "trainingPlansLogs", "read");

      // ── A3 §1 scoped preamble: exact triple + visibility ──
      const preamble = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT p.id FROM "training_program" p
           JOIN "training_program_version" v1
             ON v1.program_id = p.id AND v1.version_seq = 1
           WHERE p.id = $1 AND p.workspace_id = $2 AND p.client_profile_id = $3
             AND p.first_published_at IS NOT NULL AND p.cancelled_at IS NULL
             AND v1.activation_instant <= $4
             AND NOT EXISTS (
               SELECT 1 FROM "training_program" s
               JOIN "training_program_version" sv
                 ON sv.program_id = s.id AND sv.version_seq = 1
               WHERE s.replaces_program_id = p.id AND s.cancelled_at IS NULL
                 AND sv.activation_instant <= v1.activation_instant)`,
        input.programId,
        input.workspaceId,
        profile.id,
        now,
      );
      if (preamble.length === 0) throw new TrainingError("not_found");

      const rows = await tx.$queryRawUnsafe<
        {
          id: string;
          version_seq: number;
          effective_date: Date;
          activation_instant: Date;
        }[]
      >(
        `SELECT v.id, v.version_seq, v.effective_date, v.activation_instant
           FROM "training_program_version" v
           WHERE v.program_id = $1
             AND v.version_seq > $2
             AND v.activation_instant <= $3
             AND v.activation_instant < COALESCE((
               SELECT sv.activation_instant FROM "training_program" s
               JOIN "training_program_version" sv
                 ON sv.program_id = s.id AND sv.version_seq = 1
               WHERE s.replaces_program_id = $1 AND s.cancelled_at IS NULL),
               'infinity')
             AND NOT EXISTS (
               SELECT 1 FROM "training_program_version" v2
               WHERE v2.program_id = v.program_id
                 AND v2.version_seq > v.version_seq
                 AND v2.activation_instant <= v.activation_instant)
           ORDER BY v.version_seq LIMIT $4`,
        input.programId,
        input.cursorSeq ?? 0,
        now,
        TRAINING_LIMITS.versionPageSize + 1,
      );
      const page = rows.slice(0, TRAINING_LIMITS.versionPageSize);
      await writeAuditEvent(tx, ctx, {
        action: "READ",
        resourceType: "training_program_version",
        resourceId: input.programId,
        subjectClientProfileId: profile.id,
      });
      return {
        programId: input.programId,
        versions: page.map((v) => ({
          id: v.id,
          versionSeq: v.version_seq,
          effectiveDate: isoDate(v.effective_date),
          activationInstant: v.activation_instant.toISOString(),
        })),
        nextCursor:
          rows.length > TRAINING_LIMITS.versionPageSize
            ? (page[page.length - 1]?.version_seq ?? null)
            : null,
      };
    }, TX_OPTS),
  );
}

export type OwnVersionDetail = {
  id: string;
  programId: string;
  versionSeq: number;
  effectiveDate: string;
  activationInstant: string;
  scheduled: boolean;
  payload: MaterializedProgram;
};

/**
 * Client direct version access — exact-id scoped to the verified
 * triple. A version with a null governed span (shadowed or
 * activates at/after the successor takeover) is `not_found` —
 * indistinguishable from absent; never an existence leak.
 */
export async function readOwnTrainingVersion(
  session: SessionLike,
  input: {
    workspaceId: string;
    programId: string;
    versionId: string;
  },
  deps: TrainingDeps = {},
): Promise<OwnVersionDetail> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveTrainingConsentPolicy();
  const now = deps.now ?? new Date();
  if (
    !validId(input.workspaceId) ||
    !validId(input.programId) ||
    !validId(input.versionId)
  )
    throw new TrainingError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(async (tx) => {
      await beginRead(tx);
      const userId = session?.user?.id;
      if (typeof userId !== "string" || userId.length === 0)
        throw new AccessDeniedError(
          "unauthenticated",
          "trainingPlansLogs",
          "read",
        );
      const profile = await tx.clientProfile.findFirst({
        where: { workspaceId: input.workspaceId, userId },
        select: { id: true },
      });
      if (!profile)
        throw new AccessDeniedError("not_owner", "trainingPlansLogs", "read");
      const { ctx } = await readPrelude(
        tx,
        session,
        { workspaceId: input.workspaceId, clientProfileId: profile.id },
        registry,
      );
      if (ctx.grantedScope !== "own")
        throw new AccessDeniedError("role_denied", "trainingPlansLogs", "read");

      // A3 §1 scoped preamble — identical predicates to the versions
      // page: absent / foreign / draft / cancelled / pending / dead
      // are indistinguishable `not_found`.
      const preamble = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT p.id FROM "training_program" p
           JOIN "training_program_version" v1
             ON v1.program_id = p.id AND v1.version_seq = 1
           WHERE p.id = $1 AND p.workspace_id = $2 AND p.client_profile_id = $3
             AND p.first_published_at IS NOT NULL AND p.cancelled_at IS NULL
             AND v1.activation_instant <= $4
             AND NOT EXISTS (
               SELECT 1 FROM "training_program" s
               JOIN "training_program_version" sv
                 ON sv.program_id = s.id AND sv.version_seq = 1
               WHERE s.replaces_program_id = p.id AND s.cancelled_at IS NULL
                 AND sv.activation_instant <= v1.activation_instant)`,
        input.programId,
        input.workspaceId,
        profile.id,
        now,
      );
      if (preamble.length === 0) throw new TrainingError("not_found");

      const version = await tx.trainingProgramVersion.findFirst({
        where: {
          id: input.versionId,
          programId: input.programId,
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        },
      });
      if (!version) throw new TrainingError("not_found");
      const versions = (await programVersions(tx, input.programId)).map(
        toVersionInstant,
      );
      const succ = await liveSuccessor(tx, input.programId);
      const span = governedSpan(
        versions,
        toVersionInstant(version as VersionRow),
        succ?.takeover ?? null,
      );
      if (span === null) throw new TrainingError("not_found");
      await writeAuditEvent(tx, ctx, {
        action: "READ",
        resourceType: "training_program_version",
        resourceId: version.id,
        subjectClientProfileId: profile.id,
      });
      return {
        id: version.id,
        programId: input.programId,
        versionSeq: version.versionSeq,
        effectiveDate: isoDate(version.effectiveDate),
        activationInstant: version.activationInstant.toISOString(),
        scheduled: version.activationInstant.getTime() > now.getTime(),
        payload: projectForClient(
          version.payload as MaterializedProgram,
          normalizeFieldConfig(version.fieldConfig),
        ),
      };
    }, TX_OPTS),
  );
}
