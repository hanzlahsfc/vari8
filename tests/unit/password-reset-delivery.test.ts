import { describe, expect, it } from "vitest";

import {
  deliverPasswordResetToken,
  passwordResetDeliveryAvailable,
} from "../../lib/auth/password-reset-delivery";

/**
 * Phase 3.2 repair — the public reset surface must fail closed until a real
 * delivery adapter exists. The env var SELECTS a registered adapter; it can
 * never enable delivery on its own because the registry is empty until a
 * provider lands.
 */
describe("passwordResetDeliveryAvailable", () => {
  it("is unavailable with no adapter configured", () => {
    for (const env of [undefined, "", "   "]) {
      expect(passwordResetDeliveryAvailable(env)).toBe(false);
    }
  });

  it("an env value alone cannot enable delivery — unknown names fail closed", () => {
    for (const env of ["1", "true", "smtp", "sendgrid", "resend", "noop"]) {
      expect(passwordResetDeliveryAvailable(env)).toBe(false);
    }
  });

  it("the no-op sink resolves without throwing and leaks nothing", async () => {
    await expect(
      deliverPasswordResetToken({
        kind: "password_reset",
        to: "u@example.test",
        rawToken: `${"a".repeat(42)}A` as never,
        expiresAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
