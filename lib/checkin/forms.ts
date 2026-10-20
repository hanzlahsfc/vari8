/**
 * P-025-A Check-In form definitions — pure validator module + guarded
 * persistence service.
 *
 * Check-In is a DISTINCT domain from onboarding (P-025 decisions #92–#97):
 * types, limits, and the closed kind union here are the check-in contract —
 * never the onboarding-named ones. Safe reuse is limited to the reviewed
 * patterns (validation shape, ID trust, serializable tx + workspace-scoped
 * FOR UPDATE lock, bounded serialization retry, audit-last atomicity).
 *
 * Lock protocol per the reviewed R2 plan §13 (workspace-scoped — no `chkin`
 * advisory, which is reserved for client-scoped instance ops in P-025-B):
 *   member advisory `member:{workspaceId}:{userId}`
 *   → workspace_member FOR UPDATE (authoritative actor state)
 *   → in-transaction authorize(checkinFormDefinitions/*)
 *   → checkin_form FOR UPDATE (workspace-coherent, revision/status checks)
 *   → mutation → structural audit LAST → commit atomically.
 *
 * Publishes pin the exact normalized draft revision in
 * `publishOriginRevision`; a replay returns the existing committed version
 * rather than minting another. The mutable draft CLOSES on publish (the
 * reviewed P-008 pattern): `openCheckInDraft` seeds a v2 draft from the
 * LATEST immutable version — earlier versions are never touchable.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  prisma as defaultPrisma,
  withSerializedRetry as sharedWithSerializedRetry,
} from "../db";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";

export type CheckInFormErrorCode =
  | "invalid_input"
  | "form_not_accessible"
  | "form_archived"
  | "no_open_draft"
  | "stale_revision"
  | "forbidden_field_id"
  | "publish_incomplete"
  | "serialization_conflict";

export class CheckInFormError extends Error {
  constructor(readonly code: CheckInFormErrorCode) {
    super(code);
    this.name = "CheckInFormError";
  }
}

export const CHECKIN_FIELD_KINDS = [
  "shortText",
  "longText",
  "number",
  "date",
  "singleChoice",
  "multiChoice",
] as const;
export type CheckInFieldKind = (typeof CHECKIN_FIELD_KINDS)[number];

export const CHECKIN_FORM_LIMITS = {
  maxFields: 100,
  minPublishFields: 1,
  labelMax: 200,
  helpTextMax: 500,
  classificationMax: 64,
  minOptions: 1,
  maxOptions: 50,
  optionLabelMax: 200,
  nameMax: 120,
  definitionMaxBytes: 64 * 1024,
} as const;

export type CheckInOption = { optionId: string; label: string };
export type CheckInField = {
  fieldId: string;
  kind: CheckInFieldKind;
  label: string;
  required: boolean;
  order: number;
  helpText?: string;
  options?: CheckInOption[];
  /**
   * Optional bounded source/classification metadata — dev/test synthetic
   * values only. Production field classification for Check-In answers is
   * unresolved and fail-closed; this label is preserved through snapshots
   * but never consulted for consent decisions in this slice.
   */
  classification?: string;
};
export type CheckInDefinition = { title: string; fields: CheckInField[] };

export type CheckInFormSummary = {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  draftRevision: number;
  hasDraft: boolean;
  latestVersionSeq: number | null;
  updatedAt: string;
};

export type CheckInFormDetail = {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  draftRevision: number;
  draft: CheckInDefinition | null;
  versions: Array<{
    versionSeq: number;
    publishedAt: string;
    definition: CheckInDefinition;
  }>;
};

const CHOICE_KINDS: ReadonlySet<CheckInFieldKind> = new Set([
  "singleChoice",
  "multiChoice",
]);

// Properties a field object may carry — sparse/extra keys reject.
const FIELD_KEYS = new Set([
  "fieldId",
  "kind",
  "label",
  "required",
  "order",
  "helpText",
  "options",
  "classification",
]);
const OPTION_KEYS = new Set(["optionId", "label"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isId(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9_-]{1,64}$/i.test(v);
}

const mintFieldId = () => `f_${crypto.randomUUID()}`;
const mintOptionId = () => `o_${crypto.randomUUID()}`;

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") throw new CheckInFormError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > max)
    throw new CheckInFormError("invalid_input");
  return trimmed;
}

/**
 * Structural validation + normalization of a check-in definition payload.
 * Presented `fieldId`/`optionId` values are trusted only when already bound
 * in `knownIds` (the CURRENT draft's IDs — retired IDs from earlier drafts
 * or historical versions are never resurrected); absent IDs get
 * server-minted ones. Field kind is immutable per fieldId.
 */
export function validateCheckInDefinition(
  input: unknown,
  knownIds: {
    fieldIds: Map<string, CheckInFieldKind>;
    optionIds: Map<string, string>;
  },
  opts: { forPublish: boolean },
): CheckInDefinition {
  if (!isPlainObject(input)) throw new CheckInFormError("invalid_input");
  for (const key of Object.keys(input)) {
    if (key !== "title" && key !== "fields")
      throw new CheckInFormError("invalid_input");
  }
  const title = cleanText(input.title, CHECKIN_FORM_LIMITS.labelMax);
  const rawFields = input.fields;
  if (!Array.isArray(rawFields)) throw new CheckInFormError("invalid_input");
  if (
    rawFields.length > CHECKIN_FORM_LIMITS.maxFields ||
    (opts.forPublish && rawFields.length < CHECKIN_FORM_LIMITS.minPublishFields)
  )
    throw new CheckInFormError(
      opts.forPublish ? "publish_incomplete" : "invalid_input",
    );

  const orders = new Set<number>();
  const seenFieldIds = new Set<string>();
  const fields: CheckInField[] = rawFields.map((raw) => {
    if (!isPlainObject(raw)) throw new CheckInFormError("invalid_input");
    for (const key of Object.keys(raw)) {
      if (!FIELD_KEYS.has(key)) throw new CheckInFormError("invalid_input");
    }
    const kind = raw.kind;
    if (
      typeof kind !== "string" ||
      !(CHECKIN_FIELD_KINDS as readonly string[]).includes(kind)
    )
      throw new CheckInFormError("invalid_input");

    // ID trust rule: presented IDs must already be bound in `knownIds` (the
    // current draft's IDs only); absent → server-minted. A known ID carrying
    // a different kind is a forged kind change — rejected.
    let fieldId: string;
    if (raw.fieldId === undefined || raw.fieldId === null) {
      fieldId = mintFieldId();
    } else {
      if (!isId(raw.fieldId)) throw new CheckInFormError("invalid_input");
      const knownKind = knownIds.fieldIds.get(raw.fieldId);
      if (knownKind === undefined || knownKind !== kind)
        throw new CheckInFormError("forbidden_field_id");
      fieldId = raw.fieldId;
    }
    if (seenFieldIds.has(fieldId)) throw new CheckInFormError("invalid_input");
    seenFieldIds.add(fieldId);

    if (typeof raw.order !== "number" || !Number.isInteger(raw.order))
      throw new CheckInFormError("invalid_input");
    if (orders.has(raw.order)) throw new CheckInFormError("invalid_input");
    orders.add(raw.order);

    if (typeof raw.required !== "boolean")
      throw new CheckInFormError("invalid_input");

    const field: CheckInField = {
      fieldId,
      kind: kind as CheckInFieldKind,
      label: cleanText(raw.label, CHECKIN_FORM_LIMITS.labelMax),
      required: raw.required,
      order: raw.order,
    };

    if (raw.helpText !== undefined && raw.helpText !== null) {
      const helpText =
        typeof raw.helpText === "string" ? raw.helpText.trim() : null;
      if (
        helpText === null ||
        helpText.length > CHECKIN_FORM_LIMITS.helpTextMax
      )
        throw new CheckInFormError("invalid_input");
      if (helpText.length > 0) field.helpText = helpText;
    }

    if (raw.classification !== undefined && raw.classification !== null) {
      if (
        typeof raw.classification !== "string" ||
        raw.classification.trim().length < 1 ||
        raw.classification.trim().length > CHECKIN_FORM_LIMITS.classificationMax
      )
        throw new CheckInFormError("invalid_input");
      field.classification = raw.classification.trim();
    }

    if (CHOICE_KINDS.has(field.kind)) {
      if (!Array.isArray(raw.options))
        throw new CheckInFormError("invalid_input");
      if (
        raw.options.length < CHECKIN_FORM_LIMITS.minOptions ||
        raw.options.length > CHECKIN_FORM_LIMITS.maxOptions
      )
        throw new CheckInFormError("invalid_input");
      const optionLabels = new Set<string>();
      const seenOptionIds = new Set<string>();
      field.options = raw.options.map((rawOption) => {
        if (!isPlainObject(rawOption))
          throw new CheckInFormError("invalid_input");
        for (const key of Object.keys(rawOption)) {
          if (!OPTION_KEYS.has(key))
            throw new CheckInFormError("invalid_input");
        }
        let optionId: string;
        if (rawOption.optionId === undefined || rawOption.optionId === null) {
          optionId = mintOptionId();
        } else {
          if (!isId(rawOption.optionId))
            throw new CheckInFormError("invalid_input");
          // Option IDs must be bound to THIS field in the current draft —
          // a cross-field or historical option ID is rejected.
          if (knownIds.optionIds.get(rawOption.optionId) !== fieldId)
            throw new CheckInFormError("forbidden_field_id");
          optionId = rawOption.optionId;
        }
        if (seenOptionIds.has(optionId))
          throw new CheckInFormError("invalid_input");
        seenOptionIds.add(optionId);
        const label = cleanText(
          rawOption.label,
          CHECKIN_FORM_LIMITS.optionLabelMax,
        );
        if (optionLabels.has(label))
          throw new CheckInFormError("invalid_input");
        optionLabels.add(label);
        return { optionId, label };
      });
    } else if (raw.options !== undefined && raw.options !== null) {
      throw new CheckInFormError("invalid_input");
    }
    return field;
  });

  // Unique contiguous ordering: sort by client order, renumber 0..n-1.
  fields.sort((a, b) => a.order - b.order);
  fields.forEach((f, i) => (f.order = i));

  const definition: CheckInDefinition = { title, fields };
  if (
    Buffer.byteLength(JSON.stringify(definition), "utf8") >
    CHECKIN_FORM_LIMITS.definitionMaxBytes
  )
    throw new CheckInFormError("invalid_input");
  return definition;
}

// ── Concurrency protocol ───────────────────────────────────────────────────
// Serializable transactions + bounded retry on genuine serialization
// failures (P2034, P2010 carrying 40001/40P01); everything else propagates.

async function withSerializedRetry<T>(fn: () => Promise<T>): Promise<T> {
  return sharedWithSerializedRetry(fn, {
    maxAttempts: 8,
    backoffBaseMs: 10,
    backoffCapMs: 50,
    onExhausted: () => new CheckInFormError("serialization_conflict"),
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
     FROM "checkin_form" WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    formId,
    workspaceId,
  );
  return rows[0] ?? null;
}

/** Transaction-scoped advisory lock (reviewed key order). */
async function advisoryLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  // $executeRawUnsafe: pg_advisory_xact_lock returns void, which $queryRaw
  // cannot represent.
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    key,
  );
}

/**
 * Member advisory + locked ACTIVE membership + in-transaction authorize —
 * the reviewed P-025 form-definition order. The member row lock makes the
 * actor's role/state authoritative inside the serializable snapshot; the
 * authorize() that follows resolves the resource grant on the same locked
 * row. Returns the authorization context.
 */
async function lockedAuthorize(
  tx: Prisma.TransactionClient,
  session: SessionLike,
  request: {
    resource: "checkinFormDefinitions";
    action: "read" | "write";
    workspaceId: string;
  },
) {
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError(
      "unauthenticated",
      request.resource,
      request.action,
    );
  await advisoryLock(tx, `member:${request.workspaceId}:${userId}`);
  const memberRows = await tx.$queryRawUnsafe<{ id: string; status: string }[]>(
    `SELECT id, status FROM "workspace_member"
     WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE`,
    request.workspaceId,
    userId,
  );
  const member = memberRows[0];
  // A missing/inactive membership fails closed — authorize() is the
  // role/resource authority that follows; the lock only serializes the row.
  if (!member || member.status !== "ACTIVE")
    throw new AccessDeniedError(
      "role_denied",
      request.resource,
      request.action,
    );
  return authorize(session, request, createPrismaAuthorizationRepo(tx));
}

/** The CURRENT draft's live IDs — the only trusted set (no version history). */
function knownIdsFrom(draft: unknown): {
  fieldIds: Map<string, CheckInFieldKind>;
  optionIds: Map<string, string>;
} {
  const fieldIds = new Map<string, CheckInFieldKind>();
  const optionIds = new Map<string, string>();
  const d = draft as CheckInDefinition | null;
  for (const f of d?.fields ?? []) {
    fieldIds.set(f.fieldId, f.kind);
    for (const o of f.options ?? []) optionIds.set(o.optionId, f.fieldId);
  }
  return { fieldIds, optionIds };
}

// ── Service operations ─────────────────────────────────────────────────────
// Every call re-authorizes through the guard on the caller-bound client;
// mutations additionally run the locked protocol above.

export async function listCheckInForms(
  session: SessionLike,
  input: { workspaceId: string },
  client?: PrismaClient,
): Promise<CheckInFormSummary[]> {
  const db = client ?? defaultPrisma;
  const ctx = await authorize(
    session,
    {
      resource: "checkinFormDefinitions",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  const rows = await db.checkInForm.findMany({
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

export async function createCheckInForm(
  session: SessionLike,
  input: { workspaceId: string; name: string },
  client?: PrismaClient,
): Promise<{ formId: string }> {
  const db = client ?? defaultPrisma;
  const name = cleanText(input.name, CHECKIN_FORM_LIMITS.nameMax);
  // Form + audit event are one transaction — an audit failure rolls the
  // whole create back; authorization re-reads inside the tx on the tx
  // client (no check/write gap). Bounded retry absorbs serialization
  // conflicts like every other mutation in this module.
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await lockedAuthorize(tx, session, {
          resource: "checkinFormDefinitions",
          action: "write",
          workspaceId: input.workspaceId,
        });
        const form = await tx.checkInForm.create({
          data: {
            workspaceId: ctx.workspaceId as string,
            name,
            createdByMemberId: ctx.workspaceMemberId as string,
            draft: { title: name, fields: [] },
            draftRevision: 1,
            draftSavedByMemberId: ctx.workspaceMemberId as string,
            draftUpdatedAt: new Date(),
          },
          select: { id: true },
        });
        await writeAuditEvent(tx, ctx, {
          action: "CREATE",
          resourceType: "checkin_form",
          resourceId: form.id,
        });
        return { formId: form.id };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function getCheckInForm(
  session: SessionLike,
  input: { workspaceId: string; formId: string },
  client?: PrismaClient,
): Promise<CheckInFormDetail> {
  const db = client ?? defaultPrisma;
  const ctx = await authorize(
    session,
    {
      resource: "checkinFormDefinitions",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  // Workspace-scoped lookup: a formId outside this workspace is never
  // distinguishable from a missing one (typed not-found, no leakage).
  const form = await db.checkInForm.findFirst({
    where: { id: input.formId, workspaceId: ctx.workspaceId },
    include: { versions: { orderBy: { versionSeq: "asc" } } },
  });
  if (!form) throw new CheckInFormError("form_not_accessible");
  return {
    id: form.id,
    name: form.name,
    status: form.status,
    draftRevision: form.draftRevision,
    draft: (form.draft as CheckInDefinition | null) ?? null,
    versions: form.versions.map((v) => ({
      versionSeq: v.versionSeq,
      publishedAt: v.publishedAt.toISOString(),
      definition: v.definition as unknown as CheckInDefinition,
    })),
  };
}

export async function saveCheckInFormDraft(
  session: SessionLike,
  input: {
    workspaceId: string;
    formId: string;
    expectedRevision: number;
    draft: unknown;
    name?: string;
  },
  client?: PrismaClient,
): Promise<{ revision: number; definition: CheckInDefinition }> {
  const db = client ?? defaultPrisma;
  const name =
    input.name === undefined
      ? undefined
      : cleanText(input.name, CHECKIN_FORM_LIMITS.nameMax);
  const workspaceId = input.workspaceId;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // Reauthorized on EVERY attempt inside the tx — a retry after a
        // serialization failure re-reads current membership/role/workspace
        // in the serializable snapshot (no stale ctx).
        const ctx = await lockedAuthorize(tx, session, {
          resource: "checkinFormDefinitions",
          action: "write",
          workspaceId: input.workspaceId,
        });
        const form = await lockForm(tx, workspaceId, input.formId);
        if (!form) throw new CheckInFormError("form_not_accessible");
        if (form.status === "ARCHIVED")
          throw new CheckInFormError("form_archived");
        if (form.draft === null) throw new CheckInFormError("no_open_draft");
        if (form.draft_revision !== input.expectedRevision)
          throw new CheckInFormError("stale_revision");
        const definition = validateCheckInDefinition(
          input.draft,
          knownIdsFrom(form.draft),
          { forPublish: false },
        );
        const nextRevision = form.draft_revision + 1;
        await tx.checkInForm.update({
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
          resourceType: "checkin_form",
          resourceId: form.id,
        });
        return { revision: nextRevision, definition };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function publishCheckInForm(
  session: SessionLike,
  input: { workspaceId: string; formId: string; expectedRevision: number },
  client?: PrismaClient,
): Promise<{ versionSeq: number }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await lockedAuthorize(tx, session, {
          resource: "checkinFormDefinitions",
          action: "write",
          workspaceId: input.workspaceId,
        });
        const form = await lockForm(tx, workspaceId, input.formId);
        if (!form) throw new CheckInFormError("form_not_accessible");
        if (form.status === "ARCHIVED")
          throw new CheckInFormError("form_archived");
        if (form.draft === null) {
          // Idempotent replay: a version minted from THIS revision already
          // exists → return it. Reauthorization already ran above, so a
          // denied actor's retry never reaches here.
          const existing = await tx.checkInFormVersion.findFirst({
            where: {
              formId: form.id,
              publishOriginRevision: input.expectedRevision,
            },
          });
          if (existing) return { versionSeq: existing.versionSeq };
          throw new CheckInFormError("no_open_draft");
        }
        if (form.draft_revision !== input.expectedRevision)
          throw new CheckInFormError("stale_revision");
        // Snapshot re-validates at publish completeness — an empty draft
        // cannot publish, and the stored definition is what gets frozen.
        const definition = validateCheckInDefinition(
          form.draft,
          knownIdsFrom(form.draft),
          { forPublish: true },
        );
        const max = await tx.checkInFormVersion.aggregate({
          where: { formId: form.id },
          _max: { versionSeq: true },
        });
        // versionSeq assigned ONLY under the serialized form-row lock —
        // concurrent publishes can never mint conflicting sequences.
        const versionSeq = (max._max.versionSeq ?? 0) + 1;
        await tx.checkInFormVersion.create({
          data: {
            workspaceId: form.workspace_id,
            formId: form.id,
            versionSeq,
            definition: definition as unknown as Prisma.InputJsonValue,
            publishOriginRevision: form.draft_revision,
            publishedByMemberId: ctx.workspaceMemberId as string,
          },
        });
        // P-008 pattern + approved plan: publish CLOSES the mutable draft —
        // the frozen v1 stays immutable and `openCheckInDraft` seeds v2
        // editing from the latest version.
        await tx.checkInForm.update({
          where: { id: form.id },
          data: {
            draft: Prisma.DbNull,
            draftSavedByMemberId: ctx.workspaceMemberId as string,
            draftUpdatedAt: new Date(),
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "checkin_form",
          resourceId: form.id,
          meta: { status: "PUBLISHED", version: String(versionSeq) },
        });
        return { versionSeq };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function openCheckInDraft(
  session: SessionLike,
  input: { workspaceId: string; formId: string },
  client?: PrismaClient,
): Promise<{ revision: number; definition: CheckInDefinition }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await lockedAuthorize(tx, session, {
          resource: "checkinFormDefinitions",
          action: "write",
          workspaceId: input.workspaceId,
        });
        const form = await lockForm(tx, workspaceId, input.formId);
        if (!form) throw new CheckInFormError("form_not_accessible");
        if (form.status === "ARCHIVED")
          throw new CheckInFormError("form_archived");
        // Replay: an already-open draft is returned unchanged — no revision
        // bump, no audit write.
        if (form.draft !== null) {
          return {
            revision: form.draft_revision,
            definition: form.draft as CheckInDefinition,
          };
        }
        // Closed draft: seed from the LATEST published version — the frozen
        // snapshot, title + field/option IDs retained for continuity.
        const latest = await tx.checkInFormVersion.findFirst({
          where: { formId: form.id },
          orderBy: { versionSeq: "desc" },
        });
        const seeded = (latest?.definition as
          CheckInDefinition | undefined) ?? {
          title: form.name,
          fields: [],
        };
        const nextRevision = form.draft_revision + 1;
        await tx.checkInForm.update({
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
          resourceType: "checkin_form",
          resourceId: form.id,
        });
        return { revision: nextRevision, definition: seeded };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function archiveCheckInForm(
  session: SessionLike,
  input: { workspaceId: string; formId: string },
  client?: PrismaClient,
): Promise<{ formId: string }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  await withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await lockedAuthorize(tx, session, {
          resource: "checkinFormDefinitions",
          action: "write",
          workspaceId: input.workspaceId,
        });
        const form = await lockForm(tx, workspaceId, input.formId);
        if (!form) throw new CheckInFormError("form_not_accessible");
        // Idempotent: already archived → preserve original stamps, no audit.
        // Archive is terminal in this slice — no unarchive/reopen exists.
        if (form.status === "ARCHIVED") return;
        await tx.checkInForm.update({
          where: { id: form.id },
          data: {
            status: "ARCHIVED",
            archivedAt: new Date(),
            archivedByMemberId: ctx.workspaceMemberId as string,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "checkin_form",
          resourceId: form.id,
          meta: { status: "ARCHIVED" },
        });
      },
      { isolationLevel: "Serializable" },
    ),
  );
  return { formId: input.formId };
}
