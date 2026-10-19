import { createHash } from "node:crypto";

import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completePasswordReset,
  getResetLinkState,
  passwordResetDeliveryConfigured,
  passwordResetMessage,
  requestPasswordResetFromForm,
} from "../../lib/auth/password-reset-boundary";
import { auth } from "../../lib/auth/server";
import { PasswordPolicyError } from "../../lib/password-policy";

// Rewired guards (PR-05): the Better Auth endpoint surface and next/headers
// are mocked so the boundary's own invariants — non-enumeration, field
// validation ahead of the endpoint, policy-before-claim, hashed verification
// identifiers — are proven without a live request context. The live reset
// flow against the real pipeline is covered by the integration suites
// (tests/integration/phase-3-2-password-reset.test.ts,
// tests/integration/s1-f2d-password-reset.test.ts).
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("../../lib/auth/server", () => ({
  auth: {
    api: {
      requestPasswordReset: vi.fn(),
      resetPassword: vi.fn(),
    },
  },
}));

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

// ---------------------------------------------------------------------------
// PR-05 rewires — the verification row is looked up by the HASHED composite
// identifier (never the raw token) and expiry is enforced inside the query.
// ---------------------------------------------------------------------------

describe("getResetLinkState — verification lookup", () => {
  it("queries the hashed reset identifier and bounds expiry at the database", async () => {
    const calls: unknown[] = [];
    const client = {
      verification: {
        findFirst: async (args: unknown) => {
          calls.push(args);
          return { id: "v1" };
        },
      },
    };
    const raw = "raw-reset-token-123";
    await expect(
      getResetLinkState(raw, client, { deliveryAvailable: true }),
    ).resolves.toEqual({ state: "ready" });
    expect(calls).toHaveLength(1);
    const { where } = calls[0] as {
      where: { identifier: string; expiresAt: { gt: Date } };
    };
    expect(where.identifier).toBe(
      createHash("sha256")
        .update(`reset-password:${raw}`)
        .digest("base64url"),
    );
    expect(where.identifier).not.toBe(raw);
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// requestPasswordResetFromForm (non-enumerating) — restored from the Phase
// 3.2 suite, rewired: the endpoint is the auth surface; the DB lookup that
// used to prove "no enumeration" is now Better Auth internals (covered by
// the integration suites). What must still hold at the boundary: one generic
// message for every deliverable input, no input echo, and malformed input
// never reaching the endpoint.
// ---------------------------------------------------------------------------

describe("requestPasswordResetFromForm (non-enumerating)", () => {
  const GENERIC = /if an account exists|check your (inbox|email)/i;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the identical generic message for every deliverable email", async () => {
    vi.mocked(auth.api.requestPasswordReset).mockResolvedValue(
      undefined as never,
    );
    const existing = await requestPasswordResetFromForm("u@example.test", {
      deliveryAvailable: true,
    });
    const missing = await requestPasswordResetFromForm("ghost@example.test", {
      deliveryAvailable: true,
    });
    expect(existing.ok).toBe(true);
    expect(existing.message).toBe(missing.message);
    expect(existing.message).toMatch(GENERIC);
    expect(existing.message).not.toContain("u@example.test");
    expect(existing.message).not.toContain("ghost@example.test");
    expect(vi.mocked(auth.api.requestPasswordReset)).toHaveBeenCalledTimes(2);
  });

  it("normalizes the email before delegating to the endpoint", async () => {
    const spy = vi
      .mocked(auth.api.requestPasswordReset)
      .mockResolvedValue(undefined as never);
    const r = await requestPasswordResetFromForm("  U@Example.TEST  ", {
      deliveryAvailable: true,
    });
    expect(r.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ body: { email: "u@example.test" } }),
    );
  });

  it("rejects malformed email input with a field-level error — the endpoint is never called", async () => {
    const spy = vi.mocked(auth.api.requestPasswordReset);
    for (const email of [undefined, null, 42, "", "   ", {}]) {
      const r = await requestPasswordResetFromForm(email, {
        deliveryAvailable: true,
      });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/valid email/i);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// completePasswordReset — restored invariants: token failure maps to the
// generic invalid-link copy, a non-string token is claimed as "" (never
// echoed), and a policy violation returns before the token is consumed.
// ---------------------------------------------------------------------------

describe("completePasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("endpoint token failure maps to the generic invalid-link message", async () => {
    vi.mocked(auth.api.resetPassword).mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "INVALID_TOKEN", message: "x" }),
    );
    const r = await completePasswordReset(
      { rawToken: "nope", password: "valid-passw0rd" },
      { deliveryAvailable: true },
    );
    expect(r).toEqual({
      ok: false,
      message:
        "This password reset link is invalid or has expired. Request a new link.",
    });
  });

  it("a non-string token is claimed as empty — the raw value is never echoed", async () => {
    const spy = vi
      .mocked(auth.api.resetPassword)
      .mockRejectedValue(
        new APIError("BAD_REQUEST", { code: "INVALID_TOKEN", message: "x" }),
      );
    const r = await completePasswordReset(
      { rawToken: { weird: true }, password: "valid-passw0rd" },
      { deliveryAvailable: true },
    );
    expect(r.ok).toBe(false);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ token: "" }),
      }),
    );
    if (!r.ok) expect(r.message).not.toContain("weird");
  });

  it("policy failure returns the message without claiming the token", async () => {
    const spy = vi.mocked(auth.api.resetPassword);
    const r = await completePasswordReset(
      { rawToken: "tok_123", password: "abcdefghij" }, // no digit
      { deliveryAvailable: true },
    );
    expect(r).toEqual({
      ok: false,
      message: expect.stringMatching(/at least one digit/i),
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
