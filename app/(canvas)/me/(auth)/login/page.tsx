import Link from "next/link";

import { LoginForm } from "@/app/login/login-form";
import { passwordResetDeliveryConfigured } from "@/lib/auth/password-reset-boundary";

export const metadata = { title: "Sign in" };

/**
 * O17: the client sign-in. Same form and server action as `/login`
 * (`authenticate` redirects to `/`, which routes by role: staff to /coach, a
 * client to /me), only the shell and the client-side links differ.
 */
export default async function MeLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    inviteAccepted?: string | string[];
    reset?: string | string[];
  }>;
}) {
  const { inviteAccepted, reset } = await searchParams;
  return (
    <main className="app-main">
      <h1 className="app-title">Sign in</h1>
      {inviteAccepted === "1" ? (
        <p className="auth-success" role="status">
          Your invitation was accepted. Sign in with the invited email and the
          password you just set.
        </p>
      ) : null}
      {reset === "1" ? (
        <p className="auth-success" role="status">
          Your password was updated. Sign in with your new password.
        </p>
      ) : null}
      <p className="app-lede">Sign in to continue.</p>
      <LoginForm />
      {passwordResetDeliveryConfigured() ? (
        <p className="app-lede">
          <Link href="/me/reset-request">Forgot your password?</Link>
        </p>
      ) : null}
    </main>
  );
}
