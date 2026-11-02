-- Reverses 20261027000023_tracker_columns/migration.sql.

ALTER TABLE "public"."parameter_definition"
    DROP CONSTRAINT "parameter_definition_decimals_shape",
    DROP CONSTRAINT "parameter_definition_summary_shape";

ALTER TABLE "public"."parameter_definition"
    DROP COLUMN "decimals",
    DROP COLUMN "summary";

ALTER TABLE "public"."nutrition_log"
    DROP COLUMN "day_type",
    DROP COLUMN "plan_followed";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027000023_tracker_columns';
