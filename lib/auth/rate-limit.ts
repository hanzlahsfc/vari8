import { createHash } from "node:crypto";

import { prisma } from "../db";

/**
 * Shared auth-surface throttle (PR-05 fix pass 1).
 *
 * Better Auth's built-in limiter only runs inside its HTTP router — direct
 * `auth.api.*` calls (the login/signup server actions) bypass it. This module
 * writes to the SAME `rate_limit` table the built-in limiter uses, with the
 * same rolling-window semantics, so every auth-adjacent throttle shares one
 * durable store (survives restarts, shared across instances).
 *
 * Keys are namespaced: `acct:<purpose>:<sha256(email|userId)>` for the
 * per-account throttle (host-independent — works with or without a trusted
 * proxy header) and `ip:<purpose>:<ip>` for a per-IP bucket keyed on the
 * configured trusted header only.
 */

export type RateLimitRule = { window: number; max: number };

export type RateLimitOutcome =
  { allowed: true } | { allowed: false; retryAfter: number };

export class RateLimitExceededError extends Error {
  constructor(readonly retryAfter: number) {
    super("rate_limited");
    this.name = "RateLimitExceededError";
  }
}

const MAX_ATTEMPTS = 8;

/**
 * One atomic rolling-window consume. Mirrors Better Auth's database storage
 * algorithm (create-if-absent → window-reset CAS → bounded increment CAS) using
 * the Prisma client's conditional `updateMany` as the atomic primitive, so two
 * racing callers cannot both pass a stale read.
 */
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  client: Pick<typeof prisma, "rateLimit"> = prisma,
): Promise<RateLimitOutcome> {
  const windowMs = rule.window * 1000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const now = Date.now();
    const row = await client.rateLimit.findUnique({ where: { key } });
    if (!row) {
      try {
        await client.rateLimit.create({
          data: { key, count: 1, lastRequest: BigInt(now) },
        });
        return { allowed: true };
      } catch {
        // Lost the create race — re-read and continue.
        continue;
      }
    }
    const lastRequest = Number(row.lastRequest);
    if (now - lastRequest >= windowMs) {
      const reset = await client.rateLimit.updateMany({
        where: { key, lastRequest: { lte: BigInt(lastRequest) } },
        data: { count: 1, lastRequest: BigInt(now) },
      });
      if (reset.count === 1) return { allowed: true };
      continue;
    }
    const bumped = await client.rateLimit.updateMany({
      where: {
        key,
        lastRequest: { gt: BigInt(now - windowMs) },
        count: { lt: rule.max },
      },
      data: { count: { increment: 1 }, lastRequest: BigInt(now) },
    });
    if (bumped.count === 1) return { allowed: true };
    const fresh = await client.rateLimit.findUnique({ where: { key } });
    if (!fresh || now - Number(fresh.lastRequest) >= windowMs) continue;
    return {
      allowed: false,
      retryAfter: Math.ceil(
        (Number(fresh.lastRequest) + windowMs - now) / 1000,
      ),
    };
  }
  // Contention that never settles converges to a refusal — fail closed.
  return { allowed: false, retryAfter: rule.window };
}

/** Stable, non-reversible key material for an account-scoped bucket. */
export function accountLimitKey(
  purpose: string,
  normalizedEmail: string,
): string {
  const digest = createHash("sha256").update(normalizedEmail).digest("hex");
  return `acct:${purpose}:${digest}`;
}

/** Per-user bucket (change-password etc.) keyed on the session user id. */
export function userLimitKey(purpose: string, userId: string): string {
  const digest = createHash("sha256").update(`user:${userId}`).digest("hex");
  return `acct:${purpose}:${digest}`;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

/**
 * The client IP ONLY as declared by the configured trusted header
 * (`AUTH_TRUSTED_IP_HEADER`). No forwarding header is trusted when the env var
 * is unset or empty, so a spoofable `x-forwarded-for` buys nothing. Returns
 * null when there is no trustworthy address.
 */
export function resolveTrustedClientIp(requestHeaders: Headers): string | null {
  const header = process.env.AUTH_TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (!header) return null;
  const value = requestHeaders.get(header);
  if (!value) return null;
  const tokens = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  // A multi-hop value from an unverified chain is not trustworthy — the
  // configured header must carry exactly one address (proxy contract).
  if (tokens.length !== 1) return null;
  const ip = tokens[0];
  if (ip.length > 45 || !(IPV4.test(ip) || IPV6.test(ip))) return null;
  return ip;
}
