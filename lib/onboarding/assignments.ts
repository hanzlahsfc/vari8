/**
 * P-013 guarded service — staff-only onboarding-form assignment records
 * (product-decisions #31–#34). Assignment rows are client-associated
 * operational metadata: client + immutable published form version + staff
 * actor + lifecycle. No answers, drafts, consents, or submissions exist here.
 *
 * Lifecycle (decision #33): ACTIVE makes exactly one terminal transition —
 * SUPERSEDED (atomic replace), CANCELLED (manual cancel), or COMPLETED
 * (reserved for the future submission transaction; this service never writes
 * it). Only `status` and ending provenance may change; the pin, identity,
 * assignedByMemberId, and assignedAt never change. Terminal rows are never
 * reused, repinned, reactivated, or hard-deleted.
 *
 * Authorization (`onboardingAssignments`, decision #31): owner → workspace
 * read/write; coach → assigned read/write through the current ACTIVE
 * ClientAssignment; assistant → assigned read only; client/support/platform
 * denied. Every call re-authorizes inside its transaction on the tx client —
 * a demotion/revocation mid-flight cannot be honoured.
 *
 * Mutations: Serializable transaction + a per-(workspace, client, form)
 * `pg_advisory_xact_lock`, bounded P2034/P2010-40001/40P01 retry, and the
 * partial unique index as the final concurrency authority. Audit writes are
 * transaction-bound: a failed audit rolls the mutation back.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import {
  authorize,
  authorizeCollection,
  type CollectionContext,
  type SessionLike,
} from "../auth/guard";
import {
  createPrismaAuthorizationRepo,
  type PrismaLike,
} from "../workspace/access";
import { writeAuditEvent } from "../audit";
import { buildClientProfileWhere, normalizeLimit } from "../workspace/clients";
import { OnboardingAssignmentError } from "./assignments-gate";

// ── Types ──────────────────────────────────────────────────────────────────

export type AssignmentSummary = {
  id: string;
  clientName: string;
  formId: string;
  formName: string;
  /** The immutable pinned version this assignment is bound to. */
  versionSeq: number;
  /** The form's current latest published seq — a higher value means an
   * explicit Replace action can re-assign at the newer pin. */
  latestVersionSeq: number | null;
  status: "ACTIVE" | "SUPERSEDED" | "CANCELLED" | "COMPLETED";
  assignedAt: string;
  endedAt: string | null;
};

export type AssignableClient = { id: string; name: string };
export type AssignableForm = {
  id: string;
  name: string;
  latestVersionSeq: number;
};

// ── Concurrency protocol (mirrors the reviewed forms service) ──────────────

const RAW_SERIALIZATION_SQLSTATES = new Set(["40001", "40P01"]);
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
        throw new OnboardingAssignmentError("serialization_conflict");
      throw error;
    }
  }
}

/** Transaction-scoped advisory lock on the (workspace, client, form) tuple —
 * serializes create/replace/cancel for the pair before any lifecycle write. */
async function lockAssignmentTuple(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
  formId: string,
): Promise<void> {
  // $executeRawUnsafe: pg_advisory_xact_lock returns void, which $queryRaw
  // cannot deserialize.
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    `onbassign:${workspaceId}:${clientProfileId}:${formId}`,
  );
}

// ── Scoped read helpers ────────────────────────────────────────────────────

/** Where-clause for the actor's resolved collection scope: workspace scope
 * sees all; assigned scope constrains through the actor's ACTIVE
 * ClientAssignment — never caller-supplied role or assignment data. */
function assignmentWhere(
  ctx: CollectionContext,
): Prisma.OnboardingFormAssignmentWhereInput {
  const base: Prisma.OnboardingFormAssignmentWhereInput = {
    workspaceId: ctx.workspaceId,
  };
  if (ctx.grantedScope === "workspace") return base;
  return {
    ...base,
    clientProfile: {
      assignments: {
        some: {
          workspaceId: ctx.workspaceId,
          coachMemberId: ctx.workspaceMemberId,
          status: "ACTIVE",
        },
      },
    },
  };
}

const summarySelect = {
  id: true,
  status: true,
  assignedAt: true,
  endedAt: true,
  clientProfile: { select: { name: true } },
  form: {
    select: {
      id: true,
      name: true,
      versions: {
        select: { versionSeq: true },
        orderBy: { versionSeq: "desc" },
        take: 1,
      },
    },
  },
  formVersion: { select: { versionSeq: true } },
} satisfies Prisma.OnboardingFormAssignmentSelect;

type SummaryRow = Prisma.OnboardingFormAssignmentGetPayload<{
  select: typeof summarySelect;
}>;

function toSummary(row: SummaryRow): AssignmentSummary {
  return {
    id: row.id,
    clientName: row.clientProfile.name,
    formId: row.form.id,
    formName: row.form.name,
    versionSeq: row.formVersion.versionSeq,
    latestVersionSeq: row.form.versions[0]?.versionSeq ?? null,
    status: row.status,
    assignedAt: row.assignedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

// ── Eligibility (decision #31 + task contract) ─────────────────────────────

/** A client is assignable only when its profile belongs to the workspace, is
 * linked to a User, that User is ACTIVE, and the corresponding CLIENT
 * WorkspaceMember is ACTIVE in the same workspace. */
const ELIGIBLE_CLIENT_PREDICATE = (
  workspaceId: string,
): Prisma.ClientProfileWhereInput => ({
  userId: { not: null },
  user: {
    status: "ACTIVE",
    memberships: {
      some: { workspaceId, role: "CLIENT", status: "ACTIVE" },
    },
  },
});

async function requireEligibleClient(
  tx: PrismaLike,
  workspaceId: string,
  clientProfileId: string,
): Promise<void> {
  const row = await tx.clientProfile.findFirst({
    where: {
      id: clientProfileId,
      workspaceId,
      ...ELIGIBLE_CLIENT_PREDICATE(workspaceId),
    },
    select: { id: true },
  });
  if (!row) throw new OnboardingAssignmentError("client_not_eligible");
}

async function requireAssignableForm(
  tx: PrismaLike,
  workspaceId: string,
  formId: string,
): Promise<{ id: string }> {
  const latest = await tx.onboardingFormVersion.findFirst({
    where: { formId, form: { id: formId, workspaceId, status: "ACTIVE" } },
    orderBy: { versionSeq: "desc" },
    select: { id: true },
  });
  if (!latest) throw new OnboardingAssignmentError("form_not_eligible");
  return latest;
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listOnboardingAssignments(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  client: PrismaClient = defaultPrisma,
): Promise<{ items: AssignmentSummary[]; nextCursor: string | null }> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "onboardingAssignments",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const limit = normalizeLimit(input.limit);
  const rows = await client.onboardingFormAssignment.findMany({
    where: {
      ...assignmentWhere(ctx),
      ...(input.cursor !== undefined ? { id: { gt: input.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: limit + 1,
    select: summarySelect,
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map(toSummary),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  };
}

export async function listAssignableClients(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  client: PrismaClient = defaultPrisma,
): Promise<{ items: AssignableClient[]; nextCursor: string | null }> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "onboardingAssignments",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const limit = normalizeLimit(input.limit);
  const rows = await client.clientProfile.findMany({
    where: {
      ...buildClientProfileWhere(ctx.grantedScope, {
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        workspaceMemberId: ctx.workspaceMemberId,
      }),
      ...ELIGIBLE_CLIENT_PREDICATE(ctx.workspaceId),
      ...(input.cursor !== undefined ? { id: { gt: input.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: limit + 1,
    select: { id: true, name: true },
  });
  const page = rows.slice(0, limit);
  return {
    items: page,
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  };
}

export async function listAssignableForms(
  session: SessionLike,
  input: { workspaceId: string },
  client: PrismaClient = defaultPrisma,
): Promise<AssignableForm[]> {
  const ctx = await authorizeCollection(
    session,
    {
      resource: "onboardingAssignments",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(client),
  );
  const rows = await client.onboardingForm.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      status: "ACTIVE",
      versions: { some: {} },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      versions: {
        select: { versionSeq: true },
        orderBy: { versionSeq: "desc" },
        take: 1,
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    latestVersionSeq: row.versions[0]!.versionSeq,
  }));
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function createOnboardingAssignment(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string; formId: string },
  client: PrismaClient = defaultPrisma,
): Promise<{ assignmentId: string }> {
  const db = client;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await authorize(
          session,
          {
            resource: "onboardingAssignments",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        await lockAssignmentTuple(
          tx,
          input.workspaceId,
          input.clientProfileId,
          input.formId,
        );
        await requireEligibleClient(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        const latest = await requireAssignableForm(
          tx,
          input.workspaceId,
          input.formId,
        );
        const existing = await tx.onboardingFormAssignment.findFirst({
          where: {
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
            formId: input.formId,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        if (existing)
          throw new OnboardingAssignmentError("assignment_conflict");
        try {
          const row = await tx.onboardingFormAssignment.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              formId: input.formId,
              formVersionId: latest.id,
              assignedByMemberId: ctx.workspaceMemberId as string,
            },
            select: { id: true },
          });
          await writeAuditEvent(tx, ctx, {
            action: "ASSIGN",
            resourceType: "onboarding_assignment",
            resourceId: row.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { changed: true },
          });
          return { assignmentId: row.id };
        } catch (error) {
          // The partial unique index is the final authority — a concurrent
          // create committed between our check and insert lands here.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
            throw new OnboardingAssignmentError("assignment_conflict");
          throw error;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

type LockedAssignment = {
  id: string;
  status: string;
  clientProfileId: string;
  formId: string;
  formVersionId: string;
};

async function lockAssignmentRow(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  assignmentId: string,
): Promise<LockedAssignment | null> {
  const rows = await tx.$queryRawUnsafe<LockedAssignment[]>(
    `SELECT id, status, client_profile_id AS "clientProfileId",
            form_id AS "formId", form_version_id AS "formVersionId"
     FROM "onboarding_form_assignment"
     WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    assignmentId,
    workspaceId,
  );
  return rows[0] ?? null;
}

export async function replaceOnboardingAssignment(
  session: SessionLike,
  input: { workspaceId: string; assignmentId: string },
  client: PrismaClient = defaultPrisma,
): Promise<{ changed: boolean; assignmentId?: string }> {
  const db = client;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const current = await lockAssignmentRow(
          tx,
          input.workspaceId,
          input.assignmentId,
        );
        // Foreign/missing rows are indistinguishable — never reveal existence.
        if (!current)
          throw new OnboardingAssignmentError("assignment_not_accessible");
        if (current.status !== "ACTIVE")
          throw new OnboardingAssignmentError("assignment_not_active");
        const ctx = await authorize(
          session,
          {
            resource: "onboardingAssignments",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: current.clientProfileId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        await lockAssignmentTuple(
          tx,
          input.workspaceId,
          current.clientProfileId,
          current.formId,
        );
        await requireEligibleClient(
          tx,
          input.workspaceId,
          current.clientProfileId,
        );
        const latest = await requireAssignableForm(
          tx,
          input.workspaceId,
          current.formId,
        );
        // Already pinned to the latest published version — no mutation,
        // no audit (idempotent changed:false, mirroring S1-E).
        if (current.formVersionId === latest.id) return { changed: false };
        const now = new Date();
        try {
          await tx.onboardingFormAssignment.update({
            where: { id: current.id },
            data: {
              status: "SUPERSEDED",
              endedByMemberId: ctx.workspaceMemberId as string,
              endedAt: now,
            },
          });
          await writeAuditEvent(tx, ctx, {
            action: "UPDATE",
            resourceType: "onboarding_assignment",
            resourceId: current.id,
            subjectClientProfileId: current.clientProfileId,
            meta: { changed: true },
          });
          const row = await tx.onboardingFormAssignment.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: current.clientProfileId,
              formId: current.formId,
              formVersionId: latest.id,
              assignedByMemberId: ctx.workspaceMemberId as string,
            },
            select: { id: true },
          });
          await writeAuditEvent(tx, ctx, {
            action: "ASSIGN",
            resourceType: "onboarding_assignment",
            resourceId: row.id,
            subjectClientProfileId: current.clientProfileId,
            meta: { changed: true },
          });
          return { changed: true, assignmentId: row.id };
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
            throw new OnboardingAssignmentError("assignment_conflict");
          throw error;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

export async function cancelOnboardingAssignment(
  session: SessionLike,
  input: { workspaceId: string; assignmentId: string },
  client: PrismaClient = defaultPrisma,
): Promise<void> {
  const db = client;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const current = await lockAssignmentRow(
          tx,
          input.workspaceId,
          input.assignmentId,
        );
        if (!current)
          throw new OnboardingAssignmentError("assignment_not_accessible");
        // Terminal/stale/repeated requests produce no mutation and no audit.
        if (current.status !== "ACTIVE")
          throw new OnboardingAssignmentError("assignment_not_active");
        const ctx = await authorize(
          session,
          {
            resource: "onboardingAssignments",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: current.clientProfileId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        await lockAssignmentTuple(
          tx,
          input.workspaceId,
          current.clientProfileId,
          current.formId,
        );
        const now = new Date();
        await tx.onboardingFormAssignment.update({
          where: { id: current.id },
          data: {
            status: "CANCELLED",
            endedByMemberId: ctx.workspaceMemberId as string,
            endedAt: now,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "onboarding_assignment",
          resourceId: current.id,
          subjectClientProfileId: current.clientProfileId,
          meta: { changed: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
