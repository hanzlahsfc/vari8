import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import {
  AccessDeniedError,
  authorize,
  authorizeCollection,
  type SessionLike,
} from "../auth/guard";
import {
  createPrismaAuthorizationRepo,
  type PrismaLike,
} from "../workspace/access";
import { writeAuditEvent } from "../audit";
import {
  createStaticConsentPolicy,
  hasExactActiveConsent,
  requiredConsentsFor,
  unconfiguredConsentPolicy,
  type ConsentPolicyRegistry,
} from "../consent";
import {
  OnboardingSubmissionError,
  SUBMISSION_LIMITS,
} from "./submission-gate";
import type { FieldKind, FormDefinition } from "./forms";

export { OnboardingSubmissionError } from "./submission-gate";

/**
 * P-023 — client onboarding submission services (decisions #82–#85, R3).
 *
 * Submit: one Serializable transaction in the reviewed order —
 *   own-profile resolve → assignment pre-read scoped to the caller's OWN
 *   profile (foreign/missing IDs fail non-disclosingly before any
 *   foreign advisory is taken) → advisory `onbassign:{ws}:{client}:{form}`
 *   → advisory `member:{ws}:{user}` → workspace_member FOR UPDATE →
 *   in-tx `authorize(onboardingSubmissions/write/own)` → owned existing-
 *   submission lookup (idempotency, BEFORE the ACTIVE check) → assignment
 *   FOR UPDATE revalidation → client_profile FOR UPDATE → consent rows
 *   FOR UPDATE in kind order → pinned immutable definition → canonicalize
 *   → submission+answers insert → assignment COMPLETED + provenance →
 *   audit LAST → commit.
 *
 * Decision #82: COMPLETED is terminal; no resubmission. `already_submitted`
 * replay returns the original durable submission with zero writes and
 * zero second audit — replay answer content is never persisted.
 * Decision #83: dev/test-only BASE_CONSENTS mapping; production registry
 * stays unconfigured → fail-closed.
 * Decision #85: writes and detailed answer reads fail closed after
 * withdrawal; bounded list metadata may remain.
 */

// ── Development consent policy (#83, dev/test-only) ───────────────────────

export const ONBOARDING_SUBMISSION_DEV_CONSENT = {
  PRIVACY_NOTICE: "onboarding-submission-dev-privacy-v1",
  HEALTH_DATA: "onboarding-submission-dev-health-v1",
} as const;

export function onboardingSubmissionConsentRegistry(
  flagEnabled: boolean,
): ConsentPolicyRegistry {
  return flagEnabled
    ? createStaticConsentPolicy({
        PRIVACY_NOTICE: ONBOARDING_SUBMISSION_DEV_CONSENT.PRIVACY_NOTICE,
        HEALTH_DATA: ONBOARDING_SUBMISSION_DEV_CONSENT.HEALTH_DATA,
      })
    : unconfiguredConsentPolicy;
}

export type OnboardingSubmissionDeps = {
  db?: PrismaClient;
  registry?: ConsentPolicyRegistry;
};

// ── Concurrency protocol (mirrors the reviewed DailyEntry service) ────────

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

// ── Wire format (R3 §11 — array of {fieldId, value} records) ──────────────

export type RawAnswerEntry = { fieldId: string; value: unknown };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Bounded syntactic parse — usable BEFORE the transaction. UTF-8 byte cap
 * first, then JSON shape: an array of ≤100 plain objects with exactly the
 * keys {fieldId, value}; fieldId string ≤128; duplicate fieldIds rejected
 * here, before any canonicalization. No answer content is ever reflected
 * in the error.
 */
export function parseAnswersJson(raw: unknown): RawAnswerEntry[] {
  if (typeof raw !== "string")
    throw new OnboardingSubmissionError("invalid_input");
  if (Buffer.byteLength(raw, "utf8") > SUBMISSION_LIMITS.answersJsonMaxBytes)
    throw new OnboardingSubmissionError("invalid_input");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OnboardingSubmissionError("invalid_input");
  }
  if (!Array.isArray(parsed) || parsed.length > SUBMISSION_LIMITS.maxAnswers)
    throw new OnboardingSubmissionError("invalid_input");
  const seen = new Set<string>();
  const out: RawAnswerEntry[] = [];
  for (const entry of parsed) {
    if (!isPlainObject(entry))
      throw new OnboardingSubmissionError("invalid_input");
    const keys = Object.keys(entry);
    if (
      keys.length !== 2 ||
      !(entry as Record<string, unknown>).hasOwnProperty("fieldId") ||
      !(entry as Record<string, unknown>).hasOwnProperty("value")
    )
      throw new OnboardingSubmissionError("invalid_input");
    const fieldId = entry.fieldId;
    if (
      typeof fieldId !== "string" ||
      fieldId.length === 0 ||
      fieldId.length > SUBMISSION_LIMITS.idMax
    )
      throw new OnboardingSubmissionError("invalid_input");
    if (seen.has(fieldId)) throw new OnboardingSubmissionError("invalid_input");
    seen.add(fieldId);
    out.push({ fieldId, value: entry.value });
  }
  return out;
}

// ── Definition projection + canonicalization (R3 §12) ─────────────────────

type DefField = {
  fieldId: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  helpText: string | null;
  options: { optionId: string; label: string }[];
};

/** Defensive structural projection of the pinned immutable definition —
 * it was validated at publish, but a malformed payload degrades to
 * `not_available`, never a partial fill. */
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
      helpText: typeof raw.helpText === "string" ? raw.helpText : null,
      options,
    });
  }
  return fields.length > 0 ? fields : null;
}

export type CanonicalAnswer = {
  fieldId: string;
  kind:
    | "SHORT_TEXT"
    | "LONG_TEXT"
    | "NUMBER"
    | "DATE"
    | "SINGLE_CHOICE"
    | "MULTI_CHOICE";
  valueText: string | null;
  valueNumeric: string | null;
  valueDate: string | null;
  valueOptionIds: string[] | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function strictDate(raw: string): boolean {
  if (!DATE_RE.test(raw)) return false;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    return false;
  return raw >= SUBMISSION_LIMITS.dateMin && raw <= SUBMISSION_LIMITS.dateMax;
}

function isEmptyValue(kind: FieldKind, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (kind === "multiChoice") return Array.isArray(value) && value.length === 0;
  return typeof value === "string" && value.trim().length === 0;
}

/**
 * Canonicalize raw wire answers against the pinned immutable definition.
 * Unknown fields, retired/unknown options, wrong value shapes, bound
 * violations, and missing required answers all throw `invalid_input`.
 * Optional-empty answers are omitted; accepted answers return in
 * definition order. Text is NFC-normalized; multi-choice is deduplicated
 * and lexicographically sorted.
 */
export function canonicalizeAnswers(
  definition: unknown,
  raw: readonly RawAnswerEntry[],
): CanonicalAnswer[] {
  const fields = projectDefinition(definition);
  if (!fields) throw new OnboardingSubmissionError("not_available");
  const byField = new Map<string, unknown>();
  const known = new Set<string>();
  for (const f of fields) known.add(f.fieldId);
  for (const e of raw) {
    if (!known.has(e.fieldId))
      throw new OnboardingSubmissionError("invalid_input");
    byField.set(e.fieldId, e.value);
  }
  const out: CanonicalAnswer[] = [];
  for (const f of fields) {
    const present = byField.has(f.fieldId);
    const value = byField.get(f.fieldId);
    if (!present || isEmptyValue(f.kind, value)) {
      if (f.required) throw new OnboardingSubmissionError("invalid_input");
      continue; // optional-empty omitted — no row stored
    }
    out.push(canonicalizeField(f, value));
  }
  return out;
}

function canonicalizeField(f: DefField, value: unknown): CanonicalAnswer {
  const base = {
    fieldId: f.fieldId,
    valueText: null,
    valueNumeric: null,
    valueDate: null,
    valueOptionIds: null,
  };
  switch (f.kind) {
    case "shortText":
    case "longText": {
      if (typeof value !== "string")
        throw new OnboardingSubmissionError("invalid_input");
      const text = value.normalize("NFC");
      const maxChars =
        f.kind === "shortText"
          ? SUBMISSION_LIMITS.shortTextMaxChars
          : SUBMISSION_LIMITS.longTextMaxChars;
      const maxBytes =
        f.kind === "shortText"
          ? SUBMISSION_LIMITS.shortTextMaxBytes
          : SUBMISSION_LIMITS.longTextMaxBytes;
      if (
        text.length < 1 ||
        text.length > maxChars ||
        Buffer.byteLength(text, "utf8") > maxBytes
      )
        throw new OnboardingSubmissionError("invalid_input");
      return {
        ...base,
        kind: f.kind === "shortText" ? "SHORT_TEXT" : "LONG_TEXT",
        valueText: text,
      };
    }
    case "number": {
      if (
        typeof value !== "string" ||
        !SUBMISSION_LIMITS.numberPattern.test(value)
      )
        throw new OnboardingSubmissionError("invalid_input");
      return { ...base, kind: "NUMBER", valueNumeric: value };
    }
    case "date": {
      if (typeof value !== "string" || !strictDate(value))
        throw new OnboardingSubmissionError("invalid_input");
      return { ...base, kind: "DATE", valueDate: value };
    }
    case "singleChoice": {
      if (typeof value !== "string" || value.length === 0)
        throw new OnboardingSubmissionError("invalid_input");
      if (value.length > SUBMISSION_LIMITS.idMax)
        throw new OnboardingSubmissionError("invalid_input");
      if (!f.options.some((o) => o.optionId === value))
        throw new OnboardingSubmissionError("invalid_input");
      return { ...base, kind: "SINGLE_CHOICE", valueOptionIds: [value] };
    }
    case "multiChoice": {
      if (!Array.isArray(value))
        throw new OnboardingSubmissionError("invalid_input");
      if (
        value.length < 1 ||
        value.length > SUBMISSION_LIMITS.multiMaxSelections
      )
        throw new OnboardingSubmissionError("invalid_input");
      const valid = new Set(f.options.map((o) => o.optionId));
      const cleaned: string[] = [];
      const seen = new Set<string>();
      for (const raw of value) {
        if (typeof raw !== "string" || !valid.has(raw))
          throw new OnboardingSubmissionError("invalid_input");
        if (!seen.has(raw)) {
          seen.add(raw);
          cleaned.push(raw);
        }
      }
      const sorted = [...cleaned].sort((a, b) => (a < b ? -1 : 1));
      if (
        Buffer.byteLength(JSON.stringify(sorted), "utf8") >
        SUBMISSION_LIMITS.multiJsonMaxBytes
      )
        throw new OnboardingSubmissionError("invalid_input");
      return { ...base, kind: "MULTI_CHOICE", valueOptionIds: sorted };
    }
    default:
      throw new OnboardingSubmissionError("invalid_input");
  }
}

// ── Consent (deterministic kind order, rows FOR UPDATE) ───────────────────

async function checkRequiredConsent(
  tx: PrismaLike,
  clientProfileId: string,
  registry: ConsentPolicyRegistry,
  forUpdate: boolean,
): Promise<void> {
  const required = requiredConsentsFor("onboardingSubmissions") ?? [];
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

// ── Submit (R3 §13 — reviewed transaction order) ──────────────────────────

export type SubmitOnboardingInput = {
  workspaceId: string;
  assignmentId: string;
  answersJson: string;
};

export type SubmitOnboardingResult =
  | { status: "submitted"; submissionId: string }
  | { status: "already_submitted"; submissionId: string };

export async function submitOnboardingAssignment(
  session: SessionLike,
  input: SubmitOnboardingInput,
  deps: OnboardingSubmissionDeps = {},
): Promise<SubmitOnboardingResult> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? unconfiguredConsentPolicy;
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError(
      "unauthenticated",
      "onboardingSubmissions",
      "write",
    );
  if (
    typeof input.workspaceId !== "string" ||
    input.workspaceId.length === 0 ||
    typeof input.assignmentId !== "string" ||
    input.assignmentId.length === 0 ||
    input.assignmentId.length > SUBMISSION_LIMITS.idMax
  )
    throw new OnboardingSubmissionError("invalid_input");
  // Bounded syntactic parse — BEFORE the transaction; malformed/oversized
  // replays are rejected here, never reaching the idempotency shortcut.
  const rawAnswers = parseAnswersJson(input.answersJson);

  try {
    return await withSerializedRetry(() =>
      db.$transaction(
        async (tx) => {
          // 1. Caller's own ClientProfile — resolved server-side from
          // (workspace, actor), never from input.
          const profile = await tx.clientProfile.findFirst({
            where: { workspaceId: input.workspaceId, userId },
            select: { id: true },
          });
          if (!profile)
            throw new AccessDeniedError(
              "not_owner",
              "onboardingSubmissions",
              "write",
            );

          // 2. Scoped pre-read — assignment scoped to workspace + the
          // caller's OWN profile. Missing/foreign IDs fail identically
          // BEFORE any foreign `onbassign` advisory is acquired.
          const pre = await tx.onboardingFormAssignment.findFirst({
            where: {
              id: input.assignmentId,
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
            },
            select: { formId: true },
          });
          if (!pre) throw new OnboardingSubmissionError("not_available");

          // 3–4. Advisories — shared assignment namespace first, then the
          // stable member key (the reviewed cross-service order).
          await advisoryLock(
            tx,
            `onbassign:${input.workspaceId}:${profile.id}:${pre.formId}`,
          );
          await advisoryLock(tx, `member:${input.workspaceId}:${userId}`);

          // 5. Locked WorkspaceMember — authoritative actor state.
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
            throw new AccessDeniedError(
              "role_denied",
              "onboardingSubmissions",
              "write",
            );

          // 6. In-transaction authorization — the authoritative decision,
          // taken only AFTER the member row is locked.
          const ctx = await authorize(
            session,
            {
              resource: "onboardingSubmissions",
              action: "write",
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
            },
            createPrismaAuthorizationRepo(tx),
          );
          if (ctx.grantedScope !== "own")
            throw new AccessDeniedError(
              "role_denied",
              "onboardingSubmissions",
              "write",
            );

          // 7. Idempotency — the owned existing-submission lookup runs
          // BEFORE the ACTIVE check so every structurally valid replay
          // returns the original durable submission with zero writes.
          const existing = await tx.onboardingSubmission.findFirst({
            where: {
              assignmentId: input.assignmentId,
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
            },
            select: { id: true },
          });
          if (existing)
            return {
              status: "already_submitted",
              submissionId: existing.id,
            } satisfies SubmitOnboardingResult;

          // 8. Locked assignment row — revalidate workspace, ownership,
          // ACTIVE state, and the pinned tuple (a cancel/replace between
          // the pre-read and now is detected here).
          const assignRows = await tx.$queryRawUnsafe<
            {
              id: string;
              status: string;
              clientProfileId: string;
              formId: string;
              formVersionId: string;
            }[]
          >(
            `SELECT id, status,
                    client_profile_id AS "clientProfileId",
                    form_id AS "formId",
                    form_version_id AS "formVersionId"
             FROM "onboarding_form_assignment"
             WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
            input.assignmentId,
            input.workspaceId,
          );
          const assignment = assignRows[0];
          if (
            !assignment ||
            assignment.clientProfileId !== profile.id ||
            assignment.formId !== pre.formId ||
            assignment.status !== "ACTIVE"
          )
            throw new OnboardingSubmissionError("not_available");

          // 9. Locked ClientProfile — coherence (exists, same workspace,
          // user link intact).
          const profileRows = await tx.$queryRawUnsafe<
            { id: string; userId: string | null }[]
          >(
            `SELECT id, user_id AS "userId" FROM "client_profile"
             WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
            profile.id,
            input.workspaceId,
          );
          if (!profileRows[0] || profileRows[0].userId !== userId)
            throw new OnboardingSubmissionError("not_available");

          // 10. Consent — deterministic kind order, exact versions.
          await checkRequiredConsent(tx, profile.id, registry, true);

          // 11. Immutable pinned version — validate/canonicalize against
          // IT, never the form's current draft or a later publication.
          const version = await tx.onboardingFormVersion.findUnique({
            where: { id: assignment.formVersionId },
            select: { id: true, formId: true, definition: true },
          });
          if (!version || version.formId !== assignment.formId)
            throw new OnboardingSubmissionError("not_available");
          const answers = canonicalizeAnswers(version.definition, rawAnswers);

          // 12–13. Submission + answers → assignment COMPLETED with
          // completion provenance (#82: terminal; endedByMemberId here
          // means "completed by" — the submitting client's member row).
          const now = new Date();
          const submission = await tx.onboardingSubmission.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
              formId: assignment.formId,
              formVersionId: version.id,
              assignmentId: assignment.id,
              submittedByUserId: userId,
              submittedByMemberId: member.id,
              submittedAt: now,
            },
            select: { id: true },
          });
          for (const answer of answers) {
            await tx.onboardingSubmissionAnswer.create({
              data: {
                submissionId: submission.id,
                workspaceId: input.workspaceId,
                fieldId: answer.fieldId,
                kind: answer.kind,
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
          await tx.onboardingFormAssignment.update({
            where: { id: assignment.id },
            data: {
              status: "COMPLETED",
              endedAt: now,
              endedByMemberId: member.id,
            },
          });

          // 14. Audit LAST — a failed audit write rolls back the
          // submission, answers, and completion together.
          await writeAuditEvent(tx, ctx, {
            action: "CREATE",
            resourceType: "onboarding_submission",
            resourceId: submission.id,
            subjectClientProfileId: profile.id,
            meta: { changed: true },
          });
          return {
            status: "submitted",
            submissionId: submission.id,
          } satisfies SubmitOnboardingResult;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    // unique(assignmentId) is the final double-submit backstop: a P2002
    // aborts the failed transaction; the durable winner is looked up in a
    // fresh read and replayed as `already_submitted`.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const profile = await db.clientProfile.findFirst({
        where: { workspaceId: input.workspaceId, userId },
        select: { id: true },
      });
      const existing = profile
        ? await db.onboardingSubmission.findFirst({
            where: {
              assignmentId: input.assignmentId,
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
            },
            select: { id: true },
          })
        : null;
      if (existing)
        return { status: "already_submitted", submissionId: existing.id };
    }
    throw error;
  }
}

// ── Read surface (own list + own detail) ──────────────────────────────────

export type OwnAssignmentItem = {
  assignmentId: string;
  formName: string;
  status: "ACTIVE" | "SUPERSEDED" | "CANCELLED" | "COMPLETED";
  assignedAt: string;
  /** Bounded operational metadata only (#85) — never answer content. */
  submittedAt: string | null;
};

/**
 * Own-scope assignment discovery list. Membership/profile resolve from the
 * session; `own` scope is required, so staff roles deny at the collection
 * guard. Bounded operational metadata only — form name, status, dates.
 * A client member without a linked profile sees an empty list.
 */
export async function listOwnOnboardingAssignments(
  session: SessionLike,
  input: { workspaceId: string },
  deps: OnboardingSubmissionDeps = {},
): Promise<{ items: OwnAssignmentItem[] }> {
  const db = deps.db ?? defaultPrisma;
  const ctx = await authorizeCollection(
    session,
    {
      resource: "onboardingSubmissions",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  if (ctx.grantedScope !== "own")
    throw new AccessDeniedError("role_denied", "onboardingSubmissions", "read");
  const profile = await db.clientProfile.findFirst({
    where: { workspaceId: input.workspaceId, userId: ctx.userId },
    select: { id: true },
  });
  if (!profile) return { items: [] };
  const rows = await db.onboardingFormAssignment.findMany({
    where: { workspaceId: input.workspaceId, clientProfileId: profile.id },
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      assignedAt: true,
      form: { select: { name: true } },
      submission: { select: { submittedAt: true } },
    },
  });
  return {
    items: rows.map((r) => ({
      assignmentId: r.id,
      formName: r.form.name,
      status: r.status,
      assignedAt: r.assignedAt.toISOString(),
      submittedAt: r.submission?.submittedAt.toISOString() ?? null,
    })),
  };
}

export type OwnFormField = {
  fieldId: string;
  kind: FieldKind;
  label: string;
  helpText: string | null;
  required: boolean;
  options: { optionId: string; label: string }[];
};

export type OwnSubmittedAnswer = {
  fieldId: string;
  label: string;
  display: string;
};

export type OwnOnboardingDetail =
  | {
      state: "ready";
      assignmentId: string;
      title: string;
      fields: OwnFormField[];
    }
  | {
      state: "submitted";
      assignmentId: string;
      title: string;
      submittedAt: string;
      answers: OwnSubmittedAnswer[];
    }
  | { state: "unavailable" };

/** Render an answer through its pinned definition for the client's own
 * read-only submitted view. Display strings only. */
function renderSubmittedAnswers(
  stored: readonly {
    fieldId: string;
    kind: string;
    valueText: string | null;
    valueNumeric: unknown;
    valueDate: Date | null;
    valueOptionIds: unknown;
  }[],
  fields: readonly DefField[],
): OwnSubmittedAnswer[] {
  const byId = new Map(fields.map((f) => [f.fieldId, f]));
  const out: OwnSubmittedAnswer[] = [];
  for (const a of stored) {
    const f = byId.get(a.fieldId);
    if (!f) continue;
    let display = "";
    switch (a.kind) {
      case "SHORT_TEXT":
      case "LONG_TEXT":
        display = a.valueText ?? "";
        break;
      case "NUMBER":
        display = a.valueNumeric === null ? "" : String(a.valueNumeric);
        break;
      case "DATE":
        display = a.valueDate ? a.valueDate.toISOString().slice(0, 10) : "";
        break;
      case "SINGLE_CHOICE":
      case "MULTI_CHOICE": {
        const ids = new Set(
          Array.isArray(a.valueOptionIds)
            ? (a.valueOptionIds as unknown[]).filter(
                (x): x is string => typeof x === "string",
              )
            : [],
        );
        // Definition order, not stored canonical order.
        display = f.options
          .filter((o) => ids.has(o.optionId))
          .map((o) => o.label)
          .join(", ");
        break;
      }
      default:
        continue;
    }
    out.push({ fieldId: a.fieldId, label: f.label, display });
  }
  return out;
}

/**
 * Own detail read — fillable form for an ACTIVE assignment, or the
 * read-only submitted view while consent remains active (#85 fails closed
 * on detail reads after withdrawal). Missing, foreign, terminal-without-
 * submission, denied, and consent-missing targets share the one
 * non-disclosing `unavailable` state. Unlocked reads — display only;
 * the submit path re-validates everything under locks.
 */
export async function loadOwnOnboardingDetail(
  session: SessionLike,
  input: { workspaceId: string; assignmentId: string },
  deps: OnboardingSubmissionDeps = {},
): Promise<OwnOnboardingDetail> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? unconfiguredConsentPolicy;
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError(
      "unauthenticated",
      "onboardingSubmissions",
      "read",
    );
  if (
    typeof input.workspaceId !== "string" ||
    input.workspaceId.length === 0 ||
    input.workspaceId.length > SUBMISSION_LIMITS.idMax ||
    typeof input.assignmentId !== "string" ||
    input.assignmentId.length === 0 ||
    input.assignmentId.length > SUBMISSION_LIMITS.idMax
  )
    throw new OnboardingSubmissionError("invalid_input");

  const profile = await db.clientProfile.findFirst({
    where: { workspaceId: input.workspaceId, userId },
    select: { id: true },
  });
  if (!profile) return { state: "unavailable" };
  let ctx;
  try {
    ctx = await authorize(
      session,
      {
        resource: "onboardingSubmissions",
        action: "read",
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
      createPrismaAuthorizationRepo(db),
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) return { state: "unavailable" };
    throw error;
  }
  if (ctx.grantedScope !== "own") return { state: "unavailable" };
  const member = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: input.workspaceId, userId },
    },
    select: { role: true, status: true },
  });
  if (!member || member.status !== "ACTIVE" || member.role !== "CLIENT")
    return { state: "unavailable" };

  const assignment = await db.onboardingFormAssignment.findFirst({
    where: {
      id: input.assignmentId,
      workspaceId: input.workspaceId,
      clientProfileId: profile.id,
    },
    select: {
      status: true,
      formVersion: {
        select: {
          id: true,
          definition: true,
          form: { select: { name: true } },
        },
      },
      submission: {
        select: {
          submittedAt: true,
          answers: {
            select: {
              fieldId: true,
              kind: true,
              valueText: true,
              valueNumeric: true,
              valueDate: true,
              valueOptionIds: true,
            },
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });
  if (!assignment) return { state: "unavailable" };
  const fields = projectDefinition(assignment.formVersion.definition);
  if (!fields) return { state: "unavailable" };
  const title = assignment.formVersion.form.name;

  // Consent gates BOTH surfaces fail-closed (#85): fill and own-answer
  // detail are unavailable after withdrawal or when unconfigured.
  try {
    await checkRequiredConsent(db, profile.id, registry, false);
  } catch (error) {
    if (error instanceof OnboardingSubmissionError)
      return { state: "unavailable" };
    throw error;
  }

  const submission = assignment.submission;
  if (submission) {
    return {
      state: "submitted",
      assignmentId: input.assignmentId,
      title,
      submittedAt: submission.submittedAt.toISOString(),
      answers: renderSubmittedAnswers(submission.answers, fields),
    };
  }
  if (assignment.status !== "ACTIVE") return { state: "unavailable" };
  return {
    state: "ready",
    assignmentId: input.assignmentId,
    title,
    fields: fields.map((f) => ({
      fieldId: f.fieldId,
      kind: f.kind,
      label: f.label,
      helpText: f.helpText,
      required: f.required,
      options: f.options,
    })),
  };
}
