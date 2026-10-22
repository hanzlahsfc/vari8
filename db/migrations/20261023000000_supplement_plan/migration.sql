-- PR-SUPP: saved supplement plan per client (schedule-only contract,
-- approved FRONTEND supplements brief).
--
-- 1. supplement_plan: one container per client profile — latest-saved
--    whole-plan semantics, revision CAS, saver/instant provenance.
-- 2. supplement_plan_item: ordered rows carrying the embedded catalogue
--    snapshot the coach saw at save time (product_ref_id is a reference
--    label, never a foreign key: catalogue changes must never alter a
--    saved prescription).
-- 3. Raw composite coherence FKs pin every item/member tuple to its
--    workspace; content CHECKs bound quantity and text fields.
-- 4. Item rows CASCADE with their plan (whole-plan replace deletes them
--    in-transaction); plan/provenance FKs are RESTRICT.

CREATE TYPE "public"."SupplementItemStatus" AS ENUM ('MUST_HAVE', 'OPTIONAL', 'NONE');

CREATE TABLE "public"."supplement_plan" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "saved_by_member_id" TEXT,
    "saved_at" TIMESTAMPTZ(6),
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplement_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."supplement_plan_item" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "item_ref_id" TEXT,
    "product_ref_id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "reference_quantity" NUMERIC(14, 4),
    "quantity_unit" TEXT,
    "declared_amount" NUMERIC(14, 4),
    "declared_unit" TEXT,
    "product_url" TEXT,
    "quantity" NUMERIC(14, 4) NOT NULL,
    "dose_unit" TEXT NOT NULL,
    "timing" TEXT NOT NULL,
    "status" "public"."SupplementItemStatus" NOT NULL,
    "notes" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplement_plan_item_pkey" PRIMARY KEY ("id")
);

-- Cardinality + composite coherence targets.
CREATE UNIQUE INDEX "supplement_plan_client_profile_id_key" ON "public"."supplement_plan"("client_profile_id");
CREATE UNIQUE INDEX "supplement_plan_id_workspace_id_key" ON "public"."supplement_plan"("id", "workspace_id");
CREATE UNIQUE INDEX "supplement_plan_id_workspace_id_client_profile_id_key" ON "public"."supplement_plan"("id", "workspace_id", "client_profile_id");
CREATE UNIQUE INDEX "supplement_plan_item_plan_id_position_key" ON "public"."supplement_plan_item"("plan_id", "position");
CREATE UNIQUE INDEX "supplement_plan_item_id_workspace_id_key" ON "public"."supplement_plan_item"("id", "workspace_id");

-- Selection indexes.
CREATE INDEX "supplement_plan_workspace_id_idx" ON "public"."supplement_plan"("workspace_id");
CREATE INDEX "supplement_plan_item_plan_id_idx" ON "public"."supplement_plan_item"("plan_id");
CREATE INDEX "supplement_plan_item_workspace_id_idx" ON "public"."supplement_plan_item"("workspace_id");

-- Content CHECKs: positive quantity, bounded text, closed position.
ALTER TABLE "public"."supplement_plan" ADD CONSTRAINT "supplement_plan_revision_check" CHECK ("revision" > 0);
ALTER TABLE "public"."supplement_plan" ADD CONSTRAINT "supplement_plan_name_check" CHECK (char_length("name") BETWEEN 1 AND 120);
ALTER TABLE "public"."supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "public"."supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_reference_quantity_check" CHECK ("reference_quantity" IS NULL OR "reference_quantity" > 0);
ALTER TABLE "public"."supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_declared_amount_check" CHECK ("declared_amount" IS NULL OR "declared_amount" >= 0);
ALTER TABLE "public"."supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_position_check" CHECK ("position" >= 0);
ALTER TABLE "public"."supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_timing_check" CHECK (char_length("timing") <= 200);
ALTER TABLE "public"."supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_notes_check" CHECK (char_length("notes") <= 2000);

-- Declared foreign keys.
ALTER TABLE "public"."supplement_plan" ADD CONSTRAINT "supplement_plan_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."supplement_plan" ADD CONSTRAINT "supplement_plan_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."supplement_plan" ADD CONSTRAINT "supplement_plan_saved_by_member_id_fkey" FOREIGN KEY ("saved_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."supplement_plan" ADD CONSTRAINT "supplement_plan_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."supplement_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/provenance coherence claim.
ALTER TABLE "public"."supplement_plan"
    ADD CONSTRAINT "supplement_plan_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."supplement_plan"
    ADD CONSTRAINT "supplement_plan_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."supplement_plan"
    ADD CONSTRAINT "supplement_plan_saver_workspace_fkey"
    FOREIGN KEY ("saved_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."supplement_plan_item"
    ADD CONSTRAINT "supplement_plan_item_plan_coherence_fkey"
    FOREIGN KEY ("plan_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."supplement_plan"("id", "workspace_id", "client_profile_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."supplement_plan_item"
    ADD CONSTRAINT "supplement_plan_item_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
