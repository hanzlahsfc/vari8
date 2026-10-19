import Link from "next/link";

import { passwordResetDeliveryConfigured } from "@/lib/auth/password-reset-boundary";

import { LoginForm } from "./login-form";

export default async function LoginPage({
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
      <h1 className="app-title">App</h1>
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
      <p className="app-lede">
        Coaching workspace? <Link href="/signup">Create one</Link>
      </p>
      {passwordResetDeliveryConfigured() ? (
        <p className="app-lede">
          <Link href="/reset-request">Forgot your password?</Link>
        </p>
      ) : null}
    </main>
  );
}
