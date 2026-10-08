import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import {
  AccessDeniedError,
  authorize,
  type AuthorizationContext,
  type SessionLike,
} from "../auth/guard";
import {
  createPrismaAuthorizationRepo,
  type PrismaLike,
} from "../workspace/access";
import { writeAuditEvent } from "../audit";
import { listClientSetupPinIds } from "./client-setup";
import { CLIENT_SETUP_LIMITS } from "./client-setup-gate";
import { ClientSetupTransitionError } from "./client-setup-transition-gate";
import { computeSelectionFingerprint } from "./selection-fingerprint";
import { evaluateDailyEntryVersionEligibility } from "./daily-entry-eligibility";
import {
  buildTransitionSummary,
  computeTransitionDiff,
  validateTransitionSummary,
  type TransitionDiff,
  type TransitionDirection,
  type TransitionSummary,
} from "./transition-diff";
import {
  BLOCKED_REASON_RANK,
  canonicalProviderOutputsHash,
  collectProviderImpacts,
  DECLARED_CONSUMERS,
  PROVIDERS,
  providerSetIdentity,
  type BlockedReasonCode,
  type ProviderImpact,
  type ProviderSet,
} from "./transition-impact";

/**
 * P-020B — C2 guarded service: dev-gated review + execution of coaching
 * template version upgrades and rollbacks for existing Client Setups
 * (product-decisions #58–#62 + P-020-R3 §14–§26 + R3.1 addenda 4–6).
 *
 * Authorization: the ENTIRE surface — target discovery, diff, eligibility,
 * provider calls, review, fingerprint, confirmation, execution — requires
 * current `clientSetups` WRITE authority (workspace owner or the client's
 * currently-assigned ACTIVE coach). The positional pin resolution uses the
 * caller's authorized ordered pin list (the same contract as cancel), and
 * write authorization is re-evaluated inside the execution transaction on
 * the tx client — read authority is never a substitute.
 *
 * Execution lock order (binding — every client-scoped writer takes the
 * advisory lock first, so publish/archive which take template locks only
 * can never close a deadlock cycle):
 *   1. advisory `csetup:{workspace}:{client}` (pg_advisory_xact_lock)
 *   2. client_setup row FOR UPDATE
 *   3. coaching_template row FOR UPDATE (must be ACTIVE — archived
 *      templates are frozen, decision #60)
 *   4. current pin row FOR UPDATE (must be ACTIVE)
 *   5. target/provider reads (providers are read-only)
 *   6. old-pin supersede + new pin insert (seq = max+1)
 *   7. transaction-bound audits (UPDATE old pin, CREATE new pin)
 *
 * The review fingerprint binds actor memberId (consistency material only —
 * never echoed, grants no authority), workspace/client, active pin +
 * current version, direction/target, upgrade-latest state or the rollback
 * candidate list + position, diffHash, eligibility, provider-set identity,
 * canonical provider output, template status, and the confirmation
 * requirement. A mismatch is `stale_selection` with zero writes/audits.
 * `ClientAssignment` rows are never touched.
 */

// ── Concurrency protocol (mirrors client-setup.ts) ───────────────────────

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
        throw new ClientSetupTransitionError("serialization_conflict");
      throw error;
    }
  }
}

/** Transaction-scoped advisory lock on the (workspace, client) tuple —
 * identical key space to the C1 service so transitions serialize against
 * assignment/cancellation for the same client. */
async function lockClientTuple(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  clientProfileId: string,
): Promise<void> {
  // $executeRawUnsafe: pg_advisory_xact_lock returns void, which $queryRaw
  // cannot deserialize. hashtextextended matches the reviewed convention.
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    `csetup:${workspaceId}:${clientProfileId}`,
  );
}

function boundedIndex(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= CLIENT_SETUP_LIMITS.indexMax
    ? value
    : null;
}

export function isTransitionDirection(
  value: unknown,
): value is TransitionDirection {
  return value === "UPGRADE" || value === "ROLLBACK";
}

const DEFAULT_PROVIDER_SET: ProviderSet = {
  declarations: DECLARED_CONSUMERS,
  providers: PROVIDERS,
};

// ── Review fingerprint (R3 §20 + addendum 6) ─────────────────────────────

const lp = (s: string) => `${Buffer.byteLength(s, "utf8")}:${s}`;

export type ReviewFingerprintMaterial = {
  /** Internal consistency material only — NEVER echoed to the browser,
   * grants no authority, never replaces fresh authorization; its only
   * observable effect is that another actor's review goes stale. */
  actorMemberId: string;
  workspaceId: string;
  clientProfileId: string;
  pinId: string;
  currentVersionId: string;
  direction: TransitionDirection;
  targetVersionId: string;
  /** `latest:<versionId>` for upgrades; `rollback:<candidateFp>:<index>`
   * for rollbacks. */
  selectionState: string;
  diffHash: string;
  eligible: boolean;
  eligibilityReasonCodes: string[];
  providerSetIdentity: string;
  providerOutputsHash: string;
  templateStatus: string;
  confirmRequired: boolean;
};

export function computeReviewFingerprint(
  material: ReviewFingerprintMaterial,
): string {
  const hash = createHash("sha256");
  hash.update("C2-REVIEW-v1\x00");
  for (const field of [
    material.actorMemberId,
    material.workspaceId,
    material.clientProfileId,
    material.pinId,
    material.currentVersionId,
    material.direction,
    material.targetVersionId,
    material.selectionState,
    material.diffHash,
    material.eligible ? "1" : "0",
    material.eligibilityReasonCodes.join(","),
    material.providerSetIdentity,
    material.providerOutputsHash,
    material.templateStatus,
    material.confirmRequired ? "required" : "not-required",
  ]) {
    hash.update(lp(field));
  }
  return hash.digest("hex");
}

// ── Internal review model (never serialized directly) ────────────────────

export type InternalTransitionReview = {
  workspaceId: string;
  clientProfileId: string;
  clientSetupId: string;
  pinId: string;
  templateId: string;
  templateName: string;
  templateStatus: string;
  actorMemberId: string;
  direction: TransitionDirection;
  currentVersionId: string;
  currentVersionSeq: number;
  targetVersionId: string;
  targetVersionSeq: number;
  targetPublishedAt: Date;
  rollbackCandidateIds: string[];
  diff: TransitionDiff;
  eligible: boolean;
  eligibilityReasonCodes: string[];
  providerImpacts: ProviderImpact[];
  blockedReasonCodes: BlockedReasonCode[];
  providersDeclared: number;
  summary: TransitionSummary;
  reviewFingerprint: string;
};

export type InternalTransitionTargets = {
  clientProfileId: string;
  templateId: string;
  templateName: string;
  currentVersionSeq: number;
  canUpgrade: boolean;
  latestVersionSeq: number | null;
  rollbackTargets: Array<{
    index: number;
    versionSeq: number;
    publishedAt: Date;
    versionId: string;
  }>;
};

// ── Positional pin resolution ────────────────────────────────────────────

/** Resolves the browser's positional (index + row-list fingerprint) pin
 * selection — identical contract to the C1 cancel path. The pin list is
 * scoped to the caller's authorized rows; write authorization is enforced
 * separately before any review output or mutation. */
export async function resolveTransitionPin(
  session: SessionLike,
  input: { workspaceId: string; pinIndex: number; rowFingerprint: string },
  client: PrismaClient = defaultPrisma,
): Promise<{ pinId: string }> {
  const { ids, fingerprint } = await listClientSetupPinIds(
    session,
    { workspaceId: input.workspaceId },
    client,
  );
  if (fingerprint !== input.rowFingerprint)
    throw new ClientSetupTransitionError("stale_selection");
  const pinId = ids[boundedIndex(input.pinIndex) ?? -1];
  if (!pinId) throw new ClientSetupTransitionError("invalid_input");
  return { pinId };
}

type PinRow = {
  id: string;
  clientSetupId: string;
  clientProfileId: string;
  templateId: string;
  templateVersionId: string;
  status: string;
};

async function loadPin(
  db: PrismaLike,
  workspaceId: string,
  pinId: string,
): Promise<PinRow> {
  const pin = await db.clientSetupPin.findFirst({
    where: { id: pinId, workspaceId },
    select: {
      id: true,
      clientSetupId: true,
      clientProfileId: true,
      templateId: true,
      templateVersionId: true,
      status: true,
    },
  });
  if (!pin) throw new ClientSetupTransitionError("assignment_not_accessible");
  return pin;
}

/** Write authorization for the pin's client — denied roles learn nothing
 * beyond the uniform not-accessible error (no review or impact output). */
async function authorizeTransitionWrite(
  db: PrismaLike,
  session: SessionLike,
  workspaceId: string,
  clientProfileId: string,
): Promise<AuthorizationContext> {
  try {
    return await authorize(
      session,
      {
        resource: "clientSetups",
        action: "write",
        workspaceId,
        clientProfileId,
      },
      createPrismaAuthorizationRepo(db),
    );
  } catch (error) {
    if (error instanceof AccessDeniedError)
      throw new ClientSetupTransitionError("assignment_not_accessible");
    throw error;
  }
}

// ── Target resolution + review construction ──────────────────────────────

type VersionRow = {
  id: string;
  versionSeq: number;
  publishedAt: Date;
  definition: unknown;
};

async function loadVersions(
  db: PrismaLike,
  workspaceId: string,
  templateId: string,
): Promise<VersionRow[]> {
  return db.coachingTemplateVersion.findMany({
    where: { templateId, workspaceId },
    orderBy: { versionSeq: "asc" },
    select: { id: true, versionSeq: true, publishedAt: true, definition: true },
  });
}

function unionBlocked(
  a: readonly BlockedReasonCode[],
  b: readonly BlockedReasonCode[],
): BlockedReasonCode[] {
  return [...new Set([...a, ...b])].sort(
    (x, y) => BLOCKED_REASON_RANK[x] - BLOCKED_REASON_RANK[y],
  );
}

/** Computes the full review material against the CURRENT locked/read state.
 * Shared verbatim by the review call and the in-transaction execution path
 * so the fingerprint comparison is apples-to-apples. */
async function buildReview(
  db: PrismaLike,
  ctx: AuthorizationContext,
  workspaceId: string,
  pin: PinRow,
  template: { id: string; name: string; status: string },
  direction: TransitionDirection,
  targetIndex: number | null,
  providerSet: ProviderSet,
): Promise<InternalTransitionReview> {
  const versions = await loadVersions(db, workspaceId, template.id);
  const current = versions.find((v) => v.id === pin.templateVersionId);
  if (!current) throw new ClientSetupTransitionError("incoherent_definition");

  let target: VersionRow;
  let selectionState: string;
  let rollbackCandidateIds: string[] = [];
  if (direction === "UPGRADE") {
    // Server-selected latest retained published version (decision #58).
    target = versions[versions.length - 1]!;
    if (!target || target.versionSeq <= current.versionSeq)
      throw new ClientSetupTransitionError("no_upgrade_available");
    selectionState = `latest:${target.id}`;
  } else {
    const candidates = versions.filter(
      (v) => v.versionSeq < current.versionSeq,
    );
    rollbackCandidateIds = candidates.map((v) => v.id);
    const idx = targetIndex === null ? null : boundedIndex(targetIndex);
    if (idx === null) throw new ClientSetupTransitionError("invalid_input");
    const picked = candidates[idx];
    if (!picked) throw new ClientSetupTransitionError("invalid_input");
    target = picked;
    selectionState = `rollback:${computeSelectionFingerprint(
      rollbackCandidateIds,
    )}:${idx}`;
  }

  const diff = computeTransitionDiff(current.definition, target.definition);
  if (diff.defective)
    throw new ClientSetupTransitionError("incoherent_definition");

  // P-020A eligibility module — imported verbatim, never duplicated.
  const eligibility = evaluateDailyEntryVersionEligibility(target.definition);
  const eligibilityBlocked: BlockedReasonCode[] = eligibility.eligible
    ? []
    : ["TARGET_INELIGIBLE"];

  const providerInput = {
    direction,
    removed: diff.entries
      .filter((e) => e.category === "removed")
      .map((e) => ({
        parameterId: e.parameterId,
        parameterKey: e.parameterKey,
      })),
    reboundFrom: diff.entries
      .filter((e) => e.category === "rebound")
      .map((e) => ({
        parameterId: e.parameterId,
        parameterKey: e.parameterKey,
      })),
    reboundTo: diff.entries
      .filter((e) => e.category === "rebound")
      .map((e) => ({
        parameterId: e.reboundParameterId as string,
        parameterKey: e.reboundParameterKey as string,
      })),
  };
  const { impacts, blockedReasonCodes } = await collectProviderImpacts(
    providerSet,
    providerInput,
  );
  const blocked = unionBlocked(eligibilityBlocked, blockedReasonCodes);

  const summary = buildTransitionSummary(direction, diff.categories);
  const reviewFingerprint = computeReviewFingerprint({
    actorMemberId: ctx.workspaceMemberId as string,
    workspaceId,
    clientProfileId: pin.clientProfileId,
    pinId: pin.id,
    currentVersionId: current.id,
    direction,
    targetVersionId: target.id,
    selectionState,
    diffHash: diff.diffHash,
    eligible: eligibility.eligible,
    eligibilityReasonCodes: eligibility.reasonCodes,
    providerSetIdentity: providerSetIdentity(providerSet.declarations),
    providerOutputsHash: canonicalProviderOutputsHash(impacts),
    templateStatus: template.status,
    confirmRequired: true,
  });

  return {
    workspaceId,
    clientProfileId: pin.clientProfileId,
    clientSetupId: pin.clientSetupId,
    pinId: pin.id,
    templateId: template.id,
    templateName: template.name,
    templateStatus: template.status,
    actorMemberId: ctx.workspaceMemberId as string,
    direction,
    currentVersionId: current.id,
    currentVersionSeq: current.versionSeq,
    targetVersionId: target.id,
    targetVersionSeq: target.versionSeq,
    targetPublishedAt: target.publishedAt,
    rollbackCandidateIds,
    diff,
    eligible: eligibility.eligible,
    eligibilityReasonCodes: eligibility.reasonCodes,
    providerImpacts: impacts,
    blockedReasonCodes: blocked,
    providersDeclared: providerSet.declarations.length,
    summary,
    reviewFingerprint,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────

/** Per-pin transition target discovery — requires write authority so denied
 * roles receive nothing (no upgrade/rollback targets, no review output). */
export async function getTransitionTargets(
  session: SessionLike,
  input: { workspaceId: string; pinIndex: number; rowFingerprint: string },
  client: PrismaClient = defaultPrisma,
): Promise<InternalTransitionTargets> {
  const { pinId } = await resolveTransitionPin(session, input, client);
  const pin = await loadPin(client, input.workspaceId, pinId);
  await authorizeTransitionWrite(
    client,
    session,
    input.workspaceId,
    pin.clientProfileId,
  );
  if (pin.status !== "ACTIVE")
    throw new ClientSetupTransitionError("assignment_not_active");
  const template = await client.coachingTemplate.findFirst({
    where: { id: pin.templateId, workspaceId: input.workspaceId },
    select: { id: true, name: true, status: true },
  });
  if (!template)
    throw new ClientSetupTransitionError("assignment_not_accessible");
  if (template.status !== "ACTIVE")
    throw new ClientSetupTransitionError("transition_not_available");
  const versions = await loadVersions(client, input.workspaceId, template.id);
  const current = versions.find((v) => v.id === pin.templateVersionId);
  if (!current) throw new ClientSetupTransitionError("incoherent_definition");
  const latest = versions[versions.length - 1]!;
  const rollbackTargets = versions
    .filter((v) => v.versionSeq < current.versionSeq)
    .map((v, index) => ({
      index,
      versionSeq: v.versionSeq,
      publishedAt: v.publishedAt,
      versionId: v.id,
    }));
  return {
    clientProfileId: pin.clientProfileId,
    templateId: template.id,
    templateName: template.name,
    currentVersionSeq: current.versionSeq,
    canUpgrade: latest.versionSeq > current.versionSeq,
    latestVersionSeq: latest.versionSeq,
    rollbackTargets,
  };
}

/** Review: gate/session enforced upstream; write authorization before any
 * review or impact output; computes diff + eligibility + providers and
 * returns the internal model + fingerprint (serialization is the boundary's
 * sole job). */
export async function reviewClientSetupTransition(
  session: SessionLike,
  input: {
    workspaceId: string;
    pinIndex: number;
    rowFingerprint: string;
    direction: TransitionDirection;
    targetIndex?: number;
  },
  client: PrismaClient = defaultPrisma,
  providerSet: ProviderSet = DEFAULT_PROVIDER_SET,
): Promise<InternalTransitionReview> {
  if (!isTransitionDirection(input.direction))
    throw new ClientSetupTransitionError("invalid_input");
  const { pinId } = await resolveTransitionPin(session, input, client);
  const pin = await loadPin(client, input.workspaceId, pinId);
  const ctx = await authorizeTransitionWrite(
    client,
    session,
    input.workspaceId,
    pin.clientProfileId,
  );
  if (pin.status !== "ACTIVE")
    throw new ClientSetupTransitionError("assignment_not_active");
  const template = await client.coachingTemplate.findFirst({
    where: { id: pin.templateId, workspaceId: input.workspaceId },
    select: { id: true, name: true, status: true },
  });
  if (!template)
    throw new ClientSetupTransitionError("assignment_not_accessible");
  if (template.status !== "ACTIVE")
    throw new ClientSetupTransitionError("transition_not_available");
  return buildReview(
    client,
    ctx,
    input.workspaceId,
    pin,
    template,
    input.direction,
    input.targetIndex ?? null,
    providerSet,
  );
}

// ── Execution ────────────────────────────────────────────────────────────

type LockedTemplateRow = { id: string; name: string; status: string };
type LockedPinRow = { id: string; status: string };

/**
 * Execute a reviewed transition. Re-resolves the positional selection,
 * opens a Serializable transaction, re-authorizes inside it, takes the
 * binding lock order, recomputes the entire review under locks, compares
 * the fingerprint, then performs the atomic supersede + successor insert +
 * transaction-bound audits. Any drift → `stale_selection` with zero writes;
 * a blocked recomputation → `transition_blocked` with zero writes.
 */
export async function executeClientSetupTransition(
  session: SessionLike,
  input: {
    workspaceId: string;
    pinIndex: number;
    rowFingerprint: string;
    direction: TransitionDirection;
    targetIndex?: number;
    reviewFingerprint: string;
  },
  client: PrismaClient = defaultPrisma,
  providerSet: ProviderSet = DEFAULT_PROVIDER_SET,
): Promise<{
  applied: true;
  direction: TransitionDirection;
  targetVersionSeq: number;
}> {
  if (!isTransitionDirection(input.direction))
    throw new ClientSetupTransitionError("invalid_input");
  const { pinId } = await resolveTransitionPin(session, input, client);
  const db = client;
  return withSerializedRetry(() =>
    db.$transaction(
      async (tx) => {
        const pin = await loadPin(tx, input.workspaceId, pinId);
        const ctx = await authorizeTransitionWrite(
          tx,
          session,
          input.workspaceId,
          pin.clientProfileId,
        );
        // Binding lock order: advisory → aggregate → template → pin.
        await lockClientTuple(tx, input.workspaceId, pin.clientProfileId);
        await tx.$executeRawUnsafe(
          `SELECT id FROM "client_setup" WHERE id = $1 FOR UPDATE`,
          pin.clientSetupId,
        );
        const templateRows = await tx.$queryRawUnsafe<LockedTemplateRow[]>(
          `SELECT id, name, status FROM "coaching_template"
           WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
          pin.templateId,
          input.workspaceId,
        );
        const template = templateRows[0];
        if (!template)
          throw new ClientSetupTransitionError("assignment_not_accessible");
        if (template.status !== "ACTIVE")
          throw new ClientSetupTransitionError("transition_not_available");
        const pinRows = await tx.$queryRawUnsafe<LockedPinRow[]>(
          `SELECT id, status FROM "client_setup_pin" WHERE id = $1 FOR UPDATE`,
          pin.id,
        );
        const lockedPin = pinRows[0];
        if (!lockedPin)
          throw new ClientSetupTransitionError("assignment_not_accessible");
        if (lockedPin.status !== "ACTIVE")
          throw new ClientSetupTransitionError("assignment_not_active");

        // Recompute EVERYTHING under the locks — retries rerun the body.
        const review = await buildReview(
          tx,
          ctx,
          input.workspaceId,
          pin,
          template,
          input.direction,
          input.targetIndex ?? null,
          providerSet,
        );
        if (review.reviewFingerprint !== input.reviewFingerprint)
          throw new ClientSetupTransitionError("stale_selection");
        if (review.blockedReasonCodes.length > 0)
          throw new ClientSetupTransitionError("transition_blocked");

        const now = new Date();
        await tx.clientSetupPin.update({
          where: { id: pin.id },
          data: {
            status: "SUPERSEDED",
            endedByMemberId: ctx.workspaceMemberId as string,
            endedAt: now,
          },
        });
        const seqRows = await tx.$queryRawUnsafe<{ next: number }[]>(
          `SELECT CAST(COALESCE(MAX(seq), 0) + 1 AS integer) AS next
           FROM "client_setup_pin" WHERE client_setup_id = $1`,
          pin.clientSetupId,
        );
        const seq = seqRows[0]!.next;
        // Full service-side allowlist validation on the exact value about
        // to be persisted — fails closed even though it is computed here.
        if (validateTransitionSummary(review.summary) === null)
          throw new ClientSetupTransitionError("incoherent_definition");
        let created;
        try {
          created = await tx.clientSetupPin.create({
            data: {
              clientSetupId: pin.clientSetupId,
              workspaceId: input.workspaceId,
              clientProfileId: pin.clientProfileId,
              seq,
              templateId: pin.templateId,
              templateVersionId: review.targetVersionId,
              status: "ACTIVE",
              assignedByMemberId: ctx.workspaceMemberId as string,
              supersedesPinId: pin.id,
              transitionKind: review.direction,
              transitionSummary:
                review.summary as unknown as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
        } catch (error) {
          // Unique/anti-branching authority: a concurrent winner means our
          // reviewed state is stale — fail closed, zero writes.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
            throw new ClientSetupTransitionError("stale_selection");
          throw error;
        }
        // Transaction-bound audits — a failed audit rolls the transition
        // back. meta.version carries the PINNED template versionSeq (never
        // pin seq); meta.count is the structural warning count only.
        await writeAuditEvent(tx, ctx, {
          action: "UPDATE",
          resourceType: "client_setup_pin",
          resourceId: pin.id,
          subjectClientProfileId: pin.clientProfileId,
          meta: { changed: true, version: `v${review.currentVersionSeq}` },
        });
        await writeAuditEvent(tx, ctx, {
          action: "CREATE",
          resourceType: "client_setup_pin",
          resourceId: created.id,
          subjectClientProfileId: pin.clientProfileId,
          meta: {
            changed: true,
            version: `v${review.targetVersionSeq}`,
            count: review.diff.warningCount,
          },
        });
        return {
          applied: true as const,
          direction: review.direction,
          targetVersionSeq: review.targetVersionSeq,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
