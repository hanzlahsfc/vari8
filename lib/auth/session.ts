/**
 * S1-F2B session-version gate — Node-side only (imports Prisma; must never be
 * pulled into `auth.config.ts`, which stays edge-safe for middleware).
 *
 * `User.sessionVersion` is the revocation counter: a successful password reset
 * (S1-F2D) increments it so every JWT issued before the reset becomes stale.
 *
 * Mechanism (verified against next-auth@5.0.0-beta.32 / @auth/core@0.41.3):
 * the gate lives in the `jwt` callback, whose return type is
 * `Awaitable<JWT | null>`. Returning `null` is the supported invalidation —
 * `actions.session` sees `token === null`, pushes `sessionStore.clean()`
 * (expired-cookie headers) and returns a null body for BOTH the
 * `/api/auth/session` endpoint and the server `auth()`/`getSession` path.
 * Returning `null` from the `session` callback is NOT safe: `getSession`
 * coalesces it back to the token-derived default session (`?? args[0].session`)
 * and `auth()` stays authenticated — the independent-review bypass this file
 * was repaired for. The `session` callback therefore only delegates to the
 * base callbacks; a null token never reaches it.
 *
 * Rejections (all → `jwt` returns `null`): missing/empty `sub`, missing or
 * malformed `sv`, non-integer/negative `sv`, version mismatch vs the CURRENT
 * database row, non-ACTIVE status, unknown/deleted user, lookup error. Legacy
 * JWTs without `sv` are stale by design. One indexed PK read per validation;
 * no caching — a cache reintroduces revocation lag.
 */
import type { Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

import { authConfig } from "../../auth.config";
import { prisma } from "../db";

declare module "next-auth" {
  interface User {
    /** Session version at sign-in — becomes JWT claim `sv`. */
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Session version embedded at issuance (S1-F2B). */
    sv?: number;
  }
}

export type SessionUserGateRecord = {
  id: string;
  status: string;
  sessionVersion: number;
};

export type SessionUserGateLookup = (
  id: string,
) => Promise<SessionUserGateRecord | null>;

/** Closed claim shape: non-negative integer. */
export function isValidSessionVersionClaim(sv: unknown): sv is number {
  return typeof sv === "number" && Number.isInteger(sv) && sv >= 0;
}

/**
 * True only when the user exists, is ACTIVE, and the JWT `sv` exactly matches
 * the current database version. Fails closed — a lookup error is a rejection,
 * never a pass-through.
 */
export async function sessionVersionAllowed(
  sub: unknown,
  sv: unknown,
  lookup: SessionUserGateLookup,
): Promise<boolean> {
  if (typeof sub !== "string" || sub.length === 0) return false;
  if (!isValidSessionVersionClaim(sv)) return false;
  let user: SessionUserGateRecord | null;
  try {
    user = await lookup(sub);
  } catch {
    return false;
  }
  if (user === null) return false;
  if (user.status !== "ACTIVE") return false;
  return user.sessionVersion === sv;
}

/** One indexed PK read — the only store the gate uses. */
export const prismaSessionUserLookup: SessionUserGateLookup = (id) =>
  prisma.user.findUnique({
    where: { id },
    select: { id: true, status: true, sessionVersion: true },
  });

export type JwtCallbackParams = {
  token: JWT;
  user?: User;
  trigger?: string;
  /** Client-sent update payload (`useSession().update`) — never trusted. */
  session?: unknown;
};

export type BaseCallbacks = {
  jwt(params: JwtCallbackParams): JWT | null | Promise<JWT | null>;
  session(params: { session: Session; token: JWT }): Session | Promise<Session>;
  /** Any other callback keys (e.g. `authorized`) pass through untouched. */
  [key: string]: unknown;
};

/**
 * Deliberately COMPOSES with the base callbacks rather than replacing them:
 * every key on `base` (`authorized`, future callbacks) survives via spread;
 * only `jwt` and `session` are overridden — `jwt` wraps the base result with
 * the version gate, `session` delegates to the base mapping.
 *
 * `jwt` behavior:
 * - sign-in (`user` present): stamp `sv` from the just-authenticated record —
 *   client/session input is never a source. An implausible `sessionVersion`
 *   leaves `sv` unset, which the gate then rejects on every use (fail-closed).
 * - every other invocation (session read, `update` trigger, refresh): run the
 *   DB gate on `token.sub`/`token.sv`; `null` → invalidated session.
 *   A `trigger === "update"` client payload (`session`) is never read.
 */
export function createSessionCallbacks(
  base: BaseCallbacks,
  lookup: SessionUserGateLookup,
) {
  return {
    ...base,
    async jwt({
      token,
      user,
      trigger,
      session: updatePayload,
    }: JwtCallbackParams): Promise<JWT | null> {
      const next = await base.jwt({
        token,
        user,
        trigger,
        session: updatePayload,
      });
      if (next === null) return null;
      if (user) {
        if (isValidSessionVersionClaim(user.sessionVersion)) {
          next.sv = user.sessionVersion;
        }
        return next;
      }
      const allowed = await sessionVersionAllowed(next.sub, next.sv, lookup);
      return allowed ? next : null;
    },
    async session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }): Promise<Session> {
      return base.session({ session, token });
    },
  };
}

/**
 * The actual callback composition wired into `auth.ts`'s `NextAuth` — exported
 * here (type-only next-auth imports + the edge-safe base config) so the same
 * object can be exercised in integration tests without pulling the NextAuth
 * runtime.
 */
export const authNodeCallbacks = createSessionCallbacks(
  authConfig.callbacks as unknown as BaseCallbacks,
  prismaSessionUserLookup,
);
