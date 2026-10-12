/**
 * P-024 server boundary — the ONLY app-facing entry to staff
 * onboarding-submission review. `app/**` files must never import
 * `./review` directly.
 *
 * The dev gate (`ENABLE_ONBOARDING_SUBMISSION=1`) is checked FIRST in
 * every entry point — before session use, before any user-controlled
 * input is bound. When the flag is off every call returns the same
 * feature-off result and no service/database/audit work occurs. The
 * gate is not authorization: with it enabled, the service still
 * re-authorizes every read/mark inside its locked transaction.
 */

import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { AccessDeniedError, type SessionLike } from "../auth/guard";
import type { ConsentPolicyRegistry } from "../consent";
import {
  isOnboardingSubmissionEnabled,
  OnboardingSubmissionError,
  type OnboardingSubmissionErrorCode,
  SUBMISSION_LIMITS,
} from "./submission-gate";
import { resolveOnboardingSubmissionConsentPolicy } from "./submission-consent";
import {
  listClientOnboardingSubmissions,
  markSubmissionReviewed,
  readSubmissionReviewDetail,
  type MarkSubmissionReviewedResult,
  type StaffOnboardingReviewDetail,
  type StaffOnboardingSubmissionList,
} from "./review";

export type {
  StaffOnboardingAnswerRow,
  StaffOnboardingReviewDetail,
  StaffOnboardingSubmissionItem,
  StaffOnboardingSubmissionList,
} from "./review";

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

export type BoundaryDeps = {
  db?: PrismaClient;
  registry?: ConsentPolicyRegistry;
};

const realRegistry = (): ConsentPolicyRegistry =>
  resolveOnboardingSubmissionConsentPolicy();

const INVALID_INPUT = "Check the form details and try again.";
const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";
const DENIED_ERROR = "You don't have access to do that.";
const FEATURE_OFF = "This feature is not available.";
// One non-disclosing surface for missing, foreign, terminal, denied, and
// consent-withheld targets — probing can never distinguish them.
const UNAVAILABLE = "This form is not available.";

const ERROR_MESSAGES: Record<OnboardingSubmissionErrorCode, string> = {
  invalid_input: INVALID_INPUT,
  not_available: UNAVAILABLE,
  consent_missing: UNAVAILABLE,
  policy_not_configured: UNAVAILABLE,
  serialization_conflict: "A conflict occurred. Please try again.",
};

const fail = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

function mapError(error: unknown): { ok: false; message: string } {
  if (error instanceof AccessDeniedError) return fail(DENIED_ERROR);
  if (error instanceof OnboardingSubmissionError)
    return fail(ERROR_MESSAGES[error.code] ?? GENERIC_ERROR);
  return fail(GENERIC_ERROR);
}

function gated(): boolean {
  return isOnboardingSubmissionEnabled(
    process.env.ENABLE_ONBOARDING_SUBMISSION,
  );
}

function boundedId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= SUBMISSION_LIMITS.idMax
    ? value
    : null;
}

/** Bounded answer-free header list for the staff route. */
export async function listClientSubmissionsForReview(
  _session: SessionLike,
  _input: { workspaceId: string; clientProfileId: string; cursor?: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<StaffOnboardingSubmissionList>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const clientProfileId = boundedId(_input.clientProfileId);
  if (!workspaceId || !clientProfileId) return fail(INVALID_INPUT);
  const cursor =
    _input.cursor === undefined
      ? undefined
      : typeof _input.cursor === "string" && _input.cursor.length <= 200
        ? _input.cursor
        : undefined;
  if (_input.cursor !== undefined && cursor === undefined)
    return fail(INVALID_INPUT);
  try {
    const value = await listClientOnboardingSubmissions(
      _session,
      { workspaceId, clientProfileId, cursor },
      {
        db: _deps.db ?? defaultPrisma,
        registry: _deps.registry ?? realRegistry(),
      },
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

/** Explicit "View details" — the only answer-bearing read (one audit). */
export async function viewSubmissionReviewDetail(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<StaffOnboardingReviewDetail>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const clientProfileId = boundedId(_input.clientProfileId);
  const submissionId = boundedId(_input.submissionId);
  if (!workspaceId || !clientProfileId || !submissionId)
    return fail(INVALID_INPUT);
  try {
    const value = await readSubmissionReviewDetail(
      _session,
      { workspaceId, clientProfileId, submissionId },
      {
        db: _deps.db ?? defaultPrisma,
        registry: _deps.registry ?? realRegistry(),
      },
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

/** Explicit "Mark as reviewed" — terminal acknowledgement (assigned
 * coach only; the server independently re-runs the whole protocol). */
export async function markSubmissionReviewedFromAction(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    clientProfileId: string;
    submissionId: string;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<MarkSubmissionReviewedResult>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const clientProfileId = boundedId(_input.clientProfileId);
  const submissionId = boundedId(_input.submissionId);
  if (!workspaceId || !clientProfileId || !submissionId)
    return fail(INVALID_INPUT);
  try {
    const value = await markSubmissionReviewed(
      _session,
      { workspaceId, clientProfileId, submissionId },
      {
        db: _deps.db ?? defaultPrisma,
        registry: _deps.registry ?? realRegistry(),
      },
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}
