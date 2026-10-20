-- Down for 20261020120000_schema_v2_enums: rebuilds ParameterKind and
-- CheckInAnswerKind with their pre-PR-M0 value lists. Run AFTER
-- 20261020120100_schema_v2/down.sql. This script only succeeds when no
-- stored row uses a removed value - the USING cast fails loudly
-- otherwise; delete or rewrite those rows first.

-- The kind/column CHECKs cast literals to the enum types; they depend on
-- the type and are re-added unchanged after the rebuild.
ALTER TABLE "public"."daily_entry_revision_value"
    DROP CONSTRAINT "daily_entry_revision_value_kind_column_chk";
ALTER TABLE "public"."checkin_submission_answer"
    DROP CONSTRAINT "checkin_submission_answer_kind_column_check";

ALTER TYPE "public"."ParameterKind" RENAME TO "ParameterKind_old";
CREATE TYPE "public"."ParameterKind" AS ENUM ('MEASUREMENT', 'RATING', 'TIME', 'DURATION', 'OPTION', 'TEXT');
ALTER TABLE "public"."parameter_definition"
    ALTER COLUMN "kind" TYPE "public"."ParameterKind"
    USING "kind"::text::"public"."ParameterKind";
ALTER TABLE "public"."daily_entry_revision_value"
    ALTER COLUMN "kind" TYPE "public"."ParameterKind"
    USING "kind"::text::"public"."ParameterKind";
DROP TYPE "public"."ParameterKind_old";

ALTER TYPE "public"."CheckInAnswerKind" RENAME TO "CheckInAnswerKind_old";
CREATE TYPE "public"."CheckInAnswerKind" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_CHOICE', 'MULTI_CHOICE');
ALTER TABLE "public"."checkin_submission_answer"
    ALTER COLUMN "kind" TYPE "public"."CheckInAnswerKind"
    USING "kind"::text::"public"."CheckInAnswerKind";
DROP TYPE "public"."CheckInAnswerKind_old";

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

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261020120000_schema_v2_enums';
