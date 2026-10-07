"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isCoachingTemplatesEnabled } from "@/lib/coaching/gate";
import { isParameterClassificationEnabled } from "@/lib/coaching/parameter-classification-gate";
import {
  archiveParameterFromAction,
  classifyParameterFromAction,
  createParameterFromAction,
  updateParameterFromAction,
  type ActionResult,
} from "@/lib/coaching/parameters-boundary";

type ParameterActionResult<T> = ActionResult<T>;

/**
 * P-014 — parameter library server actions.
 *
 * Ordering contract (tested directly): the development feature flag is
 * checked BEFORE `auth()`, before any FormData reads, and before any
 * boundary/database work — flag-off calls perform zero observable side
 * effects. Revalidation fires only after a successful committed mutation.
 *
 * `workspaceId` is caller-bound but UNTRUSTED — the guarded service is the
 * final membership/role/workspace authority.
 */

const OFF = "This feature is not available.";
const INVALID = "Check the details and try again.";
const DENIED = "You don't have access to do that.";
const GENERIC = "Something went wrong. Please try again in a moment.";

const MAX_ID_LEN = 128;
const MAX_INPUT_JSON_BYTES = 128 * 1024; // boundary bound — byte-aligned
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
  return strictInt(formData, "expectedRevision", MAX_REVISION);
}

function strictInt(
  formData: FormData,
  key: string,
  max: number,
): number | null {
  const raw = singleString(formData, key, 16);
  if (raw === null || !/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n <= max ? n : null;
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
  `/workspace/${encodeURIComponent(workspaceId)}/parameters`;

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

async function delegate<T>(
  fn: () => Promise<ParameterActionResult<T>>,
  path: string,
): Promise<ParameterActionResult<T>> {
  let result: ParameterActionResult<T>;
  try {
    result = await fn();
  } catch {
    return fail(GENERIC);
  }
  if (result.ok) revalidate(path);
  return result;
}

export async function createParameter(
  workspaceId: string,
  formData: FormData,
): Promise<ParameterActionResult<{ parameterId: string; key: string }>> {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  const inputJson = isFormData(formData)
    ? singleStringBytes(formData, "input", MAX_INPUT_JSON_BYTES)
    : null;
  if (!ws || !inputJson) return fail(INVALID);
  return delegate(
    () =>
      createParameterFromAction(gate.session, { workspaceId: ws, inputJson }),
    listPath(ws),
  );
}

export async function updateParameter(
  workspaceId: string,
  formData: FormData,
): Promise<ParameterActionResult<{ revision: number }>> {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  const parameterId = isFormData(formData)
    ? singleString(formData, "parameterId", MAX_ID_LEN)
    : null;
  const expectedRevision = isFormData(formData)
    ? strictRevision(formData)
    : null;
  const inputJson = isFormData(formData)
    ? singleStringBytes(formData, "input", MAX_INPUT_JSON_BYTES)
    : null;
  if (!ws || !parameterId || expectedRevision === null || !inputJson)
    return fail(INVALID);
  return delegate(
    () =>
      updateParameterFromAction(gate.session, {
        workspaceId: ws,
        parameterId,
        expectedRevision,
        inputJson,
      }),
    listPath(ws),
  );
}

export async function archiveParameter(
  workspaceId: string,
  formData: FormData,
): Promise<ParameterActionResult<{ parameterId: string }>> {
  if (!isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES))
    return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  const parameterId = isFormData(formData)
    ? singleString(formData, "parameterId", MAX_ID_LEN)
    : null;
  if (!ws || !parameterId) return fail(INVALID);
  return delegate(
    () =>
      archiveParameterFromAction(gate.session, {
        workspaceId: ws,
        parameterId,
      }),
    listPath(ws),
  );
}

/**
 * P-020A — one-time parameter classification (decisions #73/#78). The
 * classification management gate is checked FIRST — before the library flag,
 * before `auth()`, before any FormData binding — so a flag-off call performs
 * zero observable work. The browser binds the target by positional index +
 * selection fingerprint + expectedRevision only; no raw parameter id is
 * accepted.
 */
export async function classifyParameter(
  workspaceId: string,
  formData: FormData,
): Promise<ParameterActionResult<{ revision: number }>> {
  if (
    !isParameterClassificationEnabled(
      process.env.ENABLE_PARAMETER_CLASSIFICATION,
    ) ||
    !isCoachingTemplatesEnabled(process.env.ENABLE_COACHING_TEMPLATES)
  )
    return fail(OFF);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  const parameterIndex = isFormData(formData)
    ? strictInt(formData, "parameterIndex", 100_000)
    : null;
  const expectedRevision = isFormData(formData)
    ? strictInt(formData, "expectedRevision", MAX_REVISION)
    : null;
  const fingerprint = isFormData(formData)
    ? singleString(formData, "fingerprint", MAX_ID_LEN)
    : null;
  const classification = isFormData(formData)
    ? singleString(formData, "classification", 64)
    : null;
  if (
    !ws ||
    parameterIndex === null ||
    expectedRevision === null ||
    !fingerprint ||
    !classification
  )
    return fail(INVALID);
  return delegate(
    () =>
      classifyParameterFromAction(gate.session, {
        workspaceId: ws,
        parameterIndex,
        expectedRevision,
        fingerprint,
        classification,
      }),
    listPath(ws),
  );
}
