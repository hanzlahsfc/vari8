-- Phase 2.2: additive Exercise Database catalog + import provenance.
--
-- No existing table, column, or constraint is modified. Three new tables back
-- (1) the imported reference catalog, (2) one provenance row per import run,
-- and (3) a machine-readable outcome row per candidate source row.
--
-- `pg_trgm` provides the bounded substring-search index on `name`
-- (GIN), which Prisma cannot express in the datamodel; keep `migrate deploy`
-- and do NOT let `migrate dev` drop it. The extension is standard PostgreSQL
-- and was already enabled by migration 20261001100000 (IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "ExerciseImportOutcome" AS ENUM ('IMPORTED', 'REJECTED', 'DUPLICATE');

-- CreateTable
CREATE TABLE "exercise_catalog_item" (
    "id" TEXT NOT NULL,
    "source_id" INTEGER NOT NULL,
    "row_fingerprint" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "muscle_group" TEXT,
    "primary_target" TEXT,
    "additional_targets" TEXT,
    "equipment" TEXT,
    "movement_pattern" TEXT,
    "position_setup" TEXT,
    "cues" TEXT,
    "video_link" TEXT,
    "first_imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exercise_catalog_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_import_run" (
    "id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_fingerprint" TEXT NOT NULL,
    "scanned_row_count" INTEGER NOT NULL,
    "source_row_count" INTEGER NOT NULL,
    "ignored_empty_row_count" INTEGER NOT NULL,
    "accepted_count" INTEGER NOT NULL,
    "rejected_count" INTEGER NOT NULL,
    "duplicate_count" INTEGER NOT NULL,
    "inserted_count" INTEGER NOT NULL,
    "updated_count" INTEGER NOT NULL,
    "unchanged_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_import_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_import_row_outcome" (
    "id" TEXT NOT NULL,
    "import_run_id" TEXT NOT NULL,
    "source_row" INTEGER NOT NULL,
    "source_id" INTEGER,
    "outcome" "ExerciseImportOutcome" NOT NULL,
    "reason_code" TEXT,
    "reason_field" TEXT,

    CONSTRAINT "exercise_import_row_outcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercise_catalog_item_source_id_key" ON "exercise_catalog_item"("source_id");

-- CreateIndex
CREATE INDEX "exercise_catalog_item_muscle_group_idx" ON "exercise_catalog_item"("muscle_group");

-- CreateIndex
CREATE INDEX "exercise_catalog_item_equipment_idx" ON "exercise_catalog_item"("equipment");

-- CreateIndex: bounded case-insensitive substring search over source `Exercise Name`.
CREATE INDEX "exercise_catalog_item_name_trgm_idx" ON "exercise_catalog_item" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "exercise_import_run_source_fingerprint_idx" ON "exercise_import_run"("source_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_import_row_outcome_import_run_id_source_row_key" ON "exercise_import_row_outcome"("import_run_id", "source_row");

-- CreateIndex
CREATE INDEX "exercise_import_row_outcome_import_run_id_outcome_idx" ON "exercise_import_row_outcome"("import_run_id", "outcome");

-- AddForeignKey
ALTER TABLE "exercise_import_row_outcome" ADD CONSTRAINT "exercise_import_row_outcome_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "exercise_import_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
