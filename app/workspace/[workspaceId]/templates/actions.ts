"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isCoachingTemplatesEnabled } from "@/lib/coaching/gate";
import {
  archiveTemplateFromAction,
  createTemplateFromAction,
  openTemplateDraftFromAction,
  publishTemplateFromAction,
  saveTemplateDraftFromAction,
  type ActionResult,
} from "@/lib/coaching/templates-boundary";

type TemplateActionResult<T> = ActionResult<T>;

/**
 * P-014 — coaching template server actions.
 *
 * Ordering contract (tested directly): the development feature flag is
 * checked BEFORE `auth()`, before any FormData reads, and before any
 * boundary/database work — flag-off calls perform zero observable side
 * effects. Revalidation fires only after a successful committed mutation.
 */

const OFF = "This feature is not available.";
const INVALID = "Check the details and try again.";
const DENIED = "You don't have access to do that.";
const GENERIC = "Something went wrong. Please try again in a moment.";

const MAX_ID_LEN = 128;
const MAX_NAME_LEN = 120;
const MAX_DRAFT_JSON_BYTES = 128 * 1024; // boundary bound — byte-aligned
const MAX_REVISION = 2_147_483_647;

const fail = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

function isWellFormedString(v: string): boolean {
  try {
    encodeURIComponent(v);
    return true;
  } catch {
    return false;
  }
}

function singleString(
  formData: FormData,
  key: string,
  maxLen: number,
): string | null {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  if (typeof v !== "string" || v.length === 0 || v.length > maxLen) return null;
  return isWellFormedString(v) ? v : null;
}

function singleStringBytes(
  formData: FormData,
  key: string,
  maxBytes: number,
): string | null {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  if (typeof v !== "string" || v.length === 0) return null;
  return new TextEncoder().encode(v).length <= maxBytes ? v : null;
}

function strictRevision(formData: FormData): number | null {
  const raw = singleString(formData, "expectedRevision", 16);
  if (raw === null || !/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n <= MAX_REVISION ? n : null;
}

function boundedArg(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LEN &&
    isWellFormedString(value)
    ? value
    : null;
}

async function sessionGate(): Promise<
  | { ok: true; session: { user: { id: string } } }
  | { ok: false; message: string }
> {
  let session;
  try {
    session = await auth();
  } catch {
    return fail(GENERIC);
  }
  const id = session?.user?.id;
  if (typeof id !== "string" || id.length === 0) return fail(DENIED);
  return { ok: true, session: { user: { id } } };
}

const listPath = (workspaceId: string) =>
  `/workspace/${encodeURIComponent(workspaceId)}/templates`;
const templatePath = (workspaceId: string, templateId: string) =>
  `${listPath(workspaceId)}/${encodeURIComponent(templateId)}`;

function revalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Best-effort cache invalidation — a committed write stays committed.
  }
}

function isFormData(value: unknown): value is FormData {
  return value instanceof FormData;
}

export async function createTemplate(
  workspaceId: string,
  formData: FormData,
): Promise<TemplateActionResult<{ templateId: string }>> {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  const name = isFormData(formData)
    ? singleString(formData, "name", MAX_NAME_LEN)
    : null;
  if (!ws || !name) return fail(INVALID);
  let result: TemplateActionResult<{ templateId: string }>;
  try {
    result = await createTemplateFromAction(gate.session, {
      workspaceId: ws,
      name,
    });
  } catch {
    return fail(GENERIC);
  }
  if (result.ok) {
    revalidate(listPath(ws));
    revalidate(templatePath(ws, result.value.templateId));
  }
  return result;
}

export async function saveTemplateDraft(
  workspaceId: string,
  formData: FormData,
): Promise<TemplateActionResult<{ revision: number }>> {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  const templateId = isFormData(formData)
    ? singleString(formData, "templateId", MAX_ID_LEN)
    : null;
  const expectedRevision = isFormData(formData)
    ? strictRevision(formData)
    : null;
  const draftJson = isFormData(formData)
    ? singleStringBytes(formData, "draft", MAX_DRAFT_JSON_BYTES)
    : null;
  const name = isFormData(formData)
    ? (singleString(formData, "name", MAX_NAME_LEN) ?? undefined)
    : undefined;
  if (!ws || !templateId || expectedRevision === null || !draftJson)
    return fail(INVALID);
  let result: TemplateActionResult<unknown>;
  try {
    result = await saveTemplateDraftFromAction(gate.session, {
      workspaceId: ws,
      templateId,
      expectedRevision,
      draftJson,
      name,
    });
  } catch {
    return fail(GENERIC);
  }
  if (result.ok) revalidate(templatePath(ws, templateId));
  return result as TemplateActionResult<{ revision: number }>;
}

export async function openTemplateDraft(
  workspaceId: string,
  formData: FormData,
): Promise<TemplateActionResult<{ revision: number }>> {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  const templateId = isFormData(formData)
    ? singleString(formData, "templateId", MAX_ID_LEN)
    : null;
  if (!ws || !templateId) return fail(INVALID);
  let result: TemplateActionResult<unknown>;
  try {
    result = await openTemplateDraftFromAction(gate.session, {
      workspaceId: ws,
      templateId,
    });
  } catch {
    return fail(GENERIC);
  }
  if (result.ok) revalidate(templatePath(ws, templateId));
  return result as TemplateActionResult<{ revision: number }>;
}

export async function publishTemplate(
  workspaceId: string,
  formData: FormData,
): Promise<TemplateActionResult<{ versionSeq: number }>> {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  const templateId = isFormData(formData)
    ? singleString(formData, "templateId", MAX_ID_LEN)
    : null;
  const expectedRevision = isFormData(formData)
    ? strictRevision(formData)
    : null;
  if (!ws || !templateId || expectedRevision === null) return fail(INVALID);
  let result: TemplateActionResult<{ versionSeq: number }>;
  try {
    result = await publishTemplateFromAction(gate.session, {
      workspaceId: ws,
      templateId,
      expectedRevision,
    });
  } catch {
    return fail(GENERIC);
  }
  if (result.ok) {
    revalidate(templatePath(ws, templateId));
    revalidate(listPath(ws));
  }
  return result;
}

export async function archiveTemplate(
  workspaceId: string,
  formData: FormData,
): Promise<TemplateActionResult<{ templateId: string }>> {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  const templateId = isFormData(formData)
    ? singleString(formData, "templateId", MAX_ID_LEN)
    : null;
  if (!ws || !templateId) return fail(INVALID);
  let result: TemplateActionResult<{ templateId: string }>;
  try {
    result = await archiveTemplateFromAction(gate.session, {
      workspaceId: ws,
      templateId,
    });
  } catch {
    return fail(GENERIC);
  }
  if (result.ok) {
    revalidate(templatePath(ws, templateId));
    revalidate(listPath(ws));
  }
  return result;
}
