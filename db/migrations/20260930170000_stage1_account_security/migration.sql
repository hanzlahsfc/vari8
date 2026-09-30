-- S1-F2B account-scoped security audit. Additive: one new enum, one enum
-- value, one new column with default, one nullable column, one relaxed
-- nullability, one FK, one index, two CHECKs. No rows are dropped or
-- recreated; every existing row keeps workspace ownership (scope backfills to
-- WORKSPACE and workspace_id stays populated).
CREATE TYPE "AuditScope" AS ENUM ('WORKSPACE', 'ACCOUNT');

ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RESET';

ALTER TABLE "audit_event"
    ADD COLUMN "scope" "AuditScope" NOT NULL DEFAULT 'WORKSPACE',
    ADD COLUMN "subject_user_id" TEXT,
    ALTER COLUMN "workspace_id" DROP NOT NULL;

ALTER TABLE "audit_event"
    ADD CONSTRAINT "audit_event_subject_user_id_fkey"
    FOREIGN KEY ("subject_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "audit_event_subject_user_id_at_idx"
    ON "audit_event"("subject_user_id", "at");

-- Ownership shapes (raw SQL; invisible to `migrate dev` — `deploy` required):
-- WORKSPACE rows need a workspace and no subject user; ACCOUNT rows need a
-- subject user and no workspace. No row may satisfy both or neither shape.
ALTER TABLE "audit_event"
    ADD CONSTRAINT "audit_event_workspace_scope_shape" CHECK (
        "scope" <> 'WORKSPACE'
        OR ("workspace_id" IS NOT NULL AND "subject_user_id" IS NULL)
    ),
    ADD CONSTRAINT "audit_event_account_scope_shape" CHECK (
        "scope" <> 'ACCOUNT'
        OR ("subject_user_id" IS NOT NULL AND "workspace_id" IS NULL)
    );
