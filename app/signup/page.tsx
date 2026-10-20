import Link from "next/link";

import { SignupForm } from "./signup-form";

export const metadata = { title: "Create your workspace" };

/**
 * PR-05 coach self-signup (owner answer 5). Clients never register here —
 * they join through workspace invitations.
 */
export default function SignupPage() {
  return (
    <main className="app-main">
      <h1 className="app-title">Create your workspace</h1>
      <p className="app-lede">Coach sign-up. Clients join by invitation.</p>
      <SignupForm />
      <p className="app-lede">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
