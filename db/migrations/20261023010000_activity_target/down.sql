-- Down for 20261023010000_activity_target: drops the activity_target table
-- and the ActivityTargetKind enum.
DROP TABLE "public"."activity_target";
DROP TYPE "public"."ActivityTargetKind";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261023010000_activity_target';
