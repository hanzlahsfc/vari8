-- S1-F1 independent-review repair: the DB boundary must enforce the canonical
-- digest format, not just uniqueness. Only the S1-F0 SHA-256 output shape —
-- exactly 64 lowercase hex characters — may be stored; raw bearer tokens and
-- malformed/oversized values are rejected at the database layer even if a
-- future caller bypasses lib/tokens/crypto.ts.
-- Additive only (one CHECK constraint). As with the other raw CHECKs,
-- `migrate dev`/`migrate diff` cannot see it — `migrate deploy` stays required.
ALTER TABLE "access_token"
    ADD CONSTRAINT "access_token_token_hash_sha256_hex" CHECK (
        octet_length("token_hash") = 64
        AND "token_hash" ~ '^[a-f0-9]{64}$'
    );
