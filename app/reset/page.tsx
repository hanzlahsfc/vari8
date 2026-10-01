import Link from "next/link";

import { getResetLinkState } from "@/lib/auth/password-reset-boundary";

import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set a new password" };

/**
 * Phase 3.2 public reset-consume route. Validity is established by a
 * non-consuming peek — every unusable link (missing, malformed, expired,
 * revoked, consumed, wrong purpose) renders one identical safe state. The
 * atomic claim itself still happens inside the reviewed service on submit.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const state = await getResetLinkState(token);

  if (state.state !== "ready") {
    return (
      <main className="app-main" data-testid="reset-invalid">
        <h1 className="app-title">Reset your password</h1>
        <p className="app-lede">
          This password reset link is invalid, expired, or has already been
          used. Request a new link.
        </p>
        <p className="app-lede">
          <Link href="/reset-request">Request a new link</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="app-main" data-testid="reset-page">
      <h1 className="app-title">Set a new password</h1>
      <p className="app-lede">
        Choose a new password for your account. All existing sign-in sessions
        will be signed out.
      </p>
      <ResetForm token={token as string} />
    </main>
  );
}
