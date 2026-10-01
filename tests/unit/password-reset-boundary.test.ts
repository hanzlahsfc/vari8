import { describe, expect, it } from "vitest";

import { PasswordPolicyError } from "../../lib/password-policy";
import { PasswordResetError } from "../../lib/auth/password-reset";
import {
  completePasswordReset,
  getResetLinkState,
  passwordResetMessage,
  requestPasswordResetFromForm,
} from "../../lib/auth/password-reset-boundary";

/**
 * Phase 3.2 — password-reset route boundary. `getResetLinkState` is the
 * non-consuming peek behind `/reset`; `passwordResetMessage` maps structural
 * error codes to safe UI copy; `requestPasswordResetFromForm` must return the
 * SAME generic response whether or not the account exists. None may leak the
 * raw token, account details, or internals.
 */

const VALID_TOKEN = `${"a".repeat(42)}A`; // well-formed 43-char base64url

function fakeDb(row: unknown) {
  return {
    accessToken: {
      findUnique: async () => row,
    },
  };
}

describe("getResetLinkState (non-consuming peek)", () => {
  const active = {
    purpose: "PASSWORD_RESET",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    revokedAt: null,
  };

  it("returns ready for an active PASSWORD_RESET token", async () => {
    await expect(
      getResetLinkState(VALID_TOKEN, fakeDb(active) as never),
    ).resolves.toEqual({ state: "ready" });
  });

  it("returns invalid for every non-active or foreign shape", async () => {
    const variants: unknown[] = [
      null, // unknown token hash
      { ...active, purpose: "WORKSPACE_INVITE" }, // wrong purpose
      { ...active, consumedAt: new Date() }, // consumed
      { ...active, revokedAt: new Date() }, // revoked
      { ...active, expiresAt: new Date(Date.now() - 1) }, // expired
    ];
    for (const row of variants) {
      await expect(
        getResetLinkState(VALID_TOKEN, fakeDb(row) as never),
      ).resolves.toEqual({ state: "invalid" });
    }
  });

  it("returns invalid for malformed or missing inputs without a DB read", async () => {
    let reads = 0;
    const counting = {
      accessToken: {
        findUnique: async () => {
          reads++;
          return active;
        },
      },
    };
    for (const rawToken of [
      "",
      "not-a-token",
      "a".repeat(200),
      null,
      undefined,
      ["a"],
      42,
    ]) {
      await expect(
        getResetLinkState(rawToken, counting as never),
      ).resolves.toEqual({ state: "invalid" });
    }
    expect(reads).toBe(0);
  });
});

describe("requestPasswordResetFromForm (non-enumerating)", () => {
  const GENERIC = /if an account exists|if that email|check your email/i;

  it("returns the same generic message for missing accounts", async () => {
    const db = {
      user: { findUnique: async () => null },
    };
    const r = await requestPasswordResetFromForm(
      "ghost@example.test",
      db as never,
    );
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(GENERIC);
    expect(r.message).not.toContain("ghost@example.test");
  });

  it("returns the identical message for existing accounts", async () => {
    // Minimal fake covering the service's tx surface (see s1-f2d tests).
    const fake = {
      user: {
        findUnique: async () => ({ id: "u1", status: "ACTIVE" }),
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
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
        }),
    };
    const exists = await requestPasswordResetFromForm(
      "u@example.test",
      fake as never,
    );
    const missing = await requestPasswordResetFromForm("ghost@example.test", {
      user: { findUnique: async () => null },
    } as never);
    expect(exists.ok).toBe(true);
    expect(exists.message).toBe(missing.message);
    expect(exists.message).not.toContain("u@example.test");
  });

  it("rejects malformed email input with a field-level error — no DB access", async () => {
    let lookups = 0;
    const probe = {
      user: {
        findUnique: async () => {
          lookups++;
          return null;
        },
      },
    };
    for (const email of [undefined, null, 42, "", "   ", {}, "@x", "a@"]) {
      const r = await requestPasswordResetFromForm(email, probe as never);
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/valid email/i);
    }
    expect(lookups).toBe(0);
  });
});

describe("passwordResetMessage (safe error mapping)", () => {
  it("maps token failures to one generic invalid-link message", () => {
    const message = passwordResetMessage(
      new PasswordResetError("invalid_token"),
    );
    expect(message).toMatch(/invalid|expired|no longer valid/i);
    expect(message).toMatch(/request a new link|new reset link/i);
    // Same message for ineligible accounts — no existence oracle.
    expect(
      passwordResetMessage(new PasswordResetError("account_ineligible")),
    ).toBe(message);
  });

  it("explains password-policy failures accessibly", () => {
    expect(
      passwordResetMessage(new PasswordPolicyError("password_too_short")),
    ).toMatch(/at least 10 characters/i);
    expect(
      passwordResetMessage(new PasswordPolicyError("password_needs_digit")),
    ).toMatch(/at least one digit \(0.9\)/i);
    expect(
      passwordResetMessage(new PasswordPolicyError("password_too_long")),
    ).toMatch(/128/);
  });

  it("never echoes input or internals for remaining codes", () => {
    const marker = `raw-secret-${Date.now()}`;
    for (const error of [
      new PasswordResetError("invalid_input"),
      new PasswordResetError("serialization_conflict"),
      new PasswordResetError("reset_failed"),
      new PasswordResetError("resets_not_exposable"),
      new Error(marker),
      marker, // non-Error input
      null,
    ]) {
      const message = passwordResetMessage(error);
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain(marker);
      expect(message).not.toContain("@");
    }
  });
});

describe("completePasswordReset", () => {
  it("malformed token → invalid-link message before any DB access", async () => {
    let txCalls = 0;
    const probe = {
      $transaction: async () => {
        txCalls++;
        throw new Error("must not run");
      },
    };
    const r = await completePasswordReset(
      { rawToken: "nope", password: "valid-passw0rd" },
      probe as never,
    );
    expect(r).toEqual({
      ok: false,
      message: passwordResetMessage(new PasswordResetError("invalid_token")),
    });
    expect(txCalls).toBe(0);
  });

  it("policy failure returns the message without claiming the token", async () => {
    let txCalls = 0;
    const probe = {
      $transaction: async () => {
        txCalls++;
        throw new Error("must not run");
      },
    };
    const r = await completePasswordReset(
      { rawToken: VALID_TOKEN, password: "abcdefghij" }, // no digit
      probe as never,
    );
    expect(r).toEqual({
      ok: false,
      message: expect.stringMatching(/at least one digit/i),
    });
    expect(txCalls).toBe(0);
  });
});
