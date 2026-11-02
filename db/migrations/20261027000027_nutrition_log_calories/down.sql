-- Reverses 20261027000027_nutrition_log_calories/migration.sql.

ALTER TABLE "public"."nutrition_log"
    DROP CONSTRAINT "nutrition_log_calories_check";

ALTER TABLE "public"."nutrition_log"
    DROP COLUMN "calories";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027000027_nutrition_log_calories';
