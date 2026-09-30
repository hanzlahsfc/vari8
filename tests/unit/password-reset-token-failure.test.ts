import { describe, expect, it, vi } from "vitest";

import { TokenError } from "../../lib/tokens/crypto";

/**
 * S1-F2D repair — `safeTokenHash` classification.
 *
 * Module isolation is required here: a genuine unexpected failure of the
 * production `hashAccessToken` cannot be triggered through valid inputs, so
 * the crypto module is mocked to throw once. Only this file may do that.
 */

vi.mock("../../lib/tokens/crypto", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../lib/tokens/crypto")>();
  return {
    ...mod,
    hashAccessToken: vi.fn(),
  };
});

describe("safeTokenHash classification", () => {
  it("TokenError → invalid_token; unexpected failure → reset_failed", async () => {
    const { hashAccessToken } = await import("../../lib/tokens/crypto");
    const { resetPasswordWithToken } =
      await import("../../lib/auth/password-reset");
    const mocked = vi.mocked(hashAccessToken);

    mocked.mockImplementation(() => {
      throw new TokenError("token_invalid");
    });
    await expect(
      resetPasswordWithToken(
        { rawToken: "A".repeat(43), password: "long enough passphrase" },
        {} as never,
      ),
    ).rejects.toMatchObject({
      name: "PasswordResetError",
      code: "invalid_token",
    });

    // A genuinely unexpected failure must NOT be mislabeled as an invalid
    // token — and the original message must never leak.
    mocked.mockImplementation(() => {
      throw new Error("crypto rng exploded with secret xyz");
    });
    const err = await resetPasswordWithToken(
      { rawToken: "A".repeat(43), password: "long enough passphrase" },
      {} as never,
    ).then(
      () => null,
      (e) => e,
    );
    expect(err).toMatchObject({
      name: "PasswordResetError",
      code: "reset_failed",
    });
    expect(String(err)).not.toContain("secret");
    expect(String(err)).not.toContain("exploded");
  });
});
