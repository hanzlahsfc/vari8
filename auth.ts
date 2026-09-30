import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
import { authNodeCallbacks } from "./lib/auth/session";
import { authorizeCredentials } from "./lib/credentials";
import { prisma } from "./lib/db";

/**
 * Auth.js v5 with the Credentials provider, for **existing database users only**
 * (there is no registration, password reset, seeded account, or default
 * credential in this phase).
 *
 * Session strategy is JWT (see `auth.config.ts`). Passwords are compared using
 * scrypt-based hashing in `lib/password.ts`; plaintext is never stored or
 * logged.
 *
 * S1-F2B: the Node-side callbacks in `lib/auth/session.ts` (Prisma is allowed
 * there) COMPOSE with the edge-safe base callbacks — `...authConfig` plus a
 * callbacks object that preserves every base key and overrides only `jwt`/
 * `session`. `jwt` stamps `token.sv` from the database `sessionVersion` at
 * sign-in and returns `null` (the supported Auth.js invalidation: null body +
 * cleared cookie) whenever the token's `sv` does not match the user's CURRENT
 * database status+version on every later request. Returning null from the
 * `session` callback is NOT used — `auth()`/`getSession` would coalesce it
 * back to a default authenticated session. auth.config.ts stays Prisma-free.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize(credentials) {
        return authorizeCredentials(credentials, (email) =>
          prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              status: true,
              sessionVersion: true,
            },
          }),
        );
      },
    }),
  ],
  callbacks: authNodeCallbacks,
});
