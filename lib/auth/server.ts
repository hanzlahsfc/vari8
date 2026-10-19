import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins";

import { prisma } from "../db";
import { normalizeEmail } from "../email";
import { sendMail } from "../mail";
import { hashPassword, verifyPassword } from "../password";
import {
  PasswordPolicyError,
  validatePasswordSetup,
} from "../password-policy";

/**
 * PR-05: Better Auth replaces Auth.js as the auth engine.
 *
 * - Prisma adapter on the existing schema (sessions are `session` table rows —
 *   revocation is row deletion; no JWT/sessionVersion machinery remains).
 * - Email+password with the repo's existing scrypt implementation, so hashes
 *   written before the cutover keep working unchanged.
 * - `bearer()` exposes the session token as an `Authorization: Bearer`
 *   credential (API clients); `nextCookies()` bridges Set-Cookie into Next
 *   server actions (must stay LAST in the plugin list).
 * - Sign-up here is disabled: coach self-signup goes through
 *   `lib/auth/signup.ts`, which creates user + workspace + owner membership
 *   atomically instead of leaving an orphan user row.
 * - Rate limiting is the built-in limiter, DB-backed so it survives restarts
 *   and is shared across instances. `/sign-in/email` is limited to 10
 *   attempts/minute — the card's live proof expects the 11th rapid wrong
 *   password to be refused while earlier failures still reach the credential
 *   check (the built-in special rule is 3/10s, which would limit too early).
 * - Password reset: 60-minute tokens in the `verification` table, consumed
 *   atomically (single use) inside the same transaction that revokes every
 *   session and writes the new hash (`revokeSessionsOnPasswordReset`).
 * - `hooks.before` enforces two repo invariants Better Auth doesn't know:
 *   (a) sign-in refuses non-ACTIVE accounts with the same generic failure as
 *       a wrong password (no status disclosure);
 *   (b) password-setting paths enforce the owner-decided policy (>=10 chars,
 *       >=1 digit) — `minPasswordLength` covers length, the hook adds the
 *       digit rule.
 */
const PASSWORD_SETTING_PATHS = new Set([
  "/sign-up/email",
  "/reset-password",
  "/change-password",
]);

export const auth = betterAuth({
  appName: "Vari8",
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    password: {
      hash: (password) => hashPassword(password),
      verify: ({ hash, password }) => verifyPassword(password, hash),
    },
    sendResetPassword: async ({ user, token }, request) => {
      const origin = request
        ? new URL(request.url).origin
        : (process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL ?? "");
      await sendMail({
        to: user.email,
        subject: "Reset your password",
        text: `Reset your password: ${origin}/reset?token=${token}`,
      });
    },
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        const email = normalizeEmail(ctx.body?.email);
        if (email) {
          const user = await prisma.user.findUnique({
            where: { email },
            select: { status: true },
          });
          if (user && user.status !== "ACTIVE") {
            throw new APIError("UNAUTHORIZED", {
              message: "Invalid email or password",
            });
          }
        }
      }
      if (PASSWORD_SETTING_PATHS.has(ctx.path)) {
        const candidate = ctx.body?.password ?? ctx.body?.newPassword;
        try {
          validatePasswordSetup(candidate);
        } catch (error) {
          if (error instanceof PasswordPolicyError) {
            throw new APIError("BAD_REQUEST", { message: error.code });
          }
          throw error;
        }
      }
    }),
  },
  plugins: [bearer(), nextCookies()],
});

export type AuthServer = typeof auth;
