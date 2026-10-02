"use server";

import type { ActionResult } from "@/lib/onboarding/forms-boundary";

type OnboardingActionResult<T> = ActionResult<T>;

/**
 * P-008 slice-5B — onboarding form server actions.
 *
 * INTERFACE SCAFFOLD: exact signatures only — every body throws an UNTYPED
 * error until the implementation increments land. No session lookup, no
 * FormData binding, no delegation, no revalidation yet.
 *
 * Contract notes:
 * - `workspaceId` is a caller-bound argument but remains an UNTRUSTED input;
 *   the guarded service is the final membership/role/workspace authority.
 * - All results are `{ ok, value | message }` — no redirect()/forbidden()
 *   inside actions; `revalidatePath` fires only on success.
 */

export async function createForm(
  _workspaceId: string,
  _formData: FormData,
): Promise<OnboardingActionResult<{ formId: string }>> {
  throw new Error("not implemented (slice 5B increment)");
}

export async function saveDraft(
  _workspaceId: string,
  _formData: FormData,
): Promise<
  OnboardingActionResult<{
    revision: number;
    definition: import("@/lib/onboarding/forms").FormDefinition;
  }>
> {
  throw new Error("not implemented (slice 5B increment)");
}

export async function publishForm(
  _workspaceId: string,
  _formData: FormData,
): Promise<OnboardingActionResult<{ versionSeq: number }>> {
  throw new Error("not implemented (slice 5B increment)");
}

export async function archiveForm(
  _workspaceId: string,
  _formData: FormData,
): Promise<OnboardingActionResult<{ formId: string }>> {
  throw new Error("not implemented (slice 5B increment)");
}

export async function openDraft(
  _workspaceId: string,
  _formData: FormData,
): Promise<
  OnboardingActionResult<{
    revision: number;
    definition: import("@/lib/onboarding/forms").FormDefinition;
  }>
> {
  throw new Error("not implemented (slice 5B increment)");
}
