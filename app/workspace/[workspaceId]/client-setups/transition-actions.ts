"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  executeTransitionFromAction,
  getTransitionTargetsFromAction,
  reviewTransitionFromAction,
  type ActionResult,
  type TransitionReviewPayload,
  type TransitionTargetsPayload,
} from "@/lib/coaching/client-setup-transition-boundary";
import { isClientSetupTransitionsEnabled } from "@/lib/coaching/client-setup-transition-gate";

/**
 * P-020B — client-setup template-version transition server actions
 * (product-decisions #58–#62).
 *
 * Order of operations is load-bearing: TRANSITIONS GATE + PARENT GATE →
 * session gate → only then binding user-controlled fields. With either flag
 * off, the action returns the feature-off failure before `auth()` runs — no
 * session lookup, no form field reads, no boundary/provider/database work.
 *
 * The browser submits positional indices + fingerprints only — never raw
 * pin/setup/version/template/parameter/member ids (P-020-R3 §27).
 */

const INVALID = "Check the form details and try again.";
const DENIED = "You don't have access to do that.";
const GENERIC = "Something went wrong. Please try again in a moment.";
const OFF = "This feature is not available.";

const MAX_ID_LEN = 128;

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

function boundedArg(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LEN &&
    isWellFormedString(value)
    ? value
    : null;
}

/** Session gate — runs before ANY input work or delegation. */
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
  `/workspace/${encodeURIComponent(workspaceId)}/client-setups`;

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

function isFormData(value: unknown): value is FormData {
  return value instanceof FormData;
}

/** A positional selection index: decimal digits only, integer, bounded. */
function indexField(formData: FormData, key: string): number | null {
  const raw = singleString(formData, key, 9);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** Optional positional index — absent field is valid; present-but-invalid
 * fails closed. */
function optionalIndexField(
  formData: FormData,
  key: string,
): { present: false } | { present: true; value: number | null } {
  if (formData.getAll(key).length === 0) return { present: false };
  return { present: true, value: indexField(formData, key) };
}

function directionField(formData: FormData): "UPGRADE" | "ROLLBACK" | null {
  const raw = singleString(formData, "direction", 16);
  return raw === "UPGRADE" || raw === "ROLLBACK" ? raw : null;
}

function gate(): boolean {
  return isClientSetupTransitionsEnabled(
    process.env.ENABLE_CLIENT_SETUP_TRANSITIONS,
    process.env.ENABLE_CLIENT_SETUP,
  );
}

async function delegate<T>(
  fn: () => Promise<ActionResult<T>>,
  path: string,
): Promise<ActionResult<T>> {
  let result: ActionResult<T>;
  try {
    result = await fn();
  } catch {
    return fail(GENERIC);
  }
  if (result.ok) revalidate(path);
  return result;
}

export async function loadTransitionTargets(
  workspaceId: string,
  formData: FormData,
): Promise<ActionResult<TransitionTargetsPayload>> {
  if (!gate()) return fail(OFF);
  const session = await sessionGate();
  if (!session.ok) return session;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const pinIndex = indexField(formData, "pinIndex");
  const rowFingerprint = singleString(formData, "rowFingerprint", MAX_ID_LEN);
  if (pinIndex === null || rowFingerprint === null) return fail(INVALID);
  return delegate(
    () =>
      getTransitionTargetsFromAction(session.session, {
        workspaceId: ws,
        pinIndex,
        rowFingerprint,
      }),
    listPath(ws),
  );
}

export async function reviewSetupTransition(
  workspaceId: string,
  formData: FormData,
): Promise<ActionResult<TransitionReviewPayload>> {
  if (!gate()) return fail(OFF);
  const session = await sessionGate();
  if (!session.ok) return session;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const pinIndex = indexField(formData, "pinIndex");
  const rowFingerprint = singleString(formData, "rowFingerprint", MAX_ID_LEN);
  const direction = directionField(formData);
  const target = optionalIndexField(formData, "targetIndex");
  if (pinIndex === null || rowFingerprint === null || direction === null)
    return fail(INVALID);
  if (target.present && target.value === null) return fail(INVALID);
  return delegate(
    () =>
      reviewTransitionFromAction(session.session, {
        workspaceId: ws,
        pinIndex,
        rowFingerprint,
        direction,
        targetIndex: target.present ? (target.value ?? undefined) : undefined,
      }),
    listPath(ws),
  );
}

export async function executeSetupTransition(
  workspaceId: string,
  formData: FormData,
): Promise<
  ActionResult<{ applied: true; direction: string; targetVersionSeq: number }>
> {
  if (!gate()) return fail(OFF);
  const session = await sessionGate();
  if (!session.ok) return session;
  const ws = boundedArg(workspaceId);
  if (!ws || !isFormData(formData)) return fail(INVALID);
  const pinIndex = indexField(formData, "pinIndex");
  const rowFingerprint = singleString(formData, "rowFingerprint", MAX_ID_LEN);
  const direction = directionField(formData);
  const target = optionalIndexField(formData, "targetIndex");
  const reviewFingerprint = singleString(
    formData,
    "reviewFingerprint",
    MAX_ID_LEN,
  );
  // Explicit confirmation token is mandatory for every transition — a
  // missing/non-"1" value fails closed before any service work.
  const confirm = singleString(formData, "confirm", 4);
  if (
    pinIndex === null ||
    rowFingerprint === null ||
    direction === null ||
    reviewFingerprint === null ||
    confirm !== "1"
  )
    return fail(INVALID);
  if (target.present && target.value === null) return fail(INVALID);
  return delegate(
    () =>
      executeTransitionFromAction(session.session, {
        workspaceId: ws,
        pinIndex,
        rowFingerprint,
        direction,
        targetIndex: target.present ? (target.value ?? undefined) : undefined,
        reviewFingerprint,
      }),
    listPath(ws),
  );
}
