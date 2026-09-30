import { createHash, randomBytes } from "node:crypto";

/**
 * S1-F0 — policy-neutral token cryptography foundation.
 *
 * Minimum primitives a later token service (S1-F invites/recovery, once the
 * `TODO(human)` policy decisions land) builds on:
 *
 * - `generateAccessToken()` produces a raw token from the CSPRNG and the digest
 *   that a persistence layer may store. The raw token is returned exactly once —
 *   for the future delivery layer to send — and must never be stored, logged,
 *   serialized into an error, or included in audit metadata.
 * - `hashAccessToken()` validates a presented raw token structurally and returns
 *   its canonical storage digest.
 *
 * Entropy: 32 bytes (256 bits) from `crypto.randomBytes`, encoded as unpadded
 * base64url — URL-safe, exactly 43 characters, one canonical encoding only.
 * No UUIDs, timestamps, `Math.random`, or application secrets are used as token
 * material, and there is no injectable randomness seam.
 *
 * Hashing: SHA-256 hex (64 lowercase characters). A fast digest is correct here
 * because the input is a uniformly random 256-bit value: brute force is bounded
 * by the 2^256 token space, so no work factor is needed and none would help.
 * Passwords stay on `lib/password.ts` (scrypt) — password hashing and token
 * hashing solve different problems and are deliberately not shared.
 *
 * There is no mutable module state and no logging. Errors carry structural
 * codes only and never include the submitted input.
 */

export type TokenErrorCode = "token_invalid";

export class TokenError extends Error {
  constructor(readonly code: TokenErrorCode) {
    super(code);
    this.name = "TokenError";
  }
}

/**
 * The raw token as presented to the bearer. Never persist, log, or echo this
 * value; it exists only to be delivered once to its recipient.
 */
export type RawAccessToken = string;

/**
 * The canonical storage representation: lowercase hex SHA-256 of the raw token.
 * This is the only form a persistence layer may store.
 */
export type AccessTokenHash = string;

export type GeneratedAccessToken = {
  /** Bearer secret — return to the delivery layer once; never store or log. */
  rawToken: RawAccessToken;
  /** Canonical storage digest — the only persistable form of the token. */
  tokenHash: AccessTokenHash;
};

const TOKEN_BYTE_LENGTH = 32; // 256 bits of CSPRNG entropy
// Unpadded base64url encodes 32 bytes as exactly 43 characters. The final
// character carries only the last 4 bits, so its 6-bit index is always a
// multiple of 4 — just 16 of the 64 alphabet characters can appear there.
// Restricting it keeps validation to the single canonical format the
// generator emits; nothing else is ever a real token.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
// Conservative input bound. Valid tokens are exactly 43 characters; anything
// larger is malformed — this bound additionally rejects oversized input cheaply
// before any further work.
const TOKEN_MAX_INPUT_LENGTH = 128;

/**
 * Generate a new access token. Returns the raw bearer token and its canonical
 * storage hash. Nothing is retained in module state; the caller decides which
 * half may be persisted (the hash) and which may be delivered (the raw token).
 */
export function generateAccessToken(): GeneratedAccessToken {
  const rawToken = randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");
  return { rawToken, tokenHash: hashAccessToken(rawToken) };
}

/**
 * Validate a presented raw token and return its canonical SHA-256 hex digest.
 *
 * Validation is structural and runs before hashing: the input must be a string
 * of bounded size matching the single canonical base64url format exactly (no
 * padding, no alternate encodings, no whitespace). Malformed, truncated,
 * oversized, or non-string input throws `TokenError("token_invalid")` — the
 * error message is the code only and never contains the submitted value.
 */
export function hashAccessToken(candidate: unknown): AccessTokenHash {
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.length > TOKEN_MAX_INPUT_LENGTH ||
    !TOKEN_PATTERN.test(candidate)
  ) {
    throw new TokenError("token_invalid");
  }
  return createHash("sha256").update(candidate, "utf8").digest("hex");
}
