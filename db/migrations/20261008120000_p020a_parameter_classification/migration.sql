-- P-020A: parameter data-classification foundation (product-decisions #64,
-- #73, #78 + P-020 binding correctness constraints).
--
-- 1. Closed nullable classification enum — NO default, NO backfill; every
--    existing row remains NULL until the explicit audited one-time
--    classification action performs a permitted NULL→GENERAL_HEALTH or
--    NULL→CYCLE transition. BLOODWORK and PED_HRT exist in the vocabulary so
--    they can be identified/excluded in future specialist slices; no
--    application role may assign them through this slice.
-- 2. Classification never authorizes data collection; DailyEntry structural
--    eligibility is computed from immutable published-version snapshots.

CREATE TYPE "public"."ParameterDataClassification" AS ENUM ('GENERAL_HEALTH', 'CYCLE', 'BLOODWORK', 'PED_HRT');

ALTER TABLE "public"."parameter_definition"
    ADD COLUMN "data_classification" "public"."ParameterDataClassification";
