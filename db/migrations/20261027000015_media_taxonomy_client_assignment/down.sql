-- Down for 20261027000015_media_taxonomy_client_assignment: drops the
-- assignment table, then the owner column and its constraint.
DROP TABLE "public"."media_assignment";

ALTER TABLE "public"."media_object" DROP CONSTRAINT "media_object_client_workspace_fkey";
DROP INDEX "public"."media_object_workspace_id_client_profile_id_idx";
ALTER TABLE "public"."media_object" DROP COLUMN "client_profile_id";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027000015_media_taxonomy_client_assignment';
