import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth as authServer } from "./lib/auth/server";
import { getViewer } from "./lib/auth/viewer";
import { normalizeEmail } from "./lib/email";

/**
 * PR-05: Auth.js is gone; this module keeps the existing call-site contract
 * (`auth()` -> `{ user: { id, ... } } | null`, `signIn`/`signOut` from server
 * actions) backed by the Better Auth instance in `lib/auth/server.ts`.
 *
 * The session supplies identity ONLY — authorization still re-reads user,
 * workspace, and membership state on every call through `lib/auth/guard.ts`.
 */

export type AppSession = {
  user: { id: string; email: string; name: string | null };
};

export async function auth(): Promise<AppSession | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  return { user: viewer };
}

/**
 * Credentials sign-in for the login server action. Throws `APIError`
 * (better-auth/api) on failure — callers map it to the generic message.
 * Redirects on success, mirroring the old Auth.js signature.
 */
export async function signIn(
  provider: "credentials",
  options: { email: unknown; password: unknown; redirectTo?: string },
): Promise<void> {
  await authServer.api.signInEmail({
    body: {
      email: normalizeEmail(options.email),
      password: typeof options.password === "string" ? options.password : "",
    },
    headers: await headers(),
  });
  redirect(options.redirectTo ?? "/");
}

export async function signOut(options?: {
  redirectTo?: string;
}): Promise<void> {
  try {
    await authServer.api.signOut({ headers: await headers() });
  } finally {
    redirect(options?.redirectTo ?? "/login");
  }
}
