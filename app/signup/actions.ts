"use server";

import { APIError } from "better-auth/api";

import { signIn } from "@/auth";
import { RateLimitExceededError } from "@/lib/auth/rate-limit";
import { signUpCoachAccount, SignupError } from "@/lib/auth/signup";
import { PasswordPolicyError } from "@/lib/password-policy";

export type SignupActionState = { error?: string } | undefined;

/**
 * Server action for the coach sign-up form: creates account + workspace in one
 * transaction, then signs the new coach in and lands on the app root.
 */
export async function signUpCoach(
  _previous: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  const email = formData.get("email");
  const password = formData.get("password");
  try {
    await signUpCoachAccount({
      name: formData.get("name"),
      email,
      password,
      workspaceName: formData.get("workspaceName"),
    });
    await signIn("credentials", { email, password, redirectTo: "/" });
    return undefined;
  } catch (error) {
    if (error instanceof SignupError) {
      return {
        error:
          error.code === "email_taken"
            ? "An account already exists for that email."
            : "Check the fields below and try again.",
      };
    }
    if (error instanceof PasswordPolicyError) {
      return {
        error:
          error.code === "password_needs_digit"
            ? "Password must contain at least one digit."
            : "Password must be at least 10 characters.",
      };
    }
    if (error instanceof RateLimitExceededError) {
      return { error: "Too many attempts. Please try again later." };
    }
    if (error instanceof APIError) {
      if (error.status === "TOO_MANY_REQUESTS") {
        return { error: "Too many attempts. Please try again later." };
      }
      return { error: "Could not sign you in. Try signing in manually." };
    }
    // Re-throw redirects and other framework errors.
    throw error;
  }
}
