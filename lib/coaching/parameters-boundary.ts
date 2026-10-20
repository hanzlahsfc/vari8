import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { type SessionLike } from "../auth/guard";
import { failMessage as fail, mapError as sharedMapError } from "../boundary";
import { isCoachingTemplatesEnabled, COACHING_LIMITS } from "./gate";
import { isParameterClassificationEnabled } from "./parameter-classification-gate";
import {
  archiveParameter,
  classifyParameter,
  createParameter,
  getParameter,
  listClassifiableParameterIds,
  listParameters,
  ParameterError,
  updateParameter,
  type ParameterDataClassification,
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
  stale_selection:
    "This list changed while you were deciding. Reload and try again.",
  already_classified:
    "This parameter already has a classification. Classifications cannot be changed.",
  classification_not_permitted:
    "That classification is not available. Only GENERAL_HEALTH and CYCLE can be assigned.",
};

function mapError(error: unknown): { ok: false; message: string } {
  return sharedMapError(error, {
    denied: () => fail(DENIED_ERROR),
    domain: (e) =>
      e instanceof ParameterError
        ? fail(ERROR_MESSAGES[e.code] ?? GENERIC_ERROR)
        : null,
    fallback: () => fail(GENERIC_ERROR),
  });
}

const MAX_ID_LEN = 128;
const MAX_INPUT_JSON_BYTES = 128 * 1024;

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
  _input: { workspaceId: string; limit?: number; cursor?: string },
  _deps: BoundaryDeps = {},
): Promise<
  ActionResult<{ parameters: ParameterSummary[]; nextCursor: string | null }>
> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  // limit must be an explicit integer inside the service's own bounds —
  // anything else is a malformed request, not a request to clamp.
  const limit = _input.limit;
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) ||
      (limit as number) < 1 ||
      (limit as number) > COACHING_LIMITS.listMaxLimit)
  )
    return fail(INVALID_INPUT);
  const cursor = _input.cursor;
  if (cursor !== undefined && boundedId(cursor) === null)
    return fail(INVALID_INPUT);
  if (!workspaceId) return fail(INVALID_INPUT);
  try {
    const value = await listParameters(
      _session,
      {
        workspaceId,
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

// ── P-020A classification boundary ─────────────────────────────────────────

/** Positional-selection context for the classification control: the full
 * authorized ordered id list's fingerprint plus each rendered row's index —
 * the browser never submits a raw ParameterDefinition id. */
export async function listClassificationContext(
  _session: SessionLike,
  _input: { workspaceId: string },
  _deps: BoundaryDeps = {},
): Promise<
  ActionResult<{
    fingerprint: string;
    indexByParameterId: Record<string, number>;
  }>
> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  if (!workspaceId) return fail(INVALID_INPUT);
  try {
    const { ids, fingerprint } = await listClassifiableParameterIds(
      _session,
      { workspaceId },
      _deps.db ?? defaultPrisma,
    );
    const indexByParameterId: Record<string, number> = {};
    ids.forEach((id, i) => {
      indexByParameterId[id] = i;
    });
    return { ok: true, value: { fingerprint, indexByParameterId } };
  } catch (e) {
    return mapError(e);
  }
}

export async function classifyParameterFromAction(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    parameterIndex: number;
    expectedRevision: number;
    fingerprint: string;
    classification: string;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number }>> {
  // The classification management gate is distinct from the library gate and
  // is checked FIRST — before session-dependent service work, input binding,
  // or any database access via the service below.
  if (
    !isParameterClassificationEnabled(
      process.env.ENABLE_PARAMETER_CLASSIFICATION,
    )
  )
    return fail(OFF_ERROR);
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const parameterIndex = _input.parameterIndex;
  const expectedRevision = boundedRevision(_input.expectedRevision);
  const fingerprint = boundedId(_input.fingerprint);
  const classification = _input.classification;
  if (
    !workspaceId ||
    !Number.isSafeInteger(parameterIndex) ||
    parameterIndex < 0 ||
    parameterIndex > COACHING_LIMITS.indexMax ||
    expectedRevision === null ||
    !fingerprint ||
    typeof classification !== "string"
  )
    return fail(INVALID_INPUT);
  try {
    const value = await classifyParameter(
      _session,
      {
        workspaceId,
        parameterIndex,
        expectedRevision,
        fingerprint,
        classification: classification as ParameterDataClassification,
      },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
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
