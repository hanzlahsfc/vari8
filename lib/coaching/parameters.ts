/**
 * P-014 parameter library — workspace-owned coaching parameter definitions
 * (product-decisions #41–#45). Pure validators + guarded persistence.
 *
 * Invariants enforced here:
 * - `key` is server-minted (`p_<uuid>`), immutable, never reusable.
 * - `kind` is closed-vocabulary and immutable from creation.
 * - Semantic fields (unit, ratingScheme, options+option IDs, validation)
 *   may change only before the parameter first appears in a published
 *   template; afterwards `semantics_locked` — display fields (label,
 *   helpText, group) stay editable with a revision bump.
 * - `required`, formulas, expressions, patterns, sources, and derived
 *   fields cannot be represented — unknown payload keys are rejected.
 * - Option IDs are server-minted; removed IDs move into a permanent
 *   tombstone set and can never be restored or reused.
 * - Archive is terminal; published-version snapshots never change.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { authorize, type SessionLike } from "../auth/guard";
import { createPrismaAuthorizationRepo } from "../workspace/access";
import { writeAuditEvent } from "../audit";
import { COACHING_LIMITS } from "./gate";

export type ParameterErrorCode =
  | "invalid_input"
  | "parameter_not_accessible"
  | "parameter_archived"
  | "stale_revision"
  | "semantics_locked"
  | "serialization_conflict";

export class ParameterError extends Error {
  constructor(readonly code: ParameterErrorCode) {
    super(code);
    this.name = "ParameterError";
  }
}

export const PARAMETER_KINDS = [
  "MEASUREMENT",
  "RATING",
  "TIME",
  "DURATION",
  "OPTION",
  "TEXT",
] as const;
export type ParameterKind = (typeof PARAMETER_KINDS)[number];

export const RATING_SCHEMES = [
  "SCALE_1_10",
  "SCALE_1_5",
  "WORD_LABELS",
] as const;
export type RatingScheme = (typeof RATING_SCHEMES)[number];

export type ParameterOption = { optionId: string; label: string };
export type ParameterValidation = { min?: number; max?: number };

/** Normalized parameter row state used by the edit pipeline + tests. */
export type ParameterState = {
  id: string;
  key: string;
  kind: ParameterKind;
  label: string;
  helpText: string | null;
  unit: string | null;
  ratingScheme: RatingScheme | null;
  options: ParameterOption[];
  retiredOptionIds: string[];
  validation: ParameterValidation | null;
  group: string | null;
  revision: number;
  status: "ACTIVE" | "ARCHIVED";
};

export type ParameterSummary = {
  id: string;
  key: string;
  kind: ParameterKind;
  label: string;
  status: "ACTIVE" | "ARCHIVED";
  revision: number;
  publishedReferenced: boolean;
  updatedAt: string;
};

export type ParameterDetail = ParameterSummary & {
  helpText: string | null;
  unit: string | null;
  ratingScheme: RatingScheme | null;
  options: ParameterOption[];
  validation: ParameterValidation | null;
  group: string | null;
  createdAt: string;
};

const mintParameterKey = () => `p_${crypto.randomUUID()}`;
const mintOptionId = () => `o_${crypto.randomUUID()}`;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") throw new ParameterError("invalid_input");
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > max)
    throw new ParameterError("invalid_input");
  return trimmed;
}

function cleanOptionalText(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const t = cleanText(v, max);
  return t;
}

const UNIT_KINDS: ReadonlySet<ParameterKind> = new Set([
  "MEASUREMENT",
  "TIME",
  "DURATION",
]);

/** Closed declarative numeric bounds — the ONLY representable validation. */
function cleanValidation(
  v: unknown,
  kind: ParameterKind,
): ParameterValidation | null {
  if (v === undefined || v === null) return null;
  if (kind !== "MEASUREMENT" && kind !== "DURATION")
    throw new ParameterError("invalid_input");
  if (!isPlainObject(v)) throw new ParameterError("invalid_input");
  for (const k of Object.keys(v)) {
    if (k !== "min" && k !== "max") throw new ParameterError("invalid_input");
  }
  const out: ParameterValidation = {};
  if (v.min !== undefined) {
    if (typeof v.min !== "number" || !Number.isFinite(v.min))
      throw new ParameterError("invalid_input");
    out.min = v.min;
  }
  if (v.max !== undefined) {
    if (typeof v.max !== "number" || !Number.isFinite(v.max))
      throw new ParameterError("invalid_input");
    out.max = v.max;
  }
  if (out.min === undefined && out.max === undefined)
    throw new ParameterError("invalid_input");
  if (out.min !== undefined && out.max !== undefined && out.min > out.max)
    throw new ParameterError("invalid_input");
  return out;
}

const CREATE_KEYS = new Set([
  "kind",
  "label",
  "helpText",
  "unit",
  "ratingScheme",
  "options",
  "validation",
  "group",
]);
const UPDATE_KEYS = new Set([
  "label",
  "helpText",
  "unit",
  "ratingScheme",
  "options",
  "validation",
  "group",
]);

function rejectUnknownKeys(
  input: Record<string, unknown>,
  allowed: Set<string>,
) {
  for (const k of Object.keys(input)) {
    if (!allowed.has(k)) throw new ParameterError("invalid_input");
  }
}

/**
 * Normalize a caller payload for create — caller may never supply key,
 * option IDs, `required`, or any field outside the closed allowed set.
 */
export function validateParameterCreate(input: unknown): {
  kind: ParameterKind;
  label: string;
  helpText: string | null;
  unit: string | null;
  ratingScheme: RatingScheme | null;
  options: ParameterOption[];
  validation: ParameterValidation | null;
  group: string | null;
} {
  if (!isPlainObject(input)) throw new ParameterError("invalid_input");
  rejectUnknownKeys(input, CREATE_KEYS);
  const kind = input.kind;
  if (
    typeof kind !== "string" ||
    !(PARAMETER_KINDS as readonly string[]).includes(kind)
  )
    throw new ParameterError("invalid_input");
  const k = kind as ParameterKind;

  const unit = cleanOptionalText(input.unit, COACHING_LIMITS.labelMax);
  if (unit !== null && !UNIT_KINDS.has(k))
    throw new ParameterError("invalid_input");

  let ratingScheme: RatingScheme | null = null;
  if (k === "RATING") {
    if (
      typeof input.ratingScheme !== "string" ||
      !(RATING_SCHEMES as readonly string[]).includes(input.ratingScheme)
    )
      throw new ParameterError("invalid_input");
    ratingScheme = input.ratingScheme as RatingScheme;
  } else if (input.ratingScheme !== undefined && input.ratingScheme !== null) {
    throw new ParameterError("invalid_input");
  }

  let options: ParameterOption[] = [];
  if (k === "OPTION") {
    if (!Array.isArray(input.options))
      throw new ParameterError("invalid_input");
    if (
      input.options.length < 1 ||
      input.options.length > COACHING_LIMITS.maxOptions
    )
      throw new ParameterError("invalid_input");
    const labels = new Set<string>();
    options = input.options.map((raw) => {
      if (!isPlainObject(raw)) throw new ParameterError("invalid_input");
      // Caller-supplied option IDs are never trusted — IDs are minted.
      if (raw.optionId !== undefined && raw.optionId !== null)
        throw new ParameterError("invalid_input");
      const label = cleanText(raw.label, COACHING_LIMITS.labelMax);
      if (labels.has(label)) throw new ParameterError("invalid_input");
      labels.add(label);
      return { optionId: mintOptionId(), label };
    });
  } else if (input.options !== undefined && input.options !== null) {
    throw new ParameterError("invalid_input");
  }

  return {
    kind: k,
    label: cleanText(input.label, COACHING_LIMITS.labelMax),
    helpText: cleanOptionalText(input.helpText, COACHING_LIMITS.helpTextMax),
    unit,
    ratingScheme,
    options,
    validation: cleanValidation(input.validation, k),
    group: cleanOptionalText(input.group, COACHING_LIMITS.labelMax),
  };
}

/** Normalized patch for update — `kind`/`key`/unknown keys rejected. */
function validateParameterPatch(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) throw new ParameterError("invalid_input");
  rejectUnknownKeys(input, UPDATE_KEYS);
  return input;
}

const SEMANTIC_FIELDS = [
  "unit",
  "ratingScheme",
  "options",
  "validation",
] as const;

function semanticEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Apply an update payload to the current row state. Pre-publication:
 * semantic fields editable (option edits enforce tombstone rules).
 * Post-publication (`published: true`): any semantic change →
 * `semantics_locked`; display edits stay legal. Always bumps revision.
 */
export function applyParameterEdits(
  state: ParameterState,
  patch: unknown,
  opts: { published?: boolean } = {},
): ParameterState {
  const input = validateParameterPatch(patch);
  if (state.status === "ARCHIVED")
    throw new ParameterError("parameter_archived");
  const published = opts.published === true;

  const next: ParameterState = {
    ...state,
    options: [...state.options],
    retiredOptionIds: [...state.retiredOptionIds],
    validation: state.validation ? { ...state.validation } : null,
  };

  // Display metadata — always editable.
  if (input.label !== undefined)
    next.label = cleanText(input.label, COACHING_LIMITS.labelMax);
  if (input.helpText !== undefined)
    next.helpText = cleanOptionalText(
      input.helpText,
      COACHING_LIMITS.helpTextMax,
    );
  if (input.group !== undefined)
    next.group = cleanOptionalText(input.group, COACHING_LIMITS.labelMax);

  // Semantic fields — after the first published reference they cannot
  // CHANGE; re-submitting the identical value is a no-op, not a lock
  // violation. Any differing semantic value → `semantics_locked`.
  const semanticState: Record<(typeof SEMANTIC_FIELDS)[number], unknown> = {
    unit: state.unit,
    ratingScheme: state.ratingScheme,
    options: state.options,
    validation: state.validation,
  };
  for (const field of SEMANTIC_FIELDS) {
    if (
      input[field] !== undefined &&
      published &&
      !semanticEqual(input[field], semanticState[field])
    )
      throw new ParameterError("semantics_locked");
  }

  if (input.unit !== undefined) {
    if (!UNIT_KINDS.has(state.kind)) throw new ParameterError("invalid_input");
    next.unit = cleanOptionalText(input.unit, COACHING_LIMITS.labelMax);
  }
  if (input.ratingScheme !== undefined) {
    if (state.kind !== "RATING") throw new ParameterError("invalid_input");
    if (
      typeof input.ratingScheme !== "string" ||
      !(RATING_SCHEMES as readonly string[]).includes(input.ratingScheme)
    )
      throw new ParameterError("invalid_input");
    next.ratingScheme = input.ratingScheme as RatingScheme;
  }
  if (input.validation !== undefined) {
    next.validation = cleanValidation(input.validation, state.kind);
  }
  if (input.options !== undefined) {
    if (state.kind !== "OPTION") throw new ParameterError("invalid_input");
    if (
      !Array.isArray(input.options) ||
      input.options.length < 1 ||
      input.options.length > COACHING_LIMITS.maxOptions
    )
      throw new ParameterError("invalid_input");
    const liveIds = new Set(state.options.map((o) => o.optionId));
    const tombstones = new Set(state.retiredOptionIds);
    const seen = new Set<string>();
    const presentedIds: string[] = [];
    const nextOptions: ParameterOption[] = input.options.map((raw) => {
      if (!isPlainObject(raw)) throw new ParameterError("invalid_input");
      const label = cleanText(raw.label, COACHING_LIMITS.labelMax);
      let optionId: string;
      if (raw.optionId === undefined || raw.optionId === null) {
        optionId = mintOptionId();
      } else {
        if (
          typeof raw.optionId !== "string" ||
          raw.optionId.length > COACHING_LIMITS.keyMax
        )
          throw new ParameterError("invalid_input");
        // Known to the CURRENT live set only — tombstoned or foreign IDs
        // are rejected (never restored, never reused).
        if (!liveIds.has(raw.optionId) || tombstones.has(raw.optionId))
          throw new ParameterError("invalid_input");
        optionId = raw.optionId;
      }
      if (seen.has(optionId)) throw new ParameterError("invalid_input");
      seen.add(optionId);
      presentedIds.push(optionId);
      return { optionId, label };
    });
    // Options absent from the submission move to tombstones permanently.
    for (const o of state.options) {
      if (!seen.has(o.optionId)) next.retiredOptionIds.push(o.optionId);
    }
    next.options = nextOptions;
    void presentedIds;
  }

  next.revision = state.revision + 1;
  return next;
}

function rowToState(row: {
  id: string;
  key: string;
  kind: string;
  label: string;
  helpText: string | null;
  unit: string | null;
  ratingScheme: string | null;
  options: unknown;
  retiredOptionIds: unknown;
  validation: unknown;
  group: string | null;
  revision: number;
  status: string;
}): ParameterState {
  return {
    id: row.id,
    key: row.key,
    kind: row.kind as ParameterKind,
    label: row.label,
    helpText: row.helpText,
    unit: row.unit,
    ratingScheme: (row.ratingScheme as RatingScheme | null) ?? null,
    options: (row.options as ParameterOption[] | null) ?? [],
    retiredOptionIds: (row.retiredOptionIds as string[] | null) ?? [],
    validation: (row.validation as ParameterValidation | null) ?? null,
    group: row.group,
    revision: row.revision,
    status: row.status as "ACTIVE" | "ARCHIVED",
  };
}

// ── Concurrency protocol ────────────────────────────────────────────────────
// Serializable transactions + workspace-scoped FOR UPDATE row locks; genuine
// serialization failures retry a bounded number of times.

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
        throw new ParameterError("serialization_conflict");
      throw error;
    }
  }
}

type LockedParameterRow = {
  id: string;
  workspace_id: string;
  key: string;
  kind: string;
  label: string;
  help_text: string | null;
  group_label: string | null;
  unit: string | null;
  rating_scheme: string | null;
  options: unknown;
  retired_option_ids: unknown;
  validation: unknown;
  revision: number;
  status: string;
};

/** Row lock scoped to BOTH parameterId and workspaceId — never foreign rows. */
async function lockParameter(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  parameterId: string,
): Promise<LockedParameterRow | null> {
  const rows = await tx.$queryRawUnsafe<LockedParameterRow[]>(
    `SELECT id, workspace_id, key, kind, label, help_text, group_label, unit,
            rating_scheme, options, retired_option_ids, validation, revision,
            status
     FROM "parameter_definition"
     WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    parameterId,
    workspaceId,
  );
  return rows[0] ?? null;
}

// ── Service operations ──────────────────────────────────────────────────────

export async function listParameters(
  session: SessionLike,
  input: { workspaceId: string; limit?: number; cursor?: string },
  client?: PrismaClient,
): Promise<ParameterSummary[]> {
  const db = client ?? defaultPrisma;
  const ctx = await authorize(
    session,
    {
      resource: "parameterDefinitions",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  const take = Math.min(
    Math.max(1, Math.floor(input.limit ?? COACHING_LIMITS.listDefaultLimit)),
    COACHING_LIMITS.listMaxLimit,
  );
  const rows = await db.parameterDefinition.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: {
      id: true,
      key: true,
      kind: true,
      label: true,
      status: true,
      revision: true,
      updatedAt: true,
      versionReferences: { select: { versionId: true }, take: 1 },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    kind: row.kind,
    label: row.label,
    status: row.status,
    revision: row.revision,
    publishedReferenced: row.versionReferences.length > 0,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getParameter(
  session: SessionLike,
  input: { workspaceId: string; parameterId: string },
  client?: PrismaClient,
): Promise<ParameterDetail> {
  const db = client ?? defaultPrisma;
  const ctx = await authorize(
    session,
    {
      resource: "parameterDefinitions",
      action: "read",
      workspaceId: input.workspaceId,
    },
    createPrismaAuthorizationRepo(db),
  );
  const row = await db.parameterDefinition.findFirst({
    where: { id: input.parameterId, workspaceId: ctx.workspaceId },
    include: { versionReferences: { select: { versionId: true }, take: 1 } },
  });
  // Non-disclosing: missing/foreign/out-of-scope are indistinguishable.
  if (!row) throw new ParameterError("parameter_not_accessible");
  return {
    id: row.id,
    key: row.key,
    kind: row.kind,
    label: row.label,
    status: row.status,
    revision: row.revision,
    publishedReferenced: row.versionReferences.length > 0,
    updatedAt: row.updatedAt.toISOString(),
    helpText: row.helpText,
    unit: row.unit,
    ratingScheme: row.ratingScheme,
    options: (row.options as ParameterOption[] | null) ?? [],
    validation: (row.validation as ParameterValidation | null) ?? null,
    group: row.group,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createParameter(
  session: SessionLike,
  input: { workspaceId: string; input: unknown },
  client?: PrismaClient,
): Promise<{ parameterId: string; key: string }> {
  const db = client ?? defaultPrisma;
  const clean = validateParameterCreate(input.input);
  return db.$transaction(async (tx) => {
    const ctx = await authorize(
      session,
      {
        resource: "parameterDefinitions",
        action: "write",
        workspaceId: input.workspaceId,
      },
      createPrismaAuthorizationRepo(tx),
    );
    const row = await tx.parameterDefinition.create({
      data: {
        workspaceId: ctx.workspaceId as string,
        key: mintParameterKey(),
        kind: clean.kind,
        label: clean.label,
        helpText: clean.helpText,
        group: clean.group,
        unit: clean.unit,
        ratingScheme: clean.ratingScheme,
        options: clean.options.length ? clean.options : Prisma.JsonNull,
        retiredOptionIds: Prisma.JsonNull,
        validation:
          clean.validation === null
            ? Prisma.JsonNull
            : (clean.validation as Prisma.InputJsonValue),
        createdByMemberId: ctx.workspaceMemberId as string,
        updatedByMemberId: ctx.workspaceMemberId as string,
      },
      select: { id: true, key: true },
    });
    await writeAuditEvent(tx, ctx, {
      action: "CREATE",
      resourceType: "parameter_definition",
      resourceId: row.id,
    });
    return { parameterId: row.id, key: row.key };
  });
}

export async function updateParameter(
  session: SessionLike,
  input: {
    workspaceId: string;
    parameterId: string;
    expectedRevision: number;
    input: unknown;
  },
  client?: PrismaClient,
): Promise<{ revision: number }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await authorize(
          session,
          {
            resource: "parameterDefinitions",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        const row = await lockParameter(tx, workspaceId, input.parameterId);
        if (!row) throw new ParameterError("parameter_not_accessible");
        if (row.status === "ARCHIVED")
          throw new ParameterError("parameter_archived");
        if (row.revision !== input.expectedRevision)
          throw new ParameterError("stale_revision");
        // Post-publish semantic lock: any version reference freezes the
        // semantic field set.
        const ref = await tx.coachingTemplateVersionParameter.findFirst({
          where: { parameterId: row.id },
          select: { parameterId: true },
        });
        const state = rowToState({
          id: row.id,
          key: row.key,
          kind: row.kind,
          label: row.label,
          helpText: row.help_text,
          unit: row.unit,
          ratingScheme: row.rating_scheme,
          options: row.options,
          retiredOptionIds: row.retired_option_ids,
          validation: row.validation,
          group: row.group_label,
          revision: row.revision,
          status: row.status,
        });
        const next = applyParameterEdits(state, input.input, {
          published: ref !== null,
        });
        await tx.parameterDefinition.update({
          where: { id: row.id },
          data: {
            label: next.label,
            helpText: next.helpText,
            group: next.group,
            unit: next.unit,
            ratingScheme: next.ratingScheme,
            options: next.options.length ? next.options : Prisma.JsonNull,
            retiredOptionIds: next.retiredOptionIds.length
              ? next.retiredOptionIds
              : Prisma.JsonNull,
            validation:
              next.validation === null
                ? Prisma.JsonNull
                : (next.validation as Prisma.InputJsonValue),
            revision: next.revision,
            updatedByMemberId: ctx.workspaceMemberId as string,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "parameter_definition",
          resourceId: row.id,
        });
        return { revision: next.revision };
      },
      { isolationLevel: "Serializable" },
    ),
  );
}

export async function archiveParameter(
  session: SessionLike,
  input: { workspaceId: string; parameterId: string },
  client?: PrismaClient,
): Promise<{ parameterId: string }> {
  const db = client ?? defaultPrisma;
  const workspaceId = input.workspaceId;
  await withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const ctx = await authorize(
          session,
          {
            resource: "parameterDefinitions",
            action: "write",
            workspaceId: input.workspaceId,
          },
          createPrismaAuthorizationRepo(tx),
        );
        const row = await lockParameter(tx, workspaceId, input.parameterId);
        if (!row) throw new ParameterError("parameter_not_accessible");
        // Terminal + idempotent: already archived preserves original stamps.
        if (row.status === "ARCHIVED") return;
        await tx.parameterDefinition.update({
          where: { id: row.id },
          data: {
            status: "ARCHIVED",
            archivedAt: new Date(),
            archivedByMemberId: ctx.workspaceMemberId as string,
          },
        });
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "parameter_definition",
          resourceId: row.id,
          meta: { status: "ARCHIVED" },
        });
      },
      { isolationLevel: "Serializable" },
    ),
  );
  return { parameterId: input.parameterId };
}
