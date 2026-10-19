import { describe, expect, it } from "vitest";

import { normalizeEmail } from "../../lib/email";
import { hashPassword, verifyPassword } from "../../lib/password";

/**
 * PR-05 rewiring — `lib/credentials.ts` (authorizeCredentials plus its own
 * normalizeEmail) is deleted. The sign-in contract it enforced — valid
 * credentials return the safe user shape, wrong-password/unknown-email/
 * non-ACTIVE all fail with the same generic error, and the lookup email is
 * normalized first — now lives inside Better Auth's `/sign-in/email` plus the
 * before-hooks in `lib/auth/server.ts`, which require a real database. Those
 * invariants moved to `tests/integration/phase-3-2-password-reset.test.ts`
 * ("credentials gate" describe, audit TB0.029).
 *
 * What remains as a unit surface (blocks TB0.029/TB0.030, rewired):
 * `normalizeEmail` (now `lib/email.ts`) and the scrypt credential format
 * (`lib/password.ts`) — still the exact primitives every sign-in and every
 * password write run through Better Auth's `password.hash`/`password.verify`
 * callbacks in `lib/auth/server.ts`.
 */
describe("normalizeEmail", () => {
  it("trims and lowercases strings and rejects non-strings", () => {
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });
});

describe("credential password hashing (scrypt format)", () => {
  it("verifyPassword accepts the hash hashPassword produced (round-trip)", async () => {
    const stored = await hashPassword("right-password-1");
    expect(stored.startsWith("scrypt$16384$8$1$")).toBe(true);
    await expect(verifyPassword("right-password-1", stored)).resolves.toBe(
      true,
    );
  });

  it("verifyPassword rejects a wrong password against a real hash", async () => {
    const stored = await hashPassword("right-password-1");
    await expect(verifyPassword("wrong-password", stored)).resolves.toBe(
      false,
    );
    await expect(verifyPassword("right-password-2", stored)).resolves.toBe(
      false,
    );
  });

  it("verifyPassword fails closed on tampered or malformed stored hashes", async () => {
    const stored = await hashPassword("right-password-1");
    const [prefix, n, r, p, salt, hash] = stored.split("$");
    const variants = [
      `argon2$${n}$${r}$${p}$${salt}$${hash}`, // foreign scheme
      `${prefix}$${n}$${r}$${p}$${salt}`, // missing segment
      `${stored}$extra`, // extra segment
      `${prefix}$x$${r}$${p}$${salt}$${hash}`, // non-integer params
      `${prefix}$${n}$${r}$${p}$${salt}$${hash.slice(0, -2)}AA`, // corrupted digest
      "",
      "not-a-hash",
      `${prefix}$${n}$${r}$${p}$$${hash}`, // empty salt
    ];
    for (const tampered of variants) {
      await expect(
        verifyPassword("right-password-1", tampered),
      ).resolves.toBe(false);
    }
  });

  it("NFC-equivalent inputs verify identically (composed vs decomposed)", async () => {
    const decomposed = "pässword-9".normalize("NFD");
    const composed = "pässword-9".normalize("NFC");
    expect(decomposed).not.toBe(composed); // genuinely different code points
    const stored = await hashPassword(decomposed);
    await expect(verifyPassword(composed, stored)).resolves.toBe(true);
  });

  it("hashPassword refuses empty or non-string input", async () => {
    await expect(hashPassword("")).rejects.toThrow(
      "Password must be a non-empty string",
    );
    await expect(hashPassword(undefined as never)).rejects.toThrow();
    await expect(hashPassword(42 as never)).rejects.toThrow();
  });
});
