-- FULL-PACKAGE SLICE of #173
-- Card 09: daily nutrition actuals over daily entries.
--
-- 1. nutrition_log: one row per daily_entry carrying the day's recorded
--    macros. protein / carbohydrate / fat are independently nullable -
--    NULL is "not recorded", never zero. There is no calories column on
--    purpose: kcal derives at read time (4/4/9) per the owner decision.
-- 2. The log is pinned to the day entry, not to any template pin or
--    nutrition mode, so switching a client between meal plan and macro
--    counting keeps earlier entries.
-- 3. A composite coherence FK binds (workspace_id, client_profile_id,
--    entry_date) to the same daily_entry tuple; content CHECKs bound each
--    present macro to [0, 10000] grams.

CREATE TABLE "public"."nutrition_log" (
    "id" TEXT NOT NULL,
    "daily_entry_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "protein" NUMERIC(9, 3),
    "carbohydrate" NUMERIC(9, 3),
    "fat" NUMERIC(9, 3),
    "created_by_member_id" TEXT NOT NULL,
    "updated_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nutrition_log_pkey" PRIMARY KEY ("id")
);

-- Cardinality + composite coherence targets.
CREATE UNIQUE INDEX "nutrition_log_daily_entry_id_key" ON "public"."nutrition_log"("daily_entry_id");
CREATE UNIQUE INDEX "nutrition_log_workspace_id_client_profile_id_entry_date_key" ON "public"."nutrition_log"("workspace_id", "client_profile_id", "entry_date");
CREATE UNIQUE INDEX "nutrition_log_id_workspace_id_key" ON "public"."nutrition_log"("id", "workspace_id");

-- Selection indexes.
CREATE INDEX "nutrition_log_client_profile_id_entry_date_idx" ON "public"."nutrition_log"("client_profile_id", "entry_date");

-- Content CHECKs: a present macro is a finite gram amount in [0, 10000].
ALTER TABLE "public"."nutrition_log" ADD CONSTRAINT "nutrition_log_protein_check" CHECK ("protein" IS NULL OR ("protein" >= 0 AND "protein" <= 10000));
ALTER TABLE "public"."nutrition_log" ADD CONSTRAINT "nutrition_log_carbohydrate_check" CHECK ("carbohydrate" IS NULL OR ("carbohydrate" >= 0 AND "carbohydrate" <= 10000));
ALTER TABLE "public"."nutrition_log" ADD CONSTRAINT "nutrition_log_fat_check" CHECK ("fat" IS NULL OR ("fat" >= 0 AND "fat" <= 10000));

-- Declared foreign keys. The day-tuple composite FK ties the log's
-- workspace/client/date to the same daily_entry row it hangs off, so a
-- log can never drift to a different client or day than its entry.
ALTER TABLE "public"."nutrition_log" ADD CONSTRAINT "nutrition_log_daily_entry_id_fkey" FOREIGN KEY ("daily_entry_id") REFERENCES "public"."daily_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."nutrition_log" ADD CONSTRAINT "nutrition_log_entry_day_coherence_fkey" FOREIGN KEY ("workspace_id", "client_profile_id", "entry_date") REFERENCES "public"."daily_entry"("workspace_id", "client_profile_id", "entry_date") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."nutrition_log" ADD CONSTRAINT "nutrition_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."nutrition_log" ADD CONSTRAINT "nutrition_log_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."nutrition_log" ADD CONSTRAINT "nutrition_log_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."nutrition_log" ADD CONSTRAINT "nutrition_log_updated_by_member_id_fkey" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
