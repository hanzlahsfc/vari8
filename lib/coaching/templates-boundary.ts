import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import { type SessionLike } from "../auth/guard";
import { failMessage as fail, mapError as sharedMapError } from "../boundary";
import { isCoachingTemplatesEnabled } from "./gate";
import {
  archiveTemplate,
  CoachingTemplateError,
  createTemplate,
  getTemplate,
  getTemplateVersion,
  listTemplates,
  openTemplateDraft,
  publishTemplate,
  saveTemplateDraft,
  type TemplateDetail,
  type TemplateDraft,
  type TemplateSummary,
  type TemplateVersionDefinition,
} from "./templates";

export type {
  TemplateDetail,
  TemplateDraft,
  TemplateSummary,
  TemplateVersionDefinition,
};

/**
 * P-014 coaching-template server boundary — the ONLY app-facing entry to
 * template operations. `app/**` must never import `./templates` directly.
 *
 * Adapters bind raw action inputs, delegate to the guarded service, and map
 * errors to safe stable messages. Draft content is never logged.
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
  forbidden_item_id: INVALID_INPUT,
  stale_revision:
    "This template changed while you were editing. Reload and try again.",
  template_archived: "This template is archived.",
  no_open_draft: "There's no open draft. Reopen the draft to edit.",
  publish_incomplete: "A publish needs at least one item.",
  duplicate_parameter:
    "Each parameter can appear only once in a template version. Remove the extra placement and try again.",
  parameter_changed:
    "A referenced parameter changed since this draft was saved. Review the draft and save it again before publishing.",
  parameter_not_publishable:
    "A referenced parameter is archived or no longer available. Remove or replace it and try again.",
  serialization_conflict: "A conflict occurred. Please try again.",
  template_not_accessible: DENIED_ERROR,
};

function mapError(error: unknown): { ok: false; message: string } {
  return sharedMapError(error, {
    denied: () => fail(DENIED_ERROR),
    domain: (e) =>
      e instanceof CoachingTemplateError
        ? fail(ERROR_MESSAGES[e.code] ?? GENERIC_ERROR)
        : null,
    fallback: () => fail(GENERIC_ERROR),
  });
}

const MAX_ID_LEN = 128;
const MAX_NAME_LEN = 120;
const MAX_DRAFT_JSON_BYTES = 128 * 1024;

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

export async function createTemplateFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; name: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ templateId: string }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const name = boundedName(_input.name);
  if (!workspaceId || name === null || name === undefined)
    return fail(INVALID_INPUT);
  try {
    const value = await createTemplate(
      _session,
      { workspaceId, name },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function saveTemplateDraftFromAction(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    templateId: string;
    expectedRevision: number;
    draftJson: string;
    name?: string;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number; definition: TemplateDraft }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const templateId = boundedId(_input.templateId);
  const expectedRevision = boundedRevision(_input.expectedRevision);
  const name = boundedName(_input.name);
  const draft = parseDraftJson(_input.draftJson);
  if (
    !workspaceId ||
    !templateId ||
    expectedRevision === null ||
    name === null ||
    draft === null
  )
    return fail(INVALID_INPUT);
  try {
    const value = await saveTemplateDraft(
      _session,
      { workspaceId, templateId, expectedRevision, draft, name },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function openTemplateDraftFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; templateId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ revision: number; definition: TemplateDraft }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const templateId = boundedId(_input.templateId);
  if (!workspaceId || !templateId) return fail(INVALID_INPUT);
  try {
    const value = await openTemplateDraft(
      _session,
      { workspaceId, templateId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function publishTemplateFromAction(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    templateId: string;
    expectedRevision: number;
  },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ versionSeq: number }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const templateId = boundedId(_input.templateId);
  const expectedRevision = boundedRevision(_input.expectedRevision);
  if (!workspaceId || !templateId || expectedRevision === null)
    return fail(INVALID_INPUT);
  try {
    const value = await publishTemplate(
      _session,
      { workspaceId, templateId, expectedRevision },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function archiveTemplateFromAction(
  _session: SessionLike,
  _input: { workspaceId: string; templateId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ templateId: string }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const templateId = boundedId(_input.templateId);
  if (!workspaceId || !templateId) return fail(INVALID_INPUT);
  try {
    const value = await archiveTemplate(
      _session,
      { workspaceId, templateId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function listTemplatesForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<{ templates: TemplateSummary[] }>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  if (!workspaceId) return fail(INVALID_INPUT);
  try {
    const templates = await listTemplates(
      _session,
      { workspaceId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value: { templates } };
  } catch (e) {
    return mapError(e);
  }
}

export async function getTemplateForWorkspace(
  _session: SessionLike,
  _input: { workspaceId: string; templateId: string },
  _deps: BoundaryDeps = {},
): Promise<ActionResult<TemplateDetail>> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const templateId = boundedId(_input.templateId);
  if (!workspaceId || !templateId) return fail(INVALID_INPUT);
  try {
    const value = await getTemplate(
      _session,
      { workspaceId, templateId },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}

export async function getTemplateVersionForWorkspace(
  _session: SessionLike,
  _input: {
    workspaceId: string;
    templateId: string;
    versionSeq: number;
  },
  _deps: BoundaryDeps = {},
): Promise<
  ActionResult<{
    versionId: string;
    versionSeq: number;
    publishedAt: string;
    publishedBy: string;
    definition: TemplateVersionDefinition;
  }>
> {
  const off = flagOff();
  if (off) return off;
  const workspaceId = boundedId(_input.workspaceId);
  const templateId = boundedId(_input.templateId);
  const versionSeq = boundedRevision(_input.versionSeq);
  if (!workspaceId || !templateId || versionSeq === null)
    return fail(INVALID_INPUT);
  try {
    const value = await getTemplateVersion(
      _session,
      { workspaceId, templateId, versionSeq },
      _deps.db ?? defaultPrisma,
    );
    return { ok: true, value };
  } catch (e) {
    return mapError(e);
  }
}
