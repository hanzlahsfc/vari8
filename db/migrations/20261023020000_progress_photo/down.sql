-- Down for 20261023020000_progress_photo: drops the progress-photo entry
-- table. media_object rows it referenced are untouched by design.
DROP TABLE "public"."progress_photo_entry";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261023020000_progress_photo';
