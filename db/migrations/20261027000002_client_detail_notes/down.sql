-- Down for 20261027000002_client_detail_notes: drops the two new tables and
-- the coach_note pinned column.

DROP TABLE "public"."client_week_note";
DROP TABLE "public"."client_phase";

ALTER TABLE "public"."coach_note" DROP CONSTRAINT "coach_note_pinned_visibility_check";
ALTER TABLE "public"."coach_note" DROP COLUMN "pinned";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261027000002_client_detail_notes';
