import Link from "next/link";
import { notFound } from "next/navigation";

import { ResetForm } from "@/app/reset/reset-form";
import {
  getResetLinkState,
  passwordResetDeliveryConfigured,
} from "@/lib/auth/password-reset-boundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set a new password" };

/**
 * O17: the client reset consume route. Same non-consuming peek, same form and
 * same server action as `/reset`; the mailed client link points here and the
 * recovery links stay on `/me`.
 */
export default async function MeResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  if (!passwordResetDeliveryConfigured()) notFound();
  const { token } = await searchParams;
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
          <Link href="/me/reset-request">Request a new link</Link>
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
