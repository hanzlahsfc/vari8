import { describe, expect, it, vi } from "vitest";

import * as tokenCrypto from "../../lib/tokens/crypto";
import {
  TokenError,
  generateAccessToken,
  hashAccessToken,
} from "../../lib/tokens/crypto";

// The canonical raw-token format: base64url (unpadded) of 32 random bytes.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// The canonical stored digest format: lowercase hex SHA-256.
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function expectTokenError(input: unknown): TokenError {
  try {
    hashAccessToken(input);
  } catch (error) {
    expect(error).toBeInstanceOf(TokenError);
    return error as TokenError;
  }
  throw new Error("expected hashAccessToken to reject the input");
}

describe("generateAccessToken", () => {
  it("returns a raw token in the canonical URL-safe format", () => {
    for (let i = 0; i < 8; i += 1) {
      const { rawToken } = generateAccessToken();
      expect(rawToken).toMatch(TOKEN_PATTERN);
    }
  });

  it("carries at least 256 bits of entropy (32 decoded bytes)", () => {
    const { rawToken } = generateAccessToken();
    const decoded = Buffer.from(rawToken, "base64url");
    expect(decoded).toHaveLength(32);
    // Round-trip proves the encoding is exactly unpadded base64url of the
    // decoded bytes (no alternate/padded encoding is emitted).
    expect(decoded.toString("base64url")).toBe(rawToken);
  });

  it("returns the raw token once alongside its hash", () => {
    const generated = generateAccessToken();
    expect(Object.keys(generated).sort()).toEqual(["rawToken", "tokenHash"]);
    expect(generated.tokenHash).toBe(hashAccessToken(generated.rawToken));
    expect(generated.tokenHash).toMatch(HASH_PATTERN);
  });

  it("produces a different token on every call", () => {
    const first = generateAccessToken();
    const second = generateAccessToken();
    expect(second.rawToken).not.toBe(first.rawToken);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });

  it("emits no console output containing the raw token (or anything)", () => {
    const spies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];
    try {
      const generated = generateAccessToken();
      hashAccessToken(generated.rawToken);
      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(generated.rawToken);
        }
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("hashAccessToken", () => {
  it("is deterministic for the same raw token", () => {
    const { rawToken } = generateAccessToken();
    expect(hashAccessToken(rawToken)).toBe(hashAccessToken(rawToken));
  });

  it("produces distinct digests for distinct tokens", () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(hashAccessToken(a.rawToken)).not.toBe(hashAccessToken(b.rawToken));
  });

  it("returns the canonical 64-character lowercase hex SHA-256 digest", () => {
    const { rawToken, tokenHash } = generateAccessToken();
    expect(tokenHash).toMatch(HASH_PATTERN);
    expect(hashAccessToken(rawToken)).toMatch(HASH_PATTERN);
  });

  it("matches a known SHA-256 answer (algorithm is pinned)", () => {
    // sha256("A" * 43) — an independently computed digest, not a re-run of
    // the production code path.
    expect(hashAccessToken("A".repeat(43))).toBe(
      "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a",
    );
  });

  it("never returns the raw token as its own hash", () => {
    const { rawToken, tokenHash } = generateAccessToken();
    expect(tokenHash).not.toBe(rawToken);
    expect(hashAccessToken(rawToken)).not.toBe(rawToken);
  });

  it("accepts every token it generates (validation matches canonical format)", () => {
    for (let i = 0; i < 8; i += 1) {
      const { rawToken, tokenHash } = generateAccessToken();
      expect(() => hashAccessToken(rawToken)).not.toThrow();
      expect(hashAccessToken(rawToken)).toBe(tokenHash);
    }
  });

  it("rejects an empty string", () => {
    expectTokenError("");
  });

  it("rejects whitespace inside, before, or after the token", () => {
    const { rawToken } = generateAccessToken();
    const padded = ` ${rawToken}`;
    const inner = `${rawToken.slice(0, 10)} ${rawToken.slice(11)}`;
    const whitespace = [
      " ",
      "\t\n",
      padded,
      `${rawToken} `,
      `${rawToken}\n`,
      `\t${rawToken}`,
      inner,
    ];
    for (const input of whitespace) {
      expectTokenError(input);
    }
  });

  it("rejects tokens outside the base64url alphabet", () => {
    const malformed = [
      "+".repeat(43),
      "/".repeat(43),
      `${"a".repeat(42)}!`,
      `${"a".repeat(42)}=`,
      `${"a".repeat(42)}.`,
      `${"a".repeat(42)}@`,
    ];
    for (const input of malformed) {
      expectTokenError(input);
    }
  });

  it("rejects a truncated token", () => {
    const { rawToken } = generateAccessToken();
    expectTokenError(rawToken.slice(0, 42));
    expectTokenError(rawToken.slice(1));
    expectTokenError("a".repeat(42));
  });

  it("rejects a token longer than the canonical length", () => {
    const { rawToken } = generateAccessToken();
    expectTokenError(`${rawToken}a`);
    expectTokenError("a".repeat(44));
  });

  it("rejects a final character that base64url of 32 bytes cannot produce", () => {
    // The 43rd char encodes 4 bits; only indices ≡ 0 mod 4 are canonical.
    expectTokenError(`${"a".repeat(42)}B`);
    expectTokenError(`${"a".repeat(42)}a`);
    expectTokenError(`${"a".repeat(42)}z`);
    expectTokenError(`${"a".repeat(42)}-`);
    // Same body with a canonical final character is accepted.
    expect(hashAccessToken(`${"a".repeat(42)}A`)).toMatch(HASH_PATTERN);
  });

  it("rejects unicode and non-ASCII characters", () => {
    expectTokenError(`${"a".repeat(41)}🔒`);
    expectTokenError(`${"a".repeat(42)}Ａ`); // fullwidth A
    expectTokenError(`${"a".repeat(41)} `);
  });

  it("rejects unreasonably large input before hashing", () => {
    expectTokenError("a".repeat(1024));
    expectTokenError("-".repeat(4096));
  });

  it("rejects non-string runtime input safely", () => {
    const nonStrings: unknown[] = [
      undefined,
      null,
      42,
      true,
      {},
      { token: "a".repeat(43) },
      [],
      ["a".repeat(43)],
      Buffer.from("a".repeat(43)),
      new String("a".repeat(43)),
    ];
    for (const input of nonStrings) {
      expectTokenError(input);
    }
  });

  it("returns a structural error whose message never contains the input", () => {
    const marker = "s3cr3t-marker-value";
    const error = expectTokenError(` ${marker}${"a".repeat(40)}`);
    expect(error.code).toBe("token_invalid");
    expect(error.message).not.toContain(marker);
    expect(error.message).toBe("token_invalid");
  });
});

describe("module boundary", () => {
  it("exports only functions — no mutable module-level token storage", () => {
    for (const [name, value] of Object.entries(tokenCrypto)) {
      expect(typeof value, `export ${name}`).toBe("function");
    }
  });

  it("exposes no randomness-injection seam on the public API", () => {
    // The production API sources entropy internally; there is no parameter a
    // caller (or test) could use to feed deterministic/insecure randomness.
    expect(generateAccessToken).toHaveLength(0);
    expect(hashAccessToken).toHaveLength(1);
  });

  it("keeps earlier results valid after later calls (no shared state)", () => {
    const first = generateAccessToken();
    generateAccessToken();
    generateAccessToken();
    expect(hashAccessToken(first.rawToken)).toBe(first.tokenHash);
  });
});
