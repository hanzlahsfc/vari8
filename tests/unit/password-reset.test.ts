import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { sanitizeAuditMeta } from "../../lib/audit";
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
      // Message is the code only — no detail, no input echo.
      expect(String(e)).toContain("resets_not_exposable");
    }
  });

  it("invalid inputs fail structurally without touching a database", async () => {
    for (const email of [undefined, null, 42, "", "   ", {}, "@x", "a@"]) {
      await expect(
        requestPasswordReset({ email }, {} as never),
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
    await expect(
      resetPasswordWithToken(
        { rawToken: undefined, password: "long enough passphrase" },
        {} as never,
      ),
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("non-serialization failures map to reset_failed / never retry", async () => {
    // A client whose transaction throws an unrelated P2002 must surface
    // reset_failed — never serialization_conflict, and never retried.
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
      requestPasswordReset({ email: "x@example.test" }, {
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
      requestPasswordReset({ email: "x@example.test" }, client as never),
    ).rejects.toMatchObject({ code: "serialization_conflict" });
    expect(attempts).toBe(3); // bounded MAX_ATTEMPTS
  });

  it("audit meta allowlist accepts resetStage and rejects leaks", () => {
    expect(sanitizeAuditMeta({ resetStage: "REQUESTED" })).toEqual({
      resetStage: "REQUESTED",
    });
    expect(sanitizeAuditMeta({ resetStage: "COMPLETED" })).toEqual({
      resetStage: "COMPLETED",
    });
    for (const v of ["x", "COMPLETED2", 1, true, null, "email@e.test"]) {
      expect(() => sanitizeAuditMeta({ resetStage: v as never })).toThrow(
        "audit_metadata_forbidden",
      );
    }
    expect(() => sanitizeAuditMeta({ rawToken: "abc" } as never)).toThrow(
      "audit_metadata_forbidden",
    );
  });
});
