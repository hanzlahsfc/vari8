import { describe, expect, it, vi } from "vitest";

import { generateAccessToken } from "../../lib/tokens/crypto";

/**
 * T3 invite lookup - the public route's service seam. The fake client
 * mirrors the Prisma delegates the seam touches (accessToken.findUnique,
 * rateLimit findUnique/create/updateMany) with the same conditional-update
 * semantics the real rolling-window limiter relies on.
 */

const rateRows = new Map<
  string,
  { key: string; count: number; lastRequest: bigint }
>();
const tokenRows = new Map<string, Record<string, unknown>>();

vi.mock("../../lib/db", () => ({
  prisma: {
    accessToken: {
      findUnique: async (args: { where: { tokenHash: string } }) =>
        tokenRows.get(args.where.tokenHash) ?? null,
    },
    rateLimit: {
      findUnique: async (args: { where: { key: string } }) =>
        rateRows.get(args.where.key) ?? null,
      create: async (args: {
        data: { key: string; count: number; lastRequest: bigint };
      }) => {
        rateRows.set(args.data.key, { ...args.data });
        return args.data;
      },
      updateMany: async (args: {
        where: {
          key: string;
          lastRequest?: { lte?: bigint; gt?: bigint };
          count?: { lt?: number };
        };
        data: { count?: number | { increment: number }; lastRequest: bigint };
      }) => {
        const row = rateRows.get(args.where.key);
        if (!row) return { count: 0 };
        if (args.where.lastRequest?.lte !== undefined) {
          if (row.lastRequest > args.where.lastRequest.lte) {
            return { count: 0 };
          }
          row.count = args.data.count as number;
          row.lastRequest = args.data.lastRequest;
          return { count: 1 };
        }
        if (
          args.where.lastRequest?.gt !== undefined &&
          row.lastRequest <= args.where.lastRequest.gt
        ) {
          return { count: 0 };
        }
        if (
          args.where.count?.lt !== undefined &&
          row.count >= args.where.count.lt
        ) {
          return { count: 0 };
        }
        row.count += (args.data.count as { increment: number }).increment;
        row.lastRequest = args.data.lastRequest;
        return { count: 1 };
      },
    },
  },
}));

import {
  INVITE_LOOKUP_RULE,
  lookupInviteDisplayName,
  lookupInviteForRoute,
} from "../../lib/workspace/invite-links";
import { POST } from "../../app/api/v1/invite/lookup/route";

const headers = new Headers();

function seedToken(over: Record<string, unknown> = {}) {
  const { rawToken, tokenHash } = generateAccessToken();
  tokenRows.set(tokenHash, {
    purpose: "WORKSPACE_INVITE",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    revokedAt: null,
    workspace: { name: "Alpha Coaching" },
    ...over,
  });
  return rawToken;
}

function reset() {
  rateRows.clear();
  tokenRows.clear();
}

describe("lookupInviteDisplayName", () => {
  it("returns only the workspace display name for a valid invite", async () => {
    reset();
    const raw = seedToken();
    expect(await lookupInviteDisplayName(raw)).toEqual({
      name: "Alpha Coaching",
    });
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["number", 42],
    ["malformed", "not-a-token"],
  ])("fails closed for %s input", async (_label, input) => {
    reset();
    expect(await lookupInviteDisplayName(input)).toBeNull();
  });

  it.each([
    ["unknown", () => generateAccessToken().rawToken],
    ["expired", () => seedToken({ expiresAt: new Date(Date.now() - 60_000) })],
    ["consumed", () => seedToken({ consumedAt: new Date() })],
    ["revoked", () => seedToken({ revokedAt: new Date() })],
    ["wrong purpose", () => seedToken({ purpose: "PASSWORD_RESET" })],
  ])("fails closed for a %s token", async (_label, make) => {
    reset();
    expect(await lookupInviteDisplayName(make())).toBeNull();
  });
});

describe("lookupInviteForRoute", () => {
  it("returns 200 with only `name` on a valid token", async () => {
    reset();
    const raw = seedToken();
    const outcome = await lookupInviteForRoute({ rawToken: raw, headers });
    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({ name: "Alpha Coaching" });
    expect(Object.keys(outcome.body)).toEqual(["name"]);
  });

  it("returns the identical fail-closed shape for unknown and expired", async () => {
    reset();
    const unknown = await lookupInviteForRoute({
      rawToken: generateAccessToken().rawToken,
      headers,
    });
    const expired = await lookupInviteForRoute({
      rawToken: seedToken({ expiresAt: new Date(Date.now() - 60_000) }),
      headers,
    });
    expect(unknown).toEqual(expired);
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ name: null });
  });

  it(`rejects the ${INVITE_LOOKUP_RULE.max + 1}th request over budget`, async () => {
    reset();
    const raw = seedToken();
    for (let i = 0; i < INVITE_LOOKUP_RULE.max; i++) {
      const ok = await lookupInviteForRoute({ rawToken: raw, headers });
      expect(ok.status).toBe(200);
    }
    const over = await lookupInviteForRoute({ rawToken: raw, headers });
    expect(over).toEqual({ status: 404, body: { name: null } });
  });
});

describe("POST /api/v1/invite/lookup", () => {
  const post = (body: unknown) =>
    POST(
      new Request("https://app.test/api/v1/invite/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it("returns 200 {name} for a valid token", async () => {
    reset();
    const raw = seedToken();
    const res = await post({ token: raw });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Alpha Coaching" });
  });

  it("returns 404 {name:null} for bad JSON, unknown and expired alike", async () => {
    reset();
    const badJson = await POST(
      new Request("https://app.test/api/v1/invite/lookup", {
        method: "POST",
        body: "{nope",
      }),
    );
    const unknown = await post({ token: generateAccessToken().rawToken });
    const expired = await post({
      token: seedToken({ expiresAt: new Date(Date.now() - 60_000) }),
    });
    for (const res of [badJson, unknown, expired]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ name: null });
    }
  });
});
