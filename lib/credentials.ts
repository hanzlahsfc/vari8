import { verifyPassword } from "./password";

/** The subset of a user record required to verify credentials. */
export type CredentialRecord = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  /** Account status; only ACTIVE accounts may authenticate (S1-B). */
  status: string;
  /**
   * S1-F2B: current session-generation counter — embedded in the issued JWT so
   * password-reset/other invalidation can stale already-issued sessions.
   */
  sessionVersion: number;
};

/** Looks up a user by normalized (lowercase) email. */
export type UserLookup = (email: string) => Promise<CredentialRecord | null>;

export type AuthorizedUser = {
  id: string;
  email: string;
  name: string | null;
  /** S1-F2B: session version at sign-in time — becomes the JWT `sv` claim. */
  sessionVersion: number;
};

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Verify credentials against a user lookup.
 *
 * Returns the safe user shape on success, otherwise `null`. Unknown email and
 * wrong password are indistinguishable (both `null`) so callers cannot leak
 * whether an account exists.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<"email" | "password", unknown>> | undefined,
  lookup: UserLookup,
): Promise<AuthorizedUser | null> {
  const email = normalizeEmail(credentials?.email);
  const password =
    typeof credentials?.password === "string" ? credentials.password : "";
  if (!email || !password) return null;

  const user = await lookup(email);
  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  // Inactive accounts fail with the same generic result as unknown email/wrong
  // password, so account status is never revealed.
  if (user.status !== "ACTIVE") return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    sessionVersion: user.sessionVersion,
  };
}
