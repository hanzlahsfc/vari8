-- S1-F1: additive only. AccessToken (purpose-scoped, hash-only tokens) plus
-- users.session_version. No DROP, no alteration of existing objects beyond the
-- additive users column. `prisma migrate diff`/`migrate dev` will propose
-- dropping the raw CHECK constraints below (not representable in the
-- datamodel); they must NOT be dropped — keep `migrate deploy`.

-- CreateEnum
CREATE TYPE "AccessTokenPurpose" AS ENUM ('WORKSPACE_INVITE', 'PASSWORD_RESET');

-- AlterTable: session-version foundation for reset-logs-out-other-devices.
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "access_token" (
    "id" TEXT NOT NULL,
    "purpose" "AccessTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "workspace_id" TEXT,
    "user_id" TEXT,
    "target_email" TEXT,
    "intended_role" "MemberRole",
    "created_by_user_id" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_token_token_hash_key" ON "access_token"("token_hash");

-- CreateIndex
CREATE INDEX "access_token_invite_target_idx" ON "access_token"("workspace_id", "purpose", "target_email", "intended_role");

-- CreateIndex
CREATE INDEX "access_token_user_id_purpose_idx" ON "access_token"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "access_token_expires_at_idx" ON "access_token"("expires_at");

-- AddForeignKey
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purpose-shape invariants Prisma cannot express (CHECK constraints).
-- WORKSPACE_INVITE: workspace-owned; requires workspace + normalized target
-- email + an allowed invited role + an issuer; user_id may only be set once the
-- token has been consumed (null before acceptance; the acceptor binds at
-- consumption).
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_invite_shape" CHECK (
    "purpose" <> 'WORKSPACE_INVITE'::"AccessTokenPurpose"
    OR (
        "workspace_id" IS NOT NULL
        AND "target_email" IS NOT NULL
        AND "intended_role" IS NOT NULL
        AND "intended_role" IN (
            'COACH'::"MemberRole",
            'ASSISTANT_COACH'::"MemberRole",
            'CLIENT'::"MemberRole"
        )
        AND "created_by_user_id" IS NOT NULL
        AND ("user_id" IS NULL OR "consumed_at" IS NOT NULL)
    )
);

-- PASSWORD_RESET: user-owned; requires user_id; must not carry workspace,
-- target email, role, or issuer fields.
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_reset_shape" CHECK (
    "purpose" <> 'PASSWORD_RESET'::"AccessTokenPurpose"
    OR (
        "user_id" IS NOT NULL
        AND "workspace_id" IS NULL
        AND "target_email" IS NULL
        AND "intended_role" IS NULL
        AND "created_by_user_id" IS NULL
    )
);

-- A token may never be born expired (the actual 12-hour lifetime is applied by
-- the future issuance service; the DB only enforces sanity).
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_expiry_after_creation"
    CHECK ("expires_at" > "created_at");
