/**
 * P-008 onboarding form definitions — pure validator module (slices 1D).
 *
 * Contains the definition contract: types, limits, the closed kind union and
 * `validateDefinition` (shape/bounds + current-draft ID trust + publish
 * completeness). Persistence: `listOnboardingForms`, `getOnboardingForm`,
 * `createOnboardingForm` (slice 2), `saveOnboardingFormDraft` and
 * `openOnboardingDraft` (slice 3 — serializable tx + workspace-scoped FOR
 * UPDATE row lock, bounded P2034/P2010-40001 retry), `publishOnboardingForm`
 * and `archiveOnboardingForm` (slice 4 — immutable versions, origin-revision
 * idempotency, truthful audit markers) are implemented.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  prisma as defaultPrisma,
  withSerializedRetry as sharedWithSerializedRetry,
} from "../db";
import { authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";

export type OnboardingFormErrorCode =
  | "invalid_input"
  | "form_not_accessible"
  | "form_archived"
  | "no_open_draft"
  | "stale_revision"
  | "forbidden_field_id"
  | "publish_incomplete"
  | "serialization_conflict";

export class OnboardingFormError extends Error {
  constructor(readonly code: OnboardingFormErrorCode) {
    super(code);
    this.name = "OnboardingFormError";
  }
}

export const FIELD_KINDS = [
  "shortText",
  "longText",
  "number",
  "date",
  "singleChoice",
  "multiChoice",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const FORM_LIMITS = {
  maxFields: 100,
  minPublishFields: 1,
  labelMax: 200,
  helpTextMax: 500,
  minOptions: 1,
  maxOptions: 50,
  optionLabelMax: 200,
  nameMax: 120,
  definitionMaxBytes: 64 * 1024,
} as const;

export type FieldOption = { optionId: string; label: string };
export type FormField = {
  fieldId: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  order: number;
  helpText?: string;
  options?: FieldOption[];
};
export type FormDefinition = { title: string; fields: FormField[] };

export type FormSummary = {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  draftRevision: number;
  hasDraft: boolean;
  latestVersionSeq: number | null;
  updatedAt: string;
};

export type FormDetail = {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  draftRevision: number;
  draft: FormDefinition | null;
  versions: Array<{
    versionSeq: number;
    publishedAt: string;
    definition: FormDefinition;
  }>;
};

const CHOICE_KINDS: ReadonlySet<FieldKind> = new Set([
  "singleChoice",
  "multiChoice",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isId(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9_-]{1,64}$/i.test(v);
}

const mintFieldId = () => `f_${crypto.randomUUID()}`;
const mintOptionId = () => `o_${crypto.randomUUID()}`;

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") throw new OnboardingFormError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > max)
    throw new OnboardingFormError("invalid_input");
  return trimmed;
}

/**
 * Structural validation + normalization of a definition payload. Presented
 * `fieldId`/`optionId` values are trusted only when already bound in
 * `knownIds` (the CURRENT draft's IDs — retired IDs from earlier drafts or
 * historical versions are never resurrected); absent IDs get server-minted
 * ones. Field kind is immutable per fieldId.
 */
export function validateDefinition(
  input: unknown,
  knownIds: {
    fieldIds: Map<string, FieldKind>;
    optionIds: Map<string, string>;
  },
  opts: { forPublish: boolean },
): FormDefinition {
  if (!isPlainObject(input)) throw new OnboardingFormError("invalid_input");
  const title = cleanText(input.title, FORM_LIMITS.labelMax);
  const rawFields = input.fields;
  if (!Array.isArray(rawFields)) throw new OnboardingFormError("invalid_input");
  if (
    rawFields.length > FORM_LIMITS.maxFields ||
    (opts.forPublish && rawFields.length < FORM_LIMITS.minPublishFields)
  )
    throw new OnboardingFormError(
      opts.forPublish ? "publish_incomplete" : "invalid_input",
    );

  const orders = new Set<number>();
  const seenFieldIds = new Set<string>();
  const fields: FormField[] = rawFields.map((raw) => {
    if (!isPlainObject(raw)) throw new OnboardingFormError("invalid_input");
    const kind = raw.kind;
    if (
      typeof kind !== "string" ||
      !(FIELD_KINDS as readonly string[]).includes(kind)
    )
      throw new OnboardingFormError("invalid_input");

    // ID trust rule: presented IDs must already be bound in `knownIds` (the
    // current draft's IDs only); absent → server-minted. A known ID carrying a
    // different kind is a forged kind change — rejected.
    let fieldId: string;
    if (raw.fieldId === undefined || raw.fieldId === null) {
      fieldId = mintFieldId();
    } else {
      if (!isId(raw.fieldId)) throw new OnboardingFormError("invalid_input");
      const knownKind = knownIds.fieldIds.get(raw.fieldId);
      if (knownKind === undefined || knownKind !== kind)
        throw new OnboardingFormError("forbidden_field_id");
      fieldId = raw.fieldId;
    }
    if (seenFieldIds.has(fieldId))
      throw new OnboardingFormError("invalid_input");
    seenFieldIds.add(fieldId);

    if (typeof raw.order !== "number" || !Number.isInteger(raw.order))
      throw new OnboardingFormError("invalid_input");
    if (orders.has(raw.order)) throw new OnboardingFormError("invalid_input");
    orders.add(raw.order);

    if (typeof raw.required !== "boolean")
      throw new OnboardingFormError("invalid_input");

    const field: FormField = {
      fieldId,
      kind: kind as FieldKind,
      label: cleanText(raw.label, FORM_LIMITS.labelMax),
      required: raw.required,
      order: raw.order,
    };

    if (raw.helpText !== undefined && raw.helpText !== null) {
      const helpText =
        typeof raw.helpText === "string" ? raw.helpText.trim() : null;
      if (helpText === null || helpText.length > FORM_LIMITS.helpTextMax)
        throw new OnboardingFormError("invalid_input");
      if (helpText.length > 0) field.helpText = helpText;
    }

    if (CHOICE_KINDS.has(field.kind)) {
      if (!Array.isArray(raw.options))
        throw new OnboardingFormError("invalid_input");
      if (
        raw.options.length < FORM_LIMITS.minOptions ||
        raw.options.length > FORM_LIMITS.maxOptions
      )
        throw new OnboardingFormError("invalid_input");
      const optionLabels = new Set<string>();
      const seenOptionIds = new Set<string>();
      field.options = raw.options.map((rawOption) => {
        if (!isPlainObject(rawOption))
          throw new OnboardingFormError("invalid_input");
        let optionId: string;
        if (rawOption.optionId === undefined || rawOption.optionId === null) {
          optionId = mintOptionId();
        } else {
          if (!isId(rawOption.optionId))
            throw new OnboardingFormError("invalid_input");
          // Option IDs must be bound to THIS field in the current draft —
          // a cross-field or historical option ID is rejected.
          if (knownIds.optionIds.get(rawOption.optionId) !== fieldId)
            throw new OnboardingFormError("forbidden_field_id");
          optionId = rawOption.optionId;
        }
        if (seenOptionIds.has(optionId))
          throw new OnboardingFormError("invalid_input");
        seenOptionIds.add(optionId);
        const label = cleanText(rawOption.label, FORM_LIMITS.optionLabelMax);
        if (optionLabels.has(label))
          throw new OnboardingFormError("invalid_input");
        optionLabels.add(label);
        return { optionId, label };
      });
    } else if (raw.options !== undefined && raw.options !== null) {
      throw new OnboardingFormError("invalid_input");
    }
    return field;
  });

  // Unique contiguous ordering: sort by client order, renumber 0..n-1.
  fields.sort((a, b) => a.order - b.order);
  fields.forEach((f, i) => (f.order = i));

  const definition: FormDefinition = { title, fields };
  if (
    Buffer.byteLength(JSON.stringify(definition), "utf8") >
    FORM_LIMITS.definitionMaxBytes
  )
    throw new OnboardingFormError("invalid_input");
  return definition;
}

// ── Service operations ─────────────────────────────────────────────────────
// list/get/create are authorized and backed by workspace-scoped queries; every
// call re-authorizes through the guard using an auth repo bound to the
// caller's client. save/open/publish/archive remain untyped-throw stubs.

export async function listOnboardingForms(
  session: SessionLike,
  input: { workspaceId: string },
  client?: PrismaClient,
): Promise<FormSummary[]> {
  const db = client ?? defaultPrisma;
  // Server-side reauthorization on every call — current user/membership/
  // workspace state is re-read by the guard; there is no cached grant.
  const ctx = await authorize(
    session,
    {
      resource: "onboardingFormTemplates",
      action: "read",
      workspaceId: input.workspaceId,
    },
    // Auth reads share the caller's connection — never the global client.
    createPrismaAuthorizationRepo(db),
  );
  const rows = await db.onboardingForm.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: {
      id: true,
      name: true,
      status: true,
      draftRevision: true,
      draft: true,
      updatedAt: true,
      versions: {
        select: { versionSeq: true },
        orderBy: { versionSeq: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });
  // List rows carry only summary fields — never the draft/definition payload.
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    draftRevision: row.draftRevision,
    hasDraft: row.draft !== null,
    latestVersionSeq: row.versions[0]?.versionSeq ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createOnboardingForm(
  session: SessionLike,
  input: { workspaceId: string; name: string },
  client?: PrismaClient,
): Promise<{ formId: string }> {
  const db = client ?? defaultPrisma;
  const name = cleanText(input.name, FORM_LIMITS.nameMax);
  // Form + audit event are one transaction — if the audit write fails the
  // whole transaction rolls back and no form row survives. Authorization
  // is re-read INSIDE the transaction on the tx client: an authorize()
  // outside the tx leaves a check/write gap where a mid-flight demotion
  // would still be honoured (Orion 435).
  return db.$transaction(async (tx) => {
    const ctx = await authorize(
      session,
      {
        resource: "onboardingFormTemplates",
        action: "write",
        workspaceId: input.workspaceId,
      },
      createPrismaAuthorizationRepo(tx),
    );
    const form = await tx.onboardingForm.create({
      data: {
        workspaceId: ctx.workspaceId as string,
        name,
        createdByMemberId: ctx.workspaceMemberId as string,
        draft: { title: name, fields: [] },
        draftRevision: 1,
        // Editor identity + time on the initial draft too.
        draftSavedByMemberId: ctx.workspaceMemberId as string,
        draftUpdatedAt: new Date(),
      },
      select: { id: true },
    });
    await writeAuditEvent(tx, ctx, {
      action: "CREATE",
      resourceType: "onboarding_form",
      resourceId: form.id,
    });
    return { formId: form.id };
  });
}

export async function getOnboardingForm(
  session: SessionLike,
  input: { workspaceId: string; formId: string },
  client?: PrismaClient,
): Promise<FormDetail> {
  const db = client ?? defaultPrisma;
  const ctx = await authorize(
    session,
    {
      resource: "onboardingFormTemplates",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  // Workspace-scoped lookup: a formId outside this workspace is never
  // distinguishable from a missing one (typed not-found, no leakage).
  const form = await db.onboardingForm.findFirst({
    where: { id: input.formId, workspaceId: ctx.workspaceId },
    include: {
      versions: { orderBy: { versionSeq: "asc" } },
    },
  });
  if (!form) throw new OnboardingFormError("form_not_accessible");
  return {
    id: form.id,
    name: form.name,
    status: form.status,
    draftRevision: form.draftRevision,
    draft: (form.draft as FormDefinition | null) ?? null,
    versions: form.versions.map((v) => ({
      versionSeq: v.versionSeq,
      publishedAt: v.publishedAt.toISOString(),
      definition: v.definition as unknown as FormDefinition,
    })),
  };
}

// ── Concurrency protocol (save/open) ────────────────────────────────────────
// Serializable transactions + a workspace-scoped SELECT ... FOR UPDATE row
// lock; genuine serialization failures (P2034, P2010 carrying 40001/40P01)
// retry a bounded number of times, everything else propagates unchanged.

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: 8,
    backoffBaseMs: 10,
    backoffCapMs: 50,
    onExhausted: () => new OnboardingFormError("serialization_conflict"),
  });
}

type LockedFormRow = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  draft: unknown;
  draft_revision: number;
};

/** Row lock scoped to BOTH formId and workspaceId — never a foreign row. */
async function lockForm(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  formId: string,
): Promise<LockedFormRow | null> {
  const rows = await tx.$queryRawUnsafe<LockedFormRow[]>(
    `SELECT id, workspace_id, name, status, draft, draft_revision
     FROM "onboarding_form" WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    formId,
    workspaceId,
  );
  return rows[0] ?? null;
}

/** The CURRENT draft's live IDs — the only trusted set (no version history). */
function knownIdsFrom(draft: unknown): {
  fieldIds: Map<string, FieldKind>;
  optionIds: Map<string, string>;
} {
  const fieldIds = new Map<string, FieldKind>();
  const optionIds = new Map<string, string>();
  const d = draft as FormDefinition | null;
  for (const f of d?.fields ?? []) {
    fieldIds.set(f.fieldId, f.kind);
    for (const o of f.options ?? []) optionIds.set(o.optionId, f.fieldId);
  }
  return { fieldIds, optionIds };
}

export async function saveOnboardingFormDraft(
  session: SessionLike,
  input: {
    workspaceId: string;
    formId: string;
    expectedRevision: number;
    draft: unknown;
    name?: string;
  },
  client?: PrismaClient,
): Promise<{ revision: number; definition: FormDefinition }> {
  const db = client ?? defaultPrisma;
  const name =
    input.name === undefined
      ? undefined
      : cleanText(input.name, FORM_LIMITS.nameMax);
  const workspaceId = input.workspaceId;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // Reauthorized on EVERY attempt inside the tx: a retry after a
        // serialization failure re-reads current membership/role/workspace
        // in the serializable snapshot — no stale ctx (Orion 435).
        const ctx = await authorize(
          session,
          {
            resource: "onboardingFormTemplates",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        const form = await lockForm(tx, workspaceId, input.formId);
        if (!form) throw new OnboardingFormError("form_not_accessible");
        if (form.status === "ARCHIVED")
          throw new OnboardingFormError("form_archived");
        if (form.draft === null) throw new OnboardingFormError("no_open_draft");
        if (form.draft_revision !== input.expectedRevision)
          throw new OnboardingFormError("stale_revision");
        const definition = validateDefinition(
          input.draft,
          knownIdsFrom(form.draft),
          { forPublish: false },
        );
        const nextRevision = form.draft_revision + 1;
        await tx.onboardingForm.update({
          where: { id: form.id },
          data: {
            draft: definition as unknown as Prisma.InputJsonValue,
            draftRevision: nextRevision,
            draftSavedByMemberId: ctx.workspaceMemberId as string,
            draftUpdatedAt: new Date(),
            ...(name === undefined ? {} : { name }),
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "onboarding_form",
          resourceId: form.id,
        });
        return { revision: nextRevision, definition };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function publishOnboardingForm(
  session: SessionLike,
  input: { workspaceId: string; formId: string; expectedRevision: number },
  client?: PrismaClient,
): Promise<{ versionSeq: number }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // Reauthorized on EVERY attempt inside the tx: a retry after a
        // serialization failure re-reads current membership/role/workspace
        // in the serializable snapshot — no stale ctx (Orion 435).
        const ctx = await authorize(
          session,
          {
            resource: "onboardingFormTemplates",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        const form = await lockForm(tx, workspaceId, input.formId);
        if (!form) throw new OnboardingFormError("form_not_accessible");
        if (form.status === "ARCHIVED")
          throw new OnboardingFormError("form_archived");
        if (form.draft === null) {
          // Idempotent replay: a version minted from THIS revision already
          // exists → return it. Reauthorization already ran above, so a
          // denied actor's retry never reaches here.
          const existing = await tx.onboardingFormVersion.findFirst({
            where: {
              formId: form.id,
              publishOriginRevision: input.expectedRevision,
            },
          });
          if (existing) return { versionSeq: existing.versionSeq };
          throw new OnboardingFormError("no_open_draft");
        }
        if (form.draft_revision !== input.expectedRevision)
          throw new OnboardingFormError("stale_revision");
        // Snapshot re-validates at publish completeness — an empty draft
        // cannot publish, and the stored definition is what gets frozen.
        const definition = validateDefinition(
          form.draft,
          knownIdsFrom(form.draft),
          { forPublish: true },
        );
        const max = await tx.onboardingFormVersion.aggregate({
          where: { formId: form.id },
          _max: { versionSeq: true },
        });
        const versionSeq = (max._max.versionSeq ?? 0) + 1;
        await tx.onboardingFormVersion.create({
          data: {
            formId: form.id,
            versionSeq,
            definition: definition as unknown as Prisma.InputJsonValue,
            publishOriginRevision: form.draft_revision,
            publishedByMemberId: ctx.workspaceMemberId as string,
          },
        });
        await tx.onboardingForm.update({
          where: { id: form.id },
          data: {
            draft: Prisma.DbNull,
            draftSavedByMemberId: ctx.workspaceMemberId as string,
            draftUpdatedAt: new Date(),
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "onboarding_form",
          resourceId: form.id,
          meta: { status: "PUBLISHED", version: String(versionSeq) },
        });
        return { versionSeq };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function openOnboardingDraft(
  session: SessionLike,
  input: { workspaceId: string; formId: string },
  client?: PrismaClient,
): Promise<{ revision: number; definition: FormDefinition }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // Reauthorized on EVERY attempt inside the tx: a retry after a
        // serialization failure re-reads current membership/role/workspace
        // in the serializable snapshot — no stale ctx (Orion 435).
        const ctx = await authorize(
          session,
          {
            resource: "onboardingFormTemplates",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        const form = await lockForm(tx, workspaceId, input.formId);
        if (!form) throw new OnboardingFormError("form_not_accessible");
        if (form.status === "ARCHIVED")
          throw new OnboardingFormError("form_archived");
        // Replay: an already-open draft is returned unchanged — no revision
        // bump, no audit write.
        if (form.draft !== null) {
          return {
            revision: form.draft_revision,
            definition: form.draft as FormDefinition,
          };
        }
        // Closed draft: seed from the LATEST published version — the frozen
        // snapshot, title + field/option IDs retained.
        const latest = await tx.onboardingFormVersion.findFirst({
          where: { formId: form.id },
          orderBy: { versionSeq: "desc" },
        });
        const seeded = (latest?.definition as FormDefinition | undefined) ?? {
          title: form.name,
          fields: [],
        };
        const nextRevision = form.draft_revision + 1;
        await tx.onboardingForm.update({
          where: { id: form.id },
          data: {
            draft: seeded as unknown as Prisma.InputJsonValue,
            draftRevision: nextRevision,
            draftSavedByMemberId: ctx.workspaceMemberId as string,
            draftUpdatedAt: new Date(),
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "onboarding_form",
          resourceId: form.id,
        });
        return { revision: nextRevision, definition: seeded };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function archiveOnboardingForm(
  session: SessionLike,
  input: { workspaceId: string; formId: string },
  client?: PrismaClient,
): Promise<{ formId: string }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  await withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // Reauthorized on EVERY attempt inside the tx: a retry after a
        // serialization failure re-reads current membership/role/workspace
        // in the serializable snapshot — no stale ctx (Orion 435).
        const ctx = await authorize(
          session,
          {
            resource: "onboardingFormTemplates",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        const form = await lockForm(tx, workspaceId, input.formId);
        if (!form) throw new OnboardingFormError("form_not_accessible");
        // Idempotent: already archived → preserve original stamps, no audit.
        if (form.status === "ARCHIVED") return;
        await tx.onboardingForm.update({
          where: { id: form.id },
          data: {
            status: "ARCHIVED",
            archivedAt: new Date(),
            archivedByMemberId: ctx.workspaceMemberId as string,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "onboarding_form",
          resourceId: form.id,
          meta: { status: "ARCHIVED" },
        });
      },
      { isolationLevel: "Serializable" },
    ),
  );
  return { formId: input.formId };
}
