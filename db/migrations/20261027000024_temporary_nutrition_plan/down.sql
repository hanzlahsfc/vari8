-- Down for 20261027000024_temporary_nutrition_plan: drops the table and the
-- two closed enum types in reverse dependency order.
DROP TABLE "public"."temporary_nutrition_plan";
DROP TYPE "public"."TemporaryNutritionSource";
DROP TYPE "public"."TemporaryNutritionKind";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027000024_temporary_nutrition_plan';
