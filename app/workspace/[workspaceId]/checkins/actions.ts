"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  archiveCheckInFormFromAction,
  createCheckInFormFromAction,
  openCheckInDraftFromAction,
  publishCheckInFromAction,
  saveCheckInDraftFromAction,
  type ActionResult,
} from "@/lib/checkin/forms-boundary";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";

type CheckInActionResult<T> = ActionResult<T>;

/**
 * P-025-A — Check-In form-definition server actions.
 *
 * The shared feature resolver runs FIRST — before session access, FormData
 * binding, or database work; a disabled/unconfigured environment makes
 * every action return the generic denied result (non-disclosing). Then the
 * session gate, then delegation to the reviewed boundary + success-only
 * revalidation. Successful writes return `{ ok: true }` even if cache
 * revalidation throws (the commit already happened); failure results never
 * revalidate.
 *
 * Contract notes:
 * - `workspaceId` is a caller-bound argument but remains an UNTRUSTED
 *   input; the guarded service is the final authority.
 * - All results are `{ ok, value | message }` — no redirect()/notFound()
 *   inside actions; `revalidatePath` fires only on success.
 * - draftJson is byte-bounded at the boundary BEFORE parse; actions never
 *   parse or log payload content.
 */

const INVALID = "Check the form details and try again.";
const DENIED = "You don't have access to do that.";
const GENERIC = "Something went wrong. Please try again in a moment.";

const MAX_ID_LEN = 128;
const MAX_NAME_LEN = 120; // service contract bound
const MAX_DRAFT_JSON_BYTES = 128 * 1024; // aligned with the boundary bound
const MAX_REVISION = 2_147_483_647; // Int column

const fail = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

/** Well-formed UTF-16 — lone surrogates would make encodeURIComponent throw
 * URIError during canonical path building, so malformed strings are rejected
 * as INVALID at input binding. */
function isWellFormedString(v: string): boolean {
  try {
    encodeURIComponent(v);
    return true;
  } catch {
    return false;
  }
}

/** Exactly one string value; File/duplicate/missing/oversized → null. */
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

/** singleString variant bound on UTF-8 BYTES — the boundary's bound is
 * byte-based, so the action-level transport bound must match. */
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

/** Strict decimal integer within Int32 — no coercion. 0 is syntactically
 * valid; the service's stale-revision gate controls semantics. */
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

/** Shared feature resolver — FIRST check: a disabled/untrusted environment
 * denies before session, FormData, or database work (non-disclosing). */
function featureGate(): boolean {
  return isCheckInsEnabled();
}

/** Session gate — runs after the feature gate, before input binding. */
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

/** Canonical revalidation paths — segments are encoded so caller-supplied
 * IDs can never inject extra path segments. */
const listPath = (workspaceId: string) =>
  `/workspace/${encodeURIComponent(workspaceId)}/checkins/forms`;
const formPath = (workspaceId: string, formId: string) =>
  `${listPath(workspaceId)}/${encodeURIComponent(formId)}`;

/** Revalidation is best-effort: a committed mutation stays successful even
 * when the cache layer throws. Never echoes the exception. */
function revalidate(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Cache invalidation failure must not convert a committed write into a
    // retryable-looking failure.
  }
}

/** Non-FormData arguments (serialized tamper) fail typed — getAll would
 * TypeError on a plain object. */
function isFormData(value: unknown): value is FormData {
  return value instanceof FormData;
}

async function delegate<T>(
  fn: () => Promise<CheckInActionResult<T>>,
  path: string,
): Promise<CheckInActionResult<T>> {
  let result: CheckInActionResult<T>;
  try {
    result = await fn();
  } catch {
    return fail(GENERIC);
  }
  if (result.ok) revalidate(path);
  return result;
}

export async function createCheckInForm(
  workspaceId: string,
  formData: FormData,
): Promise<CheckInActionResult<{ formId: string }>> {
  if (!featureGate()) return fail(DENIED);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const name = singleString(formData, "name", MAX_NAME_LEN);
  if (name === null) return fail(INVALID);
  return delegate(
    () => createCheckInFormFromAction(gate.session, { workspaceId: ws, name }),
    listPath(ws),
  );
}

export async function saveCheckInDraft(
  workspaceId: string,
  formData: FormData,
): Promise<
  CheckInActionResult<{
    revision: number;
    definition: import("@/lib/checkin/forms").CheckInDefinition;
  }>
> {
  if (!featureGate()) return fail(DENIED);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const formId = singleString(formData, "formId", MAX_ID_LEN);
  const expectedRevision = strictRevision(formData);
  const draftJson = singleStringBytes(
    formData,
    "draftJson",
    MAX_DRAFT_JSON_BYTES,
  );
  const names = formData.getAll("name");
  const name =
    names.length === 0
      ? undefined
      : names.length === 1 &&
          typeof names[0] === "string" &&
          names[0].length <= MAX_NAME_LEN
        ? names[0]
        : null;
  if (
    formId === null ||
    expectedRevision === null ||
    draftJson === null ||
    name === null
  )
    return fail(INVALID);
  return delegate(
    () =>
      saveCheckInDraftFromAction(gate.session, {
        workspaceId: ws,
        formId,
        expectedRevision,
        draftJson,
        name,
      }),
    formPath(ws, formId),
  );
}

export async function publishCheckInForm(
  workspaceId: string,
  formData: FormData,
): Promise<CheckInActionResult<{ versionSeq: number }>> {
  if (!featureGate()) return fail(DENIED);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const formId = singleString(formData, "formId", MAX_ID_LEN);
  const expectedRevision = strictRevision(formData);
  if (formId === null || expectedRevision === null) return fail(INVALID);
  return delegate(
    () =>
      publishCheckInFromAction(gate.session, {
        workspaceId: ws,
        formId,
        expectedRevision,
      }),
    formPath(ws, formId),
  );
}

export async function archiveCheckInForm(
  workspaceId: string,
  formData: FormData,
): Promise<CheckInActionResult<{ formId: string }>> {
  if (!featureGate()) return fail(DENIED);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const formId = singleString(formData, "formId", MAX_ID_LEN);
  if (formId === null) return fail(INVALID);
  return delegate(
    () =>
      archiveCheckInFormFromAction(gate.session, { workspaceId: ws, formId }),
    formPath(ws, formId),
  );
}

export async function openCheckInDraft(
  workspaceId: string,
  formData: FormData,
): Promise<
  CheckInActionResult<{
    revision: number;
    definition: import("@/lib/checkin/forms").CheckInDefinition;
  }>
> {
  if (!featureGate()) return fail(DENIED);
  const gate = await sessionGate();
  if (!gate.ok) return gate;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const formId = singleString(formData, "formId", MAX_ID_LEN);
  if (formId === null) return fail(INVALID);
  return delegate(
    () => openCheckInDraftFromAction(gate.session, { workspaceId: ws, formId }),
    formPath(ws, formId),
  );
}
