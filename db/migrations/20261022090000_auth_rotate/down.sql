-- Reverses 20261022090000_auth_rotate (migration.sql), newest object first.
DROP TABLE "public"."spent_refresh_tokens";
DROP INDEX "public"."sessions_family_id_idx";
ALTER TABLE "public"."sessions" DROP COLUMN "family_id";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261022090000_auth_rotate';
