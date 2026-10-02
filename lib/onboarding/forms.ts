/**
 * P-008 onboarding form definitions — pure validator module (slices 1D).
 *
 * Contains the definition contract: types, limits, the closed kind union and
 * `validateDefinition` (shape/bounds + current-draft ID trust + publish
 * completeness). Persistence: `listOnboardingForms`, `getOnboardingForm` and
 * `createOnboardingForm` are implemented (slice 2); `save`, `publish`,
 * `open` and `archive` remain callable stubs that throw UNTYPED errors until
 * their lifecycle slices land.
 */

import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
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
  | "publish_incomplete";

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
  const ctx = await authorize(
    session,
    {
      resource: "onboardingFormTemplates",
      action: "write",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  const name = cleanText(input.name, FORM_LIMITS.nameMax);
  // Form + audit event are one transaction — if the audit write fails the
  // whole transaction rolls back and no form row survives.
  return db.$transaction(async (tx) => {
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

export async function saveOnboardingFormDraft(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    formId: string;
    expectedRevision: number;
    draft: unknown;
    name?: string;
  },
  _client?: PrismaClient,
): Promise<{ revision: number; definition: FormDefinition }> {
  throw new Error("not implemented (later slices)");
}

export async function publishOnboardingForm(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string; expectedRevision: number },
  _client?: PrismaClient,
): Promise<{ versionSeq: number }> {
  throw new Error("not implemented (later slices)");
}

export async function openOnboardingDraft(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _client?: PrismaClient,
): Promise<{ revision: number; definition: FormDefinition }> {
  throw new Error("not implemented (later slices)");
}

export async function archiveOnboardingForm(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _client?: PrismaClient,
): Promise<{ formId: string }> {
  throw new Error("not implemented (later slices)");
}
