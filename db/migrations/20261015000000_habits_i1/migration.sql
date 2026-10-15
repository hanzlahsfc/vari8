-- HABITS-I1 (decision #110): staff-configured client habits. Many habits per
-- client; effective-dated weekday schedules (server-computed boundaries only);
-- one log state per habit/day. RESTRICT everywhere; the composite coherence
-- FK + content CHECKs are raw SQL (reviewed HABITS-P4 / P4-R1).

CREATE TYPE "public"."HabitLogStatus" AS ENUM ('DONE', 'SKIPPED');

-- 1. Prisma-declared tables
CREATE TABLE "public"."habits" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "target" VARCHAR(120) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "habits_id_workspace_id_key"
    ON "public"."habits"("id", "workspace_id");
CREATE INDEX "habits_workspace_id_client_profile_id_idx"
    ON "public"."habits"("workspace_id", "client_profile_id");

CREATE TABLE "public"."habit_schedules" (
    "id" TEXT NOT NULL,
    "habit_id" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "weekdays" SMALLINT NOT NULL,
    "end_date" DATE,

    CONSTRAINT "habit_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "habit_schedules_habit_id_effective_from_key"
    ON "public"."habit_schedules"("habit_id", "effective_from");

CREATE TABLE "public"."habit_logs" (
    "id" TEXT NOT NULL,
    "habit_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "public"."HabitLogStatus" NOT NULL,
    "logged_by_user_id" TEXT,
    "logged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "habit_logs_habit_id_date_key"
    ON "public"."habit_logs"("habit_id", "date");

-- 2. Prisma-declared single-column relations (RESTRICT; the loggedBy
--    provenance pointer follows the ConsentRecord.grantedBy /
--    ClientTask.completedBy SetNull precedent).
ALTER TABLE "public"."habits"
    ADD CONSTRAINT "habits_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."habits"
    ADD CONSTRAINT "habits_client_profile_id_fkey"
    FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."habit_schedules"
    ADD CONSTRAINT "habit_schedules_habit_id_fkey"
    FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_habit_id_fkey"
    FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."habit_logs"
    ADD CONSTRAINT "habit_logs_logged_by_user_id_fkey"
    FOREIGN KEY ("logged_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Raw SQL — same-workspace coherence + content invariants.

-- The habit's client profile must live in the same workspace.
ALTER TABLE "public"."habits"
    ADD CONSTRAINT "habits_client_coherence_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bounded, trimmed non-empty coaching metadata.
ALTER TABLE "public"."habits"
    ADD CONSTRAINT "habits_name_nonempty_chk"
    CHECK (btrim("name") <> '' AND length(btrim("name")) <= 120);
ALTER TABLE "public"."habits"
    ADD CONSTRAINT "habits_target_nonempty_chk"
    CHECK (btrim("target") <> '' AND length(btrim("target")) <= 120);

-- Weekday bitmask range: 0 is reserved for archive boundaries written by
-- the dedicated archive operation; service-layer create/edit rejects 0.
ALTER TABLE "public"."habit_schedules"
    ADD CONSTRAINT "habit_schedules_weekdays_range_chk"
    CHECK ("weekdays" >= 0 AND "weekdays" <= 127);

-- An end boundary cannot precede its own effective date.
ALTER TABLE "public"."habit_schedules"
    ADD CONSTRAINT "habit_schedules_end_after_start_chk"
    CHECK ("end_date" IS NULL OR "end_date" >= "effective_from");

-- CAS revision is monotonic from 1 — never zero/negative.
ALTER TABLE "public"."habits"
    ADD CONSTRAINT "habits_revision_positive_chk"
    CHECK ("revision" > 0);
