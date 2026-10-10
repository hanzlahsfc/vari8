-- P-025-A: Check-In form definitions + immutable published versions
-- (decisions #92–#97). Check-In is a distinct domain — its own tables,
-- status enum, and answer-kind enum; no instance/submission/review tables
-- exist in this slice.
--
-- 1. Tenant coherence is DB-enforced by composite foreign keys (raw SQL —
--    Prisma cannot express multi-column relations): a version's form must
--    belong to its workspace, and every member provenance column must
--    reference a member of the same workspace.
-- 2. (form_id, publish_origin_revision) is UNIQUE: the deterministic
--    publish-replay/idempotency authority — one committed version per
--    origin draft revision; a second publish from the same revision is a
--    P2002 the service resolves by returning the existing version.
-- 3. unique(form_id, version_seq) is the final concurrency authority for
--    version sequences (the service assigns seq = max+1 only under the
--    serialized form-row lock).
-- 4. Restrict FKs everywhere: deleting a workspace/member must not
--    silently erase form history (retention/erasure remains pending D-10).

CREATE TYPE "public"."CheckInFormStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TYPE "public"."CheckInAnswerKind" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_CHOICE', 'MULTI_CHOICE');

CREATE TABLE "public"."checkin_form" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."CheckInFormStatus" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(6),
    "archived_by_member_id" TEXT,
    "draft" JSONB,
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "draft_saved_by_member_id" TEXT,
    "draft_updated_at" TIMESTAMPTZ(6),
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checkin_form_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."checkin_form_version" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "version_seq" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "publish_origin_revision" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_member_id" TEXT NOT NULL,

    CONSTRAINT "checkin_form_version_pkey" PRIMARY KEY ("id")
);

-- Cardinality + composite unique targets.
CREATE UNIQUE INDEX "checkin_form_id_workspace_id_key" ON "public"."checkin_form"("id", "workspace_id");
CREATE UNIQUE INDEX "checkin_form_version_form_id_version_seq_key" ON "public"."checkin_form_version"("form_id", "version_seq");
CREATE UNIQUE INDEX "checkin_form_version_id_workspace_id_form_id_key" ON "public"."checkin_form_version"("id", "workspace_id", "form_id");

-- Publish-replay authority: one version per origin draft revision.
CREATE UNIQUE INDEX "checkin_form_version_publish_origin_key" ON "public"."checkin_form_version"("form_id", "publish_origin_revision");

CREATE INDEX "checkin_form_workspace_id_status_idx" ON "public"."checkin_form"("workspace_id", "status");

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."checkin_form" ADD CONSTRAINT "checkin_form_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_form" ADD CONSTRAINT "checkin_form_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_form" ADD CONSTRAINT "checkin_form_archived_by_member_id_fkey" FOREIGN KEY ("archived_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_form_version" ADD CONSTRAINT "checkin_form_version_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_form_version" ADD CONSTRAINT "checkin_form_version_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."checkin_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_form_version" ADD CONSTRAINT "checkin_form_version_published_by_member_id_fkey" FOREIGN KEY ("published_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/provenance coherence claim.
ALTER TABLE "public"."checkin_form_version"
    ADD CONSTRAINT "checkin_form_version_form_workspace_fkey"
    FOREIGN KEY ("form_id", "workspace_id")
    REFERENCES "public"."checkin_form"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_form"
    ADD CONSTRAINT "checkin_form_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_form"
    ADD CONSTRAINT "checkin_form_archiver_workspace_fkey"
    FOREIGN KEY ("archived_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_form"
    ADD CONSTRAINT "checkin_form_draft_saver_workspace_fkey"
    FOREIGN KEY ("draft_saved_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_form_version"
    ADD CONSTRAINT "checkin_form_version_publisher_workspace_fkey"
    FOREIGN KEY ("published_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
