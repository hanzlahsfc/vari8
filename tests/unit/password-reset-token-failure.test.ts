import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";

import {
  completePasswordReset,
  getResetLinkState,
  passwordResetMessage,
} from "../../lib/auth/password-reset-boundary";

/**
 * PR-05 rewiring — block TB0.095 originally classified `safeTokenHash`
 * failures inside the deleted `lib/auth/password-reset.ts` service. The
 * surviving token-failure surface is the reset boundary in
 * `lib/auth/password-reset-boundary.ts`: every token failure — malformed
 * input, unknown token, storage error — must collapse to the same safe
 * "invalid" state or safe copy, and internals must never leak.
 *
 * Everything here is DB-free: `getResetLinkState` accepts an injected client,
 * and `completePasswordReset` exits through the delivery gate or the
 * password-policy check before it can reach `auth.api.*`.
 */
describe("reset token-failure classification (boundary)", () => {
  it("non-string and empty token inputs resolve invalid without a storage read", async () => {
    let reads = 0;
    const counting = {
      verification: {
        findFirst: async () => {
          reads += 1;
          return { id: "v1" };
        },
      },
    };
    for (const raw of [undefined, null, 42, "", {}, []]) {
      await expect(
        getResetLinkState(raw, counting, { deliveryAvailable: true }),
      ).resolves.toEqual({ state: "invalid" });
    }
    expect(reads).toBe(0);
  });

  it("unknown and well-formed-but-absent tokens resolve to the same invalid state", async () => {
    const missing = {
      verification: {
        findFirst: async () => null,
      },
    };
    for (const raw of ["nope", "z".repeat(43), "tok_xyz"]) {
      await expect(
        getResetLinkState(raw, missing, { deliveryAvailable: true }),
      ).resolves.toEqual({ state: "invalid" });
    }
    const live = {
      verification: {
        findFirst: async () => ({ id: "v1" }),
      },
    };
    await expect(
      getResetLinkState("live-token", live, { deliveryAvailable: true }),
    ).resolves.toEqual({ state: "ready" });
  });

  it("a storage/lookup failure fails closed to invalid — never a thrown error", async () => {
    const failing = {
      verification: {
        findFirst: async () => {
          throw new Error("verifications table gone — secret-path-xyz");
        },
      },
    };
    await expect(
      getResetLinkState("z".repeat(43), failing, { deliveryAvailable: true }),
    ).resolves.toEqual({ state: "invalid" });
  });

  it("passwordResetMessage collapses token errors to one invalid-link message and never leaks internals", () => {
    const INVALID_LINK =
      "This password reset link is invalid or has expired. Request a new link.";
    expect(
      passwordResetMessage(
        new APIError("BAD_REQUEST", { code: "INVALID_TOKEN" }),
      ),
    ).toBe(INVALID_LINK);
    expect(
      passwordResetMessage(
        new APIError("BAD_REQUEST", {
          code: "INVALID_TOKEN",
          message: "consumed row id 8wBQevxQDHRpyZ78kgo6OyNB5f922si6",
        }),
      ),
    ).toBe(INVALID_LINK);
    // Anything else is the generic copy — never an echo of internals.
    const GENERIC = "Something went wrong. Please try again in a moment.";
    for (const error of [
      new Error("token store exploded with dDYSnjuHpMXe3fRp1KDR4IQx"),
      new APIError("INTERNAL_SERVER_ERROR", {
        message: "verifications table missing",
      }),
      "nope",
      42,
      undefined,
    ]) {
      const message = passwordResetMessage(error);
      expect(message).toBe(GENERIC);
      expect(message).not.toContain("dDYSnjuHpMXe3fRp1KDR4IQx");
      expect(message).not.toContain("verifications");
    }
  });

  it("completePasswordReset keeps failure surfaces safe without reaching the auth pipeline", async () => {
    // Delivery unavailable → the unavailable message, no auth work at all.
    await expect(
      completePasswordReset(
        { rawToken: "nope", password: "whatever-1" },
        { deliveryAvailable: false },
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Password reset is not currently available.",
    });
    // A policy violation reports the fixable problem first — before the token
    // is ever claimed (deliberate ordering in the boundary).
    await expect(
      completePasswordReset(
        { rawToken: "nope", password: "short" },
        { deliveryAvailable: true },
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Password must be at least 10 characters.",
    });
    await expect(
      completePasswordReset(
        { rawToken: "nope", password: "abcdefghij" },
        { deliveryAvailable: true },
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Password must contain at least one digit.",
    });
  });
});
