import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { assertTokenFlowsExternallyExposable } from "../../lib/tokens";
import { generateAccessToken, hashAccessToken } from "../../lib/tokens/crypto";
import {
  claimAccessToken,
  inspectAccessToken,
  issueWorkspaceInviteToken,
  revokeMatchingInviteTokens,
} from "../../lib/tokens/store";

/**
 * S1-F2A token-store tests — internal transaction-bound primitives over the
 * real migrated PostgreSQL schema in a dedicated disposable database
 * (`INTEGRATION_DATABASE_URL`, never the app/E2E database). Synthetic fixtures
 * only; raw tokens are never printed or asserted by value.
 */
const baseUrl = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof baseUrl === "string" && baseUrl.length > 0;

function runPrisma(args: string[], env: Record<string, string> = {}): void {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
}

function unique(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

const HEX64 = /^[a-f0-9]{64}$/;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe.skipIf(!enabled)("S1-F2A token store (real PostgreSQL)", () => {
  const url = baseUrl as string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    runPrisma(["migrate", "deploy"], { DATABASE_URL: url });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "access_token","audit_event","consent_record","client_assignment","coach_profile","client_profile","workspace_member","workspace","users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function makeUser(tag: string) {
    return prisma.user.create({
      data: {
        email: `${tag}.${unique("u")}@example.test`,
        passwordHash: "scrypt$synthetic$hash",
      },
    });
  }
  async function makeWorkspace(tag: string) {
    return prisma.workspace.create({ data: { name: tag, slug: unique(tag) } });
  }

  type RowShape = {
    id: string;
    purpose: string;
    token_hash: string;
    workspace_id: string | null;
    user_id: string | null;
    target_email: string | null;
    intended_role: string | null;
    created_by_user_id: string | null;
    expires_at: Date;
    consumed_at: Date | null;
    revoked_at: Date | null;
  };
  async function allTokens(): Promise<RowShape[]> {
    return prisma.$queryRawUnsafe<RowShape[]>(
      'SELECT * FROM "access_token" ORDER BY created_at, id',
    );
  }
  async function tokenById(id: string) {
    const rows = await prisma.$queryRawUnsafe<RowShape[]>(
      'SELECT * FROM "access_token" WHERE id = $1',
      id,
    );
    return rows[0] ?? null;
  }
  async function auditCount() {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      'SELECT COUNT(*)::int AS n FROM "audit_event"',
    );
    return rows[0].n;
  }

  async function issueInvite(opts: {
    workspaceId: string;
    targetEmail: string;
    intendedRole?: "COACH" | "ASSISTANT_COACH" | "CLIENT";
    createdByUserId: string;
  }) {
    return prisma.$transaction((tx) =>
      issueWorkspaceInviteToken(tx, {
        intendedRole: "CLIENT",
        ...opts,
      }),
    );
  }

  // PR-05: password-reset issuance moved to Better Auth (verification rows).
  // Tests that only need a PASSWORD_RESET row to exercise the generic
  // token-claim surface write it directly.
  async function issueReset(userId: string) {
    const generated = generateAccessToken();
    const row = await prisma.accessToken.create({
      data: {
        userId,
        purpose: "PASSWORD_RESET",
        tokenHash: hashAccessToken(generated.rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return { tokenId: row.id, rawToken: generated.rawToken };
  }

  it("invite issue stores only the 64-hex digest, never the raw token", async () => {
    const ws = await makeWorkspace("w1");
    const issuer = await makeUser("issuer");
    const issued = await issueInvite({
      workspaceId: ws.id,
      targetEmail: " MixedCase@Example.TEST ",
      createdByUserId: issuer.id,
    });
    const row = (await tokenById(issued.tokenId))!;
    expect(row.purpose).toBe("WORKSPACE_INVITE");
    expect(row.token_hash).toMatch(HEX64);
    expect(row.token_hash).toBe(sha256(issued.rawToken));
    expect(row.target_email).toBe("mixedcase@example.test");
    expect(row.intended_role).toBe("CLIENT");
    expect(row.created_by_user_id).toBe(issuer.id);
    expect(row.user_id).toBeNull();
    // Raw token material appears in no stored column.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(issued.rawToken);
    const leaked = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      'SELECT COUNT(*)::int AS n FROM "access_token" WHERE id = $1 AND CAST("access_token".* AS text) LIKE $2',
      issued.tokenId,
      `%${issued.rawToken}%`,
    );
    expect(leaked[0].n).toBe(0);
  });

  it("sets expiry to exactly 12 hours from issuance", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const frozen = new Date();
    vi.setSystemTime(frozen);
    try {
      const ws = await makeWorkspace("wttl");
      const issuer = await makeUser("issuer");
      const issued = await issueInvite({
        workspaceId: ws.id,
        targetEmail: `${unique("t")}@example.test`,
        createdByUserId: issuer.id,
      });
      expect(issued.expiresAt.getTime() - frozen.getTime()).toBe(
        12 * 60 * 60 * 1000,
      );
      const row = (await tokenById(issued.tokenId))!;
      expect(row.expires_at.getTime()).toBe(issued.expiresAt.getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  it("replacement revocation revokes only active matching invites", async () => {
    const ws = await makeWorkspace("wrep");
    const otherWs = await makeWorkspace("wother");
    const issuer = await makeUser("issuer");
    const email = `${unique("match")}@example.test`;

    const matching = await issueInvite({
      workspaceId: ws.id,
      targetEmail: email,
      createdByUserId: issuer.id,
    });
    const differentEmail = await issueInvite({
      workspaceId: ws.id,
      targetEmail: `${unique("other")}@example.test`,
      createdByUserId: issuer.id,
    });
    const differentRole = await issueInvite({
      workspaceId: ws.id,
      targetEmail: email,
      intendedRole: "COACH",
      createdByUserId: issuer.id,
    });
    const differentWorkspace = await issueInvite({
      workspaceId: otherWs.id,
      targetEmail: email,
      createdByUserId: issuer.id,
    });
    const resetForUser = await issueReset(issuer.id);

    // Historical matching rows must be left alone.
    const consumedMatch = await issueInvite({
      workspaceId: ws.id,
      targetEmail: email,
      createdByUserId: issuer.id,
    });
    await prisma.$transaction((tx) =>
      claimAccessToken(tx, {
        rawToken: consumedMatch.rawToken,
        purpose: "WORKSPACE_INVITE",
        workspaceId: ws.id,
      }),
    );
    const alreadyRevoked = await issueInvite({
      workspaceId: ws.id,
      targetEmail: email,
      createdByUserId: issuer.id,
    });
    await prisma.$transaction((tx) =>
      tx.accessToken.update({
        where: { id: alreadyRevoked.tokenId },
        data: { revokedAt: new Date() },
      }),
    );
    const revokedStamp = (await tokenById(alreadyRevoked.tokenId))!.revoked_at;
    // Expired matching row (inserted with a past created_at so the shape CHECK
    // is satisfied).
    await prisma.$executeRawUnsafe(
      `INSERT INTO "access_token"
        ("id","purpose","token_hash","workspace_id","target_email","intended_role","created_by_user_id","expires_at","created_at")
       VALUES ($1,'WORKSPACE_INVITE'::"AccessTokenPurpose",$2,$3,$4,'CLIENT'::"MemberRole",$5,$6,$7)`,
      unique("expired"),
      sha256(unique("exp")),
      ws.id,
      email,
      issuer.id,
      new Date(Date.now() - 2 * 60 * 60 * 1000),
      new Date(Date.now() - 14 * 60 * 60 * 1000),
    );

    const before = await allTokens();
    const result = await prisma.$transaction((tx) =>
      revokeMatchingInviteTokens(tx, {
        workspaceId: ws.id,
        targetEmail: email,
        intendedRole: "CLIENT",
      }),
    );
    expect(result.revokedCount).toBe(1);

    const after = await allTokens();
    const byId = new Map(after.map((r) => [r.id, r]));
    // Matching active row: revoked.
    expect(byId.get(matching.tokenId)!.revoked_at).not.toBeNull();
    // Every other row is byte-identical to before.
    for (const row of before) {
      if (row.id === matching.tokenId) continue;
      expect(byId.get(row.id)).toEqual(row);
    }
    // Sanity: the untouched rows include the cross-tenant one.
    expect(byId.get(differentWorkspace.tokenId)!.revoked_at).toBeNull();
    expect(byId.get(differentEmail.tokenId)!.revoked_at).toBeNull();
    expect(byId.get(differentRole.tokenId)!.revoked_at).toBeNull();
    expect(byId.get(resetForUser.tokenId)!.revoked_at).toBeNull();
    expect(byId.get(consumedMatch.tokenId)!.consumed_at).not.toBeNull();
    expect(byId.get(alreadyRevoked.tokenId)!.revoked_at).toEqual(revokedStamp);
  });

  it("claims an active token exactly once; second claim fails structurally", async () => {
    const ws = await makeWorkspace("wclaim");
    const issuer = await makeUser("issuer");
    const issued = await issueInvite({
      workspaceId: ws.id,
      targetEmail: `${unique("c")}@example.test`,
      createdByUserId: issuer.id,
    });
    const first = await prisma.$transaction((tx) =>
      claimAccessToken(tx, {
        rawToken: issued.rawToken,
        purpose: "WORKSPACE_INVITE",
        workspaceId: ws.id,
      }),
    );
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.token.id).toBe(issued.tokenId);
      expect(first.token.purpose).toBe("WORKSPACE_INVITE");
      expect(first.token.workspaceId).toBe(ws.id);
    }
    const second = await prisma.$transaction((tx) =>
      claimAccessToken(tx, {
        rawToken: issued.rawToken,
        purpose: "WORKSPACE_INVITE",
        workspaceId: ws.id,
      }),
    );
    expect(second).toEqual({ ok: false });
  });

  it("fails indistinguishably for expired, revoked, wrong-purpose, and missing tokens", async () => {
    const ws = await makeWorkspace("wbad");
    const issuer = await makeUser("issuer");
    const issued = await issueInvite({
      workspaceId: ws.id,
      targetEmail: `${unique("b")}@example.test`,
      createdByUserId: issuer.id,
    });
    // Wrong purpose with no owner scope — an invite token claimed as a reset
    // token. This must fail on the purpose predicate, not incidentally on owner
    // scope.
    expect(
      await prisma.$transaction((tx) =>
        claimAccessToken(tx, {
          rawToken: issued.rawToken,
          purpose: "PASSWORD_RESET",
        }),
      ),
    ).toEqual({ ok: false });
    expect((await tokenById(issued.tokenId))!.consumed_at).toBeNull();
    // Revoked.
    await prisma.$transaction((tx) =>
      tx.accessToken.update({
        where: { id: issued.tokenId },
        data: { revokedAt: new Date() },
      }),
    );
    expect(
      await prisma.$transaction((tx) =>
        claimAccessToken(tx, {
          rawToken: issued.rawToken,
          purpose: "WORKSPACE_INVITE",
          workspaceId: ws.id,
        }),
      ),
    ).toEqual({ ok: false });
    // Expired fixture: store the digest of a canonical-format synthetic token
    // with expires_at in the past (created_at further back so the shape CHECK
    // holds), then claim its raw form.
    const expiredRaw = `A${"E".repeat(42)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "access_token"
        ("id","purpose","token_hash","workspace_id","target_email","intended_role","created_by_user_id","expires_at","created_at")
       VALUES ($1,'WORKSPACE_INVITE'::"AccessTokenPurpose",$2,$3,$4,'CLIENT'::"MemberRole",$5,$6,$7)`,
      unique("exp"),
      sha256(expiredRaw),
      ws.id,
      `${unique("e")}@example.test`,
      issuer.id,
      new Date(Date.now() - 2 * 60 * 60 * 1000),
      new Date(Date.now() - 14 * 60 * 60 * 1000),
    );
    expect(
      await prisma.$transaction((tx) =>
        claimAccessToken(tx, {
          rawToken: expiredRaw,
          purpose: "WORKSPACE_INVITE",
          workspaceId: ws.id,
        }),
      ),
    ).toEqual({ ok: false });
    // Missing digest.
    expect(
      await prisma.$transaction((tx) =>
        claimAccessToken(tx, {
          rawToken: `A${"B".repeat(42)}`,
          purpose: "WORKSPACE_INVITE",
          workspaceId: ws.id,
        }),
      ),
    ).toEqual({ ok: false });
  });

  it("two concurrent claims yield exactly one success", async () => {
    const ws = await makeWorkspace("wrace");
    const issuer = await makeUser("issuer");
    const issued = await issueInvite({
      workspaceId: ws.id,
      targetEmail: `${unique("r")}@example.test`,
      createdByUserId: issuer.id,
    });
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        prisma
          .$transaction((tx) =>
            claimAccessToken(tx, {
              rawToken: issued.rawToken,
              purpose: "WORKSPACE_INVITE",
              workspaceId: ws.id,
            }),
          )
          .catch(() => ({ ok: false as const })),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await tokenById(issued.tokenId))!.consumed_at).not.toBeNull();
  });

  it("rolls a consumed claim back when the surrounding transaction fails", async () => {
    const ws = await makeWorkspace("wrb");
    const issuer = await makeUser("issuer");
    const issued = await issueInvite({
      workspaceId: ws.id,
      targetEmail: `${unique("rb")}@example.test`,
      createdByUserId: issuer.id,
    });
    await expect(
      prisma.$transaction(async (tx) => {
        const claimed = await claimAccessToken(tx, {
          rawToken: issued.rawToken,
          purpose: "WORKSPACE_INVITE",
          workspaceId: ws.id,
        });
        expect(claimed.ok).toBe(true);
        throw new Error("synthetic rollback");
      }),
    ).rejects.toThrow("synthetic rollback");
    // The row is consumable again — the claim never committed.
    expect((await tokenById(issued.tokenId))!.consumed_at).toBeNull();
  });

  it("rolls a failed-after-issue transaction back entirely", async () => {
    const ws = await makeWorkspace("wfail");
    const issuer = await makeUser("issuer");
    let tokenId = "";
    await expect(
      prisma.$transaction(async (tx) => {
        const issued = await issueWorkspaceInviteToken(tx, {
          workspaceId: ws.id,
          targetEmail: `${unique("f")}@example.test`,
          intendedRole: "CLIENT",
          createdByUserId: issuer.id,
        });
        tokenId = issued.tokenId;
        throw new Error("synthetic rollback");
      }),
    ).rejects.toThrow("synthetic rollback");
    expect(await tokenById(tokenId)).toBeNull();
  });

  it("claim scoped to the wrong workspace fails without touching the row", async () => {
    const wsA = await makeWorkspace("wsA");
    const wsB = await makeWorkspace("wsB");
    const issuer = await makeUser("issuer");
    const issued = await issueInvite({
      workspaceId: wsA.id,
      targetEmail: `${unique("xw")}@example.test`,
      createdByUserId: issuer.id,
    });
    const cross = await prisma.$transaction((tx) =>
      claimAccessToken(tx, {
        rawToken: issued.rawToken,
        purpose: "WORKSPACE_INVITE",
        workspaceId: wsB.id,
      }),
    );
    expect(cross).toEqual({ ok: false });
    expect((await tokenById(issued.tokenId))!.consumed_at).toBeNull();
    // Cross-workspace revoke attempts likewise cannot touch the row.
    const res = await prisma.$transaction((tx) =>
      revokeMatchingInviteTokens(tx, {
        workspaceId: wsB.id,
        targetEmail: "x",
        intendedRole: "CLIENT",
      }),
    );
    expect(res.revokedCount).toBe(0);
  });

  it("writes no audit events for any primitive", async () => {
    const before = await auditCount();
    const ws = await makeWorkspace("wnoaudit");
    const issuer = await makeUser("issuer");
    const issued = await issueInvite({
      workspaceId: ws.id,
      targetEmail: `${unique("na")}@example.test`,
      createdByUserId: issuer.id,
    });
    const reset = await issueReset(issuer.id);
    await prisma.$transaction((tx) =>
      revokeMatchingInviteTokens(tx, {
        workspaceId: ws.id,
        targetEmail: "x@x.test",
        intendedRole: "CLIENT",
      }),
    );
    await prisma.$transaction((tx) =>
      claimAccessToken(tx, {
        rawToken: issued.rawToken,
        purpose: "WORKSPACE_INVITE",
        workspaceId: ws.id,
      }),
    );
    await inspectAccessToken(prisma, reset.rawToken);
    expect(await auditCount()).toBe(before);
  });

  it("keeps every prior raw constraint and index live", async () => {
    const checks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid = '"access_token"'::regclass`,
    );
    const names = checks.map((r) => r.conname);
    expect(names).toEqual(
      expect.arrayContaining([
        "access_token_invite_shape",
        "access_token_reset_shape",
        "access_token_expiry_after_creation",
        "access_token_token_hash_sha256_hex",
      ]),
    );
    const fks = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
      "SELECT conname FROM pg_constraint WHERE contype = 'f' AND conname IN ('client_assignment_client_workspace_fkey','client_assignment_member_workspace_fkey')",
    );
    expect(fks).toHaveLength(2);
  });

  it("external exposure assertions remain closed", () => {
    expect(() => assertTokenFlowsExternallyExposable()).toThrow(
      "token_flows_not_exposable",
    );
  });
});
