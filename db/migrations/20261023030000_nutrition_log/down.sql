-- FULL-PACKAGE SLICE of #173
-- Reverses 20261023030000_nutrition_log/migration.sql.

DROP TABLE "public"."nutrition_log";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261023030000_nutrition_log';
