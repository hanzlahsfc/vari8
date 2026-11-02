-- AUTH-ROTATE: bearer token rotation (D6, ruling O1).
--
-- 1. `sessions.family_id` records the rotation family a session belongs to.
--    NULL is a sign-in session, which starts its family (family id = its own
--    session id); every session minted by POST /api/v1/auth/refresh carries
--    the family of the token it replaced.
-- 2. `spent_refresh_tokens` is the replay ledger: one row per rotated-out
--    token, keyed on the SHA-256 digest of the token. Raw tokens are never
--    stored. A request presenting a ledgered token is a replay and deletes
--    every session in that token's family.

ALTER TABLE "public"."sessions" ADD COLUMN "family_id" TEXT;

CREATE INDEX "sessions_family_id_idx" ON "public"."sessions"("family_id");

CREATE TABLE "public"."spent_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spent_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "spent_refresh_tokens_token_hash_key" ON "public"."spent_refresh_tokens"("token_hash");

CREATE INDEX "spent_refresh_tokens_family_id_idx" ON "public"."spent_refresh_tokens"("family_id");
