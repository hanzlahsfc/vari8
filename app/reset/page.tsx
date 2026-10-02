import Link from "next/link";
import { notFound } from "next/navigation";

import { getResetLinkState } from "@/lib/auth/password-reset-boundary";
import { passwordResetDeliveryConfigured } from "@/lib/auth/password-reset-delivery";

import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set a new password" };

/**
 * Phase 3.2 public reset-consume route. Fails closed (404) until a real
 * delivery adapter is registered — token URLs never reach the peek while the
 * route is gated off. Once enabled, validity is established by a
 * non-consuming peek — every unusable link (missing, malformed, expired,
 * revoked, consumed, wrong purpose) renders one identical safe state. The
 * atomic claim itself still happens inside the reviewed service on submit.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  if (!passwordResetDeliveryConfigured()) notFound();
  const { token } = await searchParams;
  // Narrow before the peek — empty/array/missing input already yields the
  // invalid state, so no assertion is needed below.
  const rawToken = typeof token === "string" ? token : "";
  const state = await getResetLinkState(rawToken);

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
      <ResetForm token={rawToken} />
    </main>
  );
}
