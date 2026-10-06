-- P-008 (TDD recovery): workspace-scoped onboarding form definitions —
-- definitions only, no submissions. Draft is mutable; published versions are
-- immutable snapshots. Restrict FKs: deleting a workspace/member must not
-- cascade away form history.

CREATE TYPE "public"."OnboardingFormStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "public"."onboarding_form" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."OnboardingFormStatus" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(6),
    "archived_by_member_id" TEXT,
    "draft" JSONB,
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "draft_saved_by_member_id" TEXT,
    "draft_updated_at" TIMESTAMPTZ(6),
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_form_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."onboarding_form_version" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "version_seq" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "publish_origin_revision" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_member_id" TEXT NOT NULL,

    CONSTRAINT "onboarding_form_version_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_form_version_form_id_version_seq_key" ON "public"."onboarding_form_version"("form_id", "version_seq");
CREATE INDEX "onboarding_form_version_form_id_publish_origin_revision_idx" ON "public"."onboarding_form_version"("form_id", "publish_origin_revision");
CREATE INDEX "onboarding_form_workspace_id_status_idx" ON "public"."onboarding_form"("workspace_id", "status");

ALTER TABLE "public"."onboarding_form" ADD CONSTRAINT "onboarding_form_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_form" ADD CONSTRAINT "onboarding_form_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_form" ADD CONSTRAINT "onboarding_form_archived_by_member_id_fkey" FOREIGN KEY ("archived_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_form_version" ADD CONSTRAINT "onboarding_form_version_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."onboarding_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_form_version" ADD CONSTRAINT "onboarding_form_version_published_by_member_id_fkey" FOREIGN KEY ("published_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
