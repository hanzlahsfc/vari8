import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";

import {
  completePasswordReset,
  getResetLinkState,
  passwordResetDeliveryConfigured,
  passwordResetMessage,
  requestPasswordResetFromForm,
} from "../../lib/auth/password-reset-boundary";
import { PasswordPolicyError } from "../../lib/password-policy";

/**
 * PR-05 boundary tests: the route-facing contract survives the Better Auth
 * swap — generic non-enumerating responses, a non-consuming peek for the
 * page, fail-closed delivery gate, and safe structural error mapping.
 * Anything that would call `auth.api.*` (DB-backed) is exercised for the
 * gated path only; the live flow is covered by the integration suite.
 */
describe("getResetLinkState (non-consuming peek)", () => {
  const client = (row: { id: string } | null) => ({
    verification: {
      findFirst: async () => row,
    },
  });

  it("returns ready for an unexpired reset verification row", async () => {
    expect(
      await getResetLinkState("tok_123", client(null), {
        deliveryAvailable: true,
      }).then(() =>
        getResetLinkState("tok_123", client({ id: "v1" }), {
          deliveryAvailable: true,
        }),
      ),
    ).toEqual({ state: "ready" });
  });

  it("returns invalid when no live verification row matches", async () => {
    expect(
      await getResetLinkState("tok_123", client(null), {
        deliveryAvailable: true,
      }),
    ).toEqual({ state: "invalid" });
  });

  it("returns invalid for malformed or missing inputs without a DB read", async () => {
    let calls = 0;
    const counting = {
      verification: {
        findFirst: async () => {
          calls += 1;
          return { id: "v1" };
        },
      },
    };
    for (const raw of [undefined, null, "", 42, ["a", "b"]]) {
      expect(
        await getResetLinkState(raw, counting, { deliveryAvailable: true }),
      ).toEqual({ state: "invalid" });
    }
    expect(calls).toBe(0);
  });

  it("fails closed on storage errors", async () => {
    const failing = {
      verification: {
        findFirst: async () => {
          throw new Error("boom");
        },
      },
    };
    expect(
      await getResetLinkState("tok_123", failing, { deliveryAvailable: true }),
    ).toEqual({ state: "invalid" });
  });
});

describe("passwordResetMessage (safe error mapping)", () => {
  it("maps an invalid/expired/consumed token to one generic invalid-link message", () => {
    const apiError = new APIError("BAD_REQUEST", {
      code: "INVALID_TOKEN",
      message: "x",
    });
    expect(passwordResetMessage(apiError)).toBe(
      "This password reset link is invalid or has expired. Request a new link.",
    );
  });

  it("explains password-policy failures accessibly", () => {
    expect(
      passwordResetMessage(new PasswordPolicyError("password_too_short")),
    ).toBe("Password must be at least 10 characters.");
    expect(
      passwordResetMessage(new PasswordPolicyError("password_needs_digit")),
    ).toBe("Password must contain at least one digit.");
  });

  it("maps Better Auth policy codes thrown at the endpoint", () => {
    expect(
      passwordResetMessage(
        new APIError("BAD_REQUEST", { message: "password_needs_digit" }),
      ),
    ).toBe("Password must contain at least one digit.");
    expect(
      passwordResetMessage(
        new APIError("BAD_REQUEST", { code: "PASSWORD_TOO_SHORT" }),
      ),
    ).toBe("Password must be at least 10 characters.");
  });

  it("never echoes input or internals for anything else", () => {
    for (const error of [
      new Error("secret detail"),
      new APIError("INTERNAL_SERVER_ERROR", { message: "db exploded" }),
      "string-error",
      undefined,
    ]) {
      const message = passwordResetMessage(error);
      expect(message).toBe("Something went wrong. Please try again in a moment.");
      expect(message).not.toContain("secret");
      expect(message).not.toContain("db");
    }
  });
});

describe("delivery gate (fail closed until a real adapter)", () => {
  const gate = { deliveryAvailable: false };

  it("peek returns invalid without any DB read when delivery is unavailable", async () => {
    let calls = 0;
    const counting = {
      verification: {
        findFirst: async () => {
          calls += 1;
          return { id: "v1" };
        },
      },
    };
    expect(await getResetLinkState("tok_123", counting, gate)).toEqual({
      state: "invalid",
    });
    expect(calls).toBe(0);
  });

  it("request fails closed without touching the auth surface", async () => {
    const result = await requestPasswordResetFromForm("u@example.test", gate);
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Password reset is not currently available.");
  });

  it("completion fails closed without touching the auth surface", async () => {
    const result = await completePasswordReset(
      { rawToken: "tok", password: "new-password-1" },
      gate,
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.message).toBe(
      "Password reset is not currently available.",
    );
  });
});

describe("passwordResetDeliveryConfigured", () => {
  it("mirrors the mail port gate", () => {
    expect(passwordResetDeliveryConfigured()).toBe(
      // dev-file adapter is the implicit non-production default
      process.env.MAIL_DELIVERY_ADAPTER === undefined ||
        process.env.MAIL_DELIVERY_ADAPTER === "dev-file",
    );
  });
});
