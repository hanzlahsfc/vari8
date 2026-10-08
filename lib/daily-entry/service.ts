import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { AccessDeniedError, authorize, type SessionLike } from "../auth/guard";
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
import { evaluateDailyEntryVersionEligibility } from "../coaching/daily-entry-eligibility";
import { computeSelectionFingerprint } from "../coaching/selection-fingerprint";
import {
  computeDailyEntryFormToken,
  computeRevisionCanonicalHash,
  type HashParam,
  type TaggedValue,
} from "./canonical";
import { DailyEntryError } from "./gate";

export { DailyEntryError } from "./gate";
import {
  validateDailyEntryValues,
  type OrdinalValue,
  type SnapshotParam,
} from "./validate";

/**
 * P-021 — DailyEntry save/read services (decisions #64–#78, P-021-R2/R3).
 *
 * Writes: Serializable transaction with the binding lock prefix —
 *   advisory `csetup:{ws}:{client}` → advisory `member:{ws}:{user}` →
 *   workspace_member FOR UPDATE → client_profile FOR UPDATE → client_setup
 *   FOR UPDATE → active pin FOR UPDATE → required consent rows FOR UPDATE
 *   (deterministic kind order) → daily_entry create-or-lock → revision/
 *   value inserts + pointer update → audit.
 * The locked WorkspaceMember row is the authoritative in-transaction actor
 * state; `authorize` re-runs inside the tx for early denial. Every retry
 * recomputes all state. A failed audit rolls the whole save back.
 *
 * The locked member/consent discipline is the contract every future
 * membership or consent mutation path must share (same advisories first).
 * Neither mutation route exists in v1, so those races are currently
 * unreachable externally — but the contract is bound now.
 */

// ── Development consent policy (#72, owner-approved dev mechanism) ────────

/** Fixed synthetic dev-only policy versions — meaningful ONLY when the
 * DailyEntry development flag is enabled. Production stays unconfigured
 * and fails closed. */
export const DAILY_ENTRY_DEV_CONSENT = {
  PRIVACY_NOTICE: "daily-entry-dev-privacy-v1",
  HEALTH_DATA: "daily-entry-dev-health-v1",
} as const;

export function dailyEntryConsentRegistry(
  entryFlagEnabled: boolean,
): ConsentPolicyRegistry {
  return entryFlagEnabled
    ? createStaticConsentPolicy({
        PRIVACY_NOTICE: DAILY_ENTRY_DEV_CONSENT.PRIVACY_NOTICE,
        HEALTH_DATA: DAILY_ENTRY_DEV_CONSENT.HEALTH_DATA,
      })
    : unconfiguredConsentPolicy;
}

export type DailyEntryDeps = {
  db?: PrismaClient;
  registry?: ConsentPolicyRegistry;
};

// ── Concurrency protocol (mirrors the reviewed client-setup service) ──────

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
        throw new DailyEntryError("serialization_conflict");
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

async function lockRow(
  tx: Prisma.TransactionClient,
  sql: string,
  ...params: string[]
): Promise<void> {
  await tx.$queryRawUnsafe<{ id: string }[]>(sql, ...params);
}

// ── Declared date ─────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDeclaredDate(raw: unknown): string {
  if (typeof raw !== "string" || !DATE_RE.test(raw))
    throw new DailyEntryError("invalid_input");
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    throw new DailyEntryError("invalid_input");
  if (raw < "1970-01-01") throw new DailyEntryError("invalid_input");
  // Upper bound: server-clock UTC +1 day (decision #66).
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const limit = tomorrow.toISOString().slice(0, 10);
  if (raw > limit) throw new DailyEntryError("invalid_input");
  return raw;
}

// ── Snapshot projection ───────────────────────────────────────────────────

type VersionDefinition = {
  sections?: Array<{
    sectionId?: string;
    label?: string;
    order?: number;
    items?: Array<{
      itemId?: string;
      parameterId?: string;
      parameterKey?: string;
      required?: boolean;
      order?: number;
    }>;
  }>;
  parameters?: Record<
    string,
    {
      key?: string;
      kind?: string;
      label?: string;
      helpText?: string | null;
      unit?: string | null;
      ratingScheme?: string | null;
      options?: Array<{ optionId?: string; label?: string }>;
      validation?: { min?: number | null; max?: number | null } | null;
      dataClassification?: string | null;
      revision?: number;
    }
  >;
};

/** Ordered eligible parameter list — only meaningful AFTER the shared
 * eligibility verdict (the module owns eligibility; this merely projects
 * the immutable snapshot's declared order). */
function projectSnapshot(definition: unknown): SnapshotParam[] | null {
  const def = definition as VersionDefinition;
  if (
    typeof def !== "object" ||
    def === null ||
    !Array.isArray(def.sections) ||
    typeof def.parameters !== "object" ||
    def.parameters === null
  )
    return null;
  const ordered = [...def.sections].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const out: SnapshotParam[] = [];
  for (const section of ordered) {
    if (!Array.isArray(section.items)) return null;
    const items = [...section.items].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    for (const item of items) {
      if (
        typeof item.parameterId !== "string" ||
        typeof item.itemId !== "string"
      )
        return null;
      const p = def.parameters[item.parameterId];
      if (typeof p !== "object" || p === null) return null;
      out.push({
        parameterId: item.parameterId,
        parameterKey:
          typeof item.parameterKey === "string"
            ? item.parameterKey
            : (p.key ?? ""),
        kind: p.kind ?? "",
        required: item.required === true,
        unit: p.unit ?? null,
        ratingScheme: p.ratingScheme ?? null,
        options: (p.options ?? []).map((o) => ({
          optionId: String(o.optionId ?? ""),
          label: String(o.label ?? ""),
        })),
        validation:
          p.validation && typeof p.validation === "object"
            ? {
                min:
                  typeof p.validation.min === "number"
                    ? p.validation.min
                    : null,
                max:
                  typeof p.validation.max === "number"
                    ? p.validation.max
                    : null,
              }
            : null,
        dataClassification: p.dataClassification ?? null,
        snapshotRevision: typeof p.revision === "number" ? p.revision : 0,
        sectionId: String(section.sectionId ?? ""),
        itemId: item.itemId,
      });
    }
  }
  return out.length > 0 ? out : null;
}

// ── Shared context resolution ─────────────────────────────────────────────

async function resolveOwnClient(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
): Promise<{ id: string } | null> {
  return tx.clientProfile.findFirst({
    where: { workspaceId, userId },
    select: { id: true },
  });
}

/** Consent read in deterministic kind order — write path locks each kind's
 * rows FOR UPDATE; read path uses the same order without the lock. */
async function checkRequiredConsent(
  tx: PrismaLike,
  clientProfileId: string,
  registry: ConsentPolicyRegistry,
  forUpdate: boolean,
): Promise<void> {
  const required = requiredConsentsFor("dailyTracking") ?? [];
  for (const kind of required) {
    const version = registry.currentVersion(kind);
    if (version === null) throw new DailyEntryError("policy_not_configured");
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
      throw new DailyEntryError("consent_missing");
  }
}

// ── Save ──────────────────────────────────────────────────────────────────

export type SaveDailyEntryInput = {
  workspaceId: string;
  entryDate: string;
  formToken: string;
  values: OrdinalValue[];
};

export type SaveDailyEntryResult =
  { status: "saved"; revisionSeq: number } | { status: "no_op" };

export async function saveDailyEntry(
  session: SessionLike,
  input: SaveDailyEntryInput,
  deps: DailyEntryDeps = {},
): Promise<SaveDailyEntryResult> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? unconfiguredConsentPolicy;
  const entryDate = parseDeclaredDate(input.entryDate);
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "dailyTracking", "write");
  if (
    typeof input.workspaceId !== "string" ||
    input.workspaceId.length === 0 ||
    typeof input.formToken !== "string" ||
    !Array.isArray(input.values)
  )
    throw new DailyEntryError("invalid_input");

  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        // Resolve the caller's own client profile — needed for the shared
        // advisory key. The authoritative identity checks happen under the
        // locks below; a missing profile fails closed (no lock target).
        const profile = await resolveOwnClient(tx, input.workspaceId, userId);
        if (!profile)
          throw new AccessDeniedError("not_owner", "dailyTracking", "write");

        // 1–2. Advisories — shared client namespace first, then the stable
        // member key (survives row absence/replacement).
        await advisoryLock(tx, `csetup:${input.workspaceId}:${profile.id}`);
        await advisoryLock(tx, `member:${input.workspaceId}:${userId}`);

        // 3. Locked WorkspaceMember — authoritative actor state.
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
          throw new AccessDeniedError("role_denied", "dailyTracking", "write");

        // 4. Re-authorize inside the tx (early denial + ctx for audit).
        const ctx = await authorize(
          session,
          {
            resource: "dailyTracking",
            action: "write",
            workspaceId: input.workspaceId,
            clientProfileId: profile.id,
          },
          createPrismaAuthorizationRepo(tx),
        );
        if (ctx.grantedScope !== "own")
          throw new AccessDeniedError("role_denied", "dailyTracking", "write");

        // 5–6. Stable subject rows.
        await lockRow(
          tx,
          `SELECT id FROM "client_profile" WHERE id = $1 FOR UPDATE`,
          profile.id,
        );
        const setupRows = await tx.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM "client_setup"
           WHERE workspace_id = $1 AND client_profile_id = $2 FOR UPDATE`,
          input.workspaceId,
          profile.id,
        );
        const setup = setupRows[0];
        if (!setup) throw new DailyEntryError("no_active_setup");

        // 7. Active pin (DailyEntry never takes the template lock — the
        // pinned version definition is immutable).
        const pinRows = await tx.$queryRawUnsafe<
          { id: string; template_version_id: string }[]
        >(
          `SELECT id, template_version_id FROM "client_setup_pin"
           WHERE client_setup_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
          setup.id,
        );
        const pin = pinRows[0];
        if (!pin) throw new DailyEntryError("no_active_setup");
        const version = await tx.coachingTemplateVersion.findUnique({
          where: { id: pin.template_version_id },
          select: { id: true, definition: true },
        });
        if (!version) throw new DailyEntryError("ineligible");
        const eligibility = evaluateDailyEntryVersionEligibility(
          version.definition,
        );
        if (!eligibility.eligible) throw new DailyEntryError("ineligible");
        const snapshot = projectSnapshot(version.definition);
        if (!snapshot) throw new DailyEntryError("ineligible");

        // 8. Consent — ordered kind locks, exact versions.
        await checkRequiredConsent(tx, profile.id, registry, true);

        // 9. Entry create-or-lock.
        const entryDateObj = new Date(`${entryDate}T00:00:00Z`);
        let entry = await tx.dailyEntry.findUnique({
          where: {
            workspaceId_clientProfileId_entryDate: {
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
              entryDate: entryDateObj,
            },
          },
          select: { id: true, currentRevisionId: true },
        });
        if (!entry) {
          entry = await tx.dailyEntry.create({
            data: {
              workspaceId: input.workspaceId,
              clientProfileId: profile.id,
              entryDate: entryDateObj,
              createdByMemberId: member.id,
            },
            select: { id: true, currentRevisionId: true },
          });
        } else {
          await lockRow(
            tx,
            `SELECT id FROM "daily_entry" WHERE id = $1 FOR UPDATE`,
            entry.id,
          );
        }

        // 10. Current revision.
        const current = entry.currentRevisionId
          ? await tx.dailyEntryRevision.findUnique({
              where: { id: entry.currentRevisionId },
              select: {
                id: true,
                canonicalHash: true,
                values: {
                  select: {
                    parameterId: true,
                    kind: true,
                    valueNumeric: true,
                    valueRating: true,
                    valueOptionId: true,
                    valueText: true,
                  },
                },
              },
            })
          : null;

        const ordinals = snapshot.map((p) => p.parameterId);
        const ordinalFingerprint = computeSelectionFingerprint(ordinals);
        const expectedToken = computeDailyEntryFormToken({
          workspaceId: input.workspaceId,
          clientProfileId: profile.id,
          entryDate,
          pinId: pin.id,
          templateVersionId: version.id,
          currentRevision: current
            ? {
                tag: "present",
                revisionId: current.id,
                canonicalHash: current.canonicalHash,
              }
            : { tag: "absent" },
          parameters: snapshot.map((p) => ({
            parameterId: p.parameterId,
            parameterKey: p.parameterKey,
            snapshotRevision: p.snapshotRevision,
          })),
          ordinalFingerprint,
          sessionUserId: userId,
          workspaceMemberId: member.id,
        });
        if (input.formToken !== expectedToken)
          throw new DailyEntryError("stale_form");

        // 11. Validate + hash.
        const validated = validateDailyEntryValues(
          input.values,
          ordinals,
          snapshot,
        );
        if (!validated.ok) throw new DailyEntryError("invalid_input");
        const hashParams: HashParam[] = snapshot.map((p) => ({
          parameterId: p.parameterId,
          parameterKey: p.parameterKey,
          dataClassification: p.dataClassification,
          kind: p.kind,
          snapshotRevision: p.snapshotRevision,
          sectionId: p.sectionId,
          itemId: p.itemId,
          value: validated.values.get(p.parameterId) ?? { tag: "absent" },
        }));
        const canonicalHash = computeRevisionCanonicalHash({
          pinId: pin.id,
          templateVersionId: version.id,
          params: hashParams,
        });
        if (current && canonicalHash === current.canonicalHash)
          return { status: "no_op" };

        const changedCount = countChanged(
          current?.values ?? [],
          validated.values,
        );

        const seqRows = await tx.$queryRawUnsafe<{ next: number }[]>(
          `SELECT COALESCE(MAX(seq), 0) + 1 AS next
           FROM "daily_entry_revision" WHERE daily_entry_id = $1`,
          entry.id,
        );
        const seq = seqRows[0]?.next ?? 1;

        const revision = await tx.dailyEntryRevision.create({
          data: {
            dailyEntryId: entry.id,
            workspaceId: input.workspaceId,
            clientProfileId: profile.id,
            clientSetupPinId: pin.id,
            templateVersionId: version.id,
            seq,
            canonicalHash,
            declaredAt: new Date(),
            createdByMemberId: member.id,
          },
          select: { id: true },
        });
        for (const p of snapshot) {
          const v = validated.values.get(p.parameterId);
          if (!v || v.tag === "absent") continue;
          await tx.dailyEntryRevisionValue.create({
            data: valueRow(revision.id, input.workspaceId, p, v),
          });
        }
        await tx.dailyEntry.update({
          where: { id: entry.id },
          data: { currentRevisionId: revision.id },
        });
        await writeAuditEvent(tx, ctx, {
          action: "CREATE",
          resourceType: "daily_entry",
          resourceId: revision.id,
          subjectClientProfileId: profile.id,
          meta: { changed: true, count: changedCount },
        });
        return { status: "saved", revisionSeq: seq };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

function valueRow(
  revisionId: string,
  workspaceId: string,
  p: SnapshotParam,
  v: TaggedValue,
): Prisma.DailyEntryRevisionValueUncheckedCreateInput {
  const base = {
    revisionId,
    workspaceId,
    parameterId: p.parameterId,
    kind: p.kind as Prisma.DailyEntryRevisionValueUncheckedCreateInput["kind"],
  };
  switch (v.tag) {
    case "measurement":
      return { ...base, valueNumeric: v.canonical };
    case "rating":
      return { ...base, valueRating: v.value };
    case "option":
      return { ...base, valueOptionId: v.optionId };
    case "text":
      return { ...base, valueText: v.value };
    default:
      throw new DailyEntryError("invalid_input");
  }
}

type StoredValue = {
  parameterId: string;
  kind: string;
  valueNumeric: unknown;
  valueRating: number | null;
  valueOptionId: string | null;
  valueText: string | null;
};

function storedToTagged(v: StoredValue): TaggedValue {
  switch (v.kind) {
    case "MEASUREMENT":
      return { tag: "measurement", canonical: String(v.valueNumeric) };
    case "RATING":
      return { tag: "rating", value: v.valueRating as number };
    case "OPTION":
      return { tag: "option", optionId: v.valueOptionId as string };
    case "TEXT":
      return { tag: "text", value: v.valueText as string };
    default:
      return { tag: "absent" };
  }
}

function tagKey(v: TaggedValue): string {
  return JSON.stringify(v);
}

function countChanged(
  stored: readonly StoredValue[],
  validated: Map<string, TaggedValue>,
): number {
  const oldMap = new Map<string, TaggedValue>();
  for (const v of stored) oldMap.set(v.parameterId, storedToTagged(v));
  let changed = 0;
  for (const [parameterId, value] of validated) {
    const old = oldMap.get(parameterId) ?? { tag: "absent" };
    if (tagKey(old) !== tagKey(value)) changed += 1;
  }
  return changed;
}

// ── Read surface (form + history payload for the client's own page) ───────

const HISTORY_ENTRY_LIMIT = 30;
const HISTORY_REVISION_LIMIT = 20;

export type DailyEntrySurfaceItem = {
  ordinal: number;
  parameterKey: string;
  label: string;
  helpText: string | null;
  unit: string | null;
  kind: string;
  required: boolean;
  ratingScheme: string | null;
  options: Array<{ ordinal: number; label: string }>;
  validation: { min: number | null; max: number | null } | null;
  /** Prefill raw value (canonical form) for the client's current entry. */
  current: string;
};

export type DailyEntrySurfaceSection = {
  sectionKey: string;
  label: string;
  items: DailyEntrySurfaceItem[];
};

export type DailyEntryHistoryRow = {
  parameterKey: string;
  label: string;
  unit: string | null;
  display: string;
};

export type DailyEntryHistoryEntry = {
  entryDate: string;
  declaredAt: string;
  revisionCount: number;
  values: DailyEntryHistoryRow[];
};

export type DailyEntrySurface =
  | {
      state: "ready";
      formToken: string;
      entryDate: string;
      sections: DailyEntrySurfaceSection[];
      history: DailyEntryHistoryEntry[];
    }
  | { state: "not_applicable" }
  | { state: "unavailable" }
  | { state: "ineligible" }
  | { state: "consent_missing" };

/** Loads the client's own persistent surface. Unlocked read — display only;
 * every write re-validates under the locked transaction. Returns
 * "not_applicable" for any non-CLIENT principal (they keep the structural
 * shell only — no staff value/history view in v1). */
export async function loadDailyEntrySurface(
  session: SessionLike,
  input: { workspaceId: string; entryDate?: string },
  deps: DailyEntryDeps = {},
): Promise<DailyEntrySurface> {
  const db = deps.db ?? defaultPrisma;
  const registry = deps.registry ?? unconfiguredConsentPolicy;
  const userId = session?.user?.id;
  if (typeof userId !== "string" || userId.length === 0)
    throw new AccessDeniedError("unauthenticated", "dailyTracking", "read");

  const profile = await db.clientProfile.findFirst({
    where: { workspaceId: input.workspaceId, userId },
    select: { id: true },
  });
  if (!profile) return { state: "not_applicable" };
  const ctx = await authorize(
    session,
    {
      resource: "dailyTracking",
      action: "read",
      workspaceId: input.workspaceId,
      clientProfileId: profile.id,
    },
    createPrismaAuthorizationRepo(db),
  );
  if (ctx.grantedScope !== "own") return { state: "not_applicable" };

  const member = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId,
      },
    },
    select: { id: true, role: true, status: true },
  });
  if (!member || member.status !== "ACTIVE" || member.role !== "CLIENT")
    return { state: "not_applicable" };

  const setup = await db.clientSetup.findUnique({
    where: {
      workspaceId_clientProfileId: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
      },
    },
    select: { id: true },
  });
  if (!setup) return { state: "unavailable" };
  const pin = await db.clientSetupPin.findFirst({
    where: { clientSetupId: setup.id, status: "ACTIVE" },
    select: { id: true, templateVersionId: true },
  });
  if (!pin) return { state: "unavailable" };
  const version = await db.coachingTemplateVersion.findUnique({
    where: { id: pin.templateVersionId },
    select: { id: true, definition: true },
  });
  if (!version) return { state: "unavailable" };
  if (!evaluateDailyEntryVersionEligibility(version.definition).eligible)
    return { state: "ineligible" };
  const snapshot = projectSnapshot(version.definition);
  if (!snapshot) return { state: "ineligible" };

  // Consent — unlocked check mirrors the write path (write re-locks).
  try {
    await checkRequiredConsent(db, profile.id, registry, false);
  } catch (error) {
    if (error instanceof DailyEntryError) return { state: "consent_missing" };
    throw error;
  }

  const entryDate = input.entryDate
    ? parseDeclaredDate(input.entryDate)
    : new Date().toISOString().slice(0, 10);
  const entry = await db.dailyEntry.findUnique({
    where: {
      workspaceId_clientProfileId_entryDate: {
        workspaceId: input.workspaceId,
        clientProfileId: profile.id,
        entryDate: new Date(`${entryDate}T00:00:00Z`),
      },
    },
    select: { id: true, currentRevisionId: true },
  });
  const currentRevision = entry?.currentRevisionId
    ? await db.dailyEntryRevision.findUnique({
        where: { id: entry.currentRevisionId },
        select: {
          id: true,
          canonicalHash: true,
          values: {
            select: {
              parameterId: true,
              kind: true,
              valueNumeric: true,
              valueRating: true,
              valueOptionId: true,
              valueText: true,
            },
          },
        },
      })
    : null;

  const ordinals = snapshot.map((p) => p.parameterId);
  const ordinalFingerprint = computeSelectionFingerprint(ordinals);
  const formToken = computeDailyEntryFormToken({
    workspaceId: input.workspaceId,
    clientProfileId: profile.id,
    entryDate,
    pinId: pin.id,
    templateVersionId: version.id,
    currentRevision: currentRevision
      ? {
          tag: "present",
          revisionId: currentRevision.id,
          canonicalHash: currentRevision.canonicalHash,
        }
      : { tag: "absent" },
    parameters: snapshot.map((p) => ({
      parameterId: p.parameterId,
      parameterKey: p.parameterKey,
      snapshotRevision: p.snapshotRevision,
    })),
    ordinalFingerprint,
    sessionUserId: userId,
    workspaceMemberId: member.id,
  });

  // Prefill current values (display ordinal for OPTION = snapshot index).
  const byParam = new Map(
    (currentRevision?.values ?? []).map((v) => [v.parameterId, v]),
  );
  const currentFor = (p: SnapshotParam): string => {
    const v = byParam.get(p.parameterId);
    if (!v) return "";
    switch (p.kind) {
      case "MEASUREMENT":
        return String(v.valueNumeric ?? "");
      case "RATING":
        return v.valueRating === null ? "" : String(v.valueRating);
      case "OPTION": {
        const idx = p.options.findIndex((o) => o.optionId === v.valueOptionId);
        return idx < 0 ? "" : String(idx);
      }
      case "TEXT":
        return v.valueText ?? "";
      default:
        return "";
    }
  };

  const sections: DailyEntrySurfaceSection[] = [];
  let ordinal = 0;
  const sectionMap = new Map<string, SnapshotParam[]>();
  for (const p of snapshot) {
    const arr = sectionMap.get(p.sectionId) ?? [];
    arr.push(p);
    sectionMap.set(p.sectionId, arr);
  }
  const def = version.definition as VersionDefinition;
  for (const [sectionId, params] of sectionMap) {
    const secDef = def.sections?.find((s) => s.sectionId === sectionId);
    sections.push({
      sectionKey: sectionId,
      label: secDef?.label ?? "",
      items: params.map((p) => {
        const meta = (def.parameters ?? {})[p.parameterId] ?? {};
        return {
          ordinal: ordinal++,
          parameterKey: p.parameterKey,
          label: meta.label ?? "",
          helpText: meta.helpText ?? null,
          unit: p.unit,
          kind: p.kind,
          required: p.required,
          ratingScheme: p.ratingScheme,
          options: p.options.map((o, i) => ({
            ordinal: i,
            label: o.label,
          })),
          validation: p.validation,
          current: currentFor(p),
        };
      }),
    });
  }

  // History — current revision of recent entries + revision counts.
  const entries = await db.dailyEntry.findMany({
    where: {
      workspaceId: input.workspaceId,
      clientProfileId: profile.id,
    },
    orderBy: { entryDate: "desc" },
    take: HISTORY_ENTRY_LIMIT,
    select: {
      entryDate: true,
      currentRevisionId: true,
      _count: { select: { revisions: true } },
    },
  });
  const revIds = entries
    .map((e) => e.currentRevisionId)
    .filter((id): id is string => id !== null);
  const revs = revIds.length
    ? await db.dailyEntryRevision.findMany({
        where: { id: { in: revIds } },
        select: {
          id: true,
          declaredAt: true,
          templateVersionId: true,
          values: {
            select: {
              parameterId: true,
              kind: true,
              valueNumeric: true,
              valueRating: true,
              valueOptionId: true,
              valueText: true,
            },
          },
        },
      })
    : [];
  const revById = new Map(revs.map((r) => [r.id, r]));
  // Each historical revision renders through ITS OWN immutable template
  // version — labels/options/provenance stay stable after later draft
  // edits, label edits, or new template versions (#71).
  const historyVersionIds = [
    ...new Set(revs.map((r) => r.templateVersionId)),
  ].filter((id) => id !== version.id);
  const historyVersions = historyVersionIds.length
    ? await db.coachingTemplateVersion.findMany({
        where: { id: { in: historyVersionIds } },
        select: { id: true, definition: true },
      })
    : [];
  const snapshotByVersion = new Map<string, SnapshotParam[]>();
  const defByVersion = new Map<string, VersionDefinition>();
  snapshotByVersion.set(version.id, snapshot);
  defByVersion.set(version.id, version.definition as VersionDefinition);
  for (const hv of historyVersions) {
    const s = projectSnapshot(hv.definition);
    if (s !== null) {
      snapshotByVersion.set(hv.id, s);
      defByVersion.set(hv.id, hv.definition as VersionDefinition);
    }
  }
  const history: DailyEntryHistoryEntry[] = entries
    .filter(
      (e) => e.currentRevisionId !== null && revById.has(e.currentRevisionId),
    )
    .map((e) => {
      const rev = revById.get(e.currentRevisionId!)!;
      const revSnapshot = snapshotByVersion.get(rev.templateVersionId) ?? [];
      const revDef = defByVersion.get(rev.templateVersionId) ?? def;
      const paramById = new Map(revSnapshot.map((p) => [p.parameterId, p]));
      return {
        entryDate: e.entryDate.toISOString().slice(0, 10),
        declaredAt: rev.declaredAt.toISOString(),
        revisionCount: Math.min(e._count.revisions, HISTORY_REVISION_LIMIT),
        values: (rev.values ?? [])
          .map((v) => {
            const p = paramById.get(v.parameterId);
            if (!p) return null;
            const meta = (revDef.parameters ?? {})[v.parameterId] ?? {};
            let display = "";
            switch (p.kind) {
              case "MEASUREMENT":
                display = String(v.valueNumeric ?? "");
                break;
              case "RATING":
                display = v.valueRating === null ? "" : String(v.valueRating);
                break;
              case "OPTION":
                display =
                  p.options.find((o) => o.optionId === v.valueOptionId)
                    ?.label ?? "";
                break;
              case "TEXT":
                display = v.valueText ?? "";
                break;
            }
            return {
              parameterKey: p.parameterKey,
              label: meta.label ?? "",
              unit: p.unit,
              display,
            };
          })
          .filter((v): v is DailyEntryHistoryRow => v !== null),
      };
    });

  return {
    state: "ready",
    formToken,
    entryDate,
    sections,
    history,
  };
}
