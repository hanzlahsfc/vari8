"use client";

import { signOutAction } from "@/app/logout/actions";

/** S1-H sign-out control for the workspace shell header. */
export function SignOutButton() {
  return (
    <form action={signOutAction} className="shell__signout">
      <button type="submit" className="auth-button" data-testid="sign-out">
        Sign out
      </button>
    </form>
  );
}
