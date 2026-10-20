-- PR-M0 schema v2 (2 of 2): workspace/product-wide settings, coach
-- tools, messaging, media, plan aggregates and the identity-timestamp
-- normalization (PR-024).
--
-- 1. Columns on existing tables follow the declared defaults; every
--    instant column is TIMESTAMPTZ(6), every calendar date is DATE.
-- 2. Remaining bare `timestamp(3)` identity columns convert to
--    TIMESTAMPTZ(6) via USING <col> AT TIME ZONE 'UTC'.
-- 3. Prisma-declared single-column relations are RESTRICT unless stated
--    (uploader/sender provenance and catalog pins are SET NULL; draft
--    and read-marker rows CASCADE with their parent).
-- 4. Same-workspace coherence composite foreign keys, restore-window
--    pairing CHECKs, kind<->column CHECKs and content CHECKs are raw SQL
--    (the established convention -- Prisma cannot express them).

CREATE TYPE "public"."AppearanceMode" AS ENUM ('LIGHT', 'DARK');

CREATE TYPE "public"."AppearanceFont" AS ENUM ('SANS', 'SERIF', 'CONDENSED', 'MONO', 'ROUNDED');

CREATE TYPE "public"."AppearanceDensity" AS ENUM ('COMFORTABLE', 'COMPACT');

CREATE TYPE "public"."CoachNoteVisibility" AS ENUM ('PRIVATE', 'GENERAL');

CREATE TYPE "public"."MessageSenderKind" AS ENUM ('CLIENT', 'STAFF');

CREATE TYPE "public"."MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT');

CREATE TYPE "public"."PlanNutritionVariant" AS ENUM ('TRAINING_DAY', 'REST_DAY');

ALTER TABLE "public"."accounts" ALTER COLUMN "access_token_expires_at" TYPE TIMESTAMPTZ(6) USING "access_token_expires_at" AT TIME ZONE 'UTC',
ALTER COLUMN "refresh_token_expires_at" TYPE TIMESTAMPTZ(6) USING "refresh_token_expires_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."checkin_instance" ADD COLUMN "cancel_restore_until" TIMESTAMPTZ(6),
ADD COLUMN "coach_note" TEXT;

ALTER TABLE "public"."checkin_submission_answer" ADD COLUMN "value_rating" INTEGER;

ALTER TABLE "public"."client_assignment" ALTER COLUMN "assigned_at" TYPE TIMESTAMPTZ(6) USING "assigned_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."client_profile" ADD COLUMN "archive_reason" TEXT,
ADD COLUMN "archived_at" TIMESTAMPTZ(6),
ADD COLUMN "coaching_since" DATE,
ADD COLUMN "height_cm" DECIMAL(5,1),
ADD COLUMN "label" TEXT,
ADD COLUMN "priority_messages_allowed" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."coach_profile" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."coaching_template" ADD COLUMN "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN "restore_until" TIMESTAMPTZ(6);

ALTER TABLE "public"."daily_entry_revision_value" ADD COLUMN "value_diastolic" SMALLINT,
ADD COLUMN "value_minutes" INTEGER,
ADD COLUMN "value_option_ids" JSONB,
ADD COLUMN "value_systolic" SMALLINT;

ALTER TABLE "public"."habits" ADD COLUMN "reason" TEXT NOT NULL DEFAULT '';

ALTER TABLE "public"."sessions" ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(6) USING "expires_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."users" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."verifications" ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(6) USING "expires_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."workspace" ADD COLUMN "appearance_accent" VARCHAR(7) NOT NULL DEFAULT '#EB91B8',
ADD COLUMN "appearance_density" "public"."AppearanceDensity" NOT NULL DEFAULT 'COMFORTABLE',
ADD COLUMN "appearance_font" "public"."AppearanceFont" NOT NULL DEFAULT 'SANS',
ADD COLUMN "appearance_mode" "public"."AppearanceMode" NOT NULL DEFAULT 'DARK',
ADD COLUMN "availability_text" TEXT NOT NULL DEFAULT '',
ADD COLUMN "logo_media_id" TEXT,
ADD COLUMN "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "priority_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "retention_days" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN "studio_dashboard_draft" JSONB,
ADD COLUMN "studio_dashboard_draft_revision" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "public"."workspace_member" ADD COLUMN "sidebar_collapsed" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(6) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(6) USING "updated_at" AT TIME ZONE 'UTC';

CREATE TABLE "public"."media_object" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "public"."MediaKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "uploaded_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "media_object_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."coach_note" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT,
    "visibility" "public"."CoachNoteVisibility" NOT NULL DEFAULT 'PRIVATE',
    "body" TEXT NOT NULL,
    "author_member_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "restore_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coach_note_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."coach_task" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT,
    "title" VARCHAR(120) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by_member_id" TEXT,
    "created_by_member_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "restore_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "coach_task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."tracker_comment" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "parameter_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tracker_comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."client_goal" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "parameter_id" TEXT NOT NULL,
    "target_value" DECIMAL(30,8) NOT NULL,
    "unit" TEXT NOT NULL,
    "target_date" DATE NOT NULL,
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_goal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."saved_meal" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "meal" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_member_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "restore_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "saved_meal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."exercise_library_item" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "muscle" TEXT NOT NULL,
    "secondary_muscles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "catalog_item_id" TEXT,
    "demo_media_id" TEXT,
    "created_by_member_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exercise_library_item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."client_plan" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "calories" INTEGER,
    "protein" INTEGER,
    "sets" INTEGER,
    "instructions" TEXT NOT NULL DEFAULT '',
    "nutrition_variant" "public"."PlanNutritionVariant",
    "program_mode" TEXT NOT NULL DEFAULT 'WEEK_BASED',
    "weeks" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_by_member_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."iifym_plan" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "timezone" TEXT,
    "timezone_set_by_member_id" TEXT,
    "timezone_set_at" TIMESTAMPTZ(6),
    "draft" JSONB,
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "draft_saved_by_member_id" TEXT,
    "draft_updated_at" TIMESTAMPTZ(6),
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "iifym_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."iifym_plan_version" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "iifym_plan_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "version_seq" INTEGER NOT NULL,
    "effective_date" DATE NOT NULL,
    "effective_timezone" TEXT NOT NULL,
    "activation_instant" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL,
    "publish_origin_revision" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_member_id" TEXT NOT NULL,

    CONSTRAINT "iifym_plan_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."conversation" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."message" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_kind" "public"."MessageSenderKind" NOT NULL,
    "sender_user_id" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "links" JSONB,
    "client_request_id" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."message_attachment" (
    "message_id" TEXT NOT NULL,
    "media_object_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "message_attachment_pkey" PRIMARY KEY ("message_id","media_object_id")
);

CREATE TABLE "public"."message_draft" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "links" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_draft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."message_draft_attachment" (
    "draft_id" TEXT NOT NULL,
    "media_object_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "message_draft_attachment_pkey" PRIMARY KEY ("draft_id","media_object_id")
);

CREATE TABLE "public"."message_read" (
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_read_pkey" PRIMARY KEY ("message_id","user_id")
);

CREATE TABLE "public"."checkin_answer_media" (
    "answer_id" TEXT NOT NULL,
    "media_object_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checkin_answer_media_pkey" PRIMARY KEY ("answer_id","media_object_id")
);

CREATE UNIQUE INDEX "media_object_storage_key_key" ON "public"."media_object"("storage_key");

CREATE INDEX "media_object_workspace_id_created_at_idx" ON "public"."media_object"("workspace_id", "created_at");

CREATE UNIQUE INDEX "media_object_id_workspace_id_key" ON "public"."media_object"("id", "workspace_id");

CREATE INDEX "coach_note_workspace_id_client_profile_id_idx" ON "public"."coach_note"("workspace_id", "client_profile_id");

CREATE UNIQUE INDEX "coach_note_id_workspace_id_key" ON "public"."coach_note"("id", "workspace_id");

CREATE INDEX "coach_task_workspace_id_client_profile_id_idx" ON "public"."coach_task"("workspace_id", "client_profile_id");

CREATE UNIQUE INDEX "coach_task_id_workspace_id_key" ON "public"."coach_task"("id", "workspace_id");

CREATE UNIQUE INDEX "tracker_comment_client_profile_id_entry_date_parameter_id_key" ON "public"."tracker_comment"("client_profile_id", "entry_date", "parameter_id");

CREATE UNIQUE INDEX "tracker_comment_id_workspace_id_key" ON "public"."tracker_comment"("id", "workspace_id");

CREATE INDEX "client_goal_client_profile_id_parameter_id_target_date_idx" ON "public"."client_goal"("client_profile_id", "parameter_id", "target_date");

CREATE UNIQUE INDEX "client_goal_id_workspace_id_key" ON "public"."client_goal"("id", "workspace_id");

CREATE INDEX "saved_meal_workspace_id_sort_order_idx" ON "public"."saved_meal"("workspace_id", "sort_order");

CREATE UNIQUE INDEX "saved_meal_id_workspace_id_key" ON "public"."saved_meal"("id", "workspace_id");

CREATE INDEX "exercise_library_item_workspace_id_archived_at_idx" ON "public"."exercise_library_item"("workspace_id", "archived_at");

CREATE UNIQUE INDEX "exercise_library_item_id_workspace_id_key" ON "public"."exercise_library_item"("id", "workspace_id");

CREATE UNIQUE INDEX "client_plan_client_profile_id_key" ON "public"."client_plan"("client_profile_id");

CREATE UNIQUE INDEX "client_plan_id_workspace_id_key" ON "public"."client_plan"("id", "workspace_id");

CREATE UNIQUE INDEX "iifym_plan_client_profile_id_key" ON "public"."iifym_plan"("client_profile_id");

CREATE INDEX "iifym_plan_workspace_id_idx" ON "public"."iifym_plan"("workspace_id");

CREATE UNIQUE INDEX "iifym_plan_id_workspace_id_key" ON "public"."iifym_plan"("id", "workspace_id");

CREATE UNIQUE INDEX "iifym_plan_id_workspace_id_client_profile_id_key" ON "public"."iifym_plan"("id", "workspace_id", "client_profile_id");

CREATE INDEX "iifym_plan_version_iifym_plan_id_effective_date_version_seq_idx" ON "public"."iifym_plan_version"("iifym_plan_id", "effective_date", "version_seq");

CREATE INDEX "iifym_plan_version_iifym_plan_id_activation_instant_idx" ON "public"."iifym_plan_version"("iifym_plan_id", "activation_instant");

CREATE UNIQUE INDEX "iifym_plan_version_iifym_plan_id_version_seq_key" ON "public"."iifym_plan_version"("iifym_plan_id", "version_seq");

CREATE UNIQUE INDEX "iifym_plan_version_publish_origin_key" ON "public"."iifym_plan_version"("iifym_plan_id", "publish_origin_revision");

CREATE UNIQUE INDEX "iifym_plan_version_id_workspace_id_iifym_plan_id_key" ON "public"."iifym_plan_version"("id", "workspace_id", "iifym_plan_id");

CREATE INDEX "conversation_workspace_id_last_message_at_idx" ON "public"."conversation"("workspace_id", "last_message_at");

CREATE UNIQUE INDEX "conversation_workspace_id_client_profile_id_key" ON "public"."conversation"("workspace_id", "client_profile_id");

CREATE UNIQUE INDEX "conversation_id_workspace_id_key" ON "public"."conversation"("id", "workspace_id");

CREATE INDEX "message_conversation_id_sent_at_id_idx" ON "public"."message"("conversation_id", "sent_at", "id");

CREATE UNIQUE INDEX "message_conversation_id_client_request_id_key" ON "public"."message"("conversation_id", "client_request_id");

CREATE UNIQUE INDEX "message_id_workspace_id_key" ON "public"."message"("id", "workspace_id");

CREATE UNIQUE INDEX "message_draft_conversation_id_author_user_id_key" ON "public"."message_draft"("conversation_id", "author_user_id");

CREATE UNIQUE INDEX "message_draft_id_workspace_id_key" ON "public"."message_draft"("id", "workspace_id");

CREATE INDEX "message_read_user_id_idx" ON "public"."message_read"("user_id");

CREATE UNIQUE INDEX "checkin_submission_answer_id_workspace_id_key" ON "public"."checkin_submission_answer"("id", "workspace_id");

CREATE INDEX "client_profile_workspace_id_archived_at_idx" ON "public"."client_profile"("workspace_id", "archived_at");

ALTER TABLE "public"."workspace" ADD CONSTRAINT "workspace_logo_media_id_fkey" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."media_object" ADD CONSTRAINT "media_object_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."media_object" ADD CONSTRAINT "media_object_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."coach_note" ADD CONSTRAINT "coach_note_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coach_note" ADD CONSTRAINT "coach_note_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coach_note" ADD CONSTRAINT "coach_note_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coach_task" ADD CONSTRAINT "coach_task_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coach_task" ADD CONSTRAINT "coach_task_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coach_task" ADD CONSTRAINT "coach_task_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coach_task" ADD CONSTRAINT "coach_task_completed_by_member_id_fkey" FOREIGN KEY ("completed_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_comment" ADD CONSTRAINT "tracker_comment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_comment" ADD CONSTRAINT "tracker_comment_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_comment" ADD CONSTRAINT "tracker_comment_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameter_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_comment" ADD CONSTRAINT "tracker_comment_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_goal" ADD CONSTRAINT "client_goal_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_goal" ADD CONSTRAINT "client_goal_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_goal" ADD CONSTRAINT "client_goal_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameter_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_goal" ADD CONSTRAINT "client_goal_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."saved_meal" ADD CONSTRAINT "saved_meal_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."saved_meal" ADD CONSTRAINT "saved_meal_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."exercise_library_item" ADD CONSTRAINT "exercise_library_item_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."exercise_library_item" ADD CONSTRAINT "exercise_library_item_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."exercise_catalog_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."exercise_library_item" ADD CONSTRAINT "exercise_library_item_demo_media_id_fkey" FOREIGN KEY ("demo_media_id") REFERENCES "public"."media_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."exercise_library_item" ADD CONSTRAINT "exercise_library_item_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_plan" ADD CONSTRAINT "client_plan_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_plan" ADD CONSTRAINT "client_plan_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_plan" ADD CONSTRAINT "client_plan_updated_by_member_id_fkey" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan" ADD CONSTRAINT "iifym_plan_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan" ADD CONSTRAINT "iifym_plan_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan" ADD CONSTRAINT "iifym_plan_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan" ADD CONSTRAINT "iifym_plan_draft_saved_by_member_id_fkey" FOREIGN KEY ("draft_saved_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan" ADD CONSTRAINT "iifym_plan_timezone_set_by_member_id_fkey" FOREIGN KEY ("timezone_set_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan_version" ADD CONSTRAINT "iifym_plan_version_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan_version" ADD CONSTRAINT "iifym_plan_version_iifym_plan_id_fkey" FOREIGN KEY ("iifym_plan_id") REFERENCES "public"."iifym_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan_version" ADD CONSTRAINT "iifym_plan_version_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan_version" ADD CONSTRAINT "iifym_plan_version_published_by_member_id_fkey" FOREIGN KEY ("published_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."conversation" ADD CONSTRAINT "conversation_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."conversation" ADD CONSTRAINT "conversation_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message" ADD CONSTRAINT "message_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message" ADD CONSTRAINT "message_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."message_attachment" ADD CONSTRAINT "message_attachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_attachment" ADD CONSTRAINT "message_attachment_media_object_id_fkey" FOREIGN KEY ("media_object_id") REFERENCES "public"."media_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_attachment" ADD CONSTRAINT "message_attachment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_draft" ADD CONSTRAINT "message_draft_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_draft" ADD CONSTRAINT "message_draft_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_draft" ADD CONSTRAINT "message_draft_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."message_draft_attachment" ADD CONSTRAINT "message_draft_attachment_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "public"."message_draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."message_draft_attachment" ADD CONSTRAINT "message_draft_attachment_media_object_id_fkey" FOREIGN KEY ("media_object_id") REFERENCES "public"."media_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_draft_attachment" ADD CONSTRAINT "message_draft_attachment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_read" ADD CONSTRAINT "message_read_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."message_read" ADD CONSTRAINT "message_read_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_answer_media" ADD CONSTRAINT "checkin_answer_media_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."checkin_submission_answer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_answer_media" ADD CONSTRAINT "checkin_answer_media_media_object_id_fkey" FOREIGN KEY ("media_object_id") REFERENCES "public"."media_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_answer_media" ADD CONSTRAINT "checkin_answer_media_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Raw SQL
-- =====================================================================

-- ---------------------------------------------------------------------
-- Same-workspace coherence composite foreign keys (MATCH SIMPLE -
-- nullable referencing columns stay valid).
-- ---------------------------------------------------------------------

ALTER TABLE "public"."workspace"
    ADD CONSTRAINT "workspace_logo_media_workspace_fkey"
    FOREIGN KEY ("logo_media_id", "id")
    REFERENCES "public"."media_object"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coach_note"
    ADD CONSTRAINT "coach_note_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coach_note"
    ADD CONSTRAINT "coach_note_author_workspace_fkey"
    FOREIGN KEY ("author_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."coach_task"
    ADD CONSTRAINT "coach_task_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coach_task"
    ADD CONSTRAINT "coach_task_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."coach_task"
    ADD CONSTRAINT "coach_task_completer_workspace_fkey"
    FOREIGN KEY ("completed_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_comment"
    ADD CONSTRAINT "tracker_comment_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."tracker_comment"
    ADD CONSTRAINT "tracker_comment_parameter_workspace_fkey"
    FOREIGN KEY ("parameter_id", "workspace_id")
    REFERENCES "public"."parameter_definition"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."tracker_comment"
    ADD CONSTRAINT "tracker_comment_author_workspace_fkey"
    FOREIGN KEY ("author_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_goal"
    ADD CONSTRAINT "client_goal_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_goal"
    ADD CONSTRAINT "client_goal_parameter_workspace_fkey"
    FOREIGN KEY ("parameter_id", "workspace_id")
    REFERENCES "public"."parameter_definition"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_goal"
    ADD CONSTRAINT "client_goal_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."saved_meal"
    ADD CONSTRAINT "saved_meal_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."exercise_library_item"
    ADD CONSTRAINT "exercise_library_item_demo_media_workspace_fkey"
    FOREIGN KEY ("demo_media_id", "workspace_id")
    REFERENCES "public"."media_object"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."exercise_library_item"
    ADD CONSTRAINT "exercise_library_item_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_plan"
    ADD CONSTRAINT "client_plan_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_plan"
    ADD CONSTRAINT "client_plan_updater_workspace_fkey"
    FOREIGN KEY ("updated_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan"
    ADD CONSTRAINT "iifym_plan_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."iifym_plan"
    ADD CONSTRAINT "iifym_plan_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."iifym_plan"
    ADD CONSTRAINT "iifym_plan_draft_saver_workspace_fkey"
    FOREIGN KEY ("draft_saved_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."iifym_plan"
    ADD CONSTRAINT "iifym_plan_timezone_setter_workspace_fkey"
    FOREIGN KEY ("timezone_set_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."iifym_plan_version"
    ADD CONSTRAINT "iifym_plan_version_plan_coherence_fkey"
    FOREIGN KEY ("iifym_plan_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."iifym_plan"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."iifym_plan_version"
    ADD CONSTRAINT "iifym_plan_version_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."iifym_plan_version"
    ADD CONSTRAINT "iifym_plan_version_publisher_workspace_fkey"
    FOREIGN KEY ("published_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."conversation"
    ADD CONSTRAINT "conversation_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message"
    ADD CONSTRAINT "message_conversation_workspace_fkey"
    FOREIGN KEY ("conversation_id", "workspace_id")
    REFERENCES "public"."conversation"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_draft"
    ADD CONSTRAINT "message_draft_conversation_workspace_fkey"
    FOREIGN KEY ("conversation_id", "workspace_id")
    REFERENCES "public"."conversation"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_attachment"
    ADD CONSTRAINT "message_attachment_message_workspace_fkey"
    FOREIGN KEY ("message_id", "workspace_id")
    REFERENCES "public"."message"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."message_attachment"
    ADD CONSTRAINT "message_attachment_media_workspace_fkey"
    FOREIGN KEY ("media_object_id", "workspace_id")
    REFERENCES "public"."media_object"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."message_draft_attachment"
    ADD CONSTRAINT "message_draft_attachment_draft_workspace_fkey"
    FOREIGN KEY ("draft_id", "workspace_id")
    REFERENCES "public"."message_draft"("id", "workspace_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."message_draft_attachment"
    ADD CONSTRAINT "message_draft_attachment_media_workspace_fkey"
    FOREIGN KEY ("media_object_id", "workspace_id")
    REFERENCES "public"."media_object"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_answer_media"
    ADD CONSTRAINT "checkin_answer_media_answer_workspace_fkey"
    FOREIGN KEY ("answer_id", "workspace_id")
    REFERENCES "public"."checkin_submission_answer"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_answer_media"
    ADD CONSTRAINT "checkin_answer_media_media_workspace_fkey"
    FOREIGN KEY ("media_object_id", "workspace_id")
    REFERENCES "public"."media_object"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- CHECKs: workspace settings, client archive provenance, template slot
-- bound, restore windows (D24), kind<->column shapes, content bounds.
-- ---------------------------------------------------------------------

ALTER TABLE "public"."workspace"
    ADD CONSTRAINT "workspace_retention_days_check"
    CHECK ("retention_days" >= 1);
ALTER TABLE "public"."workspace"
    ADD CONSTRAINT "workspace_appearance_accent_check"
    CHECK ("appearance_accent" ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE "public"."client_profile"
    ADD CONSTRAINT "client_profile_height_cm_check"
    CHECK ("height_cm" IS NULL OR "height_cm" > 0);
-- archive_reason is only meaningful together with archived_at.
ALTER TABLE "public"."client_profile"
    ADD CONSTRAINT "client_profile_archive_reason_check"
    CHECK ("archive_reason" IS NULL OR "archived_at" IS NOT NULL);

-- D31: at most four summary parameters in the JSON slot (absent = fine).
ALTER TABLE "public"."coaching_template"
    ADD CONSTRAINT "coaching_template_summary_parameters_check"
    CHECK (("draft" -> 'summaryParameterIds') IS NULL
        OR (jsonb_typeof("draft" -> 'summaryParameterIds') = 'array'
        AND jsonb_array_length("draft" -> 'summaryParameterIds') <= 4));
ALTER TABLE "public"."coaching_template_version"
    ADD CONSTRAINT "coaching_template_version_summary_parameters_check"
    CHECK (("definition" -> 'summaryParameterIds') IS NULL
        OR (jsonb_typeof("definition" -> 'summaryParameterIds') = 'array'
        AND jsonb_array_length("definition" -> 'summaryParameterIds') <= 4));

-- D24: an additional-date removal may be undone until the deadline;
-- the deadline can only exist on a cancelled instance.
ALTER TABLE "public"."checkin_instance"
    ADD CONSTRAINT "checkin_instance_cancel_restore_check"
    CHECK ("cancel_restore_until" IS NULL
        OR ("cancelled_at" IS NOT NULL
        AND "cancel_restore_until" > "cancelled_at"));

-- D24 restore window: deleted_at and restore_until are paired and the
-- deadline must postdate the deletion (coaching_template, coach_note,
-- coach_task, saved_meal).
ALTER TABLE "public"."coaching_template"
    ADD CONSTRAINT "coaching_template_restore_pairing_check"
    CHECK (("deleted_at" IS NULL) = ("restore_until" IS NULL));
ALTER TABLE "public"."coaching_template"
    ADD CONSTRAINT "coaching_template_restore_window_check"
    CHECK ("restore_until" IS NULL OR "restore_until" > "deleted_at");
ALTER TABLE "public"."coach_note"
    ADD CONSTRAINT "coach_note_restore_pairing_check"
    CHECK (("deleted_at" IS NULL) = ("restore_until" IS NULL));
ALTER TABLE "public"."coach_note"
    ADD CONSTRAINT "coach_note_restore_window_check"
    CHECK ("restore_until" IS NULL OR "restore_until" > "deleted_at");
ALTER TABLE "public"."coach_task"
    ADD CONSTRAINT "coach_task_restore_pairing_check"
    CHECK (("deleted_at" IS NULL) = ("restore_until" IS NULL));
ALTER TABLE "public"."coach_task"
    ADD CONSTRAINT "coach_task_restore_window_check"
    CHECK ("restore_until" IS NULL OR "restore_until" > "deleted_at");
ALTER TABLE "public"."saved_meal"
    ADD CONSTRAINT "saved_meal_restore_pairing_check"
    CHECK (("deleted_at" IS NULL) = ("restore_until" IS NULL));
ALTER TABLE "public"."saved_meal"
    ADD CONSTRAINT "saved_meal_restore_window_check"
    CHECK ("restore_until" IS NULL OR "restore_until" > "deleted_at");

ALTER TABLE "public"."media_object"
    ADD CONSTRAINT "media_object_file_name_nonempty_check"
    CHECK (btrim("file_name") <> '');
-- D20: 20 MB cap.
ALTER TABLE "public"."media_object"
    ADD CONSTRAINT "media_object_byte_size_check"
    CHECK ("byte_size" BETWEEN 1 AND 20971520);

ALTER TABLE "public"."coach_note"
    ADD CONSTRAINT "coach_note_body_nonempty_check"
    CHECK (btrim("body") <> '');
-- O13: a GENERAL note is client-readable and must name its client.
ALTER TABLE "public"."coach_note"
    ADD CONSTRAINT "coach_note_visibility_client_check"
    CHECK ("visibility" = 'PRIVATE' OR "client_profile_id" IS NOT NULL);

ALTER TABLE "public"."coach_task"
    ADD CONSTRAINT "coach_task_title_nonempty_check"
    CHECK (btrim("title") <> '');
ALTER TABLE "public"."coach_task"
    ADD CONSTRAINT "coach_task_completion_pairing_check"
    CHECK (("completed_at" IS NULL) = ("completed_by_member_id" IS NULL));

ALTER TABLE "public"."tracker_comment"
    ADD CONSTRAINT "tracker_comment_body_nonempty_check"
    CHECK (btrim("body") <> '');

ALTER TABLE "public"."saved_meal"
    ADD CONSTRAINT "saved_meal_name_nonempty_check"
    CHECK (btrim("name") <> '');

ALTER TABLE "public"."exercise_library_item"
    ADD CONSTRAINT "exercise_library_item_name_nonempty_check"
    CHECK (btrim("name") <> '');

ALTER TABLE "public"."client_plan"
    ADD CONSTRAINT "client_plan_calories_check"
    CHECK ("calories" IS NULL OR "calories" >= 0);
ALTER TABLE "public"."client_plan"
    ADD CONSTRAINT "client_plan_protein_check"
    CHECK ("protein" IS NULL OR "protein" >= 0);
ALTER TABLE "public"."client_plan"
    ADD CONSTRAINT "client_plan_sets_check"
    CHECK ("sets" IS NULL OR "sets" >= 0);
-- Same strings as training_program.program_mode.
ALTER TABLE "public"."client_plan"
    ADD CONSTRAINT "client_plan_program_mode_check"
    CHECK ("program_mode" IN ('WEEK_BASED', 'EVERGREEN'));
ALTER TABLE "public"."client_plan"
    ADD CONSTRAINT "client_plan_weeks_check"
    CHECK ("weeks" >= 1);

-- IIFYM plan mirrors meal_plan (same pairing / revision CHECKs).
ALTER TABLE "public"."iifym_plan"
    ADD CONSTRAINT "iifym_plan_timezone_pairing_check"
    CHECK (("timezone" IS NULL) = ("timezone_set_by_member_id" IS NULL)
       AND ("timezone" IS NULL) = ("timezone_set_at" IS NULL));
ALTER TABLE "public"."iifym_plan"
    ADD CONSTRAINT "iifym_plan_draft_provenance_check"
    CHECK (("draft_saved_by_member_id" IS NULL) = ("draft_updated_at" IS NULL));
ALTER TABLE "public"."iifym_plan"
    ADD CONSTRAINT "iifym_plan_draft_revision_check"
    CHECK ("draft_revision" >= 1);
ALTER TABLE "public"."iifym_plan_version"
    ADD CONSTRAINT "iifym_plan_version_seq_check"
    CHECK ("version_seq" >= 1 AND "publish_origin_revision" >= 1);
ALTER TABLE "public"."iifym_plan_version"
    ADD CONSTRAINT "iifym_plan_version_timezone_check"
    CHECK (length(btrim("effective_timezone")) > 0);

-- Answer kind<->column shape (extended for RATING + VISUAL): exactly the
-- value column set for the declared kind may be non-null. VISUAL carries
-- no value columns; its media live in checkin_answer_media.
ALTER TABLE "public"."checkin_submission_answer"
    DROP CONSTRAINT "checkin_submission_answer_kind_column_check";
ALTER TABLE "public"."checkin_submission_answer"
    ADD CONSTRAINT "checkin_submission_answer_kind_column_check"
    CHECK (
        ("kind" = 'SHORT_TEXT' AND "value_text" IS NOT NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL AND "value_rating" IS NULL)
     OR ("kind" = 'LONG_TEXT' AND "value_text" IS NOT NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL AND "value_rating" IS NULL)
     OR ("kind" = 'NUMBER' AND "value_text" IS NULL AND "value_numeric" IS NOT NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL AND "value_rating" IS NULL)
     OR ("kind" = 'DATE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NOT NULL AND "value_option_ids" IS NULL AND "value_rating" IS NULL)
     OR ("kind" = 'SINGLE_CHOICE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NOT NULL AND "value_rating" IS NULL)
     OR ("kind" = 'MULTI_CHOICE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NOT NULL AND "value_rating" IS NULL)
     OR ("kind" = 'RATING' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL AND "value_rating" IS NOT NULL)
     OR ("kind" = 'VISUAL' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL AND "value_rating" IS NULL)
    );

-- Daily-entry value kind<->column shape covering all ten kinds. Exactly
-- the listed columns may be non-null per branch; T is an optional note
-- for MULTI_CHOICE and CONTEXT, R the rating for LOCATION_RATING.
ALTER TABLE "public"."daily_entry_revision_value"
    DROP CONSTRAINT "daily_entry_revision_value_kind_column_chk";
ALTER TABLE "public"."daily_entry_revision_value"
    ADD CONSTRAINT "daily_entry_revision_value_kind_column_chk" CHECK (
        ("kind" = 'MEASUREMENT'::"public"."ParameterKind"
            AND "value_numeric" IS NOT NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NULL
            AND "value_minutes" IS NULL
            AND "value_systolic" IS NULL
            AND "value_diastolic" IS NULL
            AND "value_option_ids" IS NULL)
        OR ("kind" = 'RATING'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NOT NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NULL
            AND "value_minutes" IS NULL
            AND "value_systolic" IS NULL
            AND "value_diastolic" IS NULL
            AND "value_option_ids" IS NULL)
        OR ("kind" = 'OPTION'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NOT NULL
            AND "value_text" IS NULL
            AND "value_minutes" IS NULL
            AND "value_systolic" IS NULL
            AND "value_diastolic" IS NULL
            AND "value_option_ids" IS NULL)
        OR ("kind" = 'TEXT'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NOT NULL
            AND "value_minutes" IS NULL
            AND "value_systolic" IS NULL
            AND "value_diastolic" IS NULL
            AND "value_option_ids" IS NULL)
        OR ("kind" = 'TIME'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NULL
            AND "value_minutes" IS NOT NULL
            AND "value_minutes" BETWEEN 0 AND 1439
            AND "value_systolic" IS NULL
            AND "value_diastolic" IS NULL
            AND "value_option_ids" IS NULL)
        OR ("kind" = 'DURATION'::"public"."ParameterKind"
            AND "value_numeric" IS NOT NULL
            AND "value_numeric" >= 0
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NULL
            AND "value_minutes" IS NULL
            AND "value_systolic" IS NULL
            AND "value_diastolic" IS NULL
            AND "value_option_ids" IS NULL)
        OR ("kind" = 'BLOOD_PRESSURE'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NULL
            AND "value_minutes" IS NULL
            AND "value_systolic" IS NOT NULL
            AND "value_systolic" > 0
            AND "value_diastolic" IS NOT NULL
            AND "value_diastolic" > 0
            AND "value_option_ids" IS NULL)
        OR ("kind" = 'MULTI_CHOICE'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_minutes" IS NULL
            AND "value_systolic" IS NULL
            AND "value_diastolic" IS NULL
            AND "value_option_ids" IS NOT NULL
            AND jsonb_typeof("value_option_ids") = 'array')
        OR ("kind" = 'LOCATION_RATING'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NOT NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NOT NULL
            AND "value_minutes" IS NULL
            AND "value_systolic" IS NULL
            AND "value_diastolic" IS NULL
            AND "value_option_ids" IS NULL)
        OR ("kind" = 'CONTEXT'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NOT NULL
            AND "value_minutes" IS NULL
            AND "value_systolic" IS NULL
            AND "value_diastolic" IS NULL
            AND "value_option_ids" IS NULL)
    );
