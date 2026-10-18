-- TRAINING-I1B-1 — program mode: WEEK_BASED (existing semantics) or
-- EVERGREEN (ongoing, single prescription week, replacement-only end).
-- Existing rows backfill to WEEK_BASED via the default.
ALTER TABLE "training_program"
  ADD COLUMN "program_mode" TEXT NOT NULL DEFAULT 'WEEK_BASED'
  CHECK ("program_mode" IN ('WEEK_BASED', 'EVERGREEN'));
