-- Down for 20261020120100_schema_v2: drops the PR-M0 tables, columns,
-- CHECKs and enum types and restores the pre-PR-M0 kind<->column CHECKs
-- and timestamp(3) identity columns. Run BEFORE
-- 20261020120000_schema_v2_enums/down.sql.

-- Extended kind<->column CHECKs and the definition-slot bound must go
-- before their columns are restored/dropped.
ALTER TABLE "public"."daily_entry_revision_value"
    DROP CONSTRAINT "daily_entry_revision_value_kind_column_chk";
ALTER TABLE "public"."checkin_submission_answer"
    DROP CONSTRAINT "checkin_submission_answer_kind_column_check";
ALTER TABLE "public"."coaching_template"
    DROP CONSTRAINT "coaching_template_summary_parameters_check";
ALTER TABLE "public"."coaching_template_version"
    DROP CONSTRAINT "coaching_template_version_summary_parameters_check";

-- New tables, in dependency order.
DROP TABLE "public"."message_read";
DROP TABLE "public"."message_attachment";
DROP TABLE "public"."message_draft_attachment";
DROP TABLE "public"."message_draft";
DROP TABLE "public"."message";
DROP TABLE "public"."conversation";
DROP TABLE "public"."checkin_answer_media";
DROP TABLE "public"."exercise_library_item";
DROP TABLE "public"."saved_meal";
DROP TABLE "public"."client_goal";
DROP TABLE "public"."tracker_comment";
DROP TABLE "public"."coach_task";
DROP TABLE "public"."coach_note";
DROP TABLE "public"."iifym_plan_version";
DROP TABLE "public"."iifym_plan";
DROP TABLE "public"."client_plan";

-- Added columns on existing tables (dependent CHECKs and indexes drop
-- with their columns; workspace drops its logo FK pair with the column).
ALTER TABLE "public"."workspace"
    DROP COLUMN "logo_media_id",
    DROP COLUMN "retention_days",
    DROP COLUMN "appearance_mode",
    DROP COLUMN "appearance_accent",
    DROP COLUMN "appearance_font",
    DROP COLUMN "appearance_density",
    DROP COLUMN "availability_text",
    DROP COLUMN "notifications_enabled",
    DROP COLUMN "priority_notifications_enabled",
    DROP COLUMN "studio_dashboard_draft",
    DROP COLUMN "studio_dashboard_draft_revision";
ALTER TABLE "public"."workspace_member"
    DROP COLUMN "sidebar_collapsed";
ALTER TABLE "public"."client_profile"
    DROP COLUMN "label",
    DROP COLUMN "coaching_since",
    DROP COLUMN "height_cm",
    DROP COLUMN "archived_at",
    DROP COLUMN "archive_reason",
    DROP COLUMN "priority_messages_allowed";
ALTER TABLE "public"."coaching_template"
    DROP COLUMN "description",
    DROP COLUMN "deleted_at",
    DROP COLUMN "restore_until";
ALTER TABLE "public"."habits"
    DROP COLUMN "reason";
ALTER TABLE "public"."checkin_instance"
    DROP COLUMN "coach_note",
    DROP COLUMN "cancel_restore_until";
ALTER TABLE "public"."checkin_submission_answer"
    DROP COLUMN "value_rating";
ALTER TABLE "public"."daily_entry_revision_value"
    DROP COLUMN "value_minutes",
    DROP COLUMN "value_systolic",
    DROP COLUMN "value_diastolic",
    DROP COLUMN "value_option_ids";
DROP TABLE "public"."media_object";

-- Composite coherence target added for checkin_answer_media (dropped
-- after the referencing table is gone).
DROP INDEX "public"."checkin_submission_answer_id_workspace_id_key";

-- Restore the pre-PR-M0 kind<->column CHECKs.
ALTER TABLE "public"."daily_entry_revision_value"
    ADD CONSTRAINT "daily_entry_revision_value_kind_column_chk" CHECK (
        ("kind" = 'MEASUREMENT'::"public"."ParameterKind"
            AND "value_numeric" IS NOT NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NULL)
        OR ("kind" = 'RATING'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NOT NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NULL)
        OR ("kind" = 'OPTION'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NOT NULL
            AND "value_text" IS NULL)
        OR ("kind" = 'TEXT'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NOT NULL)
    );

ALTER TABLE "public"."checkin_submission_answer"
    ADD CONSTRAINT "checkin_submission_answer_kind_column_check"
    CHECK (
        ("kind" = 'SHORT_TEXT' AND "value_text" IS NOT NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL)
     OR ("kind" = 'LONG_TEXT' AND "value_text" IS NOT NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL)
     OR ("kind" = 'NUMBER' AND "value_text" IS NULL AND "value_numeric" IS NOT NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL)
     OR ("kind" = 'DATE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NOT NULL AND "value_option_ids" IS NULL)
     OR ("kind" = 'SINGLE_CHOICE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NOT NULL)
     OR ("kind" = 'MULTI_CHOICE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NOT NULL)
    );

-- Identity timestamps: back to the prior Prisma default timestamp(3).
ALTER TABLE "public"."users"
    ALTER COLUMN "created_at" TYPE timestamp(3) USING "created_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "updated_at" TYPE timestamp(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."sessions"
    ALTER COLUMN "expires_at" TYPE timestamp(3) USING "expires_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "created_at" TYPE timestamp(3) USING "created_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "updated_at" TYPE timestamp(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."accounts"
    ALTER COLUMN "access_token_expires_at" TYPE timestamp(3) USING "access_token_expires_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "refresh_token_expires_at" TYPE timestamp(3) USING "refresh_token_expires_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "created_at" TYPE timestamp(3) USING "created_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "updated_at" TYPE timestamp(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."verifications"
    ALTER COLUMN "expires_at" TYPE timestamp(3) USING "expires_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "created_at" TYPE timestamp(3) USING "created_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "updated_at" TYPE timestamp(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."workspace"
    ALTER COLUMN "created_at" TYPE timestamp(3) USING "created_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "updated_at" TYPE timestamp(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."workspace_member"
    ALTER COLUMN "created_at" TYPE timestamp(3) USING "created_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "updated_at" TYPE timestamp(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."coach_profile"
    ALTER COLUMN "created_at" TYPE timestamp(3) USING "created_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "updated_at" TYPE timestamp(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."client_profile"
    ALTER COLUMN "created_at" TYPE timestamp(3) USING "created_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "updated_at" TYPE timestamp(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "public"."client_assignment"
    ALTER COLUMN "assigned_at" TYPE timestamp(3) USING "assigned_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "created_at" TYPE timestamp(3) USING "created_at" AT TIME ZONE 'UTC',
    ALTER COLUMN "updated_at" TYPE timestamp(3) USING "updated_at" AT TIME ZONE 'UTC';

DROP TYPE "public"."AppearanceMode";
DROP TYPE "public"."AppearanceFont";
DROP TYPE "public"."AppearanceDensity";
DROP TYPE "public"."CoachNoteVisibility";
DROP TYPE "public"."MessageSenderKind";
DROP TYPE "public"."MediaKind";
DROP TYPE "public"."PlanNutritionVariant";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261020120100_schema_v2';
