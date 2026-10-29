-- W2-T13 (audit row T3 + the T2 write-path gap): nutrition_log gains a
-- stored calories column beside day_type and plan_followed, and the
-- service write path persists all three. The column is nullable: NULL
-- reads as not recorded, no existing row gets a guessed value, so no
-- default or backfill is needed. Rows without stored calories keep the
-- 4/4/9 derivation as the display fallback.
--
-- The CHECK bounds a present kcal to [0, 10000], the same range the
-- service-side MAX_CALORIES_KCAL constant enforces.

ALTER TABLE "public"."nutrition_log"
    ADD COLUMN "calories" NUMERIC(9, 3);

ALTER TABLE "public"."nutrition_log"
    ADD CONSTRAINT "nutrition_log_calories_check"
    CHECK ("calories" IS NULL OR ("calories" >= 0 AND "calories" <= 10000));
