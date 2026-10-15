/**
 * P-025-B Check-In instances + client submissions — derived lifecycle,
 * validators/parsers, and the guarded persistence service.
 *
 * Lifecycle is DERIVED, never stored (plan §10): one projector reads
 * cancellation provenance + child submission existence and returns
 * CANCELLED | SUBMITTED | SCHEDULED. A REVIEWED stage slots between
 * CANCELLED and SUBMITTED in P-025-C without schema change — this
 * projector is the single interpretation point for every list/detail/
 * action path.
 *
 * Lock protocol per plan §13 (client-scoped — chkin advisory):
 *   bounded answer-free scoped pre-read (foreign/missing/mutated tuple
 *     fails non-disclosingly BEFORE any advisory)
 *   → advisory `chkin:{workspaceId}:{clientProfileId}:{formId}`
 *   → advisory `member:{workspaceId}:{userId}`
 *   → workspace_member FOR UPDATE (authoritative actor state)
 *   → in-transaction authorize(resource/action/scope)
 *   → scope branch: owner → no ClientAssignment; assigned → re-resolve +
 *     lock ACTIVE ClientAssignment; client → own-profile rebinding
 *   → client_profile FOR UPDATE
 *   → domain rows FOR UPDATE in fixed order (instance → submission)
 *   → consent rows FOR UPDATE in kind order (before ANY answer access)
 *   → mutation/read → structural audit LAST → commit.
 *
 * `chkin` is documented in the global advisory namespace beside
 * `onbassign`/`csetup`/`member` — disjoint namespaces, no order
 * inversion (a transaction never holds `onbassign` then `chkin`).
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
import { resolveScope, type PrincipalRole } from "../auth/rbac";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import {
  hasExactActiveConsent,
  requiredConsentsFor,
  type ConsentPolicyRegistry,
} from "../consent";
import { resolveCheckInConsentPolicy } from "./instances-consent";
import type { CheckInDefinition, CheckInField } from "./forms";

// Type-only re-export — app surfaces consume the definition contract
// through THIS module (the P-025-A seam rule forbids app→forms imports).
export type { CheckInDefinition, CheckInField };

// ── Closed error vocabulary (plan §13 response minimization) ─────────────

export type CheckInInstanceErrorCode =
  | "invalid_input"
  | "not_available"
  | "already_submitted"
  | "instance_not_accessible"
  | "consent_missing"
  | "policy_not_configured"
  | "serialization_conflict"
  | "review_required"
  | "idempotency_conflict";

export class CheckInInstanceError extends Error {
  constructor(readonly code: CheckInInstanceErrorCode) {
    super(code);
    this.name = "CheckInInstanceError";
  }
}

// ── Derived lifecycle projector (§10 — the single source of truth) ───────

export type CheckInInstanceState =
  "CANCELLED" | "REVIEWED" | "SUBMITTED" | "SCHEDULED";

export type CheckInInstanceLifecycleInput = {
  cancelledAt: Date | null;
  cancelledByMemberId: string | null;
  hasSubmission: boolean;
  /** P-025-C: a coherent CheckInReview exists on the submission. */
  hasReview?: boolean;
};

/**
 * THE lifecycle projector — derivation order is fixed:
 *   1. CANCELLED when paired cancellation provenance exists;
 *   2. REVIEWED when a coherent review exists (P-025-C);
 *   3. SUBMITTED when a coherent submission exists;
 *   4. otherwise SCHEDULED.
 * Partial cancellation provenance is invalid — the paired CHECK makes it
 * unreachable in the DB; defensively it does NOT derive CANCELLED.
 */
export function projectCheckInInstanceState(
  row: CheckInInstanceLifecycleInput,
): CheckInInstanceState {
  if (row.cancelledAt !== null && row.cancelledByMemberId !== null)
    return "CANCELLED";
  if (row.hasReview === true) return "REVIEWED";
  if (row.hasSubmission) return "SUBMITTED";
  return "SCHEDULED";
}

export type CheckInInstancePresentation = {
  state: CheckInInstanceState;
  /** Late marker — submitted-after-due for SUBMITTED/REVIEWED; past-due
   * for SCHEDULED (#93: late submission allowed and marked; a passed
   * dueAt never mutates state). CANCELLED is terminal — never late. */
  late: boolean;
};

export function projectCheckInInstancePresentation(
  row: CheckInInstanceLifecycleInput & {
    dueAt: Date;
    submittedAt: Date | null;
  },
  now: Date = new Date(),
): CheckInInstancePresentation {
  const state = projectCheckInInstanceState(row);
  if (state === "CANCELLED") return { state, late: false };
  const reference =
    state === "SUBMITTED" || state === "REVIEWED" ? row.submittedAt : now;
  const late = reference !== null && reference.getTime() > row.dueAt.getTime();
  return { state, late };
}

// ── Bounds + wire parsers ────────────────────────────────────────────────

export const CHECKIN_INSTANCE_LIMITS = {
  answersJsonMaxBytes: 128 * 1024,
  answerTextMax: 4000,
  optionIdsMaxPerField: 50,
  idMax: 128,
  dueTzMax: 64,
  dueAtMinIsoYear: 2000,
  dueAtMaxIsoYear: 2100,
  listMax: 200,
} as const;

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Strict ISO-8601 UTC instant within sane bounds; else null. */
export function parseCheckInDueAt(raw: unknown): Date | null {
  if (typeof raw !== "string" || !ISO_DATETIME_RE.test(raw)) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (
    year < CHECKIN_INSTANCE_LIMITS.dueAtMinIsoYear ||
    year > CHECKIN_INSTANCE_LIMITS.dueAtMaxIsoYear
  )
    return null;
  // Reject malformed calendar days (e.g. 2026-13-01 passes Date parse into
  // a normalized different instant) — round-trip must match.
  if (d.toISOString().slice(0, 10) !== raw.slice(0, 10)) return null;
  return d;
}

/** Optional label-only timezone hint — bounded, never a tz policy. */
export function parseCheckInDueTz(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw new CheckInInstanceError("invalid_input");
  const v = raw.trim();
  if (v.length === 0) return null;
  if (v.length > CHECKIN_INSTANCE_LIMITS.dueTzMax)
    throw new CheckInInstanceError("invalid_input");
  return v;
}

export type RawCheckInAnswerEntry = { fieldId: string; value: unknown };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Bounded syntactic parse of the `[{fieldId, value}, ...]` wire format —
 * BEFORE canonicalization: duplicate/unknown-checked downstream, but
 * sparse records, extra keys, non-array roots, and oversized payloads
 * are rejected here so nothing malformed reaches the transaction.
 */
export function parseCheckInAnswersJson(raw: unknown): RawCheckInAnswerEntry[] {
  if (typeof raw !== "string") throw new CheckInInstanceError("invalid_input");
  if (
    Buffer.byteLength(raw, "utf8") > CHECKIN_INSTANCE_LIMITS.answersJsonMaxBytes
  )
    throw new CheckInInstanceError("invalid_input");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CheckInInstanceError("invalid_input");
  }
  if (!Array.isArray(parsed)) throw new CheckInInstanceError("invalid_input");
  const seen = new Set<string>();
  return parsed.map((entry) => {
    if (!isPlainObject(entry)) throw new CheckInInstanceError("invalid_input");
    const keys = Object.keys(entry);
    if (
      keys.length !== 2 ||
      !keys.includes("fieldId") ||
      !keys.includes("value")
    )
      throw new CheckInInstanceError("invalid_input");
    const fieldId = entry.fieldId;
    if (
      typeof fieldId !== "string" ||
      fieldId.length === 0 ||
      fieldId.length > CHECKIN_INSTANCE_LIMITS.idMax
    )
      throw new CheckInInstanceError("invalid_input");
    if (seen.has(fieldId)) throw new CheckInInstanceError("invalid_input");
    seen.add(fieldId);
    return { fieldId, value: entry.value };
  });
}

// ── Typed canonicalization against the PINNED immutable definition ───────

/** Wire kind → stored CheckInAnswerKind enum (domain-distinct mapping). */
export const KIND_TO_ENUM = {
  shortText: "SHORT_TEXT",
  longText: "LONG_TEXT",
  number: "NUMBER",
  date: "DATE",
  singleChoice: "SINGLE_CHOICE",
  multiChoice: "MULTI_CHOICE",
} as const;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_RE = /^-?\d{1,16}(\.\d{1,6})?$/;

export type CanonicalCheckInAnswer = {
  fieldId: string;
  kind: (typeof KIND_TO_ENUM)[keyof typeof KIND_TO_ENUM];
  /** Whether the client supplied an answer for this field. Unanswered
   * OPTIONAL fields carry no stored row — the kind↔column CHECK requires
   * the kind's value column to be non-NULL on every persisted row, so an
   * "empty answer" row is inexpressible by design. */
  answered: boolean;
  valueText: string | null;
  valueNumeric: string | null;
  valueDate: string | null;
  valueOptionIds: string[] | null;
};

function hasAnswerValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Canonicalize wire answers against the pinned published definition —
 * one row per definition field in DEFINITION ORDER; unknown/duplicate
 * fieldIds, kind mismatches, invalid option IDs, missing required, and
 * out-of-bound values all reject with the closed invalid_input code.
 */
export function canonicalizeCheckInAnswers(
  definition: CheckInDefinition,
  raw: readonly RawCheckInAnswerEntry[],
): CanonicalCheckInAnswer[] {
  if (!isPlainObject(definition) || !Array.isArray(definition.fields))
    throw new CheckInInstanceError("not_available");
  const seen = new Set<string>();
  for (const entry of raw) {
    // Canonicalizer-level strictness — callers MUST pass the parser, but
    // sparse records, extra keys, and duplicate IDs also die here.
    const keys = Object.keys(entry);
    if (
      keys.length !== 2 ||
      !keys.includes("fieldId") ||
      !keys.includes("value") ||
      typeof entry.fieldId !== "string" ||
      seen.has(entry.fieldId)
    )
      throw new CheckInInstanceError("invalid_input");
    seen.add(entry.fieldId);
    if (!definition.fields.some((f) => f.fieldId === entry.fieldId))
      throw new CheckInInstanceError("invalid_input");
  }
  const byId = new Map(raw.map((e) => [e.fieldId, e]));

  return definition.fields.map((field) => {
    const wire = byId.get(field.fieldId);
    const present = wire !== undefined && hasAnswerValue(wire.value);
    if (field.required && !present)
      throw new CheckInInstanceError("invalid_input");
    const value = wire?.value;
    switch (field.kind) {
      case "shortText":
      case "longText": {
        if (!present) return base(field, { valueText: null });
        if (typeof value !== "string")
          throw new CheckInInstanceError("invalid_input");
        const text = value.trim();
        if (
          text.length === 0 ||
          text.length > CHECKIN_INSTANCE_LIMITS.answerTextMax
        )
          throw new CheckInInstanceError("invalid_input");
        return base(field, { answered: true, valueText: text });
      }
      case "number": {
        if (!present) return base(field, { valueNumeric: null });
        if (typeof value !== "string" && typeof value !== "number")
          throw new CheckInInstanceError("invalid_input");
        const s = String(value).trim();
        if (!DECIMAL_RE.test(s))
          throw new CheckInInstanceError("invalid_input");
        return base(field, { answered: true, valueNumeric: s });
      }
      case "date": {
        if (!present) return base(field, { valueDate: null });
        if (typeof value !== "string" || !DATE_ONLY_RE.test(value))
          throw new CheckInInstanceError("invalid_input");
        const d = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value)
          throw new CheckInInstanceError("invalid_input");
        return base(field, { answered: true, valueDate: value });
      }
      case "singleChoice": {
        const optionIds = new Set((field.options ?? []).map((o) => o.optionId));
        if (!present) return base(field, { valueOptionIds: null });
        if (typeof value !== "string" || !optionIds.has(value))
          throw new CheckInInstanceError("invalid_input");
        return base(field, { answered: true, valueOptionIds: [value] });
      }
      case "multiChoice": {
        const optionIds = new Set((field.options ?? []).map((o) => o.optionId));
        if (!present) return base(field, { valueOptionIds: null });
        if (
          !Array.isArray(value) ||
          value.length === 0 ||
          value.length > CHECKIN_INSTANCE_LIMITS.optionIdsMaxPerField ||
          value.some((v) => typeof v !== "string" || !optionIds.has(v))
        )
          throw new CheckInInstanceError("invalid_input");
        return base(field, {
          answered: true,
          valueOptionIds: [...new Set(value as string[])].sort(),
        });
      }
      default:
        throw new CheckInInstanceError("invalid_input");
    }
  });
}

function base(
  field: CheckInField,
  patch: Partial<CanonicalCheckInAnswer>,
): CanonicalCheckInAnswer {
  return {
    fieldId: field.fieldId,
    kind: KIND_TO_ENUM[field.kind],
    answered: false,
    valueText: null,
    valueNumeric: null,
    valueDate: null,
    valueOptionIds: null,
    ...patch,
  };
}

// ── Serialization helpers (same reviewed conventions as forms.ts) ────────

const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 15;
const BACKOFF_CAP_MS = 250;
const RAW_SERIALIZATION_SQLSTATES = new Set(["40001", "40P01"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * CHECK-IN-FEEDBACK-I1: a P2002 may only be treated as an idempotent
 * replay when it fired on the feedback idempotency constraint —
 * `unique(submission_id, client_request_id)` on `CheckInFeedback`. ANY
 * other unique violation (PK, foreign key) is a real failure and
 * rethrows — it is never silently a successful replay.
 */
function isFeedbackNonceViolation(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const meta = (error as Prisma.PrismaClientKnownRequestError).meta as
    { modelName?: unknown; target?: unknown } | undefined;
  if (meta?.modelName !== "CheckInFeedback") return false;
  const target = meta?.target;
  if (Array.isArray(target))
    return (
      target.includes("submission_id") && target.includes("client_request_id")
    );
  if (typeof target === "string")
    return (
      target.includes("submission_id") && target.includes("client_request_id")
    );
  return false;
}

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (isRetryableSerialization(error) && ++attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(BACKOFF_BASE_MS * attempt, BACKOFF_CAP_MS));
        continue;
      }
      if (isRetryableSerialization(error))
        throw new CheckInInstanceError("serialization_conflict");
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

export type PrismaLike = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRawUnsafe"
  | "checkInInstance"
  | "checkInSubmission"
  | "checkInSubmissionAnswer"
  | "checkInReview"
  | "checkInFeedback"
  | "checkInForm"
  | "checkInFormVersion"
  | "clientProfile"
  | "workspaceMember"
  | "clientAssignment"
  | "consentRecord"
  | "auditEvent"
  | "user"
  | "workspace"
>;

// ── Shared locked-authorization helpers ──────────────────────────────────

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

/**
 * chkin+member advisories → member FOR UPDATE → in-transaction authorize.
 * Returns the authorization context + the locked member row.
 */
async function lockedAuthorize(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  request: {
    resource: "checkinInstances" | "checkinsCoachReviews" | "checkinFeedback";
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

/**
 * Assigned-scope branch: re-resolve the ACTIVE ClientAssignment for the
 * locked member + locked target client and take that row FOR UPDATE.
 * Owner ("workspace" scope) never touches the assignment table.
 */
async function lockAssignmentForScope(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  memberId: string,
  resource: "checkinInstances" | "checkinsCoachReviews" | "checkinFeedback",
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
  if (!resolved) throw new AccessDeniedError("not_assigned", resource, "write");
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
    throw new AccessDeniedError("not_assigned", resource, "write");
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

type LockedInstanceRow = {
  id: string;
  clientProfileId: string;
  formId: string;
  formVersionId: string;
  dueAt: Date;
  cancelledAt: Date | null;
  cancelledByMemberId: string | null;
};

async function lockInstance(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  instanceId: string,
): Promise<LockedInstanceRow | null> {
  const rows = await tx.$queryRawUnsafe<LockedInstanceRow[]>(
    `SELECT id,
            client_profile_id AS "clientProfileId",
            form_id AS "formId",
            form_version_id AS "formVersionId",
            due_at AS "dueAt",
            cancelled_at AS "cancelledAt",
            cancelled_by_member_id AS "cancelledByMemberId"
     FROM "checkin_instance"
     WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    instanceId,
    workspaceId,
  );
  return rows[0] ?? null;
}

/** Consent — deterministic kind order, rows FOR UPDATE when `forUpdate`. */
async function checkRequiredConsent(
  tx: Prisma.TransactionClient,
  clientProfileId: string,
  registry: ConsentPolicyRegistry,
  forUpdate: boolean,
): Promise<void> {
  const required = requiredConsentsFor("checkinsCoachReviews") ?? [];
  for (const kind of required) {
    const version = registry.currentVersion(kind);
    if (version === null)
      throw new CheckInInstanceError("policy_not_configured");
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
      throw new CheckInInstanceError("consent_missing");
  }
}

// ── Inputs ───────────────────────────────────────────────────────────────

export type CheckInInstanceDeps = {
  db?: PrismaLike;
  registry?: ConsentPolicyRegistry;
};

export type ScheduleCheckInInstanceInput = {
  workspaceId: string;
  clientProfileId: string;
  formId: string;
  formVersionId: string;
  dueAt: string;
  dueTz?: string | null;
};

export type CancelCheckInInstanceInput = {
  workspaceId: string;
  clientProfileId: string;
  instanceId: string;
};

/** Max instant span a calendar range may request (~3 months). */
export const CALENDAR_RANGE_MAX_DAYS = 95;

/**
 * P-025-D2 (decision 104): bounded instant range for the header lists — both
 * sides must be strict ISO-8601 UTC instants, `from < to`, span ≤
 * `CALENDAR_RANGE_MAX_DAYS`. Returns null on any violation.
 */
export function parseCheckInCalendarRange(raw: {
  from?: unknown;
  to?: unknown;
}): { from: Date; to: Date } | null {
  const from = parseCheckInDueAt(raw?.from);
  const to = parseCheckInDueAt(raw?.to);
  if (from === null || to === null) return null;
  if (from.getTime() >= to.getTime()) return null;
  if (to.getTime() - from.getTime() > CALENDAR_RANGE_MAX_DAYS * 86400_000)
    return null;
  return { from, to };
}

export type ListCheckInInstancesInput = {
  workspaceId: string;
  clientProfileId: string;
  /** P-025-D2: optional bounded instant range on `dueAt`. */
  range?: { from: string; to: string };
};

export type OwnCheckInInstanceInput = {
  workspaceId: string;
  /** P-025-D2: optional bounded instant range on `dueAt`. */
  range?: { from: string; to: string };
};

export type GetOwnCheckInInstanceInput = {
  workspaceId: string;
  instanceId: string;
};

export type SubmitCheckInInstanceInput = {
  workspaceId: string;
  instanceId: string;
  answersJson: string;
};

function validId(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length > 0 &&
    v.length <= CHECKIN_INSTANCE_LIMITS.idMax
  );
}

// ── Staff: schedule (one-off only — #92) ─────────────────────────────────

export type ScheduleCheckInInstanceResult =
  | { status: "scheduled"; instanceId: string }
  | { status: "already_scheduled"; instanceId: string };

/**
 * One-off instance scheduling. Owner: workspace scope, NO ClientAssignment.
 * Coach: assigned scope, coherent ACTIVE assignment re-resolved + locked.
 * Assistant/client/SUPPORT/PLATFORM_ADMIN denied by the matrix.
 */
export async function scheduleCheckInInstance(
  session: SessionLike,
  input: ScheduleCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<ScheduleCheckInInstanceResult> {
  const db = deps.db ?? defaultPrisma;
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.formId) ||
    !validId(input.formVersionId)
  )
    throw new CheckInInstanceError("invalid_input");
  const dueAt = parseCheckInDueAt(input.dueAt);
  if (!dueAt) throw new CheckInInstanceError("invalid_input");
  const dueTz = parseCheckInDueTz(input.dueTz);

  const attempt = (): Promise<ScheduleCheckInInstanceResult> =>
    withSerializedRetry(() =>
      db.$transaction(
        async (tx) => {
          // 1. Bounded answer-free pre-read — the scoped tuple that derives
          // the chkin key. Foreign/missing profiles, forms, or versions
          // fail non-disclosingly BEFORE any advisory is acquired.
          const [profile, formVersion] = await Promise.all([
            tx.clientProfile.findFirst({
              where: {
                id: input.clientProfileId,
                workspaceId: input.workspaceId,
              },
              select: { id: true },
            }),
            tx.checkInFormVersion.findFirst({
              where: {
                id: input.formVersionId,
                workspaceId: input.workspaceId,
                formId: input.formId,
              },
              select: { id: true, form: { select: { status: true } } },
            }),
          ]);
          if (!profile || !formVersion || formVersion.form.status !== "ACTIVE")
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

          // 6. Assigned branch: coherent ACTIVE ClientAssignment lock.
          if (ctx.grantedScope === "assigned")
            await lockAssignmentForScope(
              tx,
              input.workspaceId,
              input.clientProfileId,
              member.id,
              "checkinInstances",
            );

          // 7. Profile lock — the client-scoped mutation anchor.
          const lockedProfile = await lockProfile(
            tx,
            input.workspaceId,
            input.clientProfileId,
          );
          if (!lockedProfile) throw new CheckInInstanceError("not_available");

          // 8. Duplicate/derived-state re-check under the serialized locks:
          // an identical open instance (same client+form+dueAt, not
          // cancelled) returns the existing row rather than duplicating.
          const existing = await tx.checkInInstance.findFirst({
            where: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              formId: input.formId,
              dueAt,
              cancelledAt: null,
            },
            select: { id: true },
          });
          if (existing)
            return {
              status: "already_scheduled",
              instanceId: existing.id,
            } satisfies ScheduleCheckInInstanceResult;

          // 9. Insert — the pinned version tuple is written atomically;
          // the wide composite FK rejects any drift.
          const instance = await tx.checkInInstance.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              formId: input.formId,
              formVersionId: input.formVersionId,
              dueAt,
              dueTz,
              scheduledByMemberId: member.id,
            },
            select: { id: true },
          });

          // 10. Audit LAST — a failed audit rolls the instance back.
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "checkin_instance",
            resourceId: instance.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { changed: true },
          });
          return {
            status: "scheduled",
            instanceId: instance.id,
          } satisfies ScheduleCheckInInstanceResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

  try {
    return await attempt();
  } catch (error) {
    // unique(ws, cp, formId, dueAt) P2002 — the duplicate-scheduling
    // backstop. Re-enter the COMPLETE protocol once (advisories, member
    // lock, authorize, profile lock, duplicate check); never an
    // outside-transaction shortcut. Second conflict → closed error.
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

// ── Staff: cancel (only a derived-SCHEDULED instance — #97) ─────────────

export type CancelCheckInInstanceResult = { status: "cancelled" };

export async function cancelCheckInInstance(
  session: SessionLike,
  input: CancelCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<CancelCheckInInstanceResult> {
  const db = deps.db ?? defaultPrisma;
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.instanceId)
  )
    throw new CheckInInstanceError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // 1. Scoped pre-read — instance + its client/form tuple. Foreign
        // or missing rows fail BEFORE any advisory is acquired.
        const pre = await tx.checkInInstance.findFirst({
          where: {
            id: input.instanceId,
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          select: { formId: true },
        });
        if (!pre) throw new CheckInInstanceError("not_available");

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
            "checkinInstances",
          );

        // 6. Profile lock, then the instance row.
        const lockedProfile = await lockProfile(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        if (!lockedProfile) throw new CheckInInstanceError("not_available");
        const instance = await lockInstance(
          tx,
          input.workspaceId,
          input.instanceId,
        );
        if (!instance || instance.clientProfileId !== input.clientProfileId)
          throw new CheckInInstanceError("not_available");

        // 7. Derived-state check inside the lock — a concurrent submission
        // serializes on the SAME chkin advisory + this row; the loser
        // re-reads state here and fails closed (#97: only SCHEDULED may
        // cancel; SUBMITTED→CANCELLED does not exist).
        const hasSubmission = await tx.checkInSubmission.findFirst({
          where: {
            instanceId: input.instanceId,
            workspaceId: input.workspaceId,
          },
          select: { id: true },
        });
        const state = projectCheckInInstanceState({
          cancelledAt: instance.cancelledAt,
          cancelledByMemberId: instance.cancelledByMemberId,
          hasSubmission: hasSubmission !== null,
        });
        if (state !== "SCHEDULED")
          throw new CheckInInstanceError("not_available");

        // 8. Paired cancellation provenance — the only instance mutation.
        const now = new Date();
        await tx.checkInInstance.update({
          where: { id: input.instanceId },
          data: { cancelledAt: now, cancelledByMemberId: member.id },
        });

        // 9. Audit LAST.
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "checkin_instance",
          resourceId: input.instanceId,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true },
        });
        return { status: "cancelled" } satisfies CancelCheckInInstanceResult;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

// ── Staff: per-client instance header list (answer-free) ────────────────

export type StaffCheckInInstanceItem = {
  instanceId: string;
  formId: string;
  formName: string;
  versionSeq: number;
  dueAt: string;
  dueTz: string | null;
  state: CheckInInstanceState;
  late: boolean;
  submittedAt: string | null;
  scheduledAt: string;
};

export async function listCheckInInstancesForClient(
  session: SessionLike,
  input: ListCheckInInstancesInput,
  deps: CheckInInstanceDeps = {},
): Promise<{ items: StaffCheckInInstanceItem[]; truncated?: boolean }> {
  const db = deps.db ?? defaultPrisma;
  if (!validId(input.workspaceId) || !validId(input.clientProfileId))
    throw new CheckInInstanceError("invalid_input");
  const range =
    input.range === undefined ? null : parseCheckInCalendarRange(input.range);
  if (input.range !== undefined && range === null)
    throw new CheckInInstanceError("invalid_input");

  return db.$transaction(async (tx) => {
    // Bounded pre-read derives the chkin key (list is read-only but the
    // key convention stays consistent; no advisory is strictly needed for
    // a read — the member lock authorizes).
    const { ctx, member } = await lockedAuthorize(
      tx,
      session,
      {
        resource: "checkinInstances",
        action: "read",
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      },
      // Listing crosses forms — the chkin key uses a fixed namespace
      // segment rather than a single form (the protocol key shape is
      // client-scoped; form-level granularity isn't available here).
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
        "checkinInstances",
      );
    const profile = await lockProfile(
      tx,
      input.workspaceId,
      input.clientProfileId,
    );
    if (!profile) throw new CheckInInstanceError("not_available");

    const rows = await tx.checkInInstance.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        ...(range !== null ? { dueAt: { gte: range.from, lt: range.to } } : {}),
      },
      select: {
        id: true,
        formId: true,
        dueAt: true,
        dueTz: true,
        cancelledAt: true,
        cancelledByMemberId: true,
        scheduledAt: true,
        formVersion: { select: { versionSeq: true } },
        form: { select: { name: true } },
        submissions: {
          select: {
            id: true,
            submittedAt: true,
            reviews: { select: { id: true }, take: 1 },
          },
          take: 1,
        },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      // P-025-D2-I1-R2: ranged (calendar) reads fetch one extra eligible
      // row — the range predicate applies BEFORE the limit — so overflow
      // is detectable instead of silently truncating at listMax.
      take: CHECKIN_INSTANCE_LIMITS.listMax + (range !== null ? 1 : 0),
    });
    // Ranged reads expose {items, truncated}; unbounded callers keep the
    // legacy {items} contract exactly.
    const truncated =
      range !== null && rows.length > CHECKIN_INSTANCE_LIMITS.listMax;
    const eligible = rows.slice(0, CHECKIN_INSTANCE_LIMITS.listMax);
    const now = new Date();
    const items = eligible.map((row) => {
      const submission = row.submissions[0] ?? null;
      const presentation = projectCheckInInstancePresentation(
        {
          cancelledAt: row.cancelledAt,
          cancelledByMemberId: row.cancelledByMemberId,
          hasSubmission: submission !== null,
          hasReview: (submission?.reviews.length ?? 0) > 0,
          dueAt: row.dueAt,
          submittedAt: submission?.submittedAt ?? null,
        },
        now,
      );
      return {
        instanceId: row.id,
        formId: row.formId,
        formName: row.form.name,
        versionSeq: row.formVersion.versionSeq,
        dueAt: row.dueAt.toISOString(),
        dueTz: row.dueTz,
        state: presentation.state,
        late: presentation.late,
        submittedAt: submission?.submittedAt.toISOString() ?? null,
        scheduledAt: row.scheduledAt.toISOString(),
      } satisfies StaffCheckInInstanceItem;
    });
    return range === null ? { items } : { items, truncated };
  });
}

// ── Client: own list (bounded headers, zero answer values) ──────────────

export type OwnCheckInInstanceItem = {
  instanceId: string;
  formName: string;
  versionSeq: number;
  dueAt: string;
  state: CheckInInstanceState;
  late: boolean;
  submittedAt: string | null;
};

export async function listOwnCheckInInstances(
  session: SessionLike,
  input: OwnCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<{ items: OwnCheckInInstanceItem[]; truncated?: boolean }> {
  const db = deps.db ?? defaultPrisma;
  if (!validId(input.workspaceId))
    throw new CheckInInstanceError("invalid_input");
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "checkinInstances", "read");
  const range =
    input.range === undefined ? null : parseCheckInCalendarRange(input.range);
  if (input.range !== undefined && range === null)
    throw new CheckInInstanceError("invalid_input");

  return db.$transaction(async (tx) => {
    // Own-profile rebinding — the target is server-derived, never input.
    const profile = await tx.clientProfile.findFirst({
      where: { workspaceId: input.workspaceId, userId },
      select: { id: true },
    });
    if (!profile)
      throw new AccessDeniedError("not_owner", "checkinInstances", "read");
    const { ctx } = await lockedAuthorize(
      tx,
      session,
      {
        resource: "checkinInstances",
        action: "read",
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
      "*",
    );
    if (ctx.grantedScope !== "own")
      throw new AccessDeniedError("role_denied", "checkinInstances", "read");

    const rows = await tx.checkInInstance.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
        ...(range !== null ? { dueAt: { gte: range.from, lt: range.to } } : {}),
      },
      select: {
        id: true,
        dueAt: true,
        cancelledAt: true,
        cancelledByMemberId: true,
        formVersion: { select: { versionSeq: true } },
        form: { select: { name: true } },
        submissions: { select: { id: true, submittedAt: true }, take: 1 },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: CHECKIN_INSTANCE_LIMITS.listMax + (range !== null ? 1 : 0),
    });
    const truncated =
      range !== null && rows.length > CHECKIN_INSTANCE_LIMITS.listMax;
    const eligible = rows.slice(0, CHECKIN_INSTANCE_LIMITS.listMax);
    const now = new Date();
    const items = eligible.map((row) => {
      const submission = row.submissions[0] ?? null;
      const presentation = projectCheckInInstancePresentation(
        {
          cancelledAt: row.cancelledAt,
          cancelledByMemberId: row.cancelledByMemberId,
          hasSubmission: submission !== null,
          dueAt: row.dueAt,
          submittedAt: submission?.submittedAt ?? null,
        },
        now,
      );
      return {
        instanceId: row.id,
        formName: row.form.name,
        versionSeq: row.formVersion.versionSeq,
        dueAt: row.dueAt.toISOString(),
        state: presentation.state,
        late: presentation.late,
        submittedAt: submission?.submittedAt.toISOString() ?? null,
      } satisfies OwnCheckInInstanceItem;
    });
    return range === null ? { items } : { items, truncated };
  });
}

// ── FI-I4 (decision #107): earliest unfinished Check-In for Home ──────────

/** Minimal authorized header for the Home due-Check-In card — the
 *  instance id (link target), form name, due instant and the late flag.
 *  No answers, reviewer identities or aggregates. */
export type OwnNextCheckInInstance = {
  instanceId: string;
  formName: string;
  dueAt: string;
  late: boolean;
};

/**
 * Earliest unfinished scheduled Check-In for the owning client — the
 * Home card source (decision #107). Eligible-state filtering happens
 * INSIDE the bounded query: an instance is eligible only while it
 * derives SCHEDULED — `cancelledAt`/`cancelledByMemberId` both NULL
 * (cancellation provenance is paired by CHECK) AND no submission exists
 * (a submission makes it SUBMITTED or REVIEWED — the projector's
 * `hasReview` can only hold on an existing submission). Overdue items
 * precede future items because `dueAt` ascends; ties break on `id` —
 * identical to the own-list ordering. `take: 1` bounds the read so
 * excluded rows can never hide an eligible instance behind the shared
 * 200-row list limit. Same own-scope authorization protocol as the
 * header list — profile rebinding → lockedAuthorize → own scope.
 */
export async function getOwnNextCheckInInstance(
  session: SessionLike,
  input: { workspaceId: string },
  deps: CheckInInstanceDeps = {},
): Promise<OwnNextCheckInInstance | null> {
  const db = deps.db ?? defaultPrisma;
  if (!validId(input.workspaceId))
    throw new CheckInInstanceError("invalid_input");
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "checkinInstances", "read");

  return db.$transaction(async (tx) => {
    // Own-profile rebinding — the target is server-derived, never input.
    const profile = await tx.clientProfile.findFirst({
      where: { workspaceId: input.workspaceId, userId },
      select: { id: true },
    });
    if (!profile)
      throw new AccessDeniedError("not_owner", "checkinInstances", "read");
    const { ctx } = await lockedAuthorize(
      tx,
      session,
      {
        resource: "checkinInstances",
        action: "read",
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
      "*",
    );
    if (ctx.grantedScope !== "own")
      throw new AccessDeniedError("role_denied", "checkinInstances", "read");

    const row = await tx.checkInInstance.findFirst({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
        cancelledAt: null,
        cancelledByMemberId: null,
        submissions: { none: {} },
      },
      select: {
        id: true,
        dueAt: true,
        form: { select: { name: true } },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    });
    if (!row) return null;
    return {
      instanceId: row.id,
      formName: row.form.name,
      dueAt: row.dueAt.toISOString(),
      late: new Date().getTime() > row.dueAt.getTime(),
    } satisfies OwnNextCheckInInstance;
  });
}

// ── Client: own detail (definition + consent-gated submitted answers) ───

export type OwnCheckInInstanceDetail = {
  instanceId: string;
  formName: string;
  versionSeq: number;
  dueAt: string;
  state: CheckInInstanceState;
  late: boolean;
  submittedAt: string | null;
  /** Pinned immutable definition — for the fill form AND submitted-state
   * rendering. Always present (it is definition metadata, not answers). */
  definition: CheckInDefinition;
  /** Submitted answers joined to the definition — present ONLY when a
   * submission exists AND consent currently holds. Otherwise null. */
  submittedAnswers: Array<{
    fieldId: string;
    kind: string;
    valueText: string | null;
    valueNumeric: string | null;
    valueDate: string | null;
    valueOptionIds: string[] | null;
  }> | null;
  /** CHECK-IN-FEEDBACK-I1: bounded first page of staff feedback for this
   * instance's own submission — queried inside the SAME consent gate as
   * submittedAnswers; null whenever no submission exists. */
  feedback: CheckInFeedbackItem[] | null;
  /** Keyset cursor for the next (later) page, or null when the first
   * page is complete. */
  feedbackNextCursor: string | null;
};

export async function getOwnCheckInInstance(
  session: SessionLike,
  input: GetOwnCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<OwnCheckInInstanceDetail> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveCheckInConsentPolicy();
  if (!validId(input.workspaceId) || !validId(input.instanceId))
    throw new CheckInInstanceError("invalid_input");
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "checkinInstances", "read");

  return db.$transaction(async (tx) => {
    // 1. Own-profile rebinding.
    const profile = await tx.clientProfile.findFirst({
      where: { workspaceId: input.workspaceId, userId },
      select: { id: true },
    });
    if (!profile)
      throw new AccessDeniedError("not_owner", "checkinInstances", "read");

    // 2. Scoped answer-free pre-read — foreign/missing instance fails
    // BEFORE any advisory is acquired.
    const pre = await tx.checkInInstance.findFirst({
      where: {
        id: input.instanceId,
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
      select: { formId: true },
    });
    if (!pre) throw new CheckInInstanceError("not_available");

    // 3–5. Advisories → member lock → in-transaction header authorize.
    const { ctx } = await lockedAuthorize(
      tx,
      session,
      {
        resource: "checkinInstances",
        action: "read",
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
      pre.formId,
    );
    if (ctx.grantedScope !== "own")
      throw new AccessDeniedError("role_denied", "checkinInstances", "read");

    // 6. Locked instance — revalidate tuple + derive state.
    const instance = await lockInstance(
      tx,
      input.workspaceId,
      input.instanceId,
    );
    if (!instance || instance.clientProfileId !== profile.id)
      throw new CheckInInstanceError("not_available");
    const submissionRow = await tx.checkInSubmission.findFirst({
      where: { instanceId: input.instanceId, workspaceId: input.workspaceId },
      select: { id: true, submittedAt: true },
    });
    const presentation = projectCheckInInstancePresentation(
      {
        cancelledAt: instance.cancelledAt,
        cancelledByMemberId: instance.cancelledByMemberId,
        hasSubmission: submissionRow !== null,
        dueAt: instance.dueAt,
        submittedAt: submissionRow?.submittedAt ?? null,
      },
      new Date(),
    );

    // 7. Pinned immutable version — the definition that answers bind to.
    const version = await tx.checkInFormVersion.findUnique({
      where: { id: instance.formVersionId },
      select: {
        formId: true,
        versionSeq: true,
        definition: true,
        form: { select: { name: true } },
      },
    });
    if (!version || version.formId !== instance.formId)
      throw new CheckInInstanceError("not_available");

    // 8. Submitted answers — consent-authorize → consent lock → query.
    // No answer-row query may execute before consent is locked+verified.
    let submittedAnswerRows: Array<{
      fieldId: string;
      kind: string;
      valueText: string | null;
      valueNumeric: { toString(): string } | null;
      valueDate: Date | null;
      valueOptionIds: unknown;
    }> | null = null;
    let ownFeedback: CheckInFeedbackItem[] | null = null;
    let ownFeedbackNextCursor: string | null = null;
    if (submissionRow !== null) {
      const answerCtx = await authorize(
        session,
        {
          resource: "checkinsCoachReviews",
          action: "read",
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        },
        createPrismaAuthorizationRepo(tx),
      );
      if (answerCtx.grantedScope !== "own")
        throw new AccessDeniedError(
          "role_denied",
          "checkinsCoachReviews",
          "read",
        );
      await checkRequiredConsent(tx, profile.id, registry, true);
      submittedAnswerRows = await tx.checkInSubmissionAnswer.findMany({
        where: {
          submissionId: submissionRow.id,
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        },
        select: {
          fieldId: true,
          kind: true,
          valueText: true,
          valueNumeric: true,
          valueDate: true,
          valueOptionIds: true,
        },
        orderBy: { fieldId: "asc" },
      });

      // CHECK-IN-FEEDBACK-I1 — own-scope feedback read INSIDE the same
      // consent gate as answers (owner answer 1: no staff-authorship
      // exemption). Explicit checkinFeedback authorization is required
      // in addition to the existing Check-In authorization.
      const feedbackCtx = await authorize(
        session,
        {
          resource: "checkinFeedback",
          action: "read",
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        },
        createPrismaAuthorizationRepo(tx),
      );
      if (feedbackCtx.grantedScope !== "own")
        throw new AccessDeniedError("role_denied", "checkinFeedback", "read");
      const page = await feedbackPage(tx, {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
        submissionId: submissionRow.id,
        limit: CHECKIN_FEEDBACK_PAGE_SIZE,
      });
      ownFeedback = page.items;
      ownFeedbackNextCursor = page.nextCursor;
    }

    return {
      instanceId: instance.id,
      formName: version.form.name,
      versionSeq: version.versionSeq,
      dueAt: instance.dueAt.toISOString(),
      state: presentation.state,
      late: presentation.late,
      submittedAt: submissionRow?.submittedAt.toISOString() ?? null,
      definition: version.definition as CheckInDefinition,
      submittedAnswers:
        submittedAnswerRows?.map((a) => ({
          fieldId: a.fieldId,
          kind: a.kind,
          valueText: a.valueText,
          valueNumeric: a.valueNumeric?.toString() ?? null,
          valueDate: a.valueDate?.toISOString().slice(0, 10) ?? null,
          valueOptionIds: Array.isArray(a.valueOptionIds)
            ? (a.valueOptionIds as string[])
            : null,
        })) ?? null,
      feedback: ownFeedback,
      feedbackNextCursor: ownFeedbackNextCursor,
    };
  });
}

// ── Client: submit (immutable submission + typed answers) ───────────────

export type SubmitCheckInInstanceResult =
  | { status: "submitted"; submissionId: string }
  | { status: "already_submitted"; submissionId: string };

export async function submitCheckInInstance(
  session: SessionLike,
  input: SubmitCheckInInstanceInput,
  deps: CheckInInstanceDeps = {},
): Promise<SubmitCheckInInstanceResult> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveCheckInConsentPolicy();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError(
      "unauthenticated",
      "checkinsCoachReviews",
      "write",
    );
  if (!validId(input.workspaceId) || !validId(input.instanceId))
    throw new CheckInInstanceError("invalid_input");
  // Bounded syntactic parse BEFORE the transaction.
  const rawAnswers = parseCheckInAnswersJson(input.answersJson);

  const attempt = (): Promise<SubmitCheckInInstanceResult> =>
    withSerializedRetry(() =>
      db.$transaction(
        async (tx) => {
          // 1. Own-profile rebinding — server-side, never from input.
          const profile = await tx.clientProfile.findFirst({
            where: { workspaceId: input.workspaceId, userId },
            select: { id: true },
          });
          if (!profile)
            throw new AccessDeniedError(
              "not_owner",
              "checkinsCoachReviews",
              "write",
            );

          // 2. Scoped pre-read — foreign/missing/mutated tuple fails
          // non-disclosingly BEFORE any foreign chkin advisory.
          const pre = await tx.checkInInstance.findFirst({
            where: {
              id: input.instanceId,
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
            },
            select: { formId: true },
          });
          if (!pre) throw new CheckInInstanceError("not_available");

          // 3–5. chkin → member advisories → member lock → authorize.
          const { ctx, member } = await lockedAuthorize(
            tx,
            session,
            {
              resource: "checkinsCoachReviews",
              action: "write",
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
            },
            pre.formId,
          );
          if (ctx.grantedScope !== "own")
            throw new AccessDeniedError(
              "role_denied",
              "checkinsCoachReviews",
              "write",
            );

          // 6. Idempotency — existing-submission lookup BEFORE the
          // derived-state check: every structurally valid replay returns
          // the durable row with zero writes/audit (consent must still
          // hold before disclosure).
          const existing = await tx.checkInSubmission.findFirst({
            where: {
              instanceId: input.instanceId,
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
            },
            select: { id: true },
          });
          if (existing) {
            await checkRequiredConsent(tx, profile.id, registry, false);
            return {
              status: "already_submitted",
              submissionId: existing.id,
            } satisfies SubmitCheckInInstanceResult;
          }

          // 7. Locked instance — derive state; a cancelled instance and
          // a foreign client binding both fail closed.
          const instance = await lockInstance(
            tx,
            input.workspaceId,
            input.instanceId,
          );
          if (!instance || instance.clientProfileId !== profile.id)
            throw new CheckInInstanceError("not_available");
          const state = projectCheckInInstanceState({
            cancelledAt: instance.cancelledAt,
            cancelledByMemberId: instance.cancelledByMemberId,
            hasSubmission: false, // proven absent above
          });
          if (state !== "SCHEDULED")
            throw new CheckInInstanceError("not_available");

          // 8. Profile lock — user link must still bind to the caller.
          const lockedProfile = await lockProfile(
            tx,
            input.workspaceId,
            profile.id,
          );
          if (!lockedProfile || lockedProfile.userId !== userId)
            throw new CheckInInstanceError("not_available");

          // 9. Consent — deterministic kind order, rows FOR UPDATE.
          await checkRequiredConsent(tx, profile.id, registry, true);

          // 10. Pinned immutable definition — answers validate against
          // THIS snapshot, never the form's mutable draft or a later
          // published version.
          const version = await tx.checkInFormVersion.findUnique({
            where: { id: instance.formVersionId },
            select: { formId: true, definition: true },
          });
          if (!version || version.formId !== instance.formId)
            throw new CheckInInstanceError("not_available");
          const answers = canonicalizeCheckInAnswers(
            version.definition as CheckInDefinition,
            rawAnswers,
          );

          // 11. Insert — immutable submission + typed answer rows; the
          // composite coherence FKs + kind↔column CHECK enforce shape.
          const now = new Date();
          const submission = await tx.checkInSubmission.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
              formId: instance.formId,
              formVersionId: instance.formVersionId,
              instanceId: instance.id,
              submittedByUserId: userId,
              submittedByMemberId: member.id,
              submittedAt: now,
            },
            select: { id: true },
          });
          for (const answer of answers.filter((a) => a.answered)) {
            await tx.checkInSubmissionAnswer.create({
              data: {
                submissionId: submission.id,
                workspaceId: input.workspaceId,
                clientProfileId: profile.id,
                fieldId: answer.fieldId,
                kind: answer.kind as never,
                valueText: answer.valueText,
                valueNumeric: answer.valueNumeric,
                valueDate:
                  answer.valueDate !== null
                    ? new Date(`${answer.valueDate}T00:00:00Z`)
                    : null,
                valueOptionIds:
                  answer.valueOptionIds !== null
                    ? answer.valueOptionIds
                    : Prisma.DbNull,
              },
            });
          }

          // 12. Audit LAST — a failed audit rolls the whole submission back.
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "checkin_submission",
            resourceId: submission.id,
            subjectClientProfileId: profile.id,
            meta: { changed: true },
          });
          return {
            status: "submitted",
            submissionId: submission.id,
          } satisfies SubmitCheckInInstanceResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

  try {
    return await attempt();
  } catch (error) {
    // unique(instance_id) P2002 — the double-submit backstop. The aborted
    // attempt could not see the concurrent winner: re-enter the SAME fully
    // authorized protocol exactly once (fresh own-profile resolve,
    // advisories, locks, authorization, consent, lookup) — never an
    // outside-transaction shortcut. Second conflict → closed error.
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

// ── Staff: published-version picker (scheduling form select) ────────────

export type ScheduleFormOption = {
  /** Positional token — the browser selects position N and the action
   * re-runs this list server-side to map index → (formId, versionId);
   * raw internal IDs never leave the server as trusted selections. */
  position: number;
  formName: string;
  versionSeq: number;
  /** Server-only — never rendered into browser values. */
  formId: string;
  formVersionId: string;
};

export async function listSchedulableFormVersions(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: CheckInInstanceDeps = {},
): Promise<{ options: ScheduleFormOption[] }> {
  const db = deps.db ?? defaultPrisma;
  if (!validId(input.workspaceId) || !validId(input.clientProfileId))
    throw new CheckInInstanceError("invalid_input");
  const { ctx } = await db.$transaction(async (tx) =>
    lockedAuthorize(
      tx,
      session,
      {
        resource: "checkinInstances",
        action: "write",
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      },
      "*",
    ),
  );
  if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
    throw new AccessDeniedError("role_denied", "checkinInstances", "write");

  const versions = await db.checkInFormVersion.findMany({
    where: {
      workspaceId: input.workspaceId,
      form: { status: "ACTIVE" },
    },
    select: {
      id: true,
      formId: true,
      form: { select: { name: true } },
      versionSeq: true,
    },
    orderBy: [{ formId: "asc" }, { versionSeq: "desc" }],
    take: 200,
  });
  // Latest published version per form only (name is not a unique key).
  const seen = new Set<string>();
  const options: ScheduleFormOption[] = [];
  for (const v of versions) {
    if (seen.has(v.formId)) continue;
    seen.add(v.formId);
    options.push({
      position: options.length,
      formName: v.form.name,
      versionSeq: v.versionSeq,
      formId: v.formId,
      formVersionId: v.id,
    });
  }
  return { options };
}

// ── P-025-C: staff submission headers + explicit detail + terminal mark ─

export type StaffCheckInSubmissionItem = {
  instanceId: string;
  submissionId: string;
  formName: string;
  versionSeq: number;
  dueAt: string;
  dueTz: string | null;
  submittedAt: string;
  late: boolean;
  reviewedAt: string | null;
  /** #91 — bounded staff-only workflow metadata; never client-facing. */
  reviewedByName: string | null;
};

/**
 * Staff submission header list — answer-free. `checkinsCoachReviews/read`
 * (owner `workspace`, coach/assistant `assigned`); zero audits on the
 * passive list. Reviewer identity is bounded to currently authorized
 * staff only (#91).
 */
export async function listCheckInSubmissionsForClient(
  session: SessionLike,
  input: ListCheckInInstancesInput,
  deps: CheckInInstanceDeps = {},
): Promise<{ items: StaffCheckInSubmissionItem[] }> {
  const db = deps.db ?? defaultPrisma;
  if (!validId(input.workspaceId) || !validId(input.clientProfileId))
    throw new CheckInInstanceError("invalid_input");

  return db.$transaction(async (tx) => {
    const { ctx, member } = await lockedAuthorize(
      tx,
      session,
      {
        resource: "checkinsCoachReviews",
        action: "read",
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      },
      "*",
    );
    if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
      throw new AccessDeniedError(
        "role_denied",
        "checkinsCoachReviews",
        "read",
      );
    if (ctx.grantedScope === "assigned")
      await lockAssignmentForScope(
        tx,
        input.workspaceId,
        input.clientProfileId,
        member.id,
        "checkinsCoachReviews",
      );
    const profile = await lockProfile(
      tx,
      input.workspaceId,
      input.clientProfileId,
    );
    if (!profile) throw new CheckInInstanceError("not_available");

    const rows = await tx.checkInSubmission.findMany({
      where: {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
      },
      select: {
        id: true,
        instanceId: true,
        submittedAt: true,
        instance: {
          select: { dueAt: true, dueTz: true },
        },
        form: { select: { name: true } },
        formVersion: { select: { versionSeq: true } },
        reviews: {
          select: {
            reviewedAt: true,
            reviewedByMember: {
              select: { user: { select: { name: true, email: true } } },
            },
          },
          take: 1,
        },
      },
      orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
      take: CHECKIN_INSTANCE_LIMITS.listMax,
    });
    const items = rows.map((row) => {
      const review = row.reviews[0] ?? null;
      return {
        instanceId: row.instanceId,
        submissionId: row.id,
        formName: row.form.name,
        versionSeq: row.formVersion.versionSeq,
        dueAt: row.instance.dueAt.toISOString(),
        dueTz: row.instance.dueTz,
        submittedAt: row.submittedAt.toISOString(),
        late: row.submittedAt.getTime() > row.instance.dueAt.getTime(),
        reviewedAt: review?.reviewedAt.toISOString() ?? null,
        reviewedByName: review
          ? (review.reviewedByMember.user.name ??
            review.reviewedByMember.user.email)
          : null,
      } satisfies StaffCheckInSubmissionItem;
    });
    return { items };
  });
}

export type StaffCheckInSubmissionFieldView = {
  fieldId: string;
  label: string;
  kind: string;
  required: boolean;
  /** Sanitized display value — never the raw option/field identifiers. */
  display: string;
};

export type StaffCheckInSubmissionDetail = {
  submissionId: string;
  instanceId: string;
  formName: string;
  versionSeq: number;
  dueAt: string;
  submittedAt: string;
  late: boolean;
  reviewed: { byName: string; at: string } | null;
  /** True only when this caller holds the assigned-coach write cell
   * (COACH + granted assigned scope — owner/assistant are read-only).
   * The mark action re-authorizes independently; this is a UI hint. */
  canMark: boolean;
  /** CHECK-IN-FEEDBACK-I1: bounded first page of the feedback thread
   * (sentAt ASC, id ASC) queried inside the same consent gate as the
   * answers. Body text only ever travels inside this audited detail
   * payload — never in the header list. */
  feedback: CheckInFeedbackItem[];
  /** Keyset cursor for the next (later) page, or null when complete. */
  feedbackNextCursor: string | null;
  /** Advisory send affordance — distinct from canMark: canMark requires
   * review === null; canSend requires a review to EXIST plus the
   * caller's assigned write cell + ACTIVE assignment. The send action
   * re-authorizes independently. */
  canSend: boolean;
  fields: StaffCheckInSubmissionFieldView[];
};

function displayCheckInAnswer(
  field: CheckInField,
  answer:
    | {
        kind: string;
        valueText: string | null;
        valueNumeric: Prisma.Decimal | null;
        valueDate: Date | null;
        valueOptionIds: Prisma.JsonValue | null;
      }
    | undefined,
): string {
  if (!answer) return "—";
  switch (answer.kind) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return answer.valueText ?? "—";
    case "NUMBER":
      return answer.valueNumeric !== null
        ? answer.valueNumeric.toString()
        : "—";
    case "DATE":
      return answer.valueDate
        ? answer.valueDate.toISOString().slice(0, 10)
        : "—";
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE": {
      const ids = Array.isArray(answer.valueOptionIds)
        ? (answer.valueOptionIds as unknown[]).filter(
            (v): v is string => typeof v === "string",
          )
        : [];
      const labels = ids
        .map(
          (id) => (field.options ?? []).find((o) => o.optionId === id)?.label,
        )
        .filter((v): v is string => typeof v === "string");
      return labels.length > 0 ? labels.join(", ") : "—";
    }
    default:
      return "—";
  }
}

/**
 * P-025-C explicit staff submission detail read (P-022 mechanics,
 * decisions #85/#89-analog). Everything sensitive happens inside ONE
 * Serializable transaction: scoped answer-free pre-read → advisories →
 * member FOR UPDATE → in-tx authorize → assigned-scope ACTIVE assignment
 * re-resolve+lock → profile → submission/instance locks → consent rows
 * FOR UPDATE → answers → ONE structural READ audit LAST → commit. A
 * failed audit returns no values; passive GETs write zero audits.
 */
export async function readCheckInSubmissionDetail(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
  },
  deps: CheckInInstanceDeps = {},
): Promise<StaffCheckInSubmissionDetail> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveCheckInConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.submissionId)
  )
    throw new CheckInInstanceError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // 1. Scoped answer-free pre-read — foreign/missing tuple fails
        // BEFORE any foreign chkin advisory.
        const pre = await tx.checkInSubmission.findFirst({
          where: {
            id: input.submissionId,
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          select: { formId: true },
        });
        if (!pre) throw new CheckInInstanceError("not_available");

        // 2–4. chkin → member advisories → member lock → authorize.
        const { ctx, member } = await lockedAuthorize(
          tx,
          session,
          {
            resource: "checkinsCoachReviews",
            action: "read",
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          pre.formId,
        );
        if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
          throw new AccessDeniedError(
            "role_denied",
            "checkinsCoachReviews",
            "read",
          );

        // 5. Assigned branch: coherent ACTIVE assignment lock.
        if (ctx.grantedScope === "assigned")
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
            "checkinsCoachReviews",
          );

        // 6. Locked profile.
        const profile = await lockProfile(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        if (!profile) throw new CheckInInstanceError("not_available");

        // 7. Locked submission + instance; derived state must be
        // SUBMITTED or REVIEWED (a cancelled instance can never hold a
        // submission under the serialized protocol — defensive recheck).
        const submissionRows = await tx.$queryRawUnsafe<
          {
            id: string;
            instanceId: string;
            submittedAt: Date;
          }[]
        >(
          `SELECT id, instance_id AS "instanceId", submitted_at AS "submittedAt"
           FROM "checkin_submission"
           WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
           FOR UPDATE`,
          input.submissionId,
          input.workspaceId,
          input.clientProfileId,
        );
        const submission = submissionRows[0];
        if (!submission) throw new CheckInInstanceError("not_available");
        const instance = await lockInstance(
          tx,
          input.workspaceId,
          submission.instanceId,
        );
        if (!instance || instance.clientProfileId !== input.clientProfileId)
          throw new CheckInInstanceError("not_available");
        const state = projectCheckInInstanceState({
          cancelledAt: instance.cancelledAt,
          cancelledByMemberId: instance.cancelledByMemberId,
          hasSubmission: true,
          hasReview: false,
        });
        if (state !== "SUBMITTED")
          throw new CheckInInstanceError("not_available");

        // 8. Consent rows FOR UPDATE before ANY answer read (#85).
        await checkRequiredConsent(tx, input.clientProfileId, registry, true);

        // 9. Pinned version + answers (only now — after consent holds).
        const version = await tx.checkInFormVersion.findUnique({
          where: { id: instance.formVersionId },
          select: { workspaceId: true, formId: true, definition: true },
        });
        if (
          !version ||
          version.workspaceId !== input.workspaceId ||
          version.formId !== instance.formId
        )
          throw new CheckInInstanceError("not_available");
        const definition = version.definition as unknown as CheckInDefinition;
        const answers = await tx.checkInSubmissionAnswer.findMany({
          where: {
            submissionId: submission.id,
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          select: {
            fieldId: true,
            kind: true,
            valueText: true,
            valueNumeric: true,
            valueDate: true,
            valueOptionIds: true,
          },
        });
        const byField = new Map(answers.map((a) => [a.fieldId, a]));

        // 10. Review provenance (bounded staff-only metadata, #91).
        const review = await tx.checkInReview.findFirst({
          where: { submissionId: submission.id },
          select: {
            reviewedAt: true,
            reviewedByMember: {
              select: { user: { select: { name: true, email: true } } },
            },
          },
        });
        const form = await tx.checkInForm.findUnique({
          where: { id: instance.formId },
          select: { name: true },
        });

        // SOLO-COACH-I1 (decision 111): canMark reflects the caller's
        // actual WRITE scope on checkinsCoachReviews (action-specific —
        // an owner resolves `assigned` post-amendment), an ACTIVE
        // ClientAssignment row, and lifecycle (already-reviewed → no
        // affordance). Bounded indexed existence check — no answer rows.
        // Advisory only: the write transaction independently
        // re-authorizes and FOR UPDATE-locks the assignment.
        const markWriteScope = resolveScope(
          "checkinsCoachReviews",
          "write",
          member.role as PrincipalRole,
        );
        const markAssignment =
          markWriteScope === "assigned"
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

        // CHECK-IN-FEEDBACK-I1: the bounded feedback thread is queried
        // INSIDE the existing whole-payload consent gate — after the
        // FOR UPDATE consent check above, never before. canSend mirrors
        // the canMark capability shape on checkinFeedback/write but
        // requires the review to EXIST (it is the inverse edge: mark is
        // offered pre-review, send post-review). Advisory only — the
        // send transaction independently re-authorizes.
        const sendWriteScope = resolveScope(
          "checkinFeedback",
          "write",
          member.role as PrincipalRole,
        );
        const sendAssignment =
          sendWriteScope === "assigned"
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
        const feedbackPage1 = await feedbackPage(tx, {
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
          submissionId: submission.id,
          limit: CHECKIN_FEEDBACK_PAGE_SIZE,
        });

        // 11. Structural READ audit — last; a failed write rolls the
        // detail read (and its values) back (#89-analog).
        await writeAuditEvent(tx, ctx, {
          action: "READ",
          resourceType: "checkin_submission",
          resourceId: submission.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: false },
        });

        const late =
          submission.submittedAt.getTime() > instance.dueAt.getTime();
        return {
          submissionId: submission.id,
          instanceId: submission.instanceId,
          formName: form?.name ?? "",
          versionSeq: (definition as { versionSeq?: number }).versionSeq ?? 0,
          dueAt: instance.dueAt.toISOString(),
          submittedAt: submission.submittedAt.toISOString(),
          late,
          reviewed: review
            ? {
                byName:
                  review.reviewedByMember.user.name ??
                  review.reviewedByMember.user.email,
                at: review.reviewedAt.toISOString(),
              }
            : null,
          canMark:
            markWriteScope === "assigned" &&
            markAssignment !== null &&
            review === null,
          feedback: feedbackPage1.items,
          feedbackNextCursor: feedbackPage1.nextCursor,
          canSend:
            sendWriteScope === "assigned" &&
            sendAssignment !== null &&
            review !== null,
          fields: definition.fields.map((f) => ({
            fieldId: f.fieldId,
            label: f.label,
            kind: f.kind,
            required: f.required,
            display: displayCheckInAnswer(f, byField.get(f.fieldId)),
          })),
        } satisfies StaffCheckInSubmissionDetail;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

export type MarkCheckInSubmissionReviewedInput = {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
};

export type MarkCheckInSubmissionReviewedResult = {
  status: "reviewed" | "already_reviewed";
  reviewedAt: string;
};

/**
 * P-025-C terminal review acknowledgement (decisions #86–#91): exactly
 * one immutable review row per submission — reviewer + timestamp only;
 * no notes, no feedback, no workflow gate. Assigned-coach only:
 * `checkinsCoachReviews/write` denies the owner/assistant/client cells
 * outright, and only the `assigned` branch proceeds to the ACTIVE
 * assignment re-resolve + row lock. Idempotent replay returns the
 * existing reviewed state (#86) with zero rows and zero audits; P2002
 * on `unique(submission_id)` → bounded full-protocol re-entry.
 */
export async function markCheckInSubmissionReviewed(
  session: SessionLike,
  input: MarkCheckInSubmissionReviewedInput,
  deps: CheckInInstanceDeps = {},
): Promise<MarkCheckInSubmissionReviewedResult> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveCheckInConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.submissionId)
  )
    throw new CheckInInstanceError("invalid_input");

  const attempt = (): Promise<MarkCheckInSubmissionReviewedResult> =>
    withSerializedRetry(() =>
      db.$transaction(
        async (tx) => {
          // 1. Scoped answer-free pre-read — foreign/missing tuple fails
          // BEFORE any foreign chkin advisory.
          const pre = await tx.checkInSubmission.findFirst({
            where: {
              id: input.submissionId,
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            select: { formId: true },
          });
          if (!pre) throw new CheckInInstanceError("not_available");

          // 2–4. chkin → member advisories → member lock → authorize.
          // checkinsCoachReviews/write: owner/assistant/client denied at
          // the matrix — only an assigned coach survives this branch.
          const { ctx, member } = await lockedAuthorize(
            tx,
            session,
            {
              resource: "checkinsCoachReviews",
              action: "write",
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            pre.formId,
          );
          if (ctx.grantedScope !== "assigned")
            throw new AccessDeniedError(
              "role_denied",
              "checkinsCoachReviews",
              "write",
            );

          // 5. Authoritative ACTIVE assignment re-resolve + lock.
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
            "checkinsCoachReviews",
          );

          // 6. Locked profile → submission → instance.
          const profile = await lockProfile(
            tx,
            input.workspaceId,
            input.clientProfileId,
          );
          if (!profile) throw new CheckInInstanceError("not_available");
          const submissionRows = await tx.$queryRawUnsafe<
            { id: string; instanceId: string }[]
          >(
            `SELECT id, instance_id AS "instanceId"
             FROM "checkin_submission"
             WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
             FOR UPDATE`,
            input.submissionId,
            input.workspaceId,
            input.clientProfileId,
          );
          const submission = submissionRows[0];
          if (!submission) throw new CheckInInstanceError("not_available");
          const instance = await lockInstance(
            tx,
            input.workspaceId,
            submission.instanceId,
          );
          if (!instance || instance.clientProfileId !== input.clientProfileId)
            throw new CheckInInstanceError("not_available");

          // 7. Idempotency BEFORE the derived-state mark check (#86): a
          // structurally valid replay returns the existing reviewed
          // state — zero new rows, zero audits. Current consent is
          // verified first (P-025-C-I1-R2 / #85): the durable
          // `already_reviewed` state is reviewer provenance; a withdrawn
          // caller gets the closed consent_missing, never the timestamp.
          const existing = await tx.checkInReview.findFirst({
            where: { submissionId: submission.id },
            select: { reviewedAt: true },
          });
          if (existing) {
            await checkRequiredConsent(
              tx,
              input.clientProfileId,
              registry,
              false,
            );
            return {
              status: "already_reviewed",
              reviewedAt: existing.reviewedAt.toISOString(),
            } satisfies MarkCheckInSubmissionReviewedResult;
          }

          // 8. Derived state must be SUBMITTED — a cancelled or
          // submissionless instance fails closed inside the lock.
          const state = projectCheckInInstanceState({
            cancelledAt: instance.cancelledAt,
            cancelledByMemberId: instance.cancelledByMemberId,
            hasSubmission: true,
            hasReview: false,
          });
          if (state !== "SUBMITTED")
            throw new CheckInInstanceError("not_available");

          // 9. Consent FOR UPDATE — the acknowledgement itself is
          // health-adjacent provenance (#85: all new writes fail closed
          // after withdrawal).
          await checkRequiredConsent(tx, input.clientProfileId, registry, true);

          // 10. Terminal immutable row.
          const review = await tx.checkInReview.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              submissionId: submission.id,
              reviewedByMemberId: member.id,
            },
            select: { id: true, reviewedAt: true },
          });

          // 11. Audit LAST — a failed audit rolls the review back.
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "checkin_review",
            resourceId: review.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { changed: true },
          });
          return {
            status: "reviewed",
            reviewedAt: review.reviewedAt.toISOString(),
          } satisfies MarkCheckInSubmissionReviewedResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

  try {
    return await attempt();
  } catch (error) {
    // unique(submission_id) P2002 — the concurrent mark won. Re-enter the
    // SAME fully authorized protocol exactly once (the replay lookup then
    // returns already_reviewed); second conflict → closed error.
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

// ── CHECK-IN-FEEDBACK-I1: bounded staff text feedback ────────────────────

/** Body bound — UTF-16 code units, matching textarea maxLength. */
export const CHECKIN_FEEDBACK_BODY_MAX = 2000;
/** Bounded page size for feedback thread reads. */
export const CHECKIN_FEEDBACK_PAGE_SIZE = 50;
/** Client nonce bound — opaque token, never parsed for meaning. */
export const CHECKIN_FEEDBACK_NONCE_MAX = 64;

export type CheckInFeedbackItem = {
  id: string;
  sentAt: string;
  byName: string;
  body: string;
};

export type CheckInFeedbackPage = {
  items: CheckInFeedbackItem[];
  /** Opaque "{sentAtIso}|{id}" cursor for the next (later) page. */
  nextCursor: string | null;
  hasMore: boolean;
};

/** Shared bounded ASC page query — used by the detail reads AND the
 * paginated list functions. `WHERE` always carries the full coherence
 * tuple; the cursor only positions within the authorized target. */
async function feedbackPage(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
    limit: number;
    cursor?: { sentAt: Date; id: string };
  },
): Promise<CheckInFeedbackPage> {
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit)),
    CHECKIN_FEEDBACK_PAGE_SIZE,
  );
  const rows = await tx.checkInFeedback.findMany({
    where: {
      submissionId: input.submissionId,
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      ...(input.cursor
        ? {
            OR: [
              { sentAt: { gt: input.cursor.sentAt } },
              {
                AND: [
                  { sentAt: input.cursor.sentAt },
                  { id: { gt: input.cursor.id } },
                ],
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      sentAt: true,
      body: true,
      authoredBy: {
        select: { user: { select: { name: true, email: true } } },
      },
    },
    orderBy: [{ sentAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      sentAt: r.sentAt.toISOString(),
      byName: r.authoredBy.user.name ?? r.authoredBy.user.email,
      body: r.body,
    })),
    hasMore,
    nextCursor:
      hasMore && last ? `${last.sentAt.toISOString()}|${last.id}` : null,
  };
}

/** Parse the bounded opaque "{iso}|{id}" keyset cursor. */
function parseFeedbackCursor(raw: string): { sentAt: Date; id: string } {
  if (raw.length > 160) throw new CheckInInstanceError("invalid_input");
  const idx = raw.indexOf("|");
  if (idx <= 0) throw new CheckInInstanceError("invalid_input");
  const iso = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  const sentAt = new Date(iso);
  if (
    Number.isNaN(sentAt.getTime()) ||
    id.length === 0 ||
    id.length > 64 ||
    id.includes("|") ||
    !isWellFormedIso(iso)
  )
    throw new CheckInInstanceError("invalid_input");
  return { sentAt, id };
}

function isWellFormedIso(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v);
}

/** Normalize + bound the feedback body. Returns null on rejection. */
export function normalizeCheckInFeedbackBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  if (body.length === 0 || body.length > CHECKIN_FEEDBACK_BODY_MAX) return null;
  return body;
}

export type SendCheckInFeedbackInput = {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
  body: string;
  clientRequestId: string;
};

export type SendCheckInFeedbackResult = {
  status: "sent" | "already_sent";
  feedbackId: string;
  sentAt: string;
  byName: string;
  /** The stored (normalized) body — echoed for optimistic append. */
  body: string;
};

/**
 * CHECK-IN-FEEDBACK-I1 send — serializable, mirrors
 * `markCheckInSubmissionReviewed`. A CheckInReview MUST already exist
 * (#96 ack is the prerequisite and is never altered). The idempotency
 * anchor is `unique(submission_id, client_request_id)`: an identical
 * replay returns `already_sent` (zero rows/audits) after a consent
 * recheck; any author/body mismatch under the same nonce is a loud
 * `idempotency_conflict`, never a silent coalesce. P2002 is honored
 * ONLY for the idempotency constraint (`isFeedbackNonceViolation`).
 */
export async function sendCheckInFeedback(
  session: SessionLike,
  input: SendCheckInFeedbackInput,
  deps: CheckInInstanceDeps = {},
): Promise<SendCheckInFeedbackResult> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveCheckInConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.submissionId) ||
    !validId(input.clientRequestId) ||
    input.clientRequestId.length > CHECKIN_FEEDBACK_NONCE_MAX
  )
    throw new CheckInInstanceError("invalid_input");
  const body = normalizeCheckInFeedbackBody(input.body);
  if (body === null) throw new CheckInInstanceError("invalid_input");

  const attempt = (): Promise<SendCheckInFeedbackResult> =>
    withSerializedRetry(() =>
      db.$transaction(
        async (tx) => {
          // 1. Scoped answer-free pre-read — foreign/missing tuple fails
          // BEFORE any foreign chkin advisory.
          const pre = await tx.checkInSubmission.findFirst({
            where: {
              id: input.submissionId,
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            select: { formId: true },
          });
          if (!pre) throw new CheckInInstanceError("not_available");

          // 2–4. chkin → member advisories → member lock → authorize.
          // checkinFeedback/write: only the assigned cell survives —
          // owner write is assigned-only (#111), assistant/client/
          // SUPPORT/PLATFORM_ADMIN are denied at the matrix + deny-set.
          const { ctx, member } = await lockedAuthorize(
            tx,
            session,
            {
              resource: "checkinFeedback",
              action: "write",
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            pre.formId,
          );
          if (ctx.grantedScope !== "assigned")
            throw new AccessDeniedError(
              "role_denied",
              "checkinFeedback",
              "write",
            );

          // 5. Authoritative ACTIVE assignment re-resolve + lock.
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
            "checkinFeedback",
          );

          // 6. Locked profile → submission → instance.
          const profile = await lockProfile(
            tx,
            input.workspaceId,
            input.clientProfileId,
          );
          if (!profile) throw new CheckInInstanceError("not_available");
          const submissionRows = await tx.$queryRawUnsafe<
            { id: string; instanceId: string }[]
          >(
            `SELECT id, instance_id AS "instanceId"
             FROM "checkin_submission"
             WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
             FOR UPDATE`,
            input.submissionId,
            input.workspaceId,
            input.clientProfileId,
          );
          const submission = submissionRows[0];
          if (!submission) throw new CheckInInstanceError("not_available");
          const instance = await lockInstance(
            tx,
            input.workspaceId,
            submission.instanceId,
          );
          if (!instance || instance.clientProfileId !== input.clientProfileId)
            throw new CheckInInstanceError("not_available");
          // Defensive lifecycle: a cancelled instance can never hold a
          // submission under the serialized protocol (#97); recheck.
          if (instance.cancelledAt !== null)
            throw new CheckInInstanceError("not_available");

          // 7. Idempotent replay BEFORE the review prerequisite: a
          // structurally identical retry returns the durable sent state
          // — zero new rows, zero audits. Current consent is verified
          // first (the `already_reviewed` precedent): a withdrawn caller
          // gets consent_missing, never the confirmation. ANY
          // author/body mismatch → loud idempotency_conflict.
          const existing = await tx.checkInFeedback.findFirst({
            where: {
              submissionId: submission.id,
              clientRequestId: input.clientRequestId,
            },
            select: {
              id: true,
              sentAt: true,
              body: true,
              authoredByMemberId: true,
              authoredBy: {
                select: {
                  user: { select: { name: true, email: true } },
                },
              },
            },
          });
          if (existing) {
            if (
              existing.authoredByMemberId !== member.id ||
              existing.body !== body
            )
              throw new CheckInInstanceError("idempotency_conflict");
            await checkRequiredConsent(
              tx,
              input.clientProfileId,
              registry,
              false,
            );
            return {
              status: "already_sent",
              feedbackId: existing.id,
              sentAt: existing.sentAt.toISOString(),
              byName:
                existing.authoredBy.user.name ?? existing.authoredBy.user.email,
              body: existing.body,
            } satisfies SendCheckInFeedbackResult;
          }

          // 8. Review-exists prerequisite — feedback never precedes the
          // terminal acknowledgement and never alters it.
          const review = await tx.checkInReview.findFirst({
            where: { submissionId: submission.id },
            select: { id: true },
          });
          if (!review) throw new CheckInInstanceError("review_required");

          // 9. Consent FOR UPDATE before the insert — the send fails
          // closed after withdrawal (same posture as the review mark).
          await checkRequiredConsent(tx, input.clientProfileId, registry, true);

          // 10. Immutable row — no update pathway exists.
          const author = await tx.workspaceMember.findUniqueOrThrow({
            where: { id: member.id },
            select: { user: { select: { name: true, email: true } } },
          });
          const feedback = await tx.checkInFeedback.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              submissionId: submission.id,
              authoredByMemberId: member.id,
              body,
              clientRequestId: input.clientRequestId,
            },
            select: { id: true, sentAt: true },
          });

          // 11. Audit LAST — a failed audit rolls the row back. IDs +
          // structural markers only — never the body text.
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "checkin_feedback",
            resourceId: feedback.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { changed: true },
          });
          return {
            status: "sent",
            feedbackId: feedback.id,
            sentAt: feedback.sentAt.toISOString(),
            byName: author.user.name ?? author.user.email,
            body,
          } satisfies SendCheckInFeedbackResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

  try {
    return await attempt();
  } catch (error) {
    // P2002 on the idempotency constraint ONLY — the concurrent send
    // won. Re-enter the SAME fully authorized protocol exactly once
    // (the replay lookup then resolves already_sent or
    // idempotency_conflict); a second conflict → closed error. Any
    // other unique violation rethrows immediately.
    if (!isFeedbackNonceViolation(error)) throw error;
    try {
      return await attempt();
    } catch (second) {
      if (isFeedbackNonceViolation(second))
        throw new CheckInInstanceError("serialization_conflict");
      throw second;
    }
  }
}

export type ResolveCheckInFeedbackSendInput = {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
  clientRequestId: string;
};

export type ResolveCheckInFeedbackSendResult =
  | {
      status: "sent";
      feedbackId: string;
      sentAt: string;
      byName: string;
      /** The stored body — the author is re-reading their own text. */
      body: string;
    }
  | { status: "not_sent" };

/**
 * CHECK-IN-FEEDBACK-I1 recovery read — bounded reconciliation for the
 * composer's remount/reload path. Re-authorizes checkinFeedback/read,
 * verifies consent, and looks the nonce up scoped to the AUTHENTICATED
 * AUTHOR + exact workspace/client/submission target. `not_sent` is NOT
 * proof an in-flight send can never commit — callers keep the nonce.
 * Denied actors get the denial, never a `not_sent` lie.
 */
export async function resolveCheckInFeedbackSend(
  session: SessionLike,
  input: ResolveCheckInFeedbackSendInput,
  deps: CheckInInstanceDeps = {},
): Promise<ResolveCheckInFeedbackSendResult> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveCheckInConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.submissionId) ||
    !validId(input.clientRequestId) ||
    input.clientRequestId.length > CHECKIN_FEEDBACK_NONCE_MAX
  )
    throw new CheckInInstanceError("invalid_input");

  return db.$transaction(
    async (tx) => {
      const pre = await tx.checkInSubmission.findFirst({
        where: {
          id: input.submissionId,
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        },
        select: { formId: true },
      });
      if (!pre) throw new CheckInInstanceError("not_available");

      const { ctx, member } = await lockedAuthorize(
        tx,
        session,
        {
          resource: "checkinFeedback",
          action: "read",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        },
        pre.formId,
      );
      if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
        throw new AccessDeniedError("role_denied", "checkinFeedback", "read");
      if (ctx.grantedScope === "assigned")
        await lockAssignmentForScope(
          tx,
          input.workspaceId,
          input.clientProfileId,
          member.id,
          "checkinFeedback",
        );

      // Consent holds before ANY feedback read — a withdrawn caller gets
      // the closed error, never a state reveal.
      await checkRequiredConsent(tx, input.clientProfileId, registry, true);

      const row = await tx.checkInFeedback.findFirst({
        where: {
          submissionId: input.submissionId,
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
          authoredByMemberId: member.id,
          clientRequestId: input.clientRequestId,
        },
        select: {
          id: true,
          sentAt: true,
          body: true,
          authoredBy: {
            select: { user: { select: { name: true, email: true } } },
          },
        },
      });
      if (!row) return { status: "not_sent" };
      return {
        status: "sent",
        feedbackId: row.id,
        sentAt: row.sentAt.toISOString(),
        byName: row.authoredBy.user.name ?? row.authoredBy.user.email,
        body: row.body,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export type ListCheckInFeedbackInput = {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
  cursor?: string;
  limit?: number;
};

/**
 * Staff feedback thread page — same authorization/consent protocol as
 * the detail read; the thread itself is covered by the detail READ
 * audit (this bounded page call writes no additional event). Ordering
 * is `sentAt ASC, id ASC`; the keyset cursor only positions within the
 * authorized target — a foreign cursor cannot leak rows.
 */
export async function listCheckInFeedback(
  session: SessionLike,
  input: ListCheckInFeedbackInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInFeedbackPage> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveCheckInConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.submissionId)
  )
    throw new CheckInInstanceError("invalid_input");
  const cursor =
    input.cursor !== undefined ? parseFeedbackCursor(input.cursor) : undefined;

  return db.$transaction(
    async (tx) => {
      const pre = await tx.checkInSubmission.findFirst({
        where: {
          id: input.submissionId,
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        },
        select: { formId: true },
      });
      if (!pre) throw new CheckInInstanceError("not_available");

      const { ctx, member } = await lockedAuthorize(
        tx,
        session,
        {
          resource: "checkinFeedback",
          action: "read",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        },
        pre.formId,
      );
      if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
        throw new AccessDeniedError("role_denied", "checkinFeedback", "read");
      if (ctx.grantedScope === "assigned")
        await lockAssignmentForScope(
          tx,
          input.workspaceId,
          input.clientProfileId,
          member.id,
          "checkinFeedback",
        );

      // Consent holds before ANY feedback body read.
      await checkRequiredConsent(tx, input.clientProfileId, registry, true);

      return feedbackPage(tx, {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        submissionId: input.submissionId,
        limit: input.limit ?? CHECKIN_FEEDBACK_PAGE_SIZE,
        cursor,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export type ListOwnCheckInFeedbackInput = {
  workspaceId: string;
  instanceId: string;
  cursor?: string;
};

/**
 * Client feedback page for the caller's OWN instance submission —
 * own-scope rebinding + explicit checkinFeedback own authorization +
 * the same consent gate as answers. No submission → truthful empty
 * page; denied/foreign → closed errors. Unaudited (own-scope read
 * posture, matching the rest of the client surfaces).
 */
export async function listOwnCheckInFeedback(
  session: SessionLike,
  input: ListOwnCheckInFeedbackInput,
  deps: CheckInInstanceDeps = {},
): Promise<CheckInFeedbackPage> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveCheckInConsentPolicy();
  if (!validId(input.workspaceId) || !validId(input.instanceId))
    throw new CheckInInstanceError("invalid_input");
  const cursor =
    input.cursor !== undefined ? parseFeedbackCursor(input.cursor) : undefined;
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "checkinFeedback", "read");

  return db.$transaction(
    async (tx) => {
      const profile = await tx.clientProfile.findFirst({
        where: { workspaceId: input.workspaceId, userId },
        select: { id: true },
      });
      if (!profile)
        throw new AccessDeniedError("not_owner", "checkinFeedback", "read");
      const instance = await tx.checkInInstance.findFirst({
        where: {
          id: input.instanceId,
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        },
        select: { id: true },
      });
      if (!instance) throw new CheckInInstanceError("not_available");
      const submission = await tx.checkInSubmission.findFirst({
        where: { instanceId: instance.id, workspaceId: input.workspaceId },
        select: { id: true },
      });
      if (!submission) return { items: [], nextCursor: null, hasMore: false };

      const feedbackCtx = await authorize(
        session,
        {
          resource: "checkinFeedback",
          action: "read",
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        },
        createPrismaAuthorizationRepo(tx),
      );
      if (feedbackCtx.grantedScope !== "own")
        throw new AccessDeniedError("role_denied", "checkinFeedback", "read");

      // Same consent gate as answers — before any feedback body read.
      await checkRequiredConsent(tx, profile.id, registry, true);

      return feedbackPage(tx, {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
        submissionId: submission.id,
        limit: CHECKIN_FEEDBACK_PAGE_SIZE,
        cursor,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
