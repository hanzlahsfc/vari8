/**
 * P-024 — staff onboarding-submission review (decisions #86–#91, the
 * binding R2 engineering contract). One workspace-terminal immutable
 * acknowledgement per submitted onboarding response — provenance only
 * (who + when); informational, never a workflow gate.
 *
 * Authorization (settled #37 direction): WORKSPACE_OWNER reads at
 * workspace scope with NO ClientAssignment dependency and cannot mark;
 * COACH reads and marks under a coherent ACTIVE ClientAssignment;
 * ASSISTANT_COACH reads assigned, cannot mark; CLIENT/SUPPORT denied;
 * PLATFORM_ADMIN denied including dual-role (deny set). The staff route
 * is `/workspace/[ws]/clients/[cp]/onboarding`.
 *
 * Transaction protocol (detail + mark) — ONE fresh Serializable tx:
 *   scoped answer-free pre-read (derives the lock tuple; foreign/missing
 *   fails BEFORE any advisory) → `onbassign:{ws}:{cp}:{formId}` advisory →
 *   `member:{ws}:{user}` advisory → workspace_member FOR UPDATE → in-tx
 *   authorize → scope branch (owner: no assignment; assigned: ACTIVE
 *   ClientAssignment re-resolve + FOR UPDATE recheck) → client_profile
 *   FOR UPDATE → onboarding_form_assignment FOR UPDATE + COMPLETED/
 *   tuple coherence → onboarding_submission FOR UPDATE + tuple
 *   coherence → consent rows FOR UPDATE in kind order → answers/read or
 *   review insert → structural audit LAST → commit.
 *
 * Idempotency: GET/list/pagination/prefetch/refresh/rerender write zero
 * audits (#89). Each committed detail POST writes exactly one
 * `READ onboarding_submission {changed:false}` audit. Each committed
 * mark writes one `CREATE onboarding_submission_review {changed:true}`.
 * A structurally valid replay returns `already_reviewed` with zero new
 * rows/audits — after re-checking current consent. unique(submission_id)
 * P2002 → the SAME protocol re-enters exactly once; a second conflict
 * exhausts to `serialization_conflict`. Audit failure rolls everything
 * back — no values, no false success.
 *
 * Reviewer identity + reviewed timestamp are bounded staff workflow
 * metadata (#91): surfaced only to actors currently authorized for that
 * client's submission; never in client/denied responses.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { writeAuditEvent } from "../audit";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import {
  hasExactActiveConsent,
  requiredConsentsFor,
  type ConsentPolicyRegistry,
} from "../consent";
import type { FieldKind, FormDefinition } from "./forms";
import {
  OnboardingSubmissionError,
  SUBMISSION_LIMITS,
} from "./submission-gate";
import { resolveOnboardingSubmissionConsentPolicy } from "./submission-consent";

// ── Concurrency protocol (mirrors the reviewed P-022/P-025-C shape) ────

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

/** P2002 — `unique(submission_id)` is the terminal concurrency authority. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
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
        throw new OnboardingSubmissionError("serialization_conflict");
      throw error;
    }
  }
}

async function advisoryLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  // $executeRawUnsafe: pg_advisory_xact_lock returns void, which $queryRaw
  // cannot deserialize. hashtextextended matches the reviewed convention.
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    key,
  );
}

/** Narrow client type for the unlocked read path (mirrors the P-023
 * `PrismaLike` — enough surface for reads + the consent FOR-UPDATE
 * helper; transactions get the real `Prisma.TransactionClient`). */
type ConsentCapable = Pick<PrismaClient, "consentRecord" | "$queryRawUnsafe">;

export type OnboardingReviewDeps = {
  db?: PrismaClient;
  registry?: ConsentPolicyRegistry;
};

const resource = "onboardingSubmissionReviews" as const;

function validId(v: unknown): v is string {
  return (
    typeof v === "string" && v.length > 0 && v.length <= SUBMISSION_LIMITS.idMax
  );
}

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
 * onbassign+member advisories → member FOR UPDATE → in-transaction
 * authorize. The advisory tuple comes ONLY from the scoped pre-read row —
 * never from caller input. Returns ctx + the locked member.
 */
async function lockedAuthorize(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  request: {
    action: "read" | "write";
    workspaceId: string;
    clientProfileId: string;
  },
  formId: string,
) {
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", resource, request.action);
  await advisoryLock(
    tx,
    `onbassign:${request.workspaceId}:${request.clientProfileId}:${formId}`,
  );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const member = await lockMember(tx, request.workspaceId, userId);
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError("role_denied", resource, request.action);
  const ctx = await authorize(
    session,
    {
      resource,
      action: request.action,
      workspaceId: request.workspaceId,
      clientProfileId: request.clientProfileId,
    },
    createPrismaAuthorizationRepo(tx),
  );
  if (ctx.workspaceMemberId !== member.id)
    throw new AccessDeniedError(
      "membership_missing_or_inactive",
      resource,
      request.action,
    );
  return { ctx, member, userId };
}

/**
 * Assigned-scope branch: re-resolve the actor's ACTIVE ClientAssignment
 * and take that exact row FOR UPDATE. Owner ("workspace" scope) never
 * touches the coaching-assignment table — the owner path legitimately
 * has no such row. `OnboardingFormAssignment` is never conflated with
 * `ClientAssignment`.
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
  if (!resolved) throw new AccessDeniedError("not_assigned", resource, action);
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
    throw new AccessDeniedError("not_assigned", resource, action);
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

/** Consent — deterministic kind order, rows FOR UPDATE when `forUpdate`.
 * Mapped via `requiredConsentsFor("onboardingSubmissionReviews")`. */
async function checkReviewConsent(
  tx: ConsentCapable,
  clientProfileId: string,
  registry: ConsentPolicyRegistry,
  forUpdate: boolean,
): Promise<void> {
  const required = requiredConsentsFor(resource) ?? [];
  for (const kind of required) {
    const version = registry.currentVersion(kind);
    if (version === null)
      throw new OnboardingSubmissionError("policy_not_configured");
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
      throw new OnboardingSubmissionError("consent_missing");
  }
}

// ── Definition projection (mirrors the P-023 pinned-definition shape) ────

type DefField = {
  fieldId: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  options: { optionId: string; label: string }[];
};

function projectDefinition(definition: unknown): DefField[] | null {
  const def = definition as Partial<FormDefinition> | null;
  if (
    typeof def !== "object" ||
    def === null ||
    typeof def.title !== "string" ||
    !Array.isArray(def.fields)
  )
    return null;
  const fields: DefField[] = [];
  for (const raw of [...def.fields].sort((a, b) => a.order - b.order)) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof raw.fieldId !== "string" ||
      raw.fieldId.length === 0 ||
      typeof raw.kind !== "string" ||
      typeof raw.label !== "string" ||
      typeof raw.required !== "boolean"
    )
      return null;
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => ({
          optionId: String((o as { optionId?: unknown }).optionId ?? ""),
          label: String((o as { label?: unknown }).label ?? ""),
        }))
      : [];
    fields.push({
      fieldId: raw.fieldId,
      kind: raw.kind as FieldKind,
      label: raw.label,
      required: raw.required,
      options,
    });
  }
  return fields.length > 0 ? fields : null;
}

// ── Staff list (unlocked, header-only, consent-checked, zero audits) ────

const REVIEW_PAGE_SIZE = 25;

export type StaffOnboardingSubmissionItem = {
  submissionId: string;
  formName: string;
  versionSeq: number;
  submittedAt: string;
  /** #91 bounded reviewer metadata — staff-authorized readers only. */
  reviewed: { byName: string; at: string } | null;
};

export type StaffOnboardingSubmissionList =
  | {
      state: "ready";
      clientName: string;
      items: StaffOnboardingSubmissionItem[];
      nextCursor: string | null;
    }
  | { state: "consent_missing" };

/** Strict cursor: `<submittedAt ISO>|<submissionId>` — bounded, validated
 * as untrusted input. */
function parseStaffCursor(raw: string): { at: Date; id: string } | null {
  const sep = raw.indexOf("|");
  if (sep <= 0) return null;
  const at = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (Number.isNaN(at.getTime())) return null;
  if (!validId(id)) return null;
  if (raw.length > 200) return null;
  return { at, id };
}

/**
 * Answer-free bounded header list. Unlocked read — the profile +
 * authorization + consent resolve up front; only structural metadata
 * (form name, pinned version seq, submittedAt, review provenance) is
 * returned. Zero answer queries, zero audits, zero writes.
 */
export async function listClientOnboardingSubmissions(
  session: SessionLike,
  input: { workspaceId: string; clientProfileId: string; cursor?: string },
  deps: OnboardingReviewDeps = {},
): Promise<StaffOnboardingSubmissionList> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveOnboardingSubmissionConsentPolicy();
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", resource, "read");
  if (!validId(input.workspaceId) || !validId(input.clientProfileId))
    throw new OnboardingSubmissionError("invalid_input");
  const cursor =
    input.cursor === undefined ? null : parseStaffCursor(input.cursor);
  if (input.cursor !== undefined && cursor === null)
    throw new OnboardingSubmissionError("invalid_input");

  const ctx = await authorize(
    session,
    {
      resource,
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    },
    createPrismaAuthorizationRepo(db),
  );
  if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
    throw new AccessDeniedError("role_denied", resource, "read");

  const profile = await db.clientProfile.findFirst({
    where: { id: input.clientProfileId, workspaceId: input.workspaceId },
    select: { name: true },
  });
  if (!profile)
    throw new AccessDeniedError("client_outside_workspace", resource, "read");

  // Consent (#85): withdrawn/unconfigured → the header list degrades to
  // the closed state — bounded metadata may remain only while consent
  // stands; here the whole staff intake surface fails closed uniformly.
  try {
    await checkReviewConsent(db, input.clientProfileId, registry, false);
  } catch (error) {
    if (error instanceof OnboardingSubmissionError)
      return { state: "consent_missing" };
    throw error;
  }

  const where: Prisma.OnboardingSubmissionWhereInput = {
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
  };
  if (cursor !== null)
    where.OR = [
      { submittedAt: { lt: cursor.at } },
      { submittedAt: cursor.at, id: { gt: cursor.id } },
    ];
  const rows = await db.onboardingSubmission.findMany({
    where,
    orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
    take: REVIEW_PAGE_SIZE + 1,
    select: {
      id: true,
      submittedAt: true,
      form: { select: { name: true } },
      formVersion: { select: { versionSeq: true } },
      review: {
        select: {
          reviewedAt: true,
          reviewedByMember: {
            select: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });
  const pageRows = rows.slice(0, REVIEW_PAGE_SIZE);
  const items: StaffOnboardingSubmissionItem[] = pageRows.map((r) => ({
    submissionId: r.id,
    formName: r.form.name,
    versionSeq: r.formVersion.versionSeq,
    submittedAt: r.submittedAt.toISOString(),
    reviewed: r.review
      ? {
          byName:
            r.review.reviewedByMember.user.name ??
            r.review.reviewedByMember.user.email,
          at: r.review.reviewedAt.toISOString(),
        }
      : null,
  }));
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    rows.length > REVIEW_PAGE_SIZE && last
      ? `${last.submittedAt.toISOString()}|${last.id}`
      : null;
  return { state: "ready", clientName: profile.name, items, nextCursor };
}

// ── Staff detail (explicit POST → one READ audit) ──────────────────────

export type StaffOnboardingAnswerRow = {
  fieldId: string;
  label: string;
  kind: FieldKind;
  display: string;
};

export type StaffOnboardingReviewDetail = {
  submissionId: string;
  formName: string;
  versionSeq: number;
  submittedAt: string;
  reviewed: { byName: string; at: string } | null;
  /** Assigned coach only — the server re-authorizes on the mark POST;
   *  this flag is a UI affordance, not enforcement (#90). */
  canMark: boolean;
  answers: StaffOnboardingAnswerRow[];
};

function renderAnswer(
  field: DefField,
  answer:
    | {
        kind: string;
        valueText: string | null;
        valueNumeric: unknown;
        valueDate: Date | null;
        valueOptionIds: unknown;
      }
    | undefined,
): string {
  if (!answer) return "";
  switch (answer.kind) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return answer.valueText ?? "";
    case "NUMBER":
      return answer.valueNumeric === null ? "" : String(answer.valueNumeric);
    case "DATE":
      return answer.valueDate
        ? answer.valueDate.toISOString().slice(0, 10)
        : "";
    case "SINGLE_CHOICE":
    case "MULTI_CHOICE": {
      const ids = new Set(
        Array.isArray(answer.valueOptionIds)
          ? (answer.valueOptionIds as unknown[]).filter(
              (x): x is string => typeof x === "string",
            )
          : [],
      );
      // Definition order, not stored canonical order.
      return field.options
        .filter((o) => ids.has(o.optionId))
        .map((o) => o.label)
        .join(", ");
    }
    default:
      return "";
  }
}

/**
 * Explicit "View details" service — the ONLY answer-bearing read.
 * Everything health-adjacent happens inside ONE fresh Serializable
 * transaction in the reviewed order; the structural READ audit commits
 * inside the same tx, last. Denial/failure yields zero answers and zero
 * audit rows.
 */
export async function readSubmissionReviewDetail(
  session: SessionLike,
  input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
  },
  deps: OnboardingReviewDeps = {},
): Promise<StaffOnboardingReviewDetail> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveOnboardingSubmissionConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.submissionId)
  )
    throw new OnboardingSubmissionError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // 1. Scoped answer-free pre-read — foreign/missing tuples fail
        // BEFORE any onbassign advisory is taken; the lock key derives
        // from the scoped row only, never caller-minted tuples.
        const pre = await tx.onboardingSubmission.findFirst({
          where: {
            id: input.submissionId,
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          select: { formId: true, assignmentId: true },
        });
        if (!pre) throw new OnboardingSubmissionError("not_available");

        // 2–4. onbassign → member advisories → member lock → authorize.
        const { ctx, member } = await lockedAuthorize(
          tx,
          session,
          {
            action: "read",
            workspaceId: input.workspaceId,
            clientProfileId: input.clientProfileId,
          },
          pre.formId,
        );
        if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
          throw new AccessDeniedError("role_denied", resource, "read");

        // 5. Assigned branch: coherent ACTIVE ClientAssignment lock.
        // Owner scope takes NO coaching-assignment dependency.
        if (ctx.grantedScope === "assigned")
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
            "read",
          );

        // 6. Locked profile.
        const profile = await lockProfile(
          tx,
          input.workspaceId,
          input.clientProfileId,
        );
        if (!profile) throw new OnboardingSubmissionError("not_available");

        // 7. Locked form assignment — the submission's intake assignment
        // must exist, be COMPLETED (terminal after submission), and be
        // coherent with the scoped tuple.
        const assignmentRows = await tx.$queryRawUnsafe<
          {
            id: string;
            status: string;
            formId: string;
            formVersionId: string;
          }[]
        >(
          `SELECT id, status, form_id AS "formId",
                  form_version_id AS "formVersionId"
           FROM "onboarding_form_assignment"
           WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
             AND form_id = $4
           FOR UPDATE`,
          pre.assignmentId,
          input.workspaceId,
          input.clientProfileId,
          pre.formId,
        );
        const assignment = assignmentRows[0];
        if (!assignment || assignment.status !== "COMPLETED")
          throw new OnboardingSubmissionError("not_available");

        // 8. Locked submission — full tuple coherence revalidated.
        const submissionRows = await tx.$queryRawUnsafe<
          { id: string; submittedAt: Date; formVersionId: string }[]
        >(
          `SELECT id, submitted_at AS "submittedAt",
                  form_version_id AS "formVersionId"
           FROM "onboarding_submission"
           WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
             AND assignment_id = $4 AND form_id = $5
             AND form_version_id = $6
           FOR UPDATE`,
          input.submissionId,
          input.workspaceId,
          input.clientProfileId,
          pre.assignmentId,
          pre.formId,
          assignment.formVersionId,
        );
        const submission = submissionRows[0];
        if (!submission) throw new OnboardingSubmissionError("not_available");

        // 9. Consent rows FOR UPDATE — BEFORE any answer read (#85) and
        // before the review provenance is surfaced.
        await checkReviewConsent(tx, input.clientProfileId, registry, true);

        // 10. Pinned immutable definition + answers (only now).
        const version = await tx.onboardingFormVersion.findUnique({
          where: { id: assignment.formVersionId },
          select: {
            formId: true,
            versionSeq: true,
            definition: true,
            form: { select: { name: true, workspaceId: true } },
          },
        });
        if (
          !version ||
          version.formId !== pre.formId ||
          version.form.workspaceId !== input.workspaceId
        )
          throw new OnboardingSubmissionError("not_available");
        const fields = projectDefinition(version.definition);
        if (!fields) throw new OnboardingSubmissionError("not_available");
        const answers = await tx.onboardingSubmissionAnswer.findMany({
          where: {
            submissionId: submission.id,
            workspaceId: input.workspaceId,
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

        // Review provenance — bounded staff metadata (#91); surfaced
        // only after consent holds, only to the authorized reader.
        const review = await tx.onboardingSubmissionReview.findFirst({
          where: { submissionId: submission.id },
          select: {
            reviewedAt: true,
            reviewedByMember: {
              select: { user: { select: { name: true, email: true } } },
            },
          },
        });

        // 11. Structural READ audit — LAST, inside the same tx (#89);
        // a failed write rolls the detail read back entirely.
        await writeAuditEvent(tx, ctx, {
          action: "READ",
          resourceType: "onboarding_submission",
          resourceId: submission.id,
          subjectClientProfileId: input.clientProfileId,
          meta: { changed: false },
        });

        return {
          submissionId: submission.id,
          formName: version.form.name,
          versionSeq: version.versionSeq,
          submittedAt: submission.submittedAt.toISOString(),
          reviewed: review
            ? {
                byName:
                  review.reviewedByMember.user.name ??
                  review.reviewedByMember.user.email,
                at: review.reviewedAt.toISOString(),
              }
            : null,
          canMark: ctx.grantedScope === "assigned" && member.role === "COACH",
          answers: fields.map((f) => ({
            fieldId: f.fieldId,
            label: f.label,
            kind: f.kind,
            display: renderAnswer(f, byField.get(f.fieldId)),
          })),
        } satisfies StaffOnboardingReviewDetail;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

// ── Staff mark (terminal immutable acknowledgement) ────────────────────

export type MarkSubmissionReviewedInput = {
  workspaceId: string;
  clientProfileId: string;
  submissionId: string;
};

export type MarkSubmissionReviewedResult = {
  status: "reviewed" | "already_reviewed";
  reviewedAt: string;
};

/**
 * #86–#87 terminal review acknowledgement: exactly one immutable row per
 * submission — reviewer + timestamp only. `write` is denied outright at
 * the matrix for owner/assistant/client/SUPPORT/platform — only an
 * assigned coach survives the scope branch. The UI's detail-first
 * sequence (#90) is an affordance; the server independently re-runs the
 * entire protocol on every mark POST.
 *
 * Idempotent replay: an existing review under a coherent tuple returns
 * `already_reviewed` with zero new rows/audits — AFTER re-checking
 * current consent (the reviewer provenance is health-adjacent; a
 * withdrawn caller gets the closed error, never the timestamp). P2002 on
 * `unique(submission_id)` → the SAME authorized protocol re-enters
 * exactly once; a second conflict exhausts to `serialization_conflict`.
 */
export async function markSubmissionReviewed(
  session: SessionLike,
  input: MarkSubmissionReviewedInput,
  deps: OnboardingReviewDeps = {},
): Promise<MarkSubmissionReviewedResult> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? resolveOnboardingSubmissionConsentPolicy();
  if (
    !validId(input.workspaceId) ||
    !validId(input.clientProfileId) ||
    !validId(input.submissionId)
  )
    throw new OnboardingSubmissionError("invalid_input");

  const attempt = (): Promise<MarkSubmissionReviewedResult> =>
    withSerializedRetry(() =>
      db.$transaction(
        async (tx) => {
          // 1. Scoped answer-free pre-read — lock tuple from the row only.
          const pre = await tx.onboardingSubmission.findFirst({
            where: {
              id: input.submissionId,
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            select: { formId: true, assignmentId: true },
          });
          if (!pre) throw new OnboardingSubmissionError("not_available");

          // 2–4. Advisories → member lock → authorize. write: only an
          // assigned coach survives — owner/assistant denied at the matrix.
          const { ctx, member } = await lockedAuthorize(
            tx,
            session,
            {
              action: "write",
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
            },
            pre.formId,
          );
          if (ctx.grantedScope !== "assigned")
            throw new AccessDeniedError("role_denied", resource, "write");

          // 5. Authoritative ACTIVE ClientAssignment re-resolve + lock.
          await lockAssignmentForScope(
            tx,
            input.workspaceId,
            input.clientProfileId,
            member.id,
            "write",
          );

          // 6–8. Locked profile → COMPLETED form assignment → submission.
          const profile = await lockProfile(
            tx,
            input.workspaceId,
            input.clientProfileId,
          );
          if (!profile) throw new OnboardingSubmissionError("not_available");
          const assignmentRows = await tx.$queryRawUnsafe<
            { id: string; status: string }[]
          >(
            `SELECT id, status
             FROM "onboarding_form_assignment"
             WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
               AND form_id = $4
             FOR UPDATE`,
            pre.assignmentId,
            input.workspaceId,
            input.clientProfileId,
            pre.formId,
          );
          const assignment = assignmentRows[0];
          if (!assignment || assignment.status !== "COMPLETED")
            throw new OnboardingSubmissionError("not_available");
          const submissionRows = await tx.$queryRawUnsafe<{ id: string }[]>(
            `SELECT id FROM "onboarding_submission"
             WHERE id = $1 AND workspace_id = $2 AND client_profile_id = $3
               AND assignment_id = $4 AND form_id = $5
             FOR UPDATE`,
            input.submissionId,
            input.workspaceId,
            input.clientProfileId,
            pre.assignmentId,
            pre.formId,
          );
          const submission = submissionRows[0];
          if (!submission) throw new OnboardingSubmissionError("not_available");

          // 9. Idempotent replay BEFORE the write — after re-checking
          // CURRENT consent (#85): the durable reviewed state is reviewer
          // provenance; a withdrawn caller gets the closed error, never
          // the timestamp. Zero new rows, zero audits.
          const existing = await tx.onboardingSubmissionReview.findFirst({
            where: { submissionId: submission.id },
            select: { reviewedAt: true },
          });
          if (existing) {
            await checkReviewConsent(
              tx,
              input.clientProfileId,
              registry,
              false,
            );
            return {
              status: "already_reviewed",
              reviewedAt: existing.reviewedAt.toISOString(),
            } satisfies MarkSubmissionReviewedResult;
          }

          // 10. Consent FOR UPDATE — the acknowledgement itself is
          // health-adjacent provenance (#85: writes fail closed after
          // withdrawal).
          await checkReviewConsent(tx, input.clientProfileId, registry, true);

          // 11. Terminal immutable row — submission/answers untouched.
          const review = await tx.onboardingSubmissionReview.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: input.clientProfileId,
              submissionId: submission.id,
              reviewedByMemberId: member.id,
            },
            select: { id: true, reviewedAt: true },
          });

          // 12. Audit LAST — a failed audit rolls the review back.
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "onboarding_submission_review",
            resourceId: review.id,
            subjectClientProfileId: input.clientProfileId,
            meta: { changed: true },
          });
          return {
            status: "reviewed",
            reviewedAt: review.reviewedAt.toISOString(),
          } satisfies MarkSubmissionReviewedResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

  try {
    return await attempt();
  } catch (error) {
    // unique(submission_id) P2002 — the concurrent mark won. Re-enter the
    // SAME fully authorized protocol exactly once; the replay lookup then
    // returns already_reviewed. A second conflict exhausts closed.
    if (!isUniqueViolation(error)) throw error;
    try {
      return await attempt();
    } catch (second) {
      if (isUniqueViolation(second))
        throw new OnboardingSubmissionError("serialization_conflict");
      throw second;
    }
  }
}
