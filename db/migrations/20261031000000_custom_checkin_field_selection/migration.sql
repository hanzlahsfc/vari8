-- P607 (Custom check-ins): checkin_instance gains field_selection, the
-- per-instance subset of the pinned published form's fields the coach
-- asked the athlete to answer. NULL means Full — the instance renders
-- every field of its pinned form version, so existing rows need no
-- backfill and Full/NULL behavior is unchanged. The column is a JSONB
-- array of fieldIds; service-layer validation bounds it to a non-empty
-- deduped subset of the pinned definition.

ALTER TABLE "public"."checkin_instance"
    ADD COLUMN "field_selection" jsonb DEFAULT NULL;
