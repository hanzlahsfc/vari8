"use server";

import { redirect } from "next/navigation";

import { completePasswordReset } from "@/lib/auth/password-reset-boundary";

export type ResetActionState = { error?: string } | undefined;

/**
 * Phase 3.2 reset-completion server action. All token claim, policy,
 * password-hash, session-invalidation, and audit semantics live in the
 * reviewed service behind `completePasswordReset` — this action only
 * forwards fields and maps the structural result to a redirect or a safe
 * inline error. Success hands off to the ordinary credentials sign-in.
 */
export async function completeReset(
  _previous: ResetActionState,
  formData: FormData,
): Promise<ResetActionState> {
  const result = await completePasswordReset({
    rawToken: formData.get("token"),
    password: formData.get("password"),
  });
  if (!result.ok) return { error: result.message };
  redirect("/login?reset=1");
}
