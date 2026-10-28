"use server";

import { auth, signOut } from "@/auth";
import { signOutPath } from "@/lib/auth/viewer";

/**
 * S1-H sign-out server action: clears the session and returns to sign-in.
 * O17: a client returns to `/me/login`, everyone else to `/login`.
 */
export async function signOutAction(): Promise<void> {
  const session = await auth();
  await signOut({ redirectTo: await signOutPath(session?.user?.id) });
}
