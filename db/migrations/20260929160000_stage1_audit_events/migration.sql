-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'GRANT', 'REVOKE', 'INVITE', 'ASSIGN', 'DENY', 'LOGIN');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_role" "MemberRole",
    "action" "AuditAction" NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "subject_client_profile_id" TEXT,
    "result" "AuditResult" NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "meta" JSONB,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_event_workspace_id_at_idx" ON "audit_event"("workspace_id", "at");

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_subject_client_profile_id_fkey" FOREIGN KEY ("subject_client_profile_id") REFERENCES "client_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- S1-E: additive only. `prisma migrate diff`/`migrate dev` drift proposes dropping
-- the raw-SQL composite FKs and partial indexes from S1-A/S1-D (they are not in the
-- datamodel); they must NOT be dropped — keep `migrate deploy`.
