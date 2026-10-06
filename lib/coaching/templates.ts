/**
 * P-014 coaching template library — workspace-owned draft/publish containers
 * (product-decisions #41–#47). Mutable bounded drafts; immutable published
 * versions that freeze structure AND complete referenced-parameter metadata.
 *
 * Publish protocol (Serializable tx):
 *   authorize → lock template row FOR UPDATE → resolve the full referenced
 *   parameter set → lock parameter rows in ASCENDING id order → reject
 *   archived/missing/foreign refs (`parameter_not_publishable`) → compare
 *   server-stamped ack revisions (`parameter_changed`) → allocate
 *   versionSeq = max+1 under the lock → create version + normalized
 *   reference rows + audit → close the draft.
 * Replay: re-publishing the same origin revision returns the existing
 * version (unique (template_id, publish_origin_revision) backs it).
 * Archive is terminal; versions are never updated or deleted.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import { COACHING_LIMITS } from "./gate";
import type { ParameterOption, ParameterValidation } from "./parameters";

export type CoachingTemplateErrorCode =
  | "invalid_input"
  | "template_not_accessible"
  | "template_archived"
  | "no_open_draft"
  | "stale_revision"
  | "forbidden_item_id"
  | "parameter_not_publishable"
  | "parameter_changed"
  | "publish_incomplete"
  | "serialization_conflict";

export class CoachingTemplateError extends Error {
  constructor(readonly code: CoachingTemplateErrorCode) {
    super(code);
    this.name = "CoachingTemplateError";
  }
}

export type DraftItem = {
  itemId: string;
  parameterKey: string;
  parameterId: string;
  acknowledgedParameterRevision: number;
  required: boolean;
  order: number;
};
export type DraftSection = {
  sectionId: string;
  label: string;
  order: number;
  items: DraftItem[];
};
export type TemplateDraft = { title: string; sections: DraftSection[] };

/** Snapshot definition embedded in CoachingTemplateVersion. */
export type TemplateVersionDefinition = {
  title: string;
  sections: Array<{
    sectionId: string;
    label: string;
    order: number;
    items: Array<{
      itemId: string;
      parameterId: string;
      parameterKey: string;
      required: boolean;
      order: number;
    }>;
  }>;
  parameters: Record<
    string,
    {
      key: string;
      kind: string;
      label: string;
      helpText: string | null;
      unit: string | null;
      ratingScheme: string | null;
      options: ParameterOption[];
      validation: ParameterValidation | null;
      group: string | null;
      revision: number;
    }
  >;
};

export type TemplateSummary = {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  draftRevision: number;
  hasDraft: boolean;
  latestVersionSeq: number | null;
  updatedAt: string;
};

export type TemplateDetail = {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  draftRevision: number;
  draft: TemplateDraft | null;
  versions: Array<{ versionSeq: number; publishedAt: string }>;
};

const mintSectionId = () => `sec_${crypto.randomUUID()}`;
const mintItemId = () => `itm_${crypto.randomUUID()}`;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isId(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9_-]{1,64}$/i.test(v);
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") throw new CoachingTemplateError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > max)
    throw new CoachingTemplateError("invalid_input");
  return trimmed;
}

/** Object-graph depth — arrays do not add levels; root object = 1. */
function objectDepth(v: unknown): number {
  if (!isPlainObject(v)) return 0;
  let max = 1;
  for (const value of Object.values(v)) {
    if (isPlainObject(value) || Array.isArray(value)) {
      const child = Array.isArray(value)
        ? Math.max(0, ...value.map(objectDepth))
        : objectDepth(value);
      max = Math.max(max, 1 + child);
    }
  }
  return max;
}

const DRAFT_KEYS = new Set(["title", "sections"]);
const SECTION_KEYS = new Set(["sectionId", "label", "order", "items"]);
const ITEM_KEYS = new Set([
  "itemId",
  "parameterKey",
  "parameterId",
  "required",
  "order",
]);

function rejectUnknownKeys(
  input: Record<string, unknown>,
  allowed: Set<string>,
) {
  for (const k of Object.keys(input)) {
    if (!allowed.has(k)) throw new CoachingTemplateError("invalid_input");
  }
}

export type ParameterResolution = { id: string; revision: number } | null;

/**
 * Structural validation + normalization of a template draft. Caller
 * presents `parameterKey` (or the seeded `parameterId`); IDs absent →
 * server-minted; presented IDs trusted only when bound in the CURRENT
 * draft. `acknowledgedParameterRevision` is never accepted from the
 * caller — the resolver stamps the live revision.
 */
export function validateTemplateDraft(
  input: unknown,
  knownIds: { sectionIds: Set<string>; itemIds: Set<string> },
  opts: {
    resolveParameter: (keyOrId: string) => ParameterResolution;
    forPublish: boolean;
  },
): TemplateDraft {
  if (!isPlainObject(input)) throw new CoachingTemplateError("invalid_input");
  rejectUnknownKeys(input, DRAFT_KEYS);
  if (objectDepth(input) > COACHING_LIMITS.maxDepth)
    throw new CoachingTemplateError("invalid_input");
  const title = cleanText(input.title, COACHING_LIMITS.nameMax);
  const rawSections = input.sections;
  if (!Array.isArray(rawSections))
    throw new CoachingTemplateError("invalid_input");
  if (rawSections.length > COACHING_LIMITS.maxSections)
    throw new CoachingTemplateError("invalid_input");

  const seenSections = new Set<string>();
  let itemCount = 0;
  const sections: DraftSection[] = rawSections.map((raw) => {
    if (!isPlainObject(raw)) throw new CoachingTemplateError("invalid_input");
    rejectUnknownKeys(raw, SECTION_KEYS);
    let sectionId: string;
    if (raw.sectionId === undefined || raw.sectionId === null) {
      sectionId = mintSectionId();
    } else {
      if (!isId(raw.sectionId))
        throw new CoachingTemplateError("invalid_input");
      if (!knownIds.sectionIds.has(raw.sectionId))
        throw new CoachingTemplateError("forbidden_item_id");
      sectionId = raw.sectionId;
    }
    if (seenSections.has(sectionId))
      throw new CoachingTemplateError("invalid_input");
    seenSections.add(sectionId);

    const rawItems = raw.items;
    if (!Array.isArray(rawItems))
      throw new CoachingTemplateError("invalid_input");
    if (rawItems.length > COACHING_LIMITS.maxItemsPerSection)
      throw new CoachingTemplateError("invalid_input");
    itemCount += rawItems.length;
    if (itemCount > COACHING_LIMITS.maxItemsPerTemplate)
      throw new CoachingTemplateError("invalid_input");

    const seenItems = new Set<string>();
    const items: DraftItem[] = rawItems.map((rawItem) => {
      if (!isPlainObject(rawItem))
        throw new CoachingTemplateError("invalid_input");
      rejectUnknownKeys(rawItem, ITEM_KEYS);
      let itemId: string;
      if (rawItem.itemId === undefined || rawItem.itemId === null) {
        itemId = mintItemId();
      } else {
        if (!isId(rawItem.itemId))
          throw new CoachingTemplateError("invalid_input");
        if (!knownIds.itemIds.has(rawItem.itemId))
          throw new CoachingTemplateError("forbidden_item_id");
        itemId = rawItem.itemId;
      }
      if (seenItems.has(itemId))
        throw new CoachingTemplateError("invalid_input");
      seenItems.add(itemId);

      // Caller identifies the parameter by key or seeded id — both resolve
      // through the server's resolver; acknowledgment is server-stamped.
      const ref =
        typeof rawItem.parameterKey === "string" &&
        rawItem.parameterKey.length <= COACHING_LIMITS.keyMax
          ? rawItem.parameterKey
          : typeof rawItem.parameterId === "string" &&
              rawItem.parameterId.length <= COACHING_LIMITS.keyMax
            ? rawItem.parameterId
            : null;
      if (ref === null) throw new CoachingTemplateError("invalid_input");
      const resolved = opts.resolveParameter(ref);
      if (resolved === null)
        throw new CoachingTemplateError("parameter_not_publishable");
      if (typeof rawItem.required !== "boolean")
        throw new CoachingTemplateError("invalid_input");
      if (typeof rawItem.order !== "number" || !Number.isInteger(rawItem.order))
        throw new CoachingTemplateError("invalid_input");
      return {
        itemId,
        parameterKey: ref,
        parameterId: resolved.id,
        acknowledgedParameterRevision: resolved.revision,
        required: rawItem.required,
        order: rawItem.order,
      };
    });
    items.sort((a, b) => a.order - b.order);
    items.forEach((item, i) => (item.order = i));
    if (typeof raw.order !== "number" || !Number.isInteger(raw.order))
      throw new CoachingTemplateError("invalid_input");
    return {
      sectionId,
      label: cleanText(raw.label, COACHING_LIMITS.labelMax),
      order: raw.order,
      items,
    };
  });
  if (opts.forPublish && itemCount === 0)
    throw new CoachingTemplateError("publish_incomplete");
  sections.sort((a, b) => a.order - b.order);
  sections.forEach((s, i) => (s.order = i));

  const draft: TemplateDraft = { title, sections };
  if (
    Buffer.byteLength(JSON.stringify(draft), "utf8") >
    COACHING_LIMITS.definitionMaxBytes
  )
    throw new CoachingTemplateError("invalid_input");
  return draft;
}

// ── Concurrency protocol ────────────────────────────────────────────────────

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
        throw new CoachingTemplateError("serialization_conflict");
      throw error;
    }
  }
}

type LockedTemplateRow = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  draft: unknown;
  draft_revision: number;
};

async function lockTemplate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  templateId: string,
): Promise<LockedTemplateRow | null> {
  const rows = await tx.$queryRawUnsafe<LockedTemplateRow[]>(
    `SELECT id, workspace_id, name, status, draft, draft_revision
     FROM "coaching_template" WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    templateId,
    workspaceId,
  );
  return rows[0] ?? null;
}

type ParameterRow = {
  id: string;
  key: string;
  kind: string;
  label: string;
  help_text: string | null;
  group_label: string | null;
  unit: string | null;
  rating_scheme: string | null;
  options: unknown;
  validation: unknown;
  revision: number;
  status: string;
};

/** Lock every referenced parameter row in ASCENDING id order — the
 * deterministic ordering that prevents publish/archive/publish cycles. */
async function lockParametersForPublish(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  parameterIds: string[],
): Promise<ParameterRow[]> {
  if (parameterIds.length === 0) return [];
  const rows = await tx.$queryRawUnsafe<ParameterRow[]>(
    `SELECT id, key, kind, label, help_text, group_label, unit,
            rating_scheme, options, validation, revision, status
     FROM "parameter_definition"
     WHERE workspace_id = $1 AND id = ANY($2::text[])
     ORDER BY id ASC FOR UPDATE`,
    workspaceId,
    parameterIds,
  );
  return rows;
}

/** The caller-facing shape of a stored draft: server-stamped fields
 * (`parameterId`, `acknowledgedParameterRevision`) stripped — the strict
 * validator accepts only what a caller may legitimately present. */
function callerShape(draft: TemplateDraft): unknown {
  return {
    title: draft.title,
    sections: draft.sections.map((sec) => ({
      sectionId: sec.sectionId,
      label: sec.label,
      order: sec.order,
      items: sec.items.map((item) => ({
        itemId: item.itemId,
        parameterKey: item.parameterKey,
        required: item.required,
        order: item.order,
      })),
    })),
  };
}

function snapshotParameter(
  row: ParameterRow,
): TemplateVersionDefinition["parameters"][string] {
  return {
    key: row.key,
    kind: row.kind,
    label: row.label,
    helpText: row.help_text,
    unit: row.unit,
    ratingScheme: row.rating_scheme,
    options: (row.options as ParameterOption[] | null) ?? [],
    validation: (row.validation as ParameterValidation | null) ?? null,
    group: row.group_label,
    revision: row.revision,
  };
}

// ── Service operations ──────────────────────────────────────────────────────

export async function listTemplates(
  session: SessionLike,
  input: { workspaceId: string },
  client?: PrismaClient,
): Promise<TemplateSummary[]> {
  const db = client ?? defaultPrisma;
  const ctx = await authorize(
    session,
    {
      resource: "coachingTemplates",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  const rows = await db.coachingTemplate.findMany({
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

export async function getTemplate(
  session: SessionLike,
  input: { workspaceId: string; templateId: string },
  client?: PrismaClient,
): Promise<TemplateDetail> {
  const db = client ?? defaultPrisma;
  const ctx = await authorize(
    session,
    {
      resource: "coachingTemplates",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  const row = await db.coachingTemplate.findFirst({
    where: { id: input.templateId, workspaceId: ctx.workspaceId },
    include: { versions: { orderBy: { versionSeq: "asc" } } },
  });
  if (!row) throw new CoachingTemplateError("template_not_accessible");
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    draftRevision: row.draftRevision,
    draft: (row.draft as TemplateDraft | null) ?? null,
    versions: row.versions.map((v) => ({
      versionSeq: v.versionSeq,
      publishedAt: v.publishedAt.toISOString(),
    })),
  };
}

export async function getTemplateVersion(
  session: SessionLike,
  input: { workspaceId: string; templateId: string; versionSeq: number },
  client?: PrismaClient,
): Promise<{
  versionId: string;
  versionSeq: number;
  publishedAt: string;
  publishedBy: string;
  definition: TemplateVersionDefinition;
}> {
  const db = client ?? defaultPrisma;
  const ctx = await authorize(
    session,
    {
      resource: "coachingTemplates",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  const row = await db.coachingTemplateVersion.findFirst({
    where: {
      templateId: input.templateId,
      workspaceId: ctx.workspaceId,
      versionSeq: input.versionSeq,
    },
  });
  if (!row) throw new CoachingTemplateError("template_not_accessible");
  return {
    versionId: row.id,
    versionSeq: row.versionSeq,
    publishedAt: row.publishedAt.toISOString(),
    publishedBy: row.publishedByMemberId,
    definition: row.definition as unknown as TemplateVersionDefinition,
  };
}

export async function createTemplate(
  session: SessionLike,
  input: { workspaceId: string; name: string },
  client?: PrismaClient,
): Promise<{ templateId: string }> {
  const db = client ?? defaultPrisma;
  const name = cleanText(input.name, COACHING_LIMITS.nameMax);
  return db.$transaction(async (tx) => {
    const ctx = await authorize(
      session,
      {
        resource: "coachingTemplates",
        action: "write",
        workspaceId: input.workspaceId,
      },
      createPrismaAuthorizationRepo(tx),
    );
    const row = await tx.coachingTemplate.create({
      data: {
        workspaceId: ctx.workspaceId as string,
        name,
        createdByMemberId: ctx.workspaceMemberId as string,
        draft: { title: name, sections: [] },
        draftRevision: 1,
        draftSavedByMemberId: ctx.workspaceMemberId as string,
        draftUpdatedAt: new Date(),
      },
      select: { id: true },
    });
    await writeAuditEvent(tx, ctx, {
      action: "CREATE",
      resourceType: "coaching_template",
      resourceId: row.id,
    });
    return { templateId: row.id };
  });
}

export async function saveTemplateDraft(
  session: SessionLike,
  input: {
    workspaceId: string;
    templateId: string;
    expectedRevision: number;
    draft: unknown;
    name?: string;
  },
  client?: PrismaClient,
): Promise<{ revision: number; definition: TemplateDraft }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  const name =
    input.name === undefined
      ? undefined
      : cleanText(input.name, COACHING_LIMITS.nameMax);
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await authorize(
          session,
          {
            resource: "coachingTemplates",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        const row = await lockTemplate(tx, workspaceId, input.templateId);
        if (!row) throw new CoachingTemplateError("template_not_accessible");
        if (row.status === "ARCHIVED")
          throw new CoachingTemplateError("template_archived");
        if (row.draft === null)
          throw new CoachingTemplateError("no_open_draft");
        if (row.draft_revision !== input.expectedRevision)
          throw new CoachingTemplateError("stale_revision");

        // Resolve live ACTIVE params in this workspace; missing/foreign/
        // archived refs are rejected — the resolver returns null.
        const resolveCache = await tx.parameterDefinition.findMany({
          where: { workspaceId: ctx.workspaceId, status: "ACTIVE" },
          select: { id: true, key: true, revision: true },
        });
        const byRef = new Map<string, ParameterResolution>();
        for (const p of resolveCache) {
          byRef.set(p.key, { id: p.id, revision: p.revision });
          byRef.set(p.id, { id: p.id, revision: p.revision });
        }
        const current = row.draft as TemplateDraft;
        const knownIds = {
          sectionIds: new Set(current.sections.map((s2) => s2.sectionId)),
          itemIds: new Set(
            current.sections.flatMap((s2) => s2.items.map((i) => i.itemId)),
          ),
        };
        const definition = validateTemplateDraft(input.draft, knownIds, {
          resolveParameter: (ref) => byRef.get(ref) ?? null,
          forPublish: false,
        });
        const nextRevision = row.draft_revision + 1;
        await tx.coachingTemplate.update({
          where: { id: row.id },
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
          resourceType: "coaching_template",
          resourceId: row.id,
        });
        return { revision: nextRevision, definition };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function openTemplateDraft(
  session: SessionLike,
  input: { workspaceId: string; templateId: string },
  client?: PrismaClient,
): Promise<{ revision: number; definition: TemplateDraft }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await authorize(
          session,
          {
            resource: "coachingTemplates",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        const row = await lockTemplate(tx, workspaceId, input.templateId);
        if (!row) throw new CoachingTemplateError("template_not_accessible");
        if (row.status === "ARCHIVED")
          throw new CoachingTemplateError("template_archived");
        if (row.draft !== null) {
          return {
            revision: row.draft_revision,
            definition: row.draft as TemplateDraft,
          };
        }
        const latest = await tx.coachingTemplateVersion.findFirst({
          where: { templateId: row.id },
          orderBy: { versionSeq: "desc" },
        });
        const frozen = latest?.definition as unknown as
          TemplateVersionDefinition | undefined;
        // Seed the draft from the frozen version. Items keep their stable
        // IDs; parameter refs resolve through the live library — archived/
        // removed params keep the key with ack -1 so publish rejects them.
        const live = await tx.parameterDefinition.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: { id: true, key: true, revision: true, status: true },
        });
        const liveById = new Map(live.map((p) => [p.id, p]));
        const seeded: TemplateDraft = {
          title: frozen?.title ?? row.name,
          sections: (frozen?.sections ?? []).map((sec) => ({
            sectionId: sec.sectionId,
            label: sec.label,
            order: sec.order,
            items: sec.items.map((item) => {
              const param = liveById.get(item.parameterId);
              return {
                itemId: item.itemId,
                parameterKey: item.parameterKey,
                parameterId: item.parameterId,
                acknowledgedParameterRevision:
                  param && param.status === "ACTIVE" ? param.revision : -1,
                required: item.required,
                order: item.order,
              };
            }),
          })),
        };
        const nextRevision = row.draft_revision + 1;
        await tx.coachingTemplate.update({
          where: { id: row.id },
          data: {
            draft: seeded as unknown as Prisma.InputJsonValue,
            draftRevision: nextRevision,
            draftSavedByMemberId: ctx.workspaceMemberId as string,
            draftUpdatedAt: new Date(),
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "coaching_template",
          resourceId: row.id,
        });
        return { revision: nextRevision, definition: seeded };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function publishTemplate(
  session: SessionLike,
  input: { workspaceId: string; templateId: string; expectedRevision: number },
  client?: PrismaClient,
): Promise<{ versionSeq: number }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await authorize(
          session,
          {
            resource: "coachingTemplates",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        // 1. Lock the template container row first.
        const row = await lockTemplate(tx, workspaceId, input.templateId);
        if (!row) throw new CoachingTemplateError("template_not_accessible");
        if (row.status === "ARCHIVED")
          throw new CoachingTemplateError("template_archived");
        if (row.draft === null) {
          // Idempotent replay keyed on the origin revision.
          const existing = await tx.coachingTemplateVersion.findFirst({
            where: {
              templateId: row.id,
              publishOriginRevision: input.expectedRevision,
            },
          });
          if (existing) return { versionSeq: existing.versionSeq };
          throw new CoachingTemplateError("no_open_draft");
        }
        if (row.draft_revision !== input.expectedRevision)
          throw new CoachingTemplateError("stale_revision");

        // 2. Resolve the complete referenced parameter set.
        const draft = row.draft as TemplateDraft;
        const parameterIds = [
          ...new Set(
            draft.sections.flatMap((sec) =>
              sec.items.map((item) => item.parameterId),
            ),
          ),
        ];
        // 3. Lock parameter rows in deterministic ascending ID order.
        const params = await lockParametersForPublish(
          tx,
          ctx.workspaceId as string,
          parameterIds,
        );
        const byId = new Map(params.map((p) => [p.id, p]));
        for (const id of parameterIds) {
          const param = byId.get(id);
          // Missing/foreign/archived → fail-closed, zero mutation.
          if (!param || param.status !== "ACTIVE")
            throw new CoachingTemplateError("parameter_not_publishable");
        }
        // 4. Revision acknowledgment check — draft must match current state.
        for (const sec of draft.sections) {
          for (const item of sec.items) {
            const param = byId.get(item.parameterId);
            if (param && param.revision !== item.acknowledgedParameterRevision)
              throw new CoachingTemplateError("parameter_changed");
          }
        }
        // Re-validate at publish completeness under the locked rows —
        // the stored draft is stripped to its caller-facing shape first
        // (server-stamped ack/parameterId fields are not caller input).
        const byRef = new Map<string, ParameterResolution>();
        for (const p of params) {
          byRef.set(p.id, { id: p.id, revision: p.revision });
          byRef.set(p.key, { id: p.id, revision: p.revision });
        }
        const knownIds = {
          sectionIds: new Set(draft.sections.map((s2) => s2.sectionId)),
          itemIds: new Set(
            draft.sections.flatMap((s2) => s2.items.map((i) => i.itemId)),
          ),
        };
        const validated = validateTemplateDraft(callerShape(draft), knownIds, {
          resolveParameter: (ref) => byRef.get(ref) ?? null,
          forPublish: true,
        });

        // 5. Allocate the sequence under the container lock.
        const max = await tx.coachingTemplateVersion.aggregate({
          where: { templateId: row.id },
          _max: { versionSeq: true },
        });
        const versionSeq = (max._max.versionSeq ?? 0) + 1;

        // 6. Immutable snapshot — structure + complete parameter metadata.
        const parameters: TemplateVersionDefinition["parameters"] = {};
        for (const p of params) parameters[p.id] = snapshotParameter(p);
        const definition: TemplateVersionDefinition = {
          title: validated.title,
          sections: validated.sections.map((sec) => ({
            sectionId: sec.sectionId,
            label: sec.label,
            order: sec.order,
            items: sec.items.map((item) => ({
              itemId: item.itemId,
              parameterId: item.parameterId,
              parameterKey: item.parameterKey,
              required: item.required,
              order: item.order,
            })),
          })),
          parameters,
        };
        const version = await tx.coachingTemplateVersion.create({
          data: {
            workspaceId: ctx.workspaceId as string,
            templateId: row.id,
            versionSeq,
            definition: definition as unknown as Prisma.InputJsonValue,
            publishOriginRevision: row.draft_revision,
            publishedByMemberId: ctx.workspaceMemberId as string,
          },
          select: { id: true },
        });
        // Normalized references — same workspace + template coherence is
        // enforced by composite FKs; params all verified ACTIVE above.
        for (const p of params) {
          await tx.coachingTemplateVersionParameter.create({
            data: {
              workspaceId: ctx.workspaceId as string,
              templateId: row.id,
              versionId: version.id,
              parameterId: p.id,
            },
          });
        }
        await tx.coachingTemplate.update({
          where: { id: row.id },
          data: {
            draft: Prisma.DbNull,
            draftSavedByMemberId: ctx.workspaceMemberId as string,
            draftUpdatedAt: new Date(),
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "coaching_template",
          resourceId: row.id,
          meta: { status: "PUBLISHED", version: String(versionSeq) },
        });
        await writeAuditEvent(tx, ctx, {
          action: "CREATE",
          resourceType: "coaching_template_version",
          resourceId: version.id,
        });
        return { versionSeq };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function archiveTemplate(
  session: SessionLike,
  input: { workspaceId: string; templateId: string },
  client?: PrismaClient,
): Promise<{ templateId: string }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  await withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await authorize(
          session,
          {
            resource: "coachingTemplates",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        const row = await lockTemplate(tx, workspaceId, input.templateId);
        if (!row) throw new CoachingTemplateError("template_not_accessible");
        if (row.status === "ARCHIVED") return;
        await tx.coachingTemplate.update({
          where: { id: row.id },
          data: {
            status: "ARCHIVED",
            archivedAt: new Date(),
            archivedByMemberId: ctx.workspaceMemberId as string,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "coaching_template",
          resourceId: row.id,
          meta: { status: "ARCHIVED" },
        });
      },
      { isolationLevel: "Serializable" },
    ),
  );
  return { templateId: input.templateId };
}
