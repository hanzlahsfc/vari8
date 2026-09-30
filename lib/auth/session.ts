/**
 * S1-F2B session-version gate — Node-side only (imports Prisma; must never be
 * pulled into `auth.config.ts`, which stays edge-safe for middleware).
 *
 * `User.sessionVersion` is the revocation counter: a successful password reset
 * (S1-F2D) increments it so every JWT issued before the reset becomes stale.
 * The `session` callback re-reads the current row on EVERY authenticated
 * request — the JWT-carried `sv` claim is never trusted on its own — and the
 * session is rejected indistinguishably (same as expired) on: missing user,
 * non-ACTIVE status, missing/malformed/non-integer/negative `sv`, or a
 * version mismatch. Legacy JWTs without `sv` are stale by design.
 *
 * Cost: one indexed primary-key read per session validation. No caching —
 * caching reintroduces a revocation lag and defeats the mechanism.
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

export type BaseCallbacks = {
  jwt(params: { token: JWT; user?: User }): JWT | Promise<JWT>;
  session(params: { session: Session; token: JWT }): Session | Promise<Session>;
};

/**
 * Composes the edge-safe `auth.config.ts` callbacks with the DB gate. The jwt
 * callback stamps `sv` from the just-authenticated user record (never from
 * client input); the session callback validates it against fresh DB state and
 * returns `null` — indistinguishable from an expired/invalid session — on any
 * rejection.
 */
export function createSessionCallbacks(
  base: BaseCallbacks,
  lookup: SessionUserGateLookup,
) {
  return {
    async jwt({ token, user }: { token: JWT; user?: User }): Promise<JWT> {
      const next = await base.jwt({ token, user });
      if (user && isValidSessionVersionClaim(user.sessionVersion)) {
        next.sv = user.sessionVersion;
      }
      return next;
    },
    async session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }): Promise<Session> {
      const next = await base.session({ session, token });
      if (!(await sessionVersionAllowed(token.sub, token.sv, lookup))) {
        return null as unknown as Session;
      }
      return next;
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
