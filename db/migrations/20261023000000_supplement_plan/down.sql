-- Down for 20261023000000_supplement_plan: drops the PR-SUPP tables and
-- the SupplementItemStatus enum.
DROP TABLE "public"."supplement_plan_item";
DROP TABLE "public"."supplement_plan";
DROP TYPE "public"."SupplementItemStatus";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261023000000_supplement_plan';
