/**
 * P-023 server boundary — the ONLY app-facing entry to onboarding
 * submission operations. `app/**` files must never import
 * `./submissions` directly.
 *
 * The dev gate (`ENABLE_ONBOARDING_SUBMISSION=1`) is checked FIRST in
 * every entry point — before session use, before any user-controlled
 * input is bound. When the flag is off every call returns the same
 * feature-off result and no service/database/audit work occurs. The gate
 * is not authorization: with it enabled, the guarded service still
 * re-authorizes every read/mutation server-side inside its transaction.
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
import { resolveOnboardingSubmissionConsentPolicy } from "../consent";
import {
  listOwnOnboardingAssignments,
  loadOwnOnboardingDetail,
  submitOnboardingAssignment,
  type OwnAssignmentItem,
  type OwnOnboardingDetail,
  type SubmitOnboardingResult,
} from "./submissions";

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

export type {
  OwnAssignmentItem,
  OwnFormField,
  OwnOnboardingDetail,
  OwnSubmittedAnswer,
} from "./submissions";

export type BoundaryDeps = {
  db?: PrismaClient;
  registry?: ConsentPolicyRegistry;
};

/**
 * Consent registry for the real app path — the shared resolver when no
 * registry is injected. Requires BOTH the flag AND a trusted dev/test
 * runtime (#83); production/unknown always resolve unconfigured.
 */
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

export async function listOwnAssignmentsForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ items: OwnAssignmentItem[] }>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  if (!workspaceId) return fail(INVALID_INPUT);
  try {
    const value = await listOwnOnboardingAssignments(
      _session,
      { workspaceId },
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

export async function loadOwnDetailForRoute(
  _session: SessionLike,
  _input: { workspaceId: string; assignmentId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<OwnOnboardingDetail>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const assignmentId = boundedId(_input.assignmentId);
  if (!workspaceId || !assignmentId) return fail(INVALID_INPUT);
  try {
    const value = await loadOwnOnboardingDetail(
      _session,
      { workspaceId, assignmentId },
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

export async function submitOnboardingFromAction(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    assignmentId: string;
    answersJson: string;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<SubmitOnboardingResult>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const assignmentId = boundedId(_input.assignmentId);
  if (!workspaceId || !assignmentId) return fail(INVALID_INPUT);
  if (
    typeof _input.answersJson !== "string" ||
    _input.answersJson.length === 0 ||
    Buffer.byteLength(_input.answersJson, "utf8") >
      SUBMISSION_LIMITS.answersJsonMaxBytes
  )
    return fail(INVALID_INPUT);
  try {
    const value = await submitOnboardingAssignment(
      _session,
      { workspaceId, assignmentId, answersJson: _input.answersJson },
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
