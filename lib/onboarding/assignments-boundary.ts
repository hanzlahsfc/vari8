/**
 * P-013 server boundary — the ONLY app-facing entry to onboarding-assignment
 * operations. `app/**` files must never import `./assignments` directly.
 *
 * The dev gate (`ENABLE_ONBOARDING_ASSIGNMENTS=1`) is checked FIRST in every
 * entry point — before session, before any user-controlled input is bound.
 * When the flag is off every call returns the same feature-off result and no
 * service/database/audit work occurs. The gate is not authorization: with it
 * enabled, the guarded service still re-authorizes every read/mutation
 * server-side inside its transaction.
 */

import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { type SessionLike } from "../auth/guard";
import { failMessage as fail, mapError as sharedMapError } from "../boundary";
import {
  cancelOnboardingAssignment,
  createOnboardingAssignment,
  listAssignableClients,
  listAssignableForms,
  listOnboardingAssignments,
  replaceOnboardingAssignment,
  type AssignableClient,
  type AssignableForm,
  type AssignmentSummary,
} from "./assignments";
import {
  ASSIGNMENT_LIMITS,
  isOnboardingAssignmentsEnabled,
  OnboardingAssignmentError,
  type OnboardingAssignmentErrorCode,
} from "./assignments-gate";

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

// App-facing surface types — components/pages import these from THIS
// boundary, never from the guarded service module.
export type {
  AssignableClient,
  AssignableForm,
  AssignmentSummary,
} from "./assignments";

export type BoundaryDeps = { db?: PrismaClient };

const INVALID_INPUT = "Check the form details and try again.";
const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";
const DENIED_ERROR = "You don't have access to do that.";
const FEATURE_OFF = "This feature is not available.";

const ERROR_MESSAGES: Record<OnboardingAssignmentErrorCode, string> = {
  invalid_input: INVALID_INPUT,
  // Foreign/missing rows and authorization failures share one non-disclosing
  // surface — probing can never distinguish "exists but denied" from "absent".
  assignment_not_accessible: DENIED_ERROR,
  assignment_not_active: "This assignment is no longer active.",
  client_not_eligible: "This client can't be assigned a form.",
  form_not_eligible: "This form can't be assigned right now.",
  assignment_conflict:
    "This client already has an active assignment for this form.",
  serialization_conflict: "A conflict occurred. Please try again.",
};

function mapError(error: unknown): { ok: false; message: string } {
  return sharedMapError(error, {
    denied: () => fail(DENIED_ERROR),
    domain: (e) =>
      e instanceof OnboardingAssignmentError
        ? fail(ERROR_MESSAGES[e.code] ?? GENERIC_ERROR)
        : null,
    fallback: () => fail(GENERIC_ERROR),
  });
}

function gated(): boolean {
  return isOnboardingAssignmentsEnabled(
    process.env.ENABLE_ONBOARDING_ASSIGNMENTS,
  );
}

function boundedId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= ASSIGNMENT_LIMITS.idMax
    ? value
    : null;
}

export async function listAssignmentsForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string; limit?: number; cursor?: string },
  _deps: BoundaryDeps = {},
): Promise<
  ActionResult<{ items: AssignmentSummary[]; nextCursor: string | null }>
> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const cursor =
    _input.cursor === undefined ? undefined : boundedId(_input.cursor);
  if (!workspaceId || cursor === null) return fail(INVALID_INPUT);
  try {
    const value = await listOnboardingAssignments(
      _session,
      { workspaceId, limit: _input.limit, cursor },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function listAssignableClientsForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string; limit?: number; cursor?: string },
  _deps: BoundaryDeps = {},
): Promise<
  ActionResult<{ items: AssignableClient[]; nextCursor: string | null }>
> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const cursor =
    _input.cursor === undefined ? undefined : boundedId(_input.cursor);
  if (!workspaceId || cursor === null) return fail(INVALID_INPUT);
  try {
    const value = await listAssignableClients(
      _session,
      { workspaceId, limit: _input.limit, cursor },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function listAssignableFormsForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<AssignableForm[]>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  if (!workspaceId) return fail(INVALID_INPUT);
  try {
    const value = await listAssignableForms(
      _session,
      { workspaceId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function assignFormFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; clientProfileId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ assignmentId: string }>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const clientProfileId = boundedId(_input.clientProfileId);
  const formId = boundedId(_input.formId);
  if (!workspaceId || !clientProfileId || !formId) return fail(INVALID_INPUT);
  try {
    const value = await createOnboardingAssignment(
      _session,
      { workspaceId, clientProfileId, formId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function replaceAssignmentFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; assignmentId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ changed: boolean; assignmentId?: string }>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const assignmentId = boundedId(_input.assignmentId);
  if (!workspaceId || !assignmentId) return fail(INVALID_INPUT);
  try {
    const value = await replaceOnboardingAssignment(
      _session,
      { workspaceId, assignmentId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function cancelAssignmentFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; assignmentId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ cancelled: true }>> {
  if (!gated()) return fail(FEATURE_OFF);
  const workspaceId = boundedId(_input.workspaceId);
  const assignmentId = boundedId(_input.assignmentId);
  if (!workspaceId || !assignmentId) return fail(INVALID_INPUT);
  try {
    await cancelOnboardingAssignment(
      _session,
      { workspaceId, assignmentId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value: { cancelled: true } };
  } catch (e) {
    return mapError(e);
  }
}
