import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../../lib/password";
import {
  PASSWORD_MAX_CODE_POINTS,
  PASSWORD_MIN_CODE_POINTS,
  PasswordPolicyError,
  validatePasswordSetup,
  validatePasswordPolicy,
} from "../../lib/password-policy";

describe("S1-F2B password policy", () => {
  it("bounds are the approved values", () => {
    expect(PASSWORD_MIN_CODE_POINTS).toBe(10);
    expect(PASSWORD_MAX_CODE_POINTS).toBe(128);
  });

  it("accepts exactly 10 and exactly 128 code points", () => {
    expect(validatePasswordPolicy("a".repeat(10))).toBe("a".repeat(10));
    expect(validatePasswordPolicy("b".repeat(128))).toBe("b".repeat(128));
  });

  it("rejects 9 and 129 code points with structural errors", () => {
    for (const [candidate, code] of [
      ["a".repeat(9), "password_too_short"],
      ["a".repeat(129), "password_too_long"],
      ["", "password_too_short"],
      [null, "password_too_short"],
      [undefined, "password_too_short"],
      [42, "password_too_short"],
    ] as const) {
      const error = validatePasswordPolicySafe(candidate);
      expect(error).toBeInstanceOf(PasswordPolicyError);
      // The message is the code only — never the submitted password.
      expect((error as Error).message).toBe(code);
    }
  });

  it("counts code points, not UTF-16 units (astral characters)", () => {
    // 10 astral chars = 10 code points but 20 UTF-16 units. A String.length
    // check would pass this at 20 "chars" — the policy must still count 10.
    const astral = "🎒".repeat(10);
    expect(astral.length).toBe(20);
    expect(validatePasswordPolicy(astral)).toBe(astral);
    const nineAstral = "🎒".repeat(9);
    expect(nineAstral.length).toBe(18);
    expect(validatePasswordPolicySafe(nineAstral)).toBeInstanceOf(
      PasswordPolicyError,
    );
    // 129 astral = 258 UTF-16 units — over bound by code points too.
    expect(validatePasswordPolicySafe("🎒".repeat(129))).toBeInstanceOf(
      PasswordPolicyError,
    );
  });

  it("NFC-normalizes canonically equivalent input before hashing", () => {
    // U+00E9 (é composed) vs e + U+0301 (decomposed) — same intent.
    const composed = "caf\u00e9!abcde";
    const decomposed = "cafe\u0301!abcde";
    expect(decomposed.length).toBe(composed.length + 1);
    const a = validatePasswordPolicy(composed);
    const b = validatePasswordPolicy(decomposed);
    expect(a).toBe(b);
    expect([...a].length).toBe(10);
  });

  it("does not apply NFKC (look-alike folding changes intent)", () => {
    // U+FB01 (ﬁ ligature) under NFC stays a distinct char; NFKC would fold to "fi".
    const ligature = "\ufb01xed-passw0rd"; // 13 code points — passes the minimum
    const out = validatePasswordPolicy(ligature);
    expect(out).toBe(ligature);
    expect(out).not.toBe("fixed-passw0rd");
    expect([...out].length).toBe(13);
  });

  it("allows spaces anywhere and never trims", () => {
    const padded = "  pass phrase  ";
    const out = validatePasswordPolicy(padded);
    expect(out).toBe(padded);
    expect(out.startsWith("  ")).toBe(true);
    expect(out.endsWith("  ")).toBe(true);
  });

  it("imposes no composition rules and stays case-sensitive", () => {
    expect(validatePasswordPolicy("abcdefghij")).toBe("abcdefghij");
    expect(validatePasswordPolicy("          ")).toBe("          ");
    expect(validatePasswordPolicy("Abcdefghij")).toBe("Abcdefghij");
    // Case folding would be a bug — these differ and must not be equalized.
    expect(validatePasswordPolicy("Abcdefghij")).not.toBe(
      validatePasswordPolicy("abcdefghij"),
    );
  });

  it("never leaks password contents in thrown errors", async () => {
    const marker = `s3cr3t-marker-${Date.now()}`;
    const err = validatePasswordPolicySafe(marker.slice(0, 5));
    expect(String(err)).not.toContain(marker.slice(0, 5));
    expect((err as Error).message).toBe("password_too_short");
  });

  it("hash/verify round-trips across canonically equivalent input", async () => {
    const composed = validatePasswordPolicy("caf\u00e9-passw0rd");
    const stored = await hashPassword(composed);
    // Same canonical meaning, decomposed input at the sign-in boundary.
    const decomposed = "cafe\u0301-passw0rd";
    expect(decomposed.length).toBe(composed.length + 1);
    await expect(verifyPassword(decomposed, stored)).resolves.toBe(true);
    await expect(verifyPassword(composed, stored)).resolves.toBe(true);
    await expect(
      verifyPassword("cafe-passw0rd", stored), // not canonically equivalent
    ).resolves.toBe(false);
  });
});

function validatePasswordPolicySafe(candidate: unknown): unknown {
  try {
    return validatePasswordPolicy(candidate);
  } catch (error) {
    return error;
  }
}

describe("P3.1+P3.2 setup password policy (min 10 + at least one ASCII digit)", () => {
  it("accepts a ≥10-code-point password containing a digit", () => {
    expect(validatePasswordSetup("benchpress4u")).toBe("benchpress4u");
    expect(validatePasswordSetup("7".padEnd(10, "x"))).toBe(
      "7".padEnd(10, "x"),
    );
    // Digit anywhere — not just leading/trailing.
    expect(validatePasswordSetup("long passphr4se")).toBe("long passphr4se");
  });

  it("rejects ≥10 chars without a digit as password_needs_digit", () => {
    for (const candidate of [
      "abcdefghij",
      "no digits in this one",
      "🎒".repeat(10),
      "  spaces only  ",
    ]) {
      const err = safe(candidate);
      expect(err).toBeInstanceOf(PasswordPolicyError);
      expect((err as Error).message).toBe("password_needs_digit");
    }
  });

  it("keeps the shared length bounds (short/long beat the digit rule)", () => {
    expect((safe("sh0rt") as Error).message).toBe("password_too_short");
    expect((safe("1") as Error).message).toBe("password_too_short");
    expect((safe("9".repeat(129)) as Error).message).toBe("password_too_long");
    // Non-string input is the same structural short failure — never echoed.
    expect((safe(null) as Error).message).toBe("password_too_short");
  });

  it("still NFC-normalizes before the digit check and return", () => {
    const composed = "caf\u00e9-passw0rd";
    const decomposed = "cafe\u0301-passw0rd";
    expect(validatePasswordSetup(decomposed)).toBe(composed);
  });

  it("only the invite path requires a digit — the shared policy does not", () => {
    // Guard against accidentally widening validatePasswordPolicy.
    expect(validatePasswordPolicy("abcdefghij")).toBe("abcdefghij");
  });
});

function safe(candidate: unknown): unknown {
  try {
    return validatePasswordSetup(candidate);
  } catch (error) {
    return error;
  }
}

describe("hash boundary normalization", () => {
  it("hashPassword canonicalizes even when called without the policy", async () => {
    // A future caller could hash a decomposed string directly — the stored
    // credential must still verify the canonically equivalent login input.
    const stored = await hashPassword("cafe\u0301-passw0rd");
    await expect(verifyPassword("caf\u00e9-passw0rd", stored)).resolves.toBe(
      true,
    );
  });
});
