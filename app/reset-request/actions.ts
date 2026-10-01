"use server";

import { requestPasswordResetFromForm } from "@/lib/auth/password-reset-boundary";

export type ResetRequestState = { ok: boolean; message: string } | undefined;

/**
 * Phase 3.2 reset-request server action. Forwards only the email; the
 * boundary owns the non-enumerating response, delivery seam, and structural
 * error mapping.
 */
export async function requestReset(
  _previous: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  return requestPasswordResetFromForm(formData.get("email"));
}
