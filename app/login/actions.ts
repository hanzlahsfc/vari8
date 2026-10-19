"use server";

import { APIError } from "better-auth/api";

import { signIn } from "@/auth";

/**
 * Server action for the sign-in form. On success `signIn` redirects; on a
 * credentials failure it returns a single generic message so callers cannot
 * tell whether the email exists.
 */
export async function authenticate(
  _previous: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return undefined;
  } catch (error) {
    if (error instanceof APIError) {
      return "Invalid email or password.";
    }
    // Re-throw redirects and other framework errors.
    throw error;
  }
}
