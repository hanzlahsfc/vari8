import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { AccessDeniedError, type SessionLike } from "../auth/guard";
import { isCoachingTemplatesEnabled } from "./gate";
import {
  archiveParameter,
  createParameter,
  getParameter,
  listParameters,
  ParameterError,
  updateParameter,
  type ParameterDetail,
  type ParameterSummary,
} from "./parameters";

export type { ParameterDetail, ParameterSummary };

/**
 * P-014 parameter-library server boundary — the ONLY app-facing entry to
 * parameter operations. `app/**` must never import `./parameters` directly.
 *
 * Adapters bind raw action inputs (bounded strings, byte-bound before parse,
 * safe-integer revisions), delegate to the guarded service, and map errors
 * to safe stable messages — never codes, IDs, payload content, or internals.
 */

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

export type BoundaryDeps = { db?: PrismaClient };

const INVALID_INPUT = "Check the details and try again.";
const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";
const DENIED_ERROR = "You don't have access to do that.";
const OFF_ERROR = "This feature is not available.";

/** Flag-off → zero-service-call refusal (defense in depth behind the
 * action/route gates). */
function flagOff(): { ok: false; message: string } | null {
  return isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES)
    ? null
    : { ok: false, message: OFF_ERROR };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: INVALID_INPUT,
  stale_revision:
    "This parameter changed while you were editing. Reload and try again.",
  parameter_archived: "This parameter is archived.",
  semantics_locked:
    "This parameter is used in a published template. Labels and help text can still change; units, ratings, and options are locked.",
  serialization_conflict: "A conflict occurred. Please try again.",
  parameter_not_accessible: DENIED_ERROR,
};

function mapError(error: unknown): { ok: false; message: string } {
  if (error instanceof AccessDeniedError) return fail(DENIED_ERROR);
  if (error instanceof ParameterError)
    return fail(ERROR_MESSAGES[error.code] ?? GENERIC_ERROR);
  return fail(GENERIC_ERROR);
}

const MAX_ID_LEN = 128;
const MAX_INPUT_JSON_BYTES = 128 * 1024;

const fail = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

function boundedId(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LEN
    ? value
    : null;
}

function boundedRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** UTF-8 byte bound BEFORE JSON.parse — oversized payloads never parse. */
function parseJson(inputJson: unknown): unknown | null {
  if (
    typeof inputJson !== "string" ||
    byteLength(inputJson) > MAX_INPUT_JSON_BYTES
  )
    return null;
  try {
    return JSON.parse(inputJson);
  } catch {
    return null;
  }
}

export async function createParameterFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; inputJson: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ parameterId: string; key: string }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const input = parseJson(_input.inputJson);
  if (!workspaceId || input === null) return fail(INVALID_INPUT);
  try {
    const value = await createParameter(
      _session,
      { workspaceId, input },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function updateParameterFromAction(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    parameterId: string;
    expectedRevision: number;
    inputJson: string;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const parameterId = boundedId(_input.parameterId);
  const expectedRevision = boundedRevision(_input.expectedRevision);
  const input = parseJson(_input.inputJson);
  if (
    !workspaceId ||
    !parameterId ||
    expectedRevision === null ||
    input === null
  )
    return fail(INVALID_INPUT);
  try {
    const value = await updateParameter(
      _session,
      { workspaceId, parameterId, expectedRevision, input },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function archiveParameterFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; parameterId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ parameterId: string }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const parameterId = boundedId(_input.parameterId);
  if (!workspaceId || !parameterId) return fail(INVALID_INPUT);
  try {
    const value = await archiveParameter(
      _session,
      { workspaceId, parameterId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function listParametersForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ parameters: ParameterSummary[] }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  if (!workspaceId) return fail(INVALID_INPUT);
  try {
    const parameters = await listParameters(
      _session,
      { workspaceId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value: { parameters } };
  } catch (e) {
    return mapError(e);
  }
}

export async function getParameterForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string; parameterId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<ParameterDetail>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const parameterId = boundedId(_input.parameterId);
  if (!workspaceId || !parameterId) return fail(INVALID_INPUT);
  try {
    const value = await getParameter(
      _session,
      { workspaceId, parameterId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}
