import Link from "next/link";
import { notFound } from "next/navigation";

import { passwordResetDeliveryConfigured } from "@/lib/auth/password-reset-boundary";

import { ResetRequestForm } from "./reset-request-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reset password" };

/**
 * Phase 3.2 public reset-request route. Fails closed (404) until a real
 * delivery adapter is registered — the page must not promise email delivery
 * that does not exist. The response is deliberately generic once enabled —
 * it never reveals whether an account exists for the submitted email.
 */
export default function ResetRequestPage() {
  if (!passwordResetDeliveryConfigured()) notFound();
  return (
    <main className="app-main" data-testid="reset-request-page">
      <h1 className="app-title">Reset your password</h1>
      <p className="app-lede">
        Enter your account email. If an account exists, we&apos;ll send a
        password reset link.
      </p>
      <ResetRequestForm />
      <p className="app-lede">
        Remembered it? <Link href="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
