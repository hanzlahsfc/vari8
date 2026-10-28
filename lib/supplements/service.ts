/**
 * PR-SUPP — guarded supplement-plan persistence service.
 *
 * Workflow: assigned staff (coach OR explicitly assigned owner) save the
 * whole plan; staff read with their read scope; the client reads their
 * own saved plan. Every operation:
 *
 *   serializable tx (bounded P2034/40001 retry)
 *   → advisory locks (plan + member)
 *   → in-transaction authorize(supplementPlans/*)
 *   → ACTIVE ClientAssignment FOR UPDATE (assigned scope only)
 *   → client_profile FOR UPDATE
 *   → consent rows FOR UPDATE in deterministic kind order (before ANY
 *     content access on detail reads and before ANY sensitive write)
 *   → supplement_plan FOR UPDATE → item replace → structural audit LAST.
 *
 * Contract (approved FRONTEND supplements brief): one saved plan per
 * client — no draft/active/history lifecycle; items are coach-ordered
 * rows embedding the catalogue snapshot at save time; no check-off,
 * adherence, dates, cycles, pause state, dosing math, or catalogue CRUD.
 * Missing composition stays NULL; a recorded quantity is never zero.
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
  resolveSupplementsConsentPolicy,
  type ConsentPolicyRegistry,
} from "../consent";
import { consentGatesEnabled } from "../runtime";
import {
  parseSupplementItems,
  parseSupplementPlanName,
  type SupplementItemStatusWire,
  type ValidatedSupplementItem,
} from "./model";

export type SupplementErrorCode =
  | "invalid_input"
  | "plan_not_accessible"
  | "stale_revision"
  | "consent_missing"
  | "policy_not_configured"
  | "serialization_conflict";

export class SupplementError extends Error {
  readonly code: SupplementErrorCode;
  constructor(code: SupplementErrorCode) {
    super(code);
    this.name = "SupplementError";
    this.code = code;
  }
}

export type SupplementsDeps = {
  db?: PrismaClient;
  registry?: ConsentPolicyRegistry;
  now?: Date;
};

// ── Concurrency protocol (mirrors the reviewed meal-plan service) ─────

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: 8,
    backoffBaseMs: 10,
    backoffCapMs: 50,
    onExhausted: () => new SupplementError("serialization_conflict"),
    isRetryable: isSerializationConflict,
  });
}

async function advisoryLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, key);
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
 * plan + member advisories → member FOR UPDATE → in-transaction
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
    throw new AccessDeniedError(
      "unauthenticated",
      "supplementPlans",
      request.action,
    );
  await advisoryLock(
    tx,
    `supp:${request.workspaceId}:${request.clientProfileId}`,
  );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const member = await lockMember(tx, request.workspaceId, userId);
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError(
      "role_denied",
      "supplementPlans",
      request.action,
    );
  const ctx = await authorize(
    session,
    {
      resource: "supplementPlans",
      action: request.action,
      workspaceId: request.workspaceId,
      clientProfileId: request.clientProfileId,
    },
    createPrismaAuthorizationRepo(tx),
  );
  if (ctx.workspaceMemberId !== member.id)
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      "supplementPlans",
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
    throw new AccessDeniedError("not_assigned", "supplementPlans", action);
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
    throw new AccessDeniedError("not_assigned", "supplementPlans", action);
}

async function lockProfile(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<{
  id: string;
  userId: string | null;
  archivedAt: Date | null;
} | null> {
  const rows = await tx.$queryRawUnsafe<
    { id: string; userId: string | null; archivedAt: Date | null }[]
  >(
    `SELECT id, user_id AS "userId", archived_at AS "archivedAt" FROM "client_profile"
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
  name: string;
  revision: number;
};

/** Row lock scoped to BOTH clientProfileId and workspaceId — never a
 * foreign row. */
async function lockPlan(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<LockedPlanRow | null> {
  const rows = await tx.$queryRawUnsafe<LockedPlanRow[]>(
    `SELECT id, workspace_id, client_profile_id, name, revision
     FROM "supplement_plan"
     WHERE client_profile_id = $1 AND workspace_id = $2 FOR UPDATE`,
    clientProfileId,
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
  // D19: parked consent gate — allows (and skips the consent reads) when
  // ENABLE_CONSENT_GATES is off.
  if (!consentGatesEnabled()) return;
  const required = requiredConsentsFor("supplementPlans") ?? [];
  for (const kind of required) {
    const version = registry.currentVersion(kind);
    if (version === null) throw new SupplementError("policy_not_configured");
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
      throw new SupplementError("consent_missing");
  }
}

// ── Validation + serialization helpers ────────────────────────────────

function validId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 128;
}

const DEFAULT_PLAN_NAME = "Supplement plan";

const STATUS_TO_DB = {
  "must-have": "MUST_HAVE",
  optional: "OPTIONAL",
  none: "NONE",
} as const;
const STATUS_TO_WIRE = {
  MUST_HAVE: "must-have",
  OPTIONAL: "optional",
  NONE: "none",
} as const;

export type SupplementItemView = {
  id: string;
  itemRefId: string | null;
  position: number;
  product: {
    refId: string;
    brand: string;
    name: string;
    referenceQuantity: number | null;
    quantityUnit: string | null;
    declaredAmount: number | null;
    declaredUnit: string | null;
    url: string | null;
  };
  quantity: number;
  doseUnit: string;
  timing: string;
  status: SupplementItemStatusWire;
  notes: string;
};

export type SupplementPlanView = {
  id: string;
  name: string;
  revision: number;
  savedAt: string | null;
  items: SupplementItemView[];
};

export type StaffSupplementPlanView = {
  plan: SupplementPlanView | null;
  writeCapable: boolean;
};

export type OwnSupplementPlanView = { plan: SupplementPlanView | null };

const num = (v: Prisma.Decimal | null): number | null =>
  v === null ? null : Number(v);

function itemView(row: {
  id: string;
  itemRefId: string | null;
  position: number;
  productRefId: string;
  brand: string;
  productName: string;
  referenceQuantity: Prisma.Decimal | null;
  quantityUnit: string | null;
  declaredAmount: Prisma.Decimal | null;
  declaredUnit: string | null;
  productUrl: string | null;
  quantity: Prisma.Decimal;
  doseUnit: string;
  timing: string;
  status: keyof typeof STATUS_TO_WIRE;
  notes: string;
}): SupplementItemView {
  return {
    id: row.id,
    itemRefId: row.itemRefId,
    position: row.position,
    product: {
      refId: row.productRefId,
      brand: row.brand,
      name: row.productName,
      referenceQuantity: num(row.referenceQuantity),
      quantityUnit: row.quantityUnit,
      declaredAmount: num(row.declaredAmount),
      declaredUnit: row.declaredUnit,
      url: row.productUrl,
    },
    quantity: Number(row.quantity),
    doseUnit: row.doseUnit,
    timing: row.timing,
    status: STATUS_TO_WIRE[row.status],
    notes: row.notes,
  };
}

async function readPlanView(
  tx: Prisma.TransactionClient,
  planId: string,
): Promise<SupplementPlanView | null> {
  const plan = await tx.supplementPlan.findUnique({
    where: { id: planId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!plan) return null;
  return {
    id: plan.id,
    name: plan.name,
    revision: plan.revision,
    savedAt: plan.savedAt ? plan.savedAt.toISOString() : null,
    items: plan.items.map(itemView),
  };
}

// ── Save (whole-plan replace) ─────────────────────────────────────────

export async function saveSupplementPlan(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    expectedRevision: number;
    name?: string;
    items: unknown;
  },
  deps: SupplementsDeps = {},
): Promise<{ planId: string; revision: number }> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveSupplementsConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    typeof input.expectedRevision !== "number" ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw new SupplementError("invalid_input");
  // Whole-plan validation happens up front too, so a malformed payload
  // refuses before any lock/audit work — the in-transaction write still
  // re-validates its own normalized rows.
  const name =
    input.name === undefined ? undefined : parseSupplementPlanName(input.name);
  let items: ValidatedSupplementItem[];
  try {
    items = parseSupplementItems(input.items);
  } catch {
    throw new SupplementError("invalid_input");
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
          throw new AccessDeniedError(
            "role_denied",
            "supplementPlans",
            "write",
          );
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
        if (!profile || profile.archivedAt)
          throw new SupplementError("plan_not_accessible");
        await checkRequiredConsent(tx, profile.id, registry, true);

        const now = deps.now ?? new Date();
        const memberId = ctx.workspaceMemberId as string;
        const plan = await lockPlan(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );

        const itemRows = items.map((it, position) => ({
          position,
          itemRefId: it.itemRefId,
          productRefId: it.product.refId,
          brand: it.product.brand,
          productName: it.product.name,
          referenceQuantity: it.product.referenceQuantity,
          quantityUnit: it.product.quantityUnit,
          declaredAmount: it.product.declaredAmount,
          declaredUnit: it.product.declaredUnit,
          productUrl: it.product.url,
          quantity: it.quantity,
          doseUnit: it.doseUnit,
          timing: it.timing,
          status: STATUS_TO_DB[it.status],
          notes: it.notes,
        }));

        if (!plan) {
          // First save: revision 0 declares "no plan exists yet".
          if (input.expectedRevision !== 0)
            throw new SupplementError("plan_not_accessible");
          const created = await tx.supplementPlan.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              name: name ?? DEFAULT_PLAN_NAME,
              revision: 1,
              savedByMemberId: memberId,
              savedAt: now,
              createdByMemberId: memberId,
              items: {
                create: itemRows.map((r) => ({
                  workspaceId: input.workspaceId,
                  clientProfileId: input.clientProfileId,
                  ...r,
                })),
              },
            },
            select: { id: true },
          });
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "supplement_plan",
            resourceId: created.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { versionSeq: 1, count: itemRows.length },
          });
          return { planId: created.id, revision: 1 };
        }

        if (plan.revision !== input.expectedRevision)
          throw new SupplementError("stale_revision");
        const nextRevision = plan.revision + 1;
        // Whole-plan replace: items are coach-ordered rows — delete and
        // re-create inside the same transaction so a failed save can
        // never leave a half-written plan.
        await tx.supplementPlanItem.deleteMany({ where: { planId: plan.id } });
        await tx.supplementPlanItem.createMany({
          data: itemRows.map((r) => ({
            planId: plan.id,
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
            ...r,
          })),
        });
        await tx.supplementPlan.update({
          where: { id: plan.id },
          data: {
            revision: nextRevision,
            savedByMemberId: memberId,
            savedAt: now,
            ...(name === undefined ? {} : { name }),
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "supplement_plan",
          resourceId: plan.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { versionSeq: nextRevision, count: itemRows.length },
        });
        return { planId: plan.id, revision: nextRevision };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

// ── Staff read / explicit view ───────────────────────────────────────
// Ordinary list/page reads write NO audit (issue #161 acceptance 7).
// Only the explicit staff view surface writes the structural READ.

async function staffSupplementPlanRead(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: SupplementsDeps,
  auditRead: boolean,
): Promise<StaffSupplementPlanView> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveSupplementsConsentPolicy();
  if (!validId(input.workspaceId) || !validId(input.clientProfileId))
    throw new SupplementError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const { ctx, member } = await lockedAuthorize(tx, session, {
          action: "read",
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
        });
        // Read cells: owner = workspace (no assignment needed),
        // coach/assistant = assigned.
        if (ctx.grantedScope === "assigned")
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
            "read",
          );
        else if (ctx.grantedScope !== "workspace")
          throw new AccessDeniedError("role_denied", "supplementPlans", "read");
        const profile = await lockProfile(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        if (!profile) throw new SupplementError("plan_not_accessible");
        await checkRequiredConsent(tx, profile.id, registry, true);

        // Write capability mirrors the matrix: the role's write scope is
        // `assigned`, so capability = an ACTIVE assignment for THIS
        // client. Advisory only — the write transaction independently
        // re-authorizes under locks.
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

        const plan = await lockPlan(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        if (!plan) return { plan: null, writeCapable: !!writeAssignment };

        const view = await readPlanView(tx, plan.id);
        // View-READ audit — only on the explicit view surface; written
        // last, inside the tx.
        if (auditRead)
          await writeAuditEvent(tx, ctx, {
            action: "READ",
            resourceType: "supplement_plan",
            resourceId: plan.id,
            subjectClientProfileId: input.clientProfileId,
          });
        return { plan: view, writeCapable: !!writeAssignment };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

/** Ordinary staff list/page read — returns the view, writes no audit. */
export function readStaffSupplementPlan(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: SupplementsDeps = {},
): Promise<StaffSupplementPlanView> {
  return staffSupplementPlanRead(session, input, deps, false);
}

/** Explicit staff view action — the one structural READ audit per view. */
export function viewStaffSupplementPlan(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string },
  deps: SupplementsDeps = {},
): Promise<StaffSupplementPlanView> {
  return staffSupplementPlanRead(session, input, deps, true);
}

// ── Client own read ───────────────────────────────────────────────────

export async function readOwnSupplementPlan(
  session: SessionLike,
  input: { workspaceId: string },
  deps: SupplementsDeps = {},
): Promise<OwnSupplementPlanView> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveSupplementsConsentPolicy();
  if (!validId(input.workspaceId)) throw new SupplementError("invalid_input");
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const userId = session?.user?.id;
        if (typeof userId !== "string" || userId.length === 0)
          throw new AccessDeniedError(
            "unauthenticated",
            "supplementPlans",
            "read",
          );
        // Own-profile rebinding — needed before the client-scoped
        // advisory key can be derived.
        const profile = await tx.clientProfile.findFirst({
          where: { workspaceId: input.workspaceId, userId },
          select: { id: true },
        });
        if (!profile)
          throw new AccessDeniedError("not_owner", "supplementPlans", "read");
        const { ctx } = await lockedAuthorize(tx, session, {
          action: "read",
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
        });
        if (ctx.grantedScope !== "own")
          throw new AccessDeniedError("role_denied", "supplementPlans", "read");
        await lockProfile(tx, input.workspaceId, profile.id);
        await checkRequiredConsent(tx, profile.id, registry, true);

        const plan = await lockPlan(tx, input.workspaceId, profile.id);
        if (!plan) return { plan: null };

        const view = await readPlanView(tx, plan.id);
        return { plan: view };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
