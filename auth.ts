import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
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
            select: { id: true, email: true, name: true, passwordHash: true },
          }),
        );
      },
    }),
  ],
});
