-- FULL-PACKAGE SLICE of #176
-- Reverses 20261023040000_training_log/migration.sql.

DROP TABLE "public"."training_set_log";
DROP TABLE "public"."training_session_log";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261023040000_training_log';
