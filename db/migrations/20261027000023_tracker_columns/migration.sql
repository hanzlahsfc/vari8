-- W2-T12 (audit rows T1 + T2): tracker column fields.
-- T1: parameter_definition gains decimals and summary, the display
--     metadata the frontend column model already declares. Closed sets
--     are enforced by CHECK, matching the raw SQL convention for
--     invariants Prisma cannot express.
-- T2: nutrition_log gains day_type and plan_followed, the day-level
--     nutrition state the client renders. All four columns are nullable:
--     NULL reads as not recorded, and no existing row gets a guessed
--     value, so no default or backfill is needed.

ALTER TABLE "public"."parameter_definition"
    ADD COLUMN "decimals" INTEGER,
    ADD COLUMN "summary" TEXT;

ALTER TABLE "public"."parameter_definition"
    ADD CONSTRAINT "parameter_definition_decimals_shape"
    CHECK ("decimals" IS NULL OR "decimals" IN (0, 1, 2));

ALTER TABLE "public"."parameter_definition"
    ADD CONSTRAINT "parameter_definition_summary_shape"
    CHECK ("summary" IS NULL OR "summary" IN ('avg', 'sum', 'count', 'none'));

ALTER TABLE "public"."nutrition_log"
    ADD COLUMN "day_type" TEXT,
    ADD COLUMN "plan_followed" BOOLEAN;
