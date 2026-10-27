-- Reverses 20261027000012_tracker_day_notes/migration.sql.

DROP TABLE "public"."tracker_day_note";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027000012_tracker_day_notes';
