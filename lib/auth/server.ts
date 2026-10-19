import { createHash } from "node:crypto";

import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins";

import { prisma } from "../db";
import { normalizeEmail } from "../email";
import { mailDeliveryConfigured, sendMail } from "../mail";
import { hashPassword, verifyPassword } from "../password";
import {
  PasswordPolicyError,
  validatePasswordSetup,
} from "../password-policy";
import {
  accountLimitKey,
  consumeRateLimit,
  userLimitKey,
} from "./rate-limit";

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
 * - Rate limiting is layered (PR-05 sec pass):
 *   (a) `hooks.before` applies a per-account throttle keyed on the normalized
 *       email/user id via the shared `rate_limit` table. It is independent of
 *       client IP, so it holds on any host, and — because `hooks` run inside
 *       `auth.api.*` dispatch — it covers the server actions that bypass the
 *       HTTP router. Limits: sign-in 10/min, request-password-reset 3/min,
 *       change-password 10/min, sign-up (form action) 10/min.
 *   (b) the built-in HTTP limiter keys on the client IP. No forwarding header
 *       is trusted unless `AUTH_TRUSTED_IP_HEADER` explicitly names one
 *       (`x-real-ip`, `cf-connecting-ip`, …). When unset, `disableIpTracking`
 *       turns the IP limiter OFF entirely — there is no shared fallback bucket
 *       a single attacker could use to lock out every other account, and a
 *       spoofed `x-forwarded-for` buys nothing.
 * - Password reset: 60-minute tokens in the `verification` table,
 *   `storeIdentifier: "hashed"` so the stored identifier is the SHA-256 digest
 *   of `reset-password:<token>` — the mailed raw token never rests in the
 *   database. A new request supersedes earlier unused tokens (the before-hook
 *   deletes the user's outstanding rows before the endpoint mints the new
 *   one); a completed reset deletes every remaining `reset-password:*` row
 *   (`onPasswordReset`) — `value` carries the user id, which is what makes
 *   user-scoped cleanup possible under hashed identifiers.
 * - Reset links are built from `BETTER_AUTH_URL` (fallback `AUTH_URL`) only —
 *   never from the request URL, Host, or forwarded headers.
 * - `hooks.before` also enforces repo invariants Better Auth doesn't know:
 *   (a) sign-in refuses non-ACTIVE accounts with the same generic failure as
 *       a wrong password (no status disclosure);
 *   (b) every session-bearing endpoint refuses a non-ACTIVE user — the hook
 *       resolves the session, deletes the user's session rows, and clears the
 *       resolved context so the endpoint's own session middleware denies;
 *   (c) `/change-password` always revokes the user's other sessions
 *       (`revokeOtherSessions` is forced on, not caller-optional);
 *   (d) reset endpoints refuse when no mail delivery adapter is configured —
 *       before any verification row is written;
 *   (e) password-setting paths enforce the owner-decided policy (>=10 chars,
 *       >=1 digit) — `minPasswordLength` covers length, the hook adds the
 *       digit rule.
 * - In production the process refuses to boot when the auth secret is absent
 *   or shorter than 32 characters, or when a canonical and legacy name (say
 *   `BETTER_AUTH_URL` and `AUTH_URL`) are set to different values
 *   (`assertAuthSecretConfigured`, invoked by
 *   `instrumentation.ts` and at module load; `instrumentation.ts` exits the
 *   process non-zero on the refusal so a dead deployment cannot sit serving
 *   500s with the port open).
 */

/** Endpoints that resolve and act on a session — all deny non-ACTIVE users. */
const SESSION_BOUND_PATHS = new Set([
  "/get-session",
  "/update-session",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/sign-out",
  "/update-user",
  "/change-password",
  "/set-password",
  "/verify-password",
  "/change-email",
  "/delete-user",
  "/get-access-token",
  "/refresh-token",
  "/list-accounts",
  "/account-info",
  "/link-social",
  "/unlink-account",
  "/send-verification-email",
]);

const RESET_PATHS = new Set(["/request-password-reset", "/reset-password"]);

const PASSWORD_SETTING_PATHS = new Set([
  "/sign-up/email",
  "/reset-password",
  "/change-password",
]);

const TRUSTED_IP_HEADER = process.env.AUTH_TRUSTED_IP_HEADER?.trim()
  ? [process.env.AUTH_TRUSTED_IP_HEADER.trim().toLowerCase()]
  : undefined;

const TOO_MANY = () =>
  new APIError("TOO_MANY_REQUESTS", {
    message: "Too many attempts. Please try again later.",
  });

async function consumeOrThrow(key: string, rule: { window: number; max: number }) {
  const outcome = await consumeRateLimit(key, rule);
  if (!outcome.allowed) throw TOO_MANY();
}

export function assertAuthSecretConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Conflicting canonical/legacy pairs fail at boot rather than serving
  // 403 INVALID_ORIGIN on every auth call (the BETTER_AUTH_* name wins the
  // `??` reads, so a stale AUTH_* value silently loses).
  for (const [primary, legacy] of [
    ["BETTER_AUTH_URL", "AUTH_URL"],
    ["BETTER_AUTH_SECRET", "AUTH_SECRET"],
  ] as const) {
    const a = process.env[primary];
    const b = process.env[legacy];
    if (a && b && a !== b) {
      throw new Error(
        `Refusing to start: ${primary} and ${legacy} are both set to different values. Only the BETTER_AUTH_* names are supported: unset ${legacy} or make the two equal.`,
      );
    }
  }
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Refusing to start: BETTER_AUTH_SECRET must be set and at least 32 characters long in production.",
    );
  }
}

assertAuthSecretConfigured();

export const auth = betterAuth({
  appName: "Vari8",
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  verification: {
    storeIdentifier: "hashed",
  },
  advanced: {
    ipAddress: TRUSTED_IP_HEADER
      ? { ipAddressHeaders: TRUSTED_IP_HEADER }
      : { disableIpTracking: true },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    password: {
      hash: (password) => hashPassword(password),
      verify: ({ hash, password }) => verifyPassword(password, hash),
    },
    sendResetPassword: async ({ user, token }) => {
      if (!mailDeliveryConfigured()) return;
      // Supersede (post-create): the row for THIS token already exists, so
      // delete every other reset row for the user — also when a racing second
      // request created its token between this endpoint's create and now.
      const freshId = createHash("sha256")
        .update(`reset-password:${token}`)
        .digest("base64url");
      await prisma.verification.deleteMany({
        where: { value: user.id, identifier: { not: freshId } },
      });
      const origin = (
        process.env.BETTER_AUTH_URL ??
        process.env.AUTH_URL ??
        ""
      ).replace(/\/+$/, "");
      await sendMail({
        to: user.email,
        subject: "Reset your password",
        text: `Reset your password: ${origin}/reset?token=${token}`,
      });
    },
    onPasswordReset: async ({ user }) => {
      // A completed reset invalidates every other outstanding reset token for
      // the user — `verification.value` carries the user id for reset rows,
      // and this deployment issues no other verification type.
      await prisma.verification.deleteMany({ where: { value: user.id } });
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
      "/request-password-reset": { window: 60, max: 3 },
      "/change-password": { window: 60, max: 10 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // (d) Reset endpoints fail closed while mail delivery is unavailable —
      //     before the endpoint writes any verification row.
      if (RESET_PATHS.has(ctx.path) && !mailDeliveryConfigured()) {
        throw new APIError("BAD_REQUEST", {
          message: "Password reset is not currently available.",
        });
      }

      if (ctx.path === "/sign-in/email") {
        const email = normalizeEmail(ctx.body?.email);
        if (email) {
          // (a1) per-account throttle — independent of client IP, covers the
          // HTTP route and the server-action `auth.api.signInEmail` path.
          await consumeOrThrow(accountLimitKey("sign-in", email), {
            window: 60,
            max: 10,
          });
          const user = await prisma.user.findUnique({
            where: { email },
            select: { status: true },
          });
          // (a) same generic failure as a wrong password — no status disclosure.
          //     The body must carry Better Auth's own code: its bad-credential
          //     failures include INVALID_EMAIL_OR_PASSWORD, so an omission would
          //     itself leak "account exists but is non-ACTIVE". The dummy hash
          //     matches the scrypt work the endpoint does on bad credentials so
          //     the early refusal is not a timing tell either.
          if (user && user.status !== "ACTIVE") {
            await hashPassword(ctx.body?.password ?? "");
            throw new APIError("UNAUTHORIZED", {
              message: "Invalid email or password",
              code: "INVALID_EMAIL_OR_PASSWORD",
            });
          }
        }
      }

      if (ctx.path === "/request-password-reset") {
        const email = normalizeEmail(ctx.body?.email);
        if (email) {
          await consumeOrThrow(accountLimitKey("reset-request", email), {
            window: 60,
            max: 3,
          });
          // Supersede: a new request invalidates earlier unused tokens.
          const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
          });
          if (user) {
            await prisma.verification.deleteMany({
              where: { value: user.id },
            });
          }
        }
      }

      if (SESSION_BOUND_PATHS.has(ctx.path)) {
        let userId = (
          await getSessionFromCtx(ctx).catch(() => null)
        )?.user?.id;
        // The bearer plugin injects its session after this hook runs, so a
        // bearer credential resolves to null here — resolve it directly. The
        // header carries the signed cookie value `<token>.<hmac>`; the raw
        // `sessions.token` is the segment before the first dot.
        if (!userId) {
          const authorization = ctx.headers?.get("authorization");
          const bearerToken = authorization
            ?.toLowerCase()
            .startsWith("bearer ")
            ? authorization.slice(7).trim().split(".")[0]
            : null;
          if (bearerToken) {
            const row = await prisma.session.findUnique({
              where: { token: bearerToken },
              select: { userId: true },
            });
            userId = row?.userId;
          }
        }
        if (userId) {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { status: true },
          });
          // (b) a deactivated (or removed) account's sessions die here, on any
          // session-bearing Better Auth path — the same guarantee the viewer
          // seam gives the app's own routes. This must throw, not just clear
          // ctx.context.session: the bearer plugin injects its session after
          // this hook, so a dead account's bearer credential would otherwise
          // still reach the endpoint.
          if (!user || user.status !== "ACTIVE") {
            await prisma.session.deleteMany({ where: { userId } });
            ctx.context.session = null;
            throw new APIError("UNAUTHORIZED", {
              message: "Session is no longer valid",
              code: "SESSION_EXPIRED",
            });
          }
          // (c1) per-user throttle on password change attempts.
          if (ctx.path === "/change-password") {
            await consumeOrThrow(userLimitKey("change-password", userId), {
              window: 60,
              max: 10,
            });
          }
        }
      }

      if (ctx.path === "/change-password" && ctx.body) {
        // (c) changing the password always revokes the other sessions.
        ctx.body.revokeOtherSessions = true;
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
