import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildAccountAuditEvent,
  buildAuditEvent,
  sanitizeAuditMeta,
} from "../../lib/audit";
import {
  PasswordResetError,
  requestPasswordReset,
  resetPasswordWithToken,
  assertPasswordResetOrchestrationExternallyExposable,
} from "../../lib/auth/password-reset";

/**
 * S1-F2D unit tests — pure/structural surface. DB behavior lives in
 * tests/integration/s1-f2d-password-reset.test.ts (real PostgreSQL).
 */

const knReq = (
  code: string,
  meta?: { modelName?: string; target?: string[]; code?: string },
) =>
  new Prisma.PrismaClientKnownRequestError("x", {
    code,
    clientVersion: "test",
    meta,
  });

describe("S1-F2D password-reset — unit surface", () => {
  it("exposure assertion fails closed with a structural code", () => {
    expect(() => assertPasswordResetOrchestrationExternallyExposable()).toThrow(
      PasswordResetError,
    );
    try {
      assertPasswordResetOrchestrationExternallyExposable();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PasswordResetError);
      expect((e as PasswordResetError).code).toBe("resets_not_exposable");
      expect(String(e)).toContain("resets_not_exposable");
    }
  });

  it("invalid inputs fail structurally without touching a database", async () => {
    for (const email of [undefined, null, 42, "", "   ", {}, "@x", "a@"]) {
      await expect(
        requestPasswordReset({ email }, {}, {} as never),
      ).rejects.toMatchObject({
        name: "PasswordResetError",
        code: "invalid_input",
      });
    }
    for (const rawToken of [undefined, null, 42, "", "nope"]) {
      await expect(
        resetPasswordWithToken(
          { rawToken, password: "long enough passphrase" },
          {} as never,
        ),
      ).rejects.toMatchObject({
        name: "PasswordResetError",
        code: "invalid_token",
      });
    }
  });

  it("malformed token short-circuits before password-policy validation", async () => {
    // Both bad: token validation wins — invalid_token, not the policy code.
    for (const password of ["short", "x".repeat(500)]) {
      await expect(
        resetPasswordWithToken({ rawToken: "nope", password }, {} as never),
      ).rejects.toMatchObject({ code: "invalid_token" });
    }
    // A structurally VALID token + bad password still fails policy first
    // — without any database access.
    const { generateAccessToken } = await import("../../lib/tokens/crypto");
    const { rawToken } = generateAccessToken();
    await expect(
      resetPasswordWithToken({ rawToken, password: "short" }, {} as never),
    ).rejects.toMatchObject({
      name: "PasswordPolicyError",
      code: "password_too_short",
    });
  });

  it("non-serialization failures map to reset_failed / never retry", async () => {
    let attempts = 0;
    const client = {
      $transaction: async () => {
        attempts++;
        throw knReq("P2002", {
          modelName: "AccessToken",
          target: ["token_hash"],
        });
      },
    };
    await expect(
      requestPasswordReset({ email: "x@example.test" }, {}, {
        ...client,
        user: {
          findUnique: async () => ({ id: "u", status: "ACTIVE" }),
        },
      } as never),
    ).rejects.toMatchObject({ code: "reset_failed" });
    expect(attempts).toBe(1);
  });

  it("genuine serialization failures retry boundedly, then conflict", async () => {
    let attempts = 0;
    const p2034 = () => {
      attempts++;
      return Promise.reject(knReq("P2034"));
    };
    const client = {
      $transaction: p2034,
      user: {
        findUnique: async () => ({ id: "u", status: "ACTIVE" }),
      },
    };
    await expect(
      requestPasswordReset({ email: "x@example.test" }, {}, client as never),
    ).rejects.toMatchObject({ code: "serialization_conflict" });
    expect(attempts).toBe(8); // bounded MAX_ATTEMPTS
  });

  it("delivery sink runs post-commit, once, outside the retry loop", async () => {
    const { generateAccessToken } = await import("../../lib/tokens/crypto");
    let txCalls = 0;
    const delivered: unknown[] = [];
    const fake = {
      user: {
        findUnique: async () => ({ id: "u1", status: "ACTIVE" }),
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        txCalls++;
        // Minimal tx surface used by the request path.
        const tx = {
          $queryRawUnsafe: async (q: string) =>
            q.includes("FOR UPDATE") && q.includes('"users"')
              ? [{ id: "u1", status: "ACTIVE" }]
              : [],
          accessToken: {
            updateMany: async () => ({ count: 0 }),
            create: async () => ({
              id: "tok1",
              expiresAt: new Date(Date.now() + 12 * 3600_000),
            }),
          },
          auditEvent: { create: async () => ({}) },
        };
        return fn(tx);
      },
    };
    const { rawToken } = generateAccessToken();
    void rawToken;
    const r = await requestPasswordReset(
      { email: "u@example.test" },
      { deliver: async (p) => void delivered.push(p) },
      fake as never,
    );
    expect(r).toEqual({ outcome: "ACCOUNT_EXISTS" });
    expect(r).not.toHaveProperty("delivery");
    expect(delivered).toHaveLength(1);
    const payload = delivered[0] as {
      kind: string;
      to: string;
      rawToken: string;
      expiresAt: Date;
    };
    expect(payload.kind).toBe("password_reset");
    expect(payload.to).toBe("u@example.test");
    expect(typeof payload.rawToken).toBe("string");
    expect(txCalls).toBe(1);

    // Delivery failure → reset_failed, no replay of the mutation.
    txCalls = 0;
    await expect(
      requestPasswordReset(
        { email: "u@example.test" },
        {
          deliver: async () => {
            throw new Error("smtp offline");
          },
        },
        fake as never,
      ),
    ).rejects.toMatchObject({ code: "reset_failed" });
    expect(txCalls).toBe(1);
  });

  it("resetStage is scoped to account PASSWORD_RESET audit only", () => {
    // Workspace audit construction must reject it.
    expect(() =>
      sanitizeAuditMeta({ resetStage: "REQUESTED" } as never),
    ).toThrow("audit_metadata_forbidden");
    const ctx = {
      userId: "u",
      workspaceId: "w",
      workspaceMemberId: "m",
      workspaceRole: "WORKSPACE_OWNER" as const,
      platformRole: "USER" as const,
      grantedScope: "workspace" as const,
    };
    expect(() =>
      buildAuditEvent(ctx, {
        action: "INVITE",
        resourceType: "access_token",
        meta: { resetStage: "COMPLETED" } as never,
      }),
    ).toThrow("audit_metadata_forbidden");
    // Account password-reset audit accepts exactly the closed pair.
    const row = buildAccountAuditEvent(
      { subjectUserId: "u1", actorUserId: null },
      {
        action: "PASSWORD_RESET",
        resourceType: "access_token",
        resourceId: "t",
        meta: { resetStage: "REQUESTED" },
      },
    );
    expect(row.scope).toBe("ACCOUNT");
    expect(row.meta).toEqual({ resetStage: "REQUESTED" });
    expect(() =>
      buildAccountAuditEvent(
        { subjectUserId: "u1" },
        {
          action: "PASSWORD_RESET",
          resourceType: "access_token",
          meta: { resetStage: "BROKEN" } as never,
        },
      ),
    ).toThrow("audit_metadata_forbidden");
    expect(() =>
      buildAccountAuditEvent(
        { subjectUserId: "u1" },
        {
          action: "PASSWORD_RESET",
          resourceType: "access_token",
          meta: { rawToken: "x" } as never,
        },
      ),
    ).toThrow("audit_metadata_forbidden");
  });
});
