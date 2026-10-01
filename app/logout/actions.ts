"use server";

import { signOut } from "@/auth";

/** S1-H sign-out server action — clears the session and returns to sign-in. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
