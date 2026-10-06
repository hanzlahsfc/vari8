-- P-013: staff-only onboarding-form assignment records (product-decisions
-- #31–#34). Client-associated operational metadata only — no answers.
--
-- 1. Same-workspace invariants and version-belongs-to-form are enforced by
--    composite foreign keys (raw SQL — Prisma cannot express two relations
--    sharing workspace_id). The composite unique targets on
--    onboarding_form(id, workspace_id) and
--    onboarding_form_version(id, form_id) are created below.
-- 2. One ACTIVE assignment per (workspace_id, client_profile_id, form_id)
--    via a partial unique index — the final concurrency authority.
-- 3. Lifecycle provenance shape via CHECK: ACTIVE forbids ending provenance;
--    every terminal status requires it. COMPLETED is schema-reserved for the
--    future submission transaction; no P-013 service may write it.
-- 4. Restrict FKs: deleting a workspace/client/member/form/version must not
--    silently erase assignment history.

CREATE TYPE "public"."OnboardingAssignmentStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "public"."onboarding_form_assignment" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "form_version_id" TEXT NOT NULL,
    "status" "public"."OnboardingAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_by_member_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_by_member_id" TEXT,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_form_assignment_pkey" PRIMARY KEY ("id")
);

-- Composite unique targets required by the same-workspace / version-belongs-
-- to-form foreign keys below (redundant with the PKs but required as FK targets).
CREATE UNIQUE INDEX "onboarding_form_id_workspace_id_key" ON "public"."onboarding_form"("id", "workspace_id");
CREATE UNIQUE INDEX "onboarding_form_version_id_form_id_key" ON "public"."onboarding_form_version"("id", "form_id");

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."onboarding_form_assignment" ADD CONSTRAINT "onboarding_form_assignment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_form_assignment" ADD CONSTRAINT "onboarding_form_assignment_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_form_assignment" ADD CONSTRAINT "onboarding_form_assignment_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."onboarding_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_form_assignment" ADD CONSTRAINT "onboarding_form_assignment_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "public"."onboarding_form_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_form_assignment" ADD CONSTRAINT "onboarding_form_assignment_assigned_by_member_id_fkey" FOREIGN KEY ("assigned_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_form_assignment" ADD CONSTRAINT "onboarding_form_assignment_ended_by_member_id_fkey" FOREIGN KEY ("ended_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same-workspace composite foreign keys: client, form, assigning member and
-- ending member must all live in the row's workspace (ended columns are
-- nullable — composite FKs pass when any column is NULL).
ALTER TABLE "public"."onboarding_form_assignment"
    ADD CONSTRAINT "onboarding_assignment_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."onboarding_form_assignment"
    ADD CONSTRAINT "onboarding_assignment_form_workspace_fkey"
    FOREIGN KEY ("form_id", "workspace_id")
    REFERENCES "public"."onboarding_form"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."onboarding_form_assignment"
    ADD CONSTRAINT "onboarding_assignment_assigned_by_workspace_fkey"
    FOREIGN KEY ("assigned_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."onboarding_form_assignment"
    ADD CONSTRAINT "onboarding_assignment_ended_by_workspace_fkey"
    FOREIGN KEY ("ended_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The pinned version must belong to the pinned form.
ALTER TABLE "public"."onboarding_form_assignment"
    ADD CONSTRAINT "onboarding_assignment_version_form_fkey"
    FOREIGN KEY ("form_version_id", "form_id")
    REFERENCES "public"."onboarding_form_version"("id", "form_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Provenance shape: ACTIVE has no ending provenance; terminal rows require it.
ALTER TABLE "public"."onboarding_form_assignment"
    ADD CONSTRAINT "onboarding_assignment_provenance_shape" CHECK (
        ("status" = 'ACTIVE'::"public"."OnboardingAssignmentStatus"
            AND "ended_by_member_id" IS NULL AND "ended_at" IS NULL)
        OR ("status" <> 'ACTIVE'::"public"."OnboardingAssignmentStatus"
            AND "ended_by_member_id" IS NOT NULL AND "ended_at" IS NOT NULL)
    );

-- One ACTIVE assignment per (workspace, client, form) — final concurrency
-- authority. Terminal history is unrestricted.
CREATE UNIQUE INDEX "onboarding_assignment_one_active_key"
    ON "public"."onboarding_form_assignment" ("workspace_id", "client_profile_id", "form_id")
    WHERE "status" = 'ACTIVE'::"public"."OnboardingAssignmentStatus";

-- Query indexes: workspace id-cursor pagination, scoped client/form reads,
-- and the version FK parent-delete scan.
CREATE INDEX "onboarding_form_assignment_workspace_id_id_idx" ON "public"."onboarding_form_assignment"("workspace_id", "id");
CREATE INDEX "onboarding_form_assignment_client_profile_id_status_idx" ON "public"."onboarding_form_assignment"("client_profile_id", "status");
CREATE INDEX "onboarding_form_assignment_form_id_status_idx" ON "public"."onboarding_form_assignment"("form_id", "status");
CREATE INDEX "onboarding_form_assignment_form_version_id_idx" ON "public"."onboarding_form_assignment"("form_version_id");
