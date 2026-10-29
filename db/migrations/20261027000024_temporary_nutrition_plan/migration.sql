-- W2-N9: temporary nutrition plans - dated short plans (refeed windows,
-- diet breaks, event weeks) a coach layers on top of the running nutrition
-- plan. One row per temporary plan; there is no draft/publish chain. The
-- `plan` column is an opaque MealPlan|IifymPlan payload the service does
-- not re-validate per source.
--
-- 1. Closed enum columns for kind and source (the frontend wire labels
--    "diet-break"/"mealPlan" map to enum values in the service).
-- 2. Composite coherence FKs (client, creator pinned to the row's
--    workspace) matching the meal_plan family convention.
-- 3. Same-source date-overlap is a service guard inside the serialized
--    per-client advisory lock, not a DB constraint.
-- 4. RESTRICT deletes everywhere - plan history is never cascade-removed.

CREATE TYPE "public"."TemporaryNutritionKind" AS ENUM ('REFEED', 'DIET_BREAK', 'CUSTOM');
CREATE TYPE "public"."TemporaryNutritionSource" AS ENUM ('MEAL_PLAN', 'IIFYM');

CREATE TABLE "public"."temporary_nutrition_plan" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "kind" "public"."TemporaryNutritionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "source" "public"."TemporaryNutritionSource" NOT NULL,
    "plan" JSONB NOT NULL,
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "temporary_nutrition_plan_pkey" PRIMARY KEY ("id")
);

-- Composite coherence target + client selection index.
CREATE UNIQUE INDEX "temporary_nutrition_plan_id_workspace_id_client_profile_id_key" ON "public"."temporary_nutrition_plan"("id", "workspace_id", "client_profile_id");
CREATE INDEX "temporary_nutrition_plan_workspace_id_client_profile_id_idx" ON "public"."temporary_nutrition_plan"("workspace_id", "client_profile_id");

-- Field CHECKs: a non-blank label and a closed, ordered date range. The
-- 28-day bound and same-source overlap live in the service.
ALTER TABLE "public"."temporary_nutrition_plan"
    ADD CONSTRAINT "temporary_nutrition_plan_label_check"
    CHECK (length(btrim("label")) > 0);
ALTER TABLE "public"."temporary_nutrition_plan"
    ADD CONSTRAINT "temporary_nutrition_plan_date_range_check"
    CHECK ("end_date" >= "start_date");

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."temporary_nutrition_plan" ADD CONSTRAINT "temporary_nutrition_plan_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."temporary_nutrition_plan" ADD CONSTRAINT "temporary_nutrition_plan_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."temporary_nutrition_plan" ADD CONSTRAINT "temporary_nutrition_plan_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/provenance coherence claim.
ALTER TABLE "public"."temporary_nutrition_plan"
    ADD CONSTRAINT "temporary_nutrition_plan_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."temporary_nutrition_plan"
    ADD CONSTRAINT "temporary_nutrition_plan_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
