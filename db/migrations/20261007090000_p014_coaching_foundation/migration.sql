-- P-014: workspace parameter library + coaching template foundation
-- (product-decisions #41–#48). Staff configuration only — no client data.
--
-- 1. Same-workspace and template/version coherence invariants are enforced
--    by composite foreign keys (raw SQL — Prisma cannot express two
--    relations sharing workspace_id/template_id columns). Composite unique
--    targets are created below.
-- 2. (workspace_id, key) unique: a parameter key is server-minted, immutable,
--    and never reusable — archived keys stay reserved.
-- 3. (template_id, publish_origin_revision) unique is the publish replay
--    key: concurrent/duplicate publishes of the same draft revision return
--    the same version — never a duplicate row.
-- 4. Archive provenance CHECK: ARCHIVED requires actor+timestamp; ACTIVE
--    forbids them.
-- 5. Restrict FKs: no product delete path exists for any of these rows;
--    deleting a workspace/member must never silently erase library history.

CREATE TYPE "public"."ParameterKind" AS ENUM ('MEASUREMENT', 'RATING', 'TIME', 'DURATION', 'OPTION', 'TEXT');
CREATE TYPE "public"."RatingScheme" AS ENUM ('SCALE_1_10', 'SCALE_1_5', 'WORD_LABELS');
CREATE TYPE "public"."ParameterStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "public"."CoachingTemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "public"."parameter_definition" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "public"."ParameterKind" NOT NULL,
    "label" TEXT NOT NULL,
    "help_text" TEXT,
    "group_label" TEXT,
    "unit" TEXT,
    "rating_scheme" "public"."RatingScheme",
    "options" JSONB,
    "retired_option_ids" JSONB,
    "validation" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "public"."ParameterStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_member_id" TEXT NOT NULL,
    "updated_by_member_id" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "archived_by_member_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parameter_definition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."coaching_template" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."CoachingTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(6),
    "archived_by_member_id" TEXT,
    "draft" JSONB,
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "draft_saved_by_member_id" TEXT,
    "draft_updated_at" TIMESTAMPTZ(6),
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coaching_template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."coaching_template_version" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version_seq" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "publish_origin_revision" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_member_id" TEXT NOT NULL,

    CONSTRAINT "coaching_template_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."coaching_template_version_parameter" (
    "workspace_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "parameter_id" TEXT NOT NULL,

    CONSTRAINT "coaching_template_version_parameter_pkey" PRIMARY KEY ("version_id", "parameter_id")
);

-- Unique constraints / indexes (Prisma-declared + composite FK targets).
CREATE UNIQUE INDEX "parameter_definition_workspace_id_key_key" ON "public"."parameter_definition"("workspace_id", "key");
CREATE UNIQUE INDEX "parameter_definition_id_workspace_id_key" ON "public"."parameter_definition"("id", "workspace_id");
CREATE INDEX "parameter_definition_workspace_id_status_idx" ON "public"."parameter_definition"("workspace_id", "status");

CREATE UNIQUE INDEX "coaching_template_id_workspace_id_key" ON "public"."coaching_template"("id", "workspace_id");
CREATE INDEX "coaching_template_workspace_id_status_idx" ON "public"."coaching_template"("workspace_id", "status");

CREATE UNIQUE INDEX "coaching_template_version_template_id_version_seq_key" ON "public"."coaching_template_version"("template_id", "version_seq");
-- Name matches Prisma's canonical generation (identifier would otherwise
-- be silently truncated at PostgreSQL's 63-byte limit).
CREATE UNIQUE INDEX "coaching_template_version_template_id_publish_origin_revisi_key" ON "public"."coaching_template_version"("template_id", "publish_origin_revision");
CREATE UNIQUE INDEX "coaching_template_version_id_workspace_id_key" ON "public"."coaching_template_version"("id", "workspace_id");
CREATE UNIQUE INDEX "coaching_template_version_id_template_id_workspace_id_key" ON "public"."coaching_template_version"("id", "template_id", "workspace_id");

CREATE INDEX "coaching_template_version_parameter_parameter_id_idx" ON "public"."coaching_template_version_parameter"("parameter_id");

-- Archive-provenance shape (raw SQL — Prisma cannot express CHECKs).
ALTER TABLE "public"."parameter_definition"
    ADD CONSTRAINT "parameter_definition_archive_provenance_check"
    CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL AND "archived_by_member_id" IS NOT NULL));
ALTER TABLE "public"."coaching_template"
    ADD CONSTRAINT "coaching_template_archive_provenance_check"
    CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL AND "archived_by_member_id" IS NOT NULL));

-- Plain foreign keys (as declared in the Prisma schema — all RESTRICT).
ALTER TABLE "public"."parameter_definition" ADD CONSTRAINT "parameter_definition_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."parameter_definition" ADD CONSTRAINT "parameter_definition_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."parameter_definition" ADD CONSTRAINT "parameter_definition_updated_by_member_id_fkey" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."parameter_definition" ADD CONSTRAINT "parameter_definition_archived_by_member_id_fkey" FOREIGN KEY ("archived_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coaching_template" ADD CONSTRAINT "coaching_template_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coaching_template" ADD CONSTRAINT "coaching_template_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coaching_template" ADD CONSTRAINT "coaching_template_archived_by_member_id_fkey" FOREIGN KEY ("archived_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coaching_template_version" ADD CONSTRAINT "coaching_template_version_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coaching_template_version" ADD CONSTRAINT "coaching_template_version_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."coaching_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coaching_template_version" ADD CONSTRAINT "coaching_template_version_published_by_member_id_fkey" FOREIGN KEY ("published_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coaching_template_version_parameter" ADD CONSTRAINT "coaching_template_version_parameter_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coaching_template_version_parameter" ADD CONSTRAINT "coaching_template_version_parameter_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."coaching_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coaching_template_version_parameter" ADD CONSTRAINT "coaching_template_version_parameter_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."coaching_template_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coaching_template_version_parameter" ADD CONSTRAINT "coaching_template_version_parameter_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameter_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite coherence foreign keys: cross-workspace or wrong-template
-- references are structurally impossible (the DB rejects them).
ALTER TABLE "public"."coaching_template_version_parameter"
    ADD CONSTRAINT "ctp_parameter_workspace_fkey"
    FOREIGN KEY ("parameter_id", "workspace_id")
    REFERENCES "public"."parameter_definition"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coaching_template_version_parameter"
    ADD CONSTRAINT "ctp_template_workspace_fkey"
    FOREIGN KEY ("template_id", "workspace_id")
    REFERENCES "public"."coaching_template"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coaching_template_version_parameter"
    ADD CONSTRAINT "ctp_version_template_workspace_fkey"
    FOREIGN KEY ("version_id", "template_id", "workspace_id")
    REFERENCES "public"."coaching_template_version"("id", "template_id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
