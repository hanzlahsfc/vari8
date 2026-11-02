-- Reverses 20261031000000_custom_checkin_field_selection/migration.sql.

ALTER TABLE "public"."checkin_instance"
    DROP COLUMN "field_selection";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261031000000_custom_checkin_field_selection';
