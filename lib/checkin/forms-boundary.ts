import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { type SessionLike } from "../auth/guard";
import { failMessage as fail, mapError as sharedMapError } from "../boundary";
import {
  CHECKIN_FORM_LIMITS,
  CheckInFormError,
  archiveCheckInForm,
  createCheckInForm,
  getCheckInForm,
  listCheckInForms,
  openCheckInDraft,
  publishCheckInForm,
  saveCheckInFormDraft,
  type CheckInDefinition,
  type CheckInFormDetail,
  type CheckInFormSummary,
} from "./forms";

/**
 * P-025-A server boundary — the ONLY app-facing entry to Check-In form
 * operations. `app/**` files must never import `./forms` directly.
 *
 * Library adapters: bind raw action inputs (byte-bound before parse, shape
 * checks before any service call), delegate to the guarded service with the
 * caller-injected client, and map errors to safe stable messages. They do
 * NOT prove HTTP/CSRF/session security — route-level assertions land with
 * the routes. Draft content is never logged.
 */

export type ActionResult<T> =
  { ok: true; value: T } | { ok: false; message: string };

export type BoundaryDeps = { db?: PrismaClient };

// Pinned safe-message contract — exact strings, never codes/internals.
const INVALID_INPUT = "Check the form details and try again.";
const GENERIC_ERROR = "Something went wrong. Please try again in a moment.";
const DENIED_ERROR = "You don't have access to do that.";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_input: INVALID_INPUT,
  forbidden_field_id: INVALID_INPUT,
  stale_revision:
    "This form changed while you were editing. Reload and try again.",
  form_archived: "This form is archived.",
  no_open_draft: "There's no open draft. Reopen the draft to edit.",
  publish_incomplete: "A publish needs at least one field.",
  serialization_conflict: "A conflict occurred. Please try again.",
  form_not_accessible: DENIED_ERROR,
};

function mapError(error: unknown): { ok: false; message: string } {
  return sharedMapError(error, {
    denied: () => fail(DENIED_ERROR),
    domain: (e) =>
      e instanceof CheckInFormError
        ? fail(ERROR_MESSAGES[e.code] ?? GENERIC_ERROR)
        : null,
    fallback: () => fail(GENERIC_ERROR),
  });
}

// Contract-derived bounds: draftJson is UTF-8 byte-bounded BEFORE parse
// (normalized 64KiB service bound + transport headroom); IDs ≤128 chars;
// name uses the service contract bound (120 chars); revisions are bounded
// safe integers.
const MAX_DRAFT_JSON_BYTES = 128 * 1024;
const MAX_ID_LEN = 128;
const MAX_NAME_LEN = CHECKIN_FORM_LIMITS.nameMax;

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

function boundedName(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.length <= MAX_NAME_LEN
    ? value
    : null;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** UTF-8 byte bound BEFORE JSON.parse — oversized payloads never parse. */
function parseDraftJson(draftJson: unknown): unknown | null {
  if (
    typeof draftJson !== "string" ||
    byteLength(draftJson) > MAX_DRAFT_JSON_BYTES
  )
    return null;
  try {
    return JSON.parse(draftJson);
  } catch {
    return null;
  }
}

export async function saveCheckInDraftFromAction(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    formId: string;
    expectedRevision: number;
    draftJson: string;
    name?: string;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number; definition: CheckInDefinition }>> {
  const workspaceId = boundedId(_input.workspaceId);
  const formId = boundedId(_input.formId);
  const expectedRevision = boundedRevision(_input.expectedRevision);
  const name = boundedName(_input.name);
  const draft = parseDraftJson(_input.draftJson);
  if (
    !workspaceId ||
    !formId ||
    expectedRevision === null ||
    name === null ||
    draft === null
  )
    return fail(INVALID_INPUT);
  try {
    const value = await saveCheckInFormDraft(
      _session,
      { workspaceId, formId, expectedRevision, draft, name },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function openCheckInDraftFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number; definition: CheckInDefinition }>> {
  const workspaceId = boundedId(_input.workspaceId);
  const formId = boundedId(_input.formId);
  if (!workspaceId || !formId) return fail(INVALID_INPUT);
  try {
    const value = await openCheckInDraft(
      _session,
      { workspaceId, formId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function publishCheckInFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string; expectedRevision: number },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ versionSeq: number }>> {
  const workspaceId = boundedId(_input.workspaceId);
  const formId = boundedId(_input.formId);
  const expectedRevision = boundedRevision(_input.expectedRevision);
  if (!workspaceId || !formId || expectedRevision === null)
    return fail(INVALID_INPUT);
  try {
    const value = await publishCheckInForm(
      _session,
      { workspaceId, formId, expectedRevision },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function archiveCheckInFormFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ formId: string }>> {
  const workspaceId = boundedId(_input.workspaceId);
  const formId = boundedId(_input.formId);
  if (!workspaceId || !formId) return fail(INVALID_INPUT);
  try {
    const value = await archiveCheckInForm(
      _session,
      { workspaceId, formId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function createCheckInFormFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; name: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ formId: string }>> {
  const workspaceId = boundedId(_input.workspaceId);
  const name = boundedName(_input.name);
  if (!workspaceId || name === null || name === undefined)
    return fail(INVALID_INPUT);
  try {
    const value = await createCheckInForm(
      _session,
      { workspaceId, name },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function listCheckInFormsForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ forms: CheckInFormSummary[] }>> {
  const workspaceId = boundedId(_input.workspaceId);
  if (!workspaceId) return fail(INVALID_INPUT);
  try {
    const forms = await listCheckInForms(
      _session,
      { workspaceId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value: { forms } };
  } catch (e) {
    return mapError(e);
  }
}

export async function getCheckInFormForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<CheckInFormDetail>> {
  const workspaceId = boundedId(_input.workspaceId);
  const formId = boundedId(_input.formId);
  if (!workspaceId || !formId) return fail(INVALID_INPUT);
  try {
    const value = await getCheckInForm(
      _session,
      { workspaceId, formId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}
