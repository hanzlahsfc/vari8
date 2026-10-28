import Link from "next/link";
import { notFound } from "next/navigation";

import { ResetRequestForm } from "@/app/reset-request/reset-request-form";
import { passwordResetDeliveryConfigured } from "@/lib/auth/password-reset-boundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reset password" };

/**
 * O17: the client reset request. Same form, action and non-enumerating
 * response as `/reset-request`; only the shell and the back link differ.
 * Fails closed (404) until a real delivery adapter is registered, exactly as
 * the staff route does.
 */
export default function MeResetRequestPage() {
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
        Remembered it? <Link href="/me/login">Back to sign in</Link>
      </p>
    </main>
  );
}
