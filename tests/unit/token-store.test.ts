import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { assertTokenPrimitivesExternallyExposable } from "../../lib/tokens";
import { generateAccessToken } from "../../lib/tokens/crypto";
import {
  ACCESS_TOKEN_TTL_MS,
  TokenStoreError,
  claimAccessToken,
  inspectAccessToken,
  issueWorkspaceInviteToken,
} from "../../lib/tokens/store";

/** A transaction-client stand-in with only the store's delegates mocked. */
function fakeTx(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      ...overrides,
    },
  } as unknown as Prisma.TransactionClient;
}

const RAW_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const HEX64 = /^[a-f0-9]{64}$/;

describe("S1-F2A token store (unit)", () => {
  it("exposes the founder-decided 12-hour lifetime as one constant", () => {
    expect(ACCESS_TOKEN_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });

  it("issues invites with normalized email and hash-only storage", async () => {
    const tx = fakeTx({
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "tok-1",
        expiresAt: data.expiresAt,
      })),
    });
    const issued = await issueWorkspaceInviteToken(tx, {
      workspaceId: "ws-1",
      targetEmail: "  Invitee@Example.COM ",
      intendedRole: "CLIENT",
      createdByUserId: "issuer-1",
    });
    const create = tx.accessToken.create as ReturnType<typeof vi.fn>;
    const data = create.mock.calls[0][0].data;
    expect(data.targetEmail).toBe("invitee@example.com");
    expect(data.tokenHash).toMatch(HEX64);
    expect(data.purpose).toBe("WORKSPACE_INVITE");
    expect(data.userId ?? null).toBeNull();
    expect("rawToken" in data).toBe(false);
    expect(issued.rawToken).toMatch(RAW_PATTERN);
    expect(createHash("sha256").update(issued.rawToken).digest("hex")).toBe(
      data.tokenHash,
    );
    expect(issued.tokenId).toBe("tok-1");
  });

  it("rejects empty, non-string, and oversized invite emails structurally", async () => {
    const tx = fakeTx();
    for (const targetEmail of ["", "   ", null, 42, "a".repeat(300)]) {
      const error = await issueWorkspaceInviteToken(tx, {
        workspaceId: "ws-1",
        targetEmail: targetEmail as string,
        intendedRole: "CLIENT",
        createdByUserId: "issuer-1",
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TokenStoreError);
      // The message is the structural code only — never the submitted value.
      expect((error as Error).message).toBe("invalid_input");
    }
    expect(tx.accessToken.create).not.toHaveBeenCalled();
  });

  it("rejects non-invocable roles before any database work", async () => {
    const tx = fakeTx();
    for (const intendedRole of ["WORKSPACE_OWNER", "SUPPORT", "BOGUS"]) {
      await expect(
        issueWorkspaceInviteToken(tx, {
          workspaceId: "ws-1",
          targetEmail: "a@b.test",
          intendedRole: intendedRole as never,
          createdByUserId: "issuer-1",
        }),
      ).rejects.toThrow("invalid_input");
    }
    expect(tx.accessToken.create).not.toHaveBeenCalled();
  });

  it("claim returns the indistinguishable invalid result for malformed input without database work", async () => {
    const tx = fakeTx();
    for (const rawToken of ["", "!!!", "A".repeat(44), null, 123, {}]) {
      const result = await claimAccessToken(tx, {
        rawToken,
        purpose: "WORKSPACE_INVITE",
        workspaceId: "ws-1",
      });
      expect(result).toEqual({ ok: false });
    }
    expect(tx.accessToken.updateMany).not.toHaveBeenCalled();
    expect(tx.accessToken.findUnique).not.toHaveBeenCalled();
  });

  it("propagates unexpected database errors instead of misclassifying them", async () => {
    const tx = fakeTx({
      updateMany: vi.fn(async () => {
        throw new Error("db exploded");
      }),
    });
    const rawToken = generateAccessToken().rawToken;
    await expect(
      claimAccessToken(tx, {
        rawToken,
        purpose: "PASSWORD_RESET",
        userId: "u-1",
      }),
    ).rejects.toThrow("db exploded");
  });

  it("inspection returns only {valid,purpose,expiresAt} — never identity fields", async () => {
    const rawToken = generateAccessToken().rawToken;
    const tx = fakeTx({
      findUnique: vi.fn(async () => ({
        id: "tok-secret-id",
        tokenHash: "deadbeef",
        workspaceId: "ws-secret",
        userId: "u-secret",
        targetEmail: "victim@example.test",
        intendedRole: "CLIENT",
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + 3600_000),
        consumedAt: null,
        revokedAt: null,
      })),
    });
    const result = await inspectAccessToken(tx, rawToken);
    expect(result).toEqual({
      valid: true,
      purpose: "PASSWORD_RESET",
      expiresAt: expect.any(Date),
    });
    const serialized = JSON.stringify(result);
    for (const leaked of [
      "tok-secret-id",
      "deadbeef",
      "ws-secret",
      "u-secret",
      "victim@example.test",
      "CLIENT",
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("inspection is indistinguishable for invalid, consumed, revoked, expired, and malformed", async () => {
    const base = {
      purpose: "WORKSPACE_INVITE",
      expiresAt: new Date(Date.now() + 3600_000),
      consumedAt: null,
      revokedAt: null,
    };
    const variants = [
      { findUnique: vi.fn(async () => null) },
      { findUnique: vi.fn(async () => ({ ...base, consumedAt: new Date() })) },
      { findUnique: vi.fn(async () => ({ ...base, revokedAt: new Date() })) },
      {
        findUnique: vi.fn(async () => ({
          ...base,
          expiresAt: new Date(Date.now() - 1000),
        })),
      },
    ];
    for (const overrides of variants) {
      const result = await inspectAccessToken(
        fakeTx(overrides),
        generateAccessToken().rawToken,
      );
      expect(result).toEqual({ valid: false });
    }
    expect(await inspectAccessToken(fakeTx(), "malformed")).toEqual({
      valid: false,
    });
  });

  it("the primitives exposure assertion fails closed", () => {
    expect(() => assertTokenPrimitivesExternallyExposable()).toThrow(
      "token_primitives_not_exposable",
    );
  });
});
