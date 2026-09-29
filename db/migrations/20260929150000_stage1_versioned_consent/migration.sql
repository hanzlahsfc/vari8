-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('PRIVACY_NOTICE', 'HEALTH_DATA', 'CYCLE', 'PHOTOS', 'BLOODWORK', 'PED_HRT');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('CLIENT_SELF', 'COACH_ATTESTED');



-- CreateTable
CREATE TABLE "consent_record" (
    "id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "version" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "granted_by_user_id" TEXT,
    "source" "ConsentSource" NOT NULL DEFAULT 'CLIENT_SELF',

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_record_client_profile_id_kind_version_revoked_at_idx" ON "consent_record"("client_profile_id", "kind", "version", "revoked_at");

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- S1-D: at most one unrevoked consent row per (client_profile_id, kind, version).
-- History-preserving: revoked rows remain; revocation is the only permitted mutation.
CREATE UNIQUE INDEX "consent_record_active_version_key"
    ON "consent_record" ("client_profile_id", "kind", "version")
    WHERE "revoked_at" IS NULL;
