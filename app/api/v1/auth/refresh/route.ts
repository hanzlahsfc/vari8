import { createHash, randomBytes } from "node:crypto";

import { getViewerFromHeaders } from "@/lib/auth/viewer";
import {
  consumeRateLimit,
  resolveTrustedClientIp,
  userLimitKey,
} from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";

/**
 * AUTH-ROTATE: `POST /api/v1/auth/refresh` — bearer only (ruling O1: cookie
 * sessions belong to web/PWA and never rotate here, D6: the Capacitor shell
 * rotates its bearer token).
 *
 * The contract, in the order the handler enforces it:
 *   1. bearer credential only. A cookie session, or no credential, is a 401;
 *      nothing about the web/PWA session is touched by this route.
 *   2. the token hash is throttled first (no identity needed), then the
 *      account (20 refreshes per 10 minutes, shared `rate_limit` store).
 *   3. the session row must exist and the credential must resolve through
 *      `getViewerFromHeaders` (HMAC check + ACTIVE user, the same seam every
 *      `/api/v1` route uses). A token with no session row that appears in the
 *      replay ledger is a replay: the whole family dies.
 *   4. the account is re-checked inside the handler. This route is not a
 *      Better Auth endpoint, so the `hooks.before` ACTIVE gate in
 *      `lib/auth/server.ts` never runs for it: ACTIVE user and a live ACTIVE
 *      membership in an ACTIVE workspace are required here explicitly.
 *   5. spend before issue, in one statement: delete the presented session row
 *      and require `count === 1`. Losing that race (a concurrent refresh, a
 *      replay that beats the ledger write) mints nothing and returns 401.
 *   6. only then the tombstone is written and the replacement session created.
 *
 * Fail closed: every store error ends as 401, never 500, because a 500 invites
 * the client to retry a request that may already have spent its token.
 *
 * Lifetime: a minted token gets 7 days absolute (`rotatedAt + 7d`, no rolling
 * `updateAge` extension). `rotateAt` is 80 percent of that life, so the shell
 * rotates while the token still works; both are returned ISO-8601.
 */

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Same absolute lifetime as a cookie session (`lib/auth/server.ts` session.expiresIn). */
const TOKEN_LIFETIME_MS = 7 * DAY_MS;
/** The shell rotates at 80 percent of the token's life (card item 5). */
const ROTATE_AT_FRACTION = 0.8;
/** 20 per 10 minutes, per account and per presented token hash (card item 4). */
const REFRESH_RULE = { window: 10 * 60, max: 20 };

const unauthenticated = () =>
  Response.json({ error: { code: "unauthenticated" } }, { status: 401 });

/**
 * The session token from `Authorization: Bearer <token>`. Better Auth accepts
 * both `raw` and `raw.<hmac>` (it signs a bare value itself), and the session
 * row is always keyed on the raw segment before the first dot.
 */
function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || header.slice(0, 7).toLowerCase() !== "bearer ") return null;
  const raw = header.slice(7).trim().split(".")[0];
  return raw.length > 0 ? raw : null;
}

/** One row per spent token; the hash is the only token-derived value stored. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Item 3, replay branch: the presented token is not a live session. If it was
 * rotated out, every session in its family goes, including the newest one.
 */
async function killFamilyIfSpent(tokenHash: string): Promise<Response> {
  const spent = await prisma.spentRefreshToken.findUnique({
    where: { tokenHash },
    select: { familyId: true },
  });
  if (!spent) return unauthenticated();
  await prisma.session.deleteMany({
    where: { OR: [{ familyId: spent.familyId }, { id: spent.familyId }] },
  });
  return unauthenticated();
}

export async function POST(request: Request): Promise<Response> {
  try {
    const token = bearerToken(request);
    if (!token) return unauthenticated();
    const tokenHash = hashToken(token);

    const tokenBudget = await consumeRateLimit(
      `tok:refresh:${tokenHash}`,
      REFRESH_RULE,
    );
    if (!tokenBudget.allowed) {
      return Response.json(
        { error: { code: "rate_limited" } },
        { status: 429 },
      );
    }

    const session = await prisma.session.findUnique({
      where: { token },
      select: { id: true, userId: true, familyId: true, expiresAt: true },
    });
    if (!session) return killFamilyIfSpent(tokenHash);

    const viewer = await getViewerFromHeaders(request.headers);
    if (!viewer || viewer.id !== session.userId) return unauthenticated();

    const accountBudget = await consumeRateLimit(
      userLimitKey("refresh", session.userId),
      REFRESH_RULE,
    );
    if (!accountBudget.allowed) {
      return Response.json(
        { error: { code: "rate_limited" } },
        { status: 429 },
      );
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.userId,
        status: "ACTIVE",
        workspace: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!membership) return unauthenticated();

    // Spend before issue: exactly one caller can delete this row.
    const familyId = session.familyId ?? session.id;
    const spent = await prisma.session.deleteMany({ where: { token } });
    if (spent.count !== 1) return unauthenticated();

    await prisma.spentRefreshToken.create({
      data: { tokenHash, familyId, expiresAt: session.expiresAt },
    });

    const nextToken = randomBytes(32).toString("base64url");
    const now = Date.now();
    const expiresAt = new Date(now + TOKEN_LIFETIME_MS);
    await prisma.session.create({
      data: {
        userId: session.userId,
        token: nextToken,
        familyId,
        expiresAt,
        // Item 7: the app session records an IP only from the configured
        // trusted header (`AUTH_TRUSTED_IP_HEADER`); otherwise null.
        ipAddress: resolveTrustedClientIp(request.headers),
        userAgent: request.headers.get("user-agent"),
      },
    });

    return Response.json({
      token: nextToken,
      expiresAt: expiresAt.toISOString(),
      rotateAt: new Date(
        now + TOKEN_LIFETIME_MS * ROTATE_AT_FRACTION,
      ).toISOString(),
    });
  } catch {
    // Item 1, fail closed: a store error spends nothing and mints nothing, and
    // the client's 401 path (sign out) beats a retry of a maybe-spent token.
    return unauthenticated();
  }
}
