import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { type SessionLike } from "../auth/guard";
import { failMessage as fail, mapError as sharedMapError } from "../boundary";
import {
  FORM_LIMITS,
  OnboardingFormError,
  archiveOnboardingForm,
  createOnboardingForm,
  getOnboardingForm,
  listOnboardingForms,
  openOnboardingDraft,
  publishOnboardingForm,
  saveOnboardingFormDraft,
  type FormDefinition,
  type FormDetail,
  type FormSummary,
} from "./forms";

/**
 * P-008 server boundary — the ONLY app-facing entry to onboarding form
 * operations (slice 5A). `app/**` files must never import `./forms` directly.
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
      e instanceof OnboardingFormError
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
const MAX_NAME_LEN = FORM_LIMITS.nameMax;

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

export async function saveDraftFromAction(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    formId: string;
    expectedRevision: number;
    draftJson: string;
    name?: string;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number; definition: FormDefinition }>> {
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
    const value = await saveOnboardingFormDraft(
      _session,
      { workspaceId, formId, expectedRevision, draft, name },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function openDraftFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number; definition: FormDefinition }>> {
  const workspaceId = boundedId(_input.workspaceId);
  const formId = boundedId(_input.formId);
  if (!workspaceId || !formId) return fail(INVALID_INPUT);
  try {
    const value = await openOnboardingDraft(
      _session,
      { workspaceId, formId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function publishFromAction(
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
    const value = await publishOnboardingForm(
      _session,
      { workspaceId, formId, expectedRevision },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function archiveFormFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ formId: string }>> {
  const workspaceId = boundedId(_input.workspaceId);
  const formId = boundedId(_input.formId);
  if (!workspaceId || !formId) return fail(INVALID_INPUT);
  try {
    const value = await archiveOnboardingForm(
      _session,
      { workspaceId, formId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function createFormFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; name: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ formId: string }>> {
  const workspaceId = boundedId(_input.workspaceId);
  const name = boundedName(_input.name);
  if (!workspaceId || name === null || name === undefined)
    return fail(INVALID_INPUT);
  try {
    const value = await createOnboardingForm(
      _session,
      { workspaceId, name },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function listFormsForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ forms: FormSummary[] }>> {
  const workspaceId = boundedId(_input.workspaceId);
  if (!workspaceId) return fail(INVALID_INPUT);
  try {
    const forms = await listOnboardingForms(
      _session,
      { workspaceId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value: { forms } };
  } catch (e) {
    return mapError(e);
  }
}

export async function getFormForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string; formId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<FormDetail>> {
  const workspaceId = boundedId(_input.workspaceId);
  const formId = boundedId(_input.formId);
  if (!workspaceId || !formId) return fail(INVALID_INPUT);
  try {
    const value = await getOnboardingForm(
      _session,
      { workspaceId, formId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}
