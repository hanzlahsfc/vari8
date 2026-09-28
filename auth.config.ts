import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe base Auth.js configuration.
 *
 * Session strategy: **JWT** (`session.strategy = "jwt"`). The Credentials
 * provider requires JWT sessions; database sessions are not supported for
 * Credentials in Auth.js v5. Session state lives in a signed, HttpOnly cookie.
 *
 * This file stays free of Node-only imports (no Prisma, no scrypt) so it could
 * be used from middleware later. The provider and database-backed lookup live
 * in `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
