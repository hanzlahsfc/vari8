-- Down for 20261027000018_saved_meal_client_assignment: drops the client
-- ownership columns and their constraints from saved_meal.
ALTER TABLE "public"."saved_meal" DROP CONSTRAINT "saved_meal_client_workspace_fkey";
ALTER TABLE "public"."saved_meal" DROP CONSTRAINT "saved_meal_source_workspace_fkey";
ALTER TABLE "public"."saved_meal" DROP CONSTRAINT "saved_meal_assigned_by_member_id_fkey";
DROP INDEX "public"."saved_meal_workspace_id_client_profile_id_idx";

ALTER TABLE "public"."saved_meal" DROP COLUMN "assigned_at";
ALTER TABLE "public"."saved_meal" DROP COLUMN "assigned_by_member_id";
ALTER TABLE "public"."saved_meal" DROP COLUMN "source_saved_meal_id";
ALTER TABLE "public"."saved_meal" DROP COLUMN "client_profile_id";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027000018_saved_meal_client_assignment';
