import type { PrismaClient } from "@prisma/client";

import { prisma } from "../db";
import { AccessDeniedError, type SessionLike } from "../auth/guard";
import {
  ClientSetupTransitionError,
  isClientSetupTransitionsEnabled,
} from "./client-setup-transition-gate";
import { CLIENT_SETUP_LIMITS } from "./client-setup-gate";
import {
  executeClientSetupTransition,
  getTransitionTargets,
  isTransitionDirection,
  reviewClientSetupTransition,
  type InternalTransitionReview,
} from "./client-setup-transition";
import type { DiffCategory, TransitionDirection } from "./transition-diff";
import type {
  BlockedReasonCode,
  ImpactReasonCode,
  ImpactRole,
  ProviderSet,
} from "./transition-impact";
import { DECLARED_CONSUMERS, PROVIDERS } from "./transition-impact";

/**
 * P-020B client-setup transition boundary — the single app-facing surface
 * for the guarded transition service (product-decisions #58–#62).
 *
 * Every entry point:
 *  1. checks `ENABLE_CLIENT_SETUP_TRANSITIONS === "1"` AND the parent
 *     `ENABLE_CLIENT_SETUP === "1"` FIRST — before binding any
 *     user-controlled input, before the database, before providers;
 *  2. binds indices/direction/fingerprints to bounded, well-formed values;
 *  3. delegates to the service, which performs flag-independent write
 *     authorization;
 *  4. maps failure codes to stable, non-disclosing messages;
 *  5. serializes ONLY through `serializeTransitionReview` — the sole
 *     boundary between internal review data and browser output (addendum
 *     5). No raw setup/pin/version/template/parameter/member ids ever cross
 *     it; the browser sees labels, parameterKeys, structural counts, closed
 *     reason codes, canonical count strings, date bounds, and fingerprints.
 */

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";
const GENERIC = "Something went wrong. Please try again in a moment.";
const OFF = "This feature is not available.";
const STALE =
  "The list changed while you were working — refresh and try again.";

const CODE_TO_MESSAGE: Record<string, string> = {
  invalid_input: INVALID,
  assignment_not_accessible: DENIED,
  assignment_not_active: "This assignment is no longer active.",
  transition_not_available: "This transition isn't available.",
  no_upgrade_available: "There is no newer version to upgrade to.",
  incoherent_definition: "This transition can't be reviewed safely.",
  transition_blocked: "This transition is blocked.",
  provider_configuration: GENERIC,
  stale_selection: STALE,
  serialization_conflict: "A conflict occurred. Please try again.",
};

function isWellFormedString(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

function boundedId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= CLIENT_SETUP_LIMITS.idMax &&
    isWellFormedString(value)
    ? value
    : null;
}

function boundedIndex(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= CLIENT_SETUP_LIMITS.indexMax
    ? value
    : null;
}

function mapError(error: unknown): { ok: false; message: string } {
  if (error instanceof ClientSetupTransitionError) {
    return { ok: false, message: CODE_TO_MESSAGE[error.code] ?? GENERIC };
  }
  if (error instanceof AccessDeniedError) {
    return { ok: false, message: DENIED };
  }
  return { ok: false, message: GENERIC };
}

function enabled(): boolean {
  return isClientSetupTransitionsEnabled(
    process.env.ENABLE_CLIENT_SETUP_TRANSITIONS,
    process.env.ENABLE_CLIENT_SETUP,
  );
}

// ── Display-safe output types (no internal identifiers) ──────────────────

export type TransitionTargetsPayload = {
  canUpgrade: boolean;
  latestVersionSeq: number | null;
  currentVersionSeq: number;
  templateName: string;
  rollbackTargets: Array<{
    index: number;
    versionSeq: number;
    publishedAt: string;
  }>;
};

export type SerializedDiffEntry = {
  category: DiffCategory;
  parameterKey: string | null;
  parameterLabel: string | null;
  reboundParameterKey: string | null;
  reboundParameterLabel: string | null;
  detail: string;
  warn: boolean;
};

export type SerializedProviderImpact = {
  consumerKey: string;
  contractVersion: number;
  affectedParameters: Array<{
    parameterKey: string;
    impactRole: ImpactRole;
    count: string;
    earliestDate: string | null;
    latestDate: string | null;
    reasonCode: ImpactReasonCode;
  }>;
  blockedReasonCodes: BlockedReasonCode[];
};

export type TransitionReviewPayload = {
  direction: TransitionDirection;
  templateName: string;
  currentVersionSeq: number;
  targetVersionSeq: number;
  targetPublishedAt: string;
  categories: Record<DiffCategory, number>;
  warningCount: number;
  entries: SerializedDiffEntry[];
  eligibilityReasonCodes: string[];
  blockedReasonCodes: BlockedReasonCode[];
  providerImpacts: SerializedProviderImpact[];
  /** Number of declared data consumers — 0 in this slice (honest
   * zero-provider state, not "no history"). */
  providersDeclared: number;
  requiresConfirmation: true;
  reviewFingerprint: string;
};

/**
 * THE SOLE browser-serialization boundary (P-020-R3.1 addendum 5). Internal
 * review data enters; only labels, parameterKeys, categories, closed reason
 * codes, canonical count strings, date bounds, and the fingerprint leave.
 * All pin/setup/version/template/parameter/member database ids are stripped
 * here — no alternate serializer may bypass this function.
 */
export function serializeTransitionReview(
  review: InternalTransitionReview,
): TransitionReviewPayload {
  return {
    direction: review.direction,
    templateName: review.templateName,
    currentVersionSeq: review.currentVersionSeq,
    targetVersionSeq: review.targetVersionSeq,
    targetPublishedAt: review.targetPublishedAt.toISOString(),
    categories: { ...review.diff.categories },
    warningCount: review.diff.warningCount,
    entries: review.diff.entries.map((e) => ({
      category: e.category,
      parameterKey: e.parameterKey === "" ? null : e.parameterKey,
      parameterLabel: e.parameterLabel,
      reboundParameterKey: e.reboundParameterKey ?? null,
      reboundParameterLabel: e.reboundParameterLabel ?? null,
      detail: e.detail,
      warn: e.warn,
    })),
    eligibilityReasonCodes: [...review.eligibilityReasonCodes],
    blockedReasonCodes: [...review.blockedReasonCodes],
    providerImpacts: review.providerImpacts.map((p) => ({
      consumerKey: p.consumerKey,
      contractVersion: p.contractVersion,
      affectedParameters: p.affectedParameters.map((a) => ({
        parameterKey: a.parameterKey,
        impactRole: a.impactRole,
        count: a.count,
        earliestDate: a.earliestDate,
        latestDate: a.latestDate,
        reasonCode: a.reasonCode,
      })),
      blockedReasonCodes: [...p.blockedReasonCodes],
    })),
    providersDeclared: review.providersDeclared,
    requiresConfirmation: true,
    reviewFingerprint: review.reviewFingerprint,
  };
}

// ── Action-facing entry points ───────────────────────────────────────────

type Deps = { db?: PrismaClient; providers?: ProviderSet };

export async function getTransitionTargetsFromAction(
  session: SessionLike,
  input: { workspaceId: string; pinIndex: number; rowFingerprint: string },
  deps: Deps = {},
): Promise<ActionResult<TransitionTargetsPayload>> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  const pinIndex = boundedIndex(input?.pinIndex);
  const rowFingerprint = boundedId(input?.rowFingerprint);
  if (workspaceId === null || pinIndex === null || rowFingerprint === null)
    return { ok: false, message: INVALID };
  try {
    const targets = await getTransitionTargets(
      session,
      { workspaceId, pinIndex, rowFingerprint },
      deps.db ?? prisma,
    );
    return {
      ok: true,
      value: {
        canUpgrade: targets.canUpgrade,
        latestVersionSeq: targets.latestVersionSeq,
        currentVersionSeq: targets.currentVersionSeq,
        templateName: targets.templateName,
        rollbackTargets: targets.rollbackTargets.map((t) => ({
          index: t.index,
          versionSeq: t.versionSeq,
          publishedAt: t.publishedAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    return mapError(error);
  }
}

export async function reviewTransitionFromAction(
  session: SessionLike,
  input: {
    workspaceId: string;
    pinIndex: number;
    rowFingerprint: string;
    direction: string;
    targetIndex?: number;
  },
  deps: Deps = {},
): Promise<ActionResult<TransitionReviewPayload>> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  const pinIndex = boundedIndex(input?.pinIndex);
  const rowFingerprint = boundedId(input?.rowFingerprint);
  const targetIndex =
    input?.targetIndex === undefined ? null : boundedIndex(input.targetIndex);
  if (
    workspaceId === null ||
    pinIndex === null ||
    rowFingerprint === null ||
    !isTransitionDirection(input?.direction) ||
    (input?.targetIndex !== undefined && targetIndex === null)
  )
    return { ok: false, message: INVALID };
  try {
    const review = await reviewClientSetupTransition(
      session,
      {
        workspaceId,
        pinIndex,
        rowFingerprint,
        direction: input.direction,
        targetIndex: targetIndex ?? undefined,
      },
      deps.db ?? prisma,
      deps.providers ?? {
        declarations: DECLARED_CONSUMERS,
        providers: PROVIDERS,
      },
    );
    return { ok: true, value: serializeTransitionReview(review) };
  } catch (error) {
    return mapError(error);
  }
}

export async function executeTransitionFromAction(
  session: SessionLike,
  input: {
    workspaceId: string;
    pinIndex: number;
    rowFingerprint: string;
    direction: string;
    targetIndex?: number;
    reviewFingerprint: string;
  },
  deps: Deps = {},
): Promise<
  ActionResult<{ applied: true; direction: string; targetVersionSeq: number }>
> {
  if (!enabled()) return { ok: false, message: OFF };
  const workspaceId = boundedId(input?.workspaceId);
  const pinIndex = boundedIndex(input?.pinIndex);
  const rowFingerprint = boundedId(input?.rowFingerprint);
  const reviewFingerprint = boundedId(input?.reviewFingerprint);
  const targetIndex =
    input?.targetIndex === undefined ? null : boundedIndex(input.targetIndex);
  if (
    workspaceId === null ||
    pinIndex === null ||
    rowFingerprint === null ||
    reviewFingerprint === null ||
    !isTransitionDirection(input?.direction) ||
    (input?.targetIndex !== undefined && targetIndex === null)
  )
    return { ok: false, message: INVALID };
  try {
    const value = await executeClientSetupTransition(
      session,
      {
        workspaceId,
        pinIndex,
        rowFingerprint,
        direction: input.direction,
        targetIndex: targetIndex ?? undefined,
        reviewFingerprint,
      },
      deps.db ?? prisma,
      deps.providers ?? {
        declarations: DECLARED_CONSUMERS,
        providers: PROVIDERS,
      },
    );
    return { ok: true, value };
  } catch (error) {
    return mapError(error);
  }
}
