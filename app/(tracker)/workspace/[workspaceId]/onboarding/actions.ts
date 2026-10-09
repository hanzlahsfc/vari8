"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { isOnboardingSubmissionEnabled } from "@/lib/onboarding/submission-gate";
import { submitOnboardingFromAction } from "@/lib/onboarding/submissions-boundary";
import { onboardingSubmissionConsentRegistry } from "@/lib/onboarding/submissions";

/**
 * P-023 — client onboarding submit server action (decisions #82–#85).
 *
 * Order is load-bearing: GATE → session gate → only then FormData
 * binding → boundary. With the flag off/unset/invalid, the action returns
 * the unavailable failure BEFORE `auth()` runs — no session lookup, no
 * field reads, no service/database/audit work.
 *
 * The browser submits `workspaceId` + `assignmentId` (opaque route IDs)
 * + `answersJson` — a bounded array of {fieldId, value} records. No
 * clientProfileId or userId is ever accepted from the browser.
 */

const OFF = "This feature is not available.";
const DENIED = "You don't have access to do that.";
const INVALID = "Check the form details and try again.";

const fail = (message: string): { ok: false; message: string } => ({
  ok: false,
  message,
});

const singleString = (formData: FormData, key: string, maxLen: number) => {
  const all = formData.getAll(key);
  if (all.length !== 1) return null;
  const v = all[0];
  return typeof v === "string" && v.length > 0 && v.length <= maxLen ? v : null;
};

export type SubmitOnboardingState =
  | { ok: true; status: "submitted" | "already_submitted" }
  | { ok: false; message: string }
  | { ok: "idle" };

export async function submitOnboardingAction(
  _prev: SubmitOnboardingState,
  formData: FormData,
): Promise<SubmitOnboardingState> {
  // 1. Gate — off fails before ANY work.
  if (!isOnboardingSubmissionEnabled(process.env.ENABLE_ONBOARDING_SUBMISSION))
    return fail(OFF) as SubmitOnboardingState;

  // 2. Session gate.
  const session = await auth();
  if (!session?.user?.id) return fail(DENIED) as SubmitOnboardingState;

  // 3. Bounded input binding — opaque IDs + the bounded JSON payload.
  //    answersJson's 64 KiB byte cap is re-checked inside the boundary.
  const workspaceId = singleString(formData, "workspaceId", 128);
  const assignmentId = singleString(formData, "assignmentId", 128);
  const answersJson = singleString(formData, "answersJson", 96 * 1024);
  if (workspaceId === null || assignmentId === null || answersJson === null)
    return fail(INVALID) as SubmitOnboardingState;

  const result = await submitOnboardingFromAction(
    { user: { id: session.user.id } },
    { workspaceId, assignmentId, answersJson },
    { registry: onboardingSubmissionConsentRegistry(true) },
  );
  if (result.ok)
    revalidatePath(`/workspace/${workspaceId}/onboarding/${assignmentId}`);
  if (!result.ok) return result as SubmitOnboardingState;
  return { ok: true, status: result.value.status };
}
