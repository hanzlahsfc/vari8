/**
 * Card 10 (#175) — guarded IIFYM (macro target) persistence service,
 * cloned step for step from the reviewed meal-plan publish protocol
 * (MEAL-PLAN-I1, decision #115) onto the existing iifym_plan /
 * iifym_plan_version tables. No migration: the schema v2 tables carry
 * every column this service needs.
 *
 * Workflow: assigned staff (coach OR explicitly assigned owner) confirms
 * the client's plan-scoped IANA timezone → edits a shared draft under
 * `draftRevision` CAS → publishes an immutable effective-dated version.
 * Publish = assign; the draft STAYS open for continuous editing.
 *
 * Lock protocol (client-scoped — reviewed order):
 *   advisory `iifym:{workspaceId}:{clientProfileId}`
 *   → advisory `member:{workspaceId}:{userId}`
 *   → workspace_member FOR UPDATE (authoritative actor state)
 *   → in-transaction authorize(mealPlans/* — the owner's settled
 *     nutrition-plan posture; IIFYM is the second nutrition plan kind)
 *   → ACTIVE ClientAssignment FOR UPDATE (assigned scope only)
 *   → client_profile FOR UPDATE
 *   → consent rows FOR UPDATE in deterministic kind order (before ANY
 *     content access on detail reads and before ANY sensitive write)
 *   → iifym_plan FOR UPDATE → mutation → structural audit LAST.
 *
 * Serializable + bounded retry on genuine serialization failures
 * (P2034, P2010 carrying 40001/40P01) plus the declared publication
 * uniques; every retry re-resolves all state.
 *
 * Timezone semantics (owner-settled): `activationInstant` is resolved
 * ONCE at publish via `resolveLocalInstant(plan.timezone,
 * effectiveDate, 0)` and stored immutably with `effectiveTimezone`.
 * Current selection is `activationInstant <= now` eligible,
 * `(effectiveDate, versionSeq)` precedence — identical for coach and
 * client, browser-tz-free. A timezone change touches the container
 * only; published snapshots never retime.
 *
 * `publishOriginRevision` is the replay authority: a retried publish of
 * a committed revision returns the stored version unchanged — checked
 * BEFORE the CAS so a lost-response retry after a newer draft save
 * still resolves.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  isSerializationConflict,
  prisma as defaultPrisma,
  withSerializedRetry as sharedWithSerializedRetry,
} from "../db";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import {
  hasExactActiveConsent,
  requiredConsentsFor,
  type ConsentPolicyRegistry,
} from "../consent";
import { resolveLocalInstant } from "../checkin/timezone";
import { resolveIifymConsentPolicy } from "../consent";
import { consentGatesEnabled } from "../runtime";
import { isIifymPlansEnabled } from "./gate";
import { IIFYM_LIMITS } from "./limits";
import { IifymError, normalizeIifymPayload, type IifymDraft } from "./payload";

export { IifymError } from "./payload";
export type {
  IifymDraft,
  IifymOption,
  MealTargets,
  TargetValue,
  VariantSchedule,
} from "./payload";

export type IifymDeps = {
  db?: PrismaClient;
  registry?: ConsentPolicyRegistry;
  now?: Date;
};

// ── Effective-date parsing + activation resolution ───────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Declared effective date: strict YYYY-MM-DD, real calendar date, year in
 * the shared timezone utility's supported range (2000–2100), and at most
 * `effectiveDateAheadDays` past the server UTC date. Backdating within
 * range is allowed — precedence resolves which version is current.
 */
export function parseEffectiveDate(
  raw: unknown,
  now: Date = new Date(),
): string {
  if (typeof raw !== "string" || !DATE_RE.test(raw))
    throw new IifymError("invalid_input");
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    throw new IifymError("invalid_input");
  if (y < 2000 || y > 2100) throw new IifymError("invalid_input");
  const todayUtc = now.toISOString().slice(0, 10);
  const [ty, tm, td] = todayUtc.split("-").map(Number);
  const limit = new Date(
    Date.UTC(ty, tm - 1, td + IIFYM_LIMITS.effectiveDateAheadDays),
  )
    .toISOString()
    .slice(0, 10);
  if (raw >= limit) throw new IifymError("invalid_input");
  return raw;
}

export type IifymActivation =
  | { status: "ok"; instant: Date }
  | { status: "unrepresentable" }
  | { status: "invalid" };

/**
 * Start-of-client-local-day for the declared effective date — the
 * reviewed wall→instant resolver at minute 0 (strict-subset reuse: fold →
 * earlier instant, midnight gap → first valid minute on the SAME date,
 * whole-day skip → unrepresentable, invalid zone/date → invalid).
 */
export function resolveIifymActivation(
  zone: string,
  effectiveDate: string,
): IifymActivation {
  return resolveLocalInstant(zone, effectiveDate, 0);
}

// ── Concurrency protocol (reviewed convention) ───────────────────────────

/**
 * Unique-violation targets that are safe to retry inside `publish`: under
 * SERIALIZABLE a concurrent publish can pass the plan-row lock yet insert
 * with a stale-snapshot sequence/origin. Restarting the transaction is
 * exactly correct — the retry re-runs the replay check (idempotent
 * return) or recomputes `versionSeq` under the serialized lock.
 */
const PUBLISH_RETRYABLE_UNIQUE_TARGETS: readonly (readonly string[])[] = [
  ["iifym_plan_id", "version_seq"],
  ["iifym_plan_id", "publish_origin_revision"],
] as const;

function isRetryableUniqueConflict(
  error: unknown,
  targets: readonly (readonly string[])[],
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  )
    return false;
  const meta = error.meta as
    { target?: unknown; constraint?: unknown } | undefined;
  const fields = [meta?.target, meta?.constraint]
    .flat()
    .filter((v): v is string => typeof v === "string");
  return targets.some((cols) =>
    cols.every((c) => fields.some((f) => f === c || f.includes(c))),
  );
}

async function withSerializedRetry<T>(
  fn: () => Promise<T>,
  retryUniqueTargets?: readonly (readonly string[])[],
): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: 8,
    backoffBaseMs: 10,
    backoffCapMs: 50,
    isRetryable: (error) =>
      isSerializationConflict(error) ||
      (retryUniqueTargets !== undefined &&
        isRetryableUniqueConflict(error, retryUniqueTargets)),
    onExhausted: () => new IifymError("serialization_conflict"),
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
 * iifym + member advisories → member FOR UPDATE → in-transaction
 * authorize. Returns the authorization context + the locked member row.
 */
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
    throw new AccessDeniedError("unauthenticated", "mealPlans", request.action);
  await advisoryLock(
    tx,
    `iifym:${request.workspaceId}:${request.clientProfileId}`,
  );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const member = await lockMember(tx, request.workspaceId, userId);
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError("role_denied", "mealPlans", request.action);
  const ctx = await authorize(
    session,
    {
      resource: "mealPlans",
      action: request.action,
      workspaceId: request.workspaceId,
      clientProfileId: request.clientProfileId,
    },
    createPrismaAuthorizationRepo(tx),
  );
  if (ctx.workspaceMemberId !== member.id)
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "mealPlans",
      request.action,
    );
  return { ctx, member, userId };
}

/**
 * Assigned-scope branch: re-resolve the ACTIVE ClientAssignment for the
 * locked member + locked target client and take that row FOR UPDATE.
 * Workspace-scope readers (owners) never touch the assignment table.
 */
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
    throw new AccessDeniedError("not_assigned", "mealPlans", action);
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
    throw new AccessDeniedError("not_assigned", "mealPlans", action);
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

type LockedPlanRow = {
  id: string;
  workspace_id: string;
  client_profile_id: string;
  title: string;
  timezone: string | null;
  draft: unknown;
  draft_revision: number;
};

/** Row lock scoped to BOTH clientProfileId and workspaceId — never a
 * foreign row. */
async function lockPlan(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<LockedPlanRow | null> {
  const rows = await tx.$queryRawUnsafe<LockedPlanRow[]>(
    `SELECT id, workspace_id, client_profile_id, title, timezone, draft,
            draft_revision
     FROM "iifym_plan"
     WHERE client_profile_id = $1 AND workspace_id = $2 FOR UPDATE`,
    clientProfileId,
    workspaceId,
  );
  return rows[0] ?? null;
}

/** Consent — deterministic kind order, rows FOR UPDATE when `forUpdate`.
 * The macro-target surface rides the same nutrition-plan consent kinds
 * as meal plans (BASE_CONSENTS). */
async function checkRequiredConsent(
  tx: Prisma.TransactionClient,
  clientProfileId: string,
  registry: ConsentPolicyRegistry,
  forUpdate: boolean,
): Promise<void> {
  // D19: parked consent gate — allows (and skips the consent reads) when
  // ENABLE_CONSENT_GATES is off.
  if (!consentGatesEnabled()) return;
  const required = requiredConsentsFor("mealPlans") ?? [];
  for (const kind of required) {
    const version = registry.currentVersion(kind);
    if (version === null) throw new IifymError("policy_not_configured");
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
      throw new IifymError("consent_missing");
  }
}

// ── Validation helpers ───────────────────────────────────────────────────

function validId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 128;
}

function cleanTitle(v: unknown): string {
  if (typeof v !== "string") throw new IifymError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > IIFYM_LIMITS.titleMax)
    throw new IifymError("invalid_input");
  return trimmed;
}

// ── Selection (the ONE rule, identical for coach and client) ────────────
// eligible  = activationInstant <= now
// current   = eligible ORDER BY effectiveDate DESC, versionSeq DESC LIMIT 1
// upcoming  = activationInstant >  now ORDER BY activationInstant ASC,
//             versionSeq ASC LIMIT 1

type VersionSelectRow = {
  id: string;
  iifymPlanId: string;
  versionSeq: number;
  effectiveDate: Date;
  effectiveTimezone: string;
  activationInstant: Date;
  publishedAt: Date;
};

const VERSION_SELECT = {
  id: true,
  iifymPlanId: true,
  versionSeq: true,
  effectiveDate: true,
  effectiveTimezone: true,
  activationInstant: true,
  publishedAt: true,
} as const;

async function currentVersion(
  tx: Prisma.TransactionClient,
  iifymPlanId: string,
  now: Date,
): Promise<VersionSelectRow | null> {
  return tx.iifymPlanVersion.findFirst({
    where: { iifymPlanId, activationInstant: { lte: now } },
    orderBy: [{ effectiveDate: "desc" }, { versionSeq: "desc" }],
    select: VERSION_SELECT,
  });
}

async function upcomingVersion(
  tx: Prisma.TransactionClient,
  iifymPlanId: string,
  now: Date,
): Promise<VersionSelectRow | null> {
  return tx.iifymPlanVersion.findFirst({
    where: { iifymPlanId, activationInstant: { gt: now } },
    orderBy: [{ activationInstant: "asc" }, { versionSeq: "asc" }],
    select: VERSION_SELECT,
  });
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ── Write operations ─────────────────────────────────────────────────────

/**
 * Save the shared draft. `expectedRevision === 0` CREATES the container
 * (title required); otherwise the row's `draft_revision` must match
 * exactly (CAS — stale editor → `stale_revision`, zero writes). An
 * optional `timezone` (explicit confirm) stamps provenance when it
 * changes; it never touches published version snapshots.
 */
export async function saveIifymDraft(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    expectedRevision: number;
    title?: string;
    draft: unknown;
    timezone?: string;
  },
  deps: IifymDeps = {},
): Promise<{ planId: string; revision: number }> {
  if (!isIifymPlansEnabled()) throw new IifymError("plan_not_accessible");
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveIifymConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    typeof input.expectedRevision !== "number" ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw new IifymError("invalid_input");
  const title = input.title === undefined ? undefined : cleanTitle(input.title);
  const timezone = input.timezone;
  if (timezone !== undefined) {
    const check = resolveIifymActivation(timezone, "2000-01-01");
    if (check.status === "invalid") throw new IifymError("invalid_input");
  }
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, member } = await lockedAuthorize(tx, session, {
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        // Write cells are `assigned` for coach AND owner — anything else
        // never reaches here (authorize throws first); asserted anyway.
        if (ctx.grantedScope !== "assigned")
          throw new AccessDeniedError("role_denied", "mealPlans", "write");
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
        if (!profile) throw new IifymError("plan_not_accessible");
        await checkRequiredConsent(tx, profile.id, registry, true);

        const normalized = normalizeIifymPayload(input.draft, {
          forPublish: false,
        });
        const now = deps.now ?? new Date();
        const memberId = ctx.workspaceMemberId as string;

        const plan = await lockPlan(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        if (!plan) {
          if (input.expectedRevision !== 0)
            throw new IifymError("plan_not_accessible");
          if (title === undefined) throw new IifymError("invalid_input");
          const created = await tx.iifymPlan.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              title,
              ...(timezone === undefined
                ? {}
                : {
                    timezone,
                    timezoneSetByMemberId: memberId,
                    timezoneSetAt: now,
                  }),
              draft: normalized as unknown as Prisma.InputJsonValue,
              draftRevision: 1,
              draftSavedByMemberId: memberId,
              draftUpdatedAt: now,
              createdByMemberId: memberId,
            },
            select: { id: true },
          });
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "iifym_plan",
            resourceId: created.id,
            subjectClientProfileId: input.clientProfileId,
          });
          return { planId: created.id, revision: 1 };
        }

        if (plan.draft_revision !== input.expectedRevision)
          throw new IifymError("stale_revision");
        const nextRevision = plan.draft_revision + 1;
        const timezoneChanged =
          timezone !== undefined && timezone !== plan.timezone;
        await tx.iifymPlan.update({
          where: { id: plan.id },
          data: {
            draft: normalized as unknown as Prisma.InputJsonValue,
            draftRevision: nextRevision,
            draftSavedByMemberId: memberId,
            draftUpdatedAt: now,
            ...(title === undefined ? {} : { title }),
            ...(timezone === undefined
              ? {}
              : timezoneChanged
                ? {
                    timezone,
                    timezoneSetByMemberId: memberId,
                    timezoneSetAt: now,
                  }
                : {}),
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "iifym_plan",
          resourceId: plan.id,
          subjectClientProfileId: input.clientProfileId,
          ...(timezoneChanged ? { meta: { changed: true } } : {}),
        });
        return { planId: plan.id, revision: nextRevision };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/**
 * Explicitly confirm/change the plan-scoped timezone on an existing
 * container. Never touches the draft, the revision, or any published
 * version's stored snapshot. Same write authorization + consent protocol
 * as every IIFYM mutation.
 */
export async function setIifymTimezone(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string; timezone: string },
  deps: IifymDeps = {},
): Promise<{ planId: string }> {
  if (!isIifymPlansEnabled()) throw new IifymError("plan_not_accessible");
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveIifymConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    resolveIifymActivation(input.timezone, "2000-01-01").status === "invalid"
  )
    throw new IifymError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, member } = await lockedAuthorize(tx, session, {
          action: "write",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        if (ctx.grantedScope !== "assigned")
          throw new AccessDeniedError("role_denied", "mealPlans", "write");
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
        if (!profile) throw new IifymError("plan_not_accessible");
        await checkRequiredConsent(tx, profile.id, registry, true);
        const plan = await lockPlan(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        if (!plan) throw new IifymError("plan_not_accessible");
        // Idempotent: same zone → no write, no audit event.
        if (plan.timezone === input.timezone) return { planId: plan.id };
        await tx.iifymPlan.update({
          where: { id: plan.id },
          data: {
            timezone: input.timezone,
            timezoneSetByMemberId: ctx.workspaceMemberId as string,
            timezoneSetAt: deps.now ?? new Date(),
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "iifym_plan",
          resourceId: plan.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: true },
        });
        return { planId: plan.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/**
 * Publish the CURRENT shared draft as an immutable client-assigned
 * version. `publishOriginRevision` is the replay authority: a retried
 * publish of a committed revision returns the existing version (checked
 * BEFORE the CAS, so a lost-response retry after a newer draft save
 * still resolves), and `stale_revision` rejects revisions that were
 * never published. The `(effectiveTimezone, activationInstant)` pair is
 * resolved inside the iifym lock — a concurrent timezone change can
 * never tear the snapshot.
 */
export async function publishIifymVersion(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    expectedRevision: number;
    effectiveDate: string;
  },
  deps: IifymDeps = {},
): Promise<{ versionId: string; versionSeq: number }> {
  if (!isIifymPlansEnabled()) throw new IifymError("plan_not_accessible");
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveIifymConsentPolicy();
  const now = deps.now ?? new Date();
  const effectiveDate = parseEffectiveDate(input.effectiveDate, now);
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    typeof input.expectedRevision !== "number" ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  )
    throw new IifymError("invalid_input");
  return withSerializedRetry(
    () =>
      db.$transaction(
        async (tx) => {
          const { ctx, member } = await lockedAuthorize(tx, session, {
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          });
          if (ctx.grantedScope !== "assigned")
            throw new AccessDeniedError("role_denied", "mealPlans", "write");
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
          if (!profile) throw new IifymError("plan_not_accessible");
          await checkRequiredConsent(tx, profile.id, registry, true);
          const plan = await lockPlan(
            tx,
            input.workspaceId,
            input.clientProfileId,
          );
          if (!plan) throw new IifymError("plan_not_accessible");

          // Replay authority FIRST: a version minted from this revision
          // already exists → return it. Reauthorization already ran, so a
          // denied actor's retry never reaches here.
          const existing = await tx.iifymPlanVersion.findFirst({
            where: {
              iifymPlanId: plan.id,
              publishOriginRevision: input.expectedRevision,
            },
            select: { id: true, versionSeq: true },
          });
          if (existing)
            return { versionId: existing.id, versionSeq: existing.versionSeq };

          if (plan.draft === null || plan.draft === undefined)
            throw new IifymError("publish_incomplete");
          if (plan.draft_revision !== input.expectedRevision)
            throw new IifymError("stale_revision");

          // Confirmed plan-scoped timezone — required before first publish.
          if (plan.timezone === null) throw new IifymError("timezone_required");
          const activation = resolveIifymActivation(
            plan.timezone,
            effectiveDate,
          );
          if (activation.status === "invalid")
            throw new IifymError("invalid_input");
          if (activation.status === "unrepresentable")
            throw new IifymError("unrepresentable_date");

          // Publish completeness validation on the STORED draft — the
          // frozen payload is exactly the normalized snapshot.
          const payload = normalizeIifymPayload(plan.draft, {
            forPublish: true,
          });

          const max = await tx.iifymPlanVersion.aggregate({
            where: { iifymPlanId: plan.id },
            _max: { versionSeq: true },
          });
          // versionSeq assigned ONLY under the serialized plan lock —
          // concurrent publishes can never mint conflicting sequences.
          const versionSeq = (max._max.versionSeq ?? 0) + 1;
          const created = await tx.iifymPlanVersion.create({
            data: {
              workspaceId: plan.workspace_id,
              iifymPlanId: plan.id,
              clientProfileId: plan.client_profile_id,
              versionSeq,
              effectiveDate: new Date(`${effectiveDate}T00:00:00Z`),
              effectiveTimezone: plan.timezone,
              activationInstant: activation.instant,
              payload: payload as unknown as Prisma.InputJsonValue,
              publishOriginRevision: plan.draft_revision,
              publishedByMemberId: ctx.workspaceMemberId as string,
            },
            select: { id: true },
          });
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "iifym_plan_version",
            resourceId: created.id,
            subjectClientProfileId: plan.client_profile_id,
            meta: {
              version: String(versionSeq),
              date: effectiveDate,
              status: "PUBLISHED",
              count: payload.options.length,
            },
          });
          return { versionId: created.id, versionSeq };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    PUBLISH_RETRYABLE_UNIQUE_TARGETS,
  );
}

// ── Read operations ──────────────────────────────────────────────────────

export type IifymVersionHeader = {
  id: string;
  versionSeq: number;
  effectiveDate: string;
  effectiveTimezone: string;
  publishedAt: string;
};

export type StaffIifymView = {
  plan: {
    id: string;
    title: string;
    timezone: string | null;
    draftRevision: number;
    draft: IifymDraft;
  } | null;
  versions: IifymVersionHeader[];
  currentVersionId: string | null;
  upcoming: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
  } | null;
  /** Advisory write capability — the write path independently
   * re-authorizes under locks; this only shapes the UI. */
  canWrite: boolean;
};

/** Staff detail read: draft + bounded version headers + server-resolved
 * current/upcoming. Consent rows are locked BEFORE any content access;
 * the READ audit is written last. */
export async function readStaffIifymPlan(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: IifymDeps = {},
): Promise<StaffIifymView> {
  if (!isIifymPlansEnabled()) throw new IifymError("plan_not_accessible");
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveIifymConsentPolicy();
  const now = deps.now ?? new Date();
  if (!validId(input.workspaceId) || !validId(input.clientProfileId))
    throw new IifymError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, member } = await lockedAuthorize(tx, session, {
          action: "read",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
          throw new AccessDeniedError("role_denied", "mealPlans", "read");
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
        if (!profile) throw new IifymError("plan_not_accessible");
        // Consent rows locked BEFORE any plan content is read.
        await checkRequiredConsent(tx, profile.id, registry, true);

        const plan = await lockPlan(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );

        let versions: VersionSelectRow[] = [];
        let currentId: string | null = null;
        let upcoming: VersionSelectRow | null = null;
        if (plan) {
          versions = await tx.iifymPlanVersion.findMany({
            where: { iifymPlanId: plan.id },
            orderBy: { versionSeq: "desc" },
            take: IIFYM_LIMITS.versionPageSize,
            select: VERSION_SELECT,
          });
          const current = await currentVersion(tx, plan.id, now);
          currentId = current?.id ?? null;
          upcoming = await upcomingVersion(tx, plan.id, now);
          await writeAuditEvent(tx, ctx, {
            action: "READ",
            resourceType: "iifym_plan",
            resourceId: plan.id,
            subjectClientProfileId: input.clientProfileId,
          });
        }

        // Write capability mirrors the reviewed capability pattern: the
        // role's write scope on mealPlans is `assigned`, so capability =
        // an ACTIVE assignment for THIS client. Advisory only — the
        // write transaction independently re-authorizes under locks.
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

        return {
          plan: plan
            ? {
                id: plan.id,
                title: plan.title,
                timezone: plan.timezone,
                draftRevision: plan.draft_revision,
                draft: (plan.draft as IifymDraft | null) ?? { options: [] },
              }
            : null,
          versions: versions.map((v) => ({
            id: v.id,
            versionSeq: v.versionSeq,
            effectiveDate: isoDate(v.effectiveDate),
            effectiveTimezone: v.effectiveTimezone,
            publishedAt: v.publishedAt.toISOString(),
          })),
          currentVersionId: currentId,
          upcoming: upcoming
            ? {
                versionSeq: upcoming.versionSeq,
                effectiveDate: isoDate(upcoming.effectiveDate),
                effectiveTimezone: upcoming.effectiveTimezone,
              }
            : null,
          canWrite: writeAssignment !== null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

export type OwnIifymView = {
  current: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
    payload: IifymDraft;
  } | null;
  upcoming: {
    versionSeq: number;
    effectiveDate: string;
    effectiveTimezone: string;
  } | null;
};

/**
 * Client own-scope read — the published CURRENT version plus the
 * earliest upcoming header. The draft is never selected, never returned.
 */
export async function readOwnIifymPlan(
  session: SessionLike,
  input: { workspaceId: string },
  deps: IifymDeps = {},
): Promise<OwnIifymView> {
  if (!isIifymPlansEnabled()) throw new IifymError("plan_not_accessible");
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveIifymConsentPolicy();
  const now = deps.now ?? new Date();
  if (!validId(input.workspaceId)) throw new IifymError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const userId = session?.user?.id;
        if (typeof userId !== "string" || userId.length === 0)
          throw new AccessDeniedError("unauthenticated", "mealPlans", "read");
        // Own-profile rebinding — needed before the client-scoped
        // advisory key can be derived.
        const profile = await tx.clientProfile.findFirst({
          where: { workspaceId: input.workspaceId, userId },
          select: { id: true },
        });
        if (!profile)
          throw new AccessDeniedError("not_owner", "mealPlans", "read");
        const { ctx } = await lockedAuthorize(tx, session, {
          action: "read",
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        });
        if (ctx.grantedScope !== "own")
          throw new AccessDeniedError("role_denied", "mealPlans", "read");
        await lockProfile(tx, input.workspaceId, profile.id);
        await checkRequiredConsent(tx, profile.id, registry, true);

        const plan = await lockPlan(tx, input.workspaceId, profile.id);
        if (!plan) return { current: null, upcoming: null };

        const current = await currentVersion(tx, plan.id, now);
        const upcoming = await upcomingVersion(tx, plan.id, now);

        // Detail-READ audit — written last, inside the tx.
        if (current !== null || upcoming !== null) {
          await writeAuditEvent(tx, ctx, {
            action: "READ",
            resourceType: "iifym_plan_version",
            resourceId: (current ?? upcoming)!.id,
            subjectClientProfileId: profile.id,
          });
        }

        return {
          current: current
            ? {
                versionSeq: current.versionSeq,
                effectiveDate: isoDate(current.effectiveDate),
                effectiveTimezone: current.effectiveTimezone,
                payload: (
                  await tx.iifymPlanVersion.findUniqueOrThrow({
                    where: { id: current.id },
                    select: { payload: true },
                  })
                ).payload as IifymDraft,
              }
            : null,
          upcoming: upcoming
            ? {
                versionSeq: upcoming.versionSeq,
                effectiveDate: isoDate(upcoming.effectiveDate),
                effectiveTimezone: upcoming.effectiveTimezone,
              }
            : null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
