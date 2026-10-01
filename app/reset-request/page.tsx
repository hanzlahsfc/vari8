import Link from "next/link";

import { ResetRequestForm } from "./reset-request-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reset password" };

/**
 * Phase 3.2 public reset-request route. The response is deliberately generic
 * — it never reveals whether an account exists for the submitted email.
 */
export default function ResetRequestPage() {
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
