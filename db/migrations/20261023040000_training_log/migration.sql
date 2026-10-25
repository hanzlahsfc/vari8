-- PR-M10 (#176): the client's performed training-session log.
--
-- training_session_log: one row per session occurrence — the natural key
-- (workspace, client, program, session, booked week, performed date) is the
-- resume/replay identity. pinned_version_id + session_id + booked_week are
-- resolved ONCE at start: a later publish leaves this row beside the old
-- prescription, never rewriting history. performed_date is a declared
-- local calendar date under the program's immutable anchor timezone — a
-- date, never an instant. Status carries the terminal states explicitly
-- (skipped and partial sessions are states, not zeros).
--
-- training_set_log: one row per logged set. The set payload is the
-- validated SetLogEntry shape (M6/PR #116) stored as JSONB — whatever
-- actuals the coach's own template defines, never one column per field.
-- set_key ("p:{prescribedSetId}" or "a:{client-added id}") with the
-- (session_log, exercise, set_key) unique is the idempotency authority:
-- saving the same set twice updates the row instead of doubling.
--
-- Composite coherence FKs and CHECKs follow the established raw-SQL
-- convention. Restrict FKs — logged history is never cascade-deleted.

CREATE TABLE "public"."training_session_log" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "pinned_version_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "booked_week" INTEGER NOT NULL,
    "performed_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_session_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."training_set_log" (
    "id" TEXT NOT NULL,
    "session_log_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "set_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "actuals" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_set_log_pkey" PRIMARY KEY ("id")
);

-- One log per session occurrence — start/resume idempotency key.
CREATE UNIQUE INDEX "training_session_log_natural_key"
    ON "public"."training_session_log"("workspace_id", "client_profile_id", "program_id", "session_id", "booked_week", "performed_date");
-- Composite coherence target for the raw set-log FK.
CREATE UNIQUE INDEX "training_session_log_id_workspace_id_client_profile_id_key"
    ON "public"."training_session_log"("id", "workspace_id", "client_profile_id");
CREATE INDEX "training_session_log_client_date_idx"
    ON "public"."training_session_log"("workspace_id", "client_profile_id", "performed_date");

-- One row per logged set — the per-set save idempotency key.
CREATE UNIQUE INDEX "training_set_log_set_key"
    ON "public"."training_set_log"("session_log_id", "exercise_id", "set_key");
CREATE INDEX "training_set_log_client_idx"
    ON "public"."training_set_log"("workspace_id", "client_profile_id");

-- Field CHECKs.
ALTER TABLE "public"."training_session_log"
    ADD CONSTRAINT "training_session_log_status_check"
    CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'SKIPPED'));
ALTER TABLE "public"."training_session_log"
    ADD CONSTRAINT "training_session_log_booked_week_check"
    CHECK ("booked_week" >= 1);
-- Terminal pairing: completed_at is set exactly on the terminal states.
ALTER TABLE "public"."training_session_log"
    ADD CONSTRAINT "training_session_log_completed_pairing_check"
    CHECK (("completed_at" IS NULL) = ("status" = 'IN_PROGRESS'));
ALTER TABLE "public"."training_set_log"
    ADD CONSTRAINT "training_set_log_set_key_check"
    CHECK ("set_key" ~ '^[pa]:[A-Za-z0-9_-]{1,64}$');
ALTER TABLE "public"."training_set_log"
    ADD CONSTRAINT "training_set_log_position_check"
    CHECK ("position" >= 0 AND "position" < 40);

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."training_session_log" ADD CONSTRAINT "training_session_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_log" ADD CONSTRAINT "training_session_log_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_log" ADD CONSTRAINT "training_session_log_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."training_program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_log" ADD CONSTRAINT "training_session_log_pinned_version_id_fkey" FOREIGN KEY ("pinned_version_id") REFERENCES "public"."training_program_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."training_set_log" ADD CONSTRAINT "training_set_log_session_log_id_fkey" FOREIGN KEY ("session_log_id") REFERENCES "public"."training_session_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_set_log" ADD CONSTRAINT "training_set_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_set_log" ADD CONSTRAINT "training_set_log_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite coherence FKs: tenant/client, program and pin coherence.
ALTER TABLE "public"."training_session_log"
    ADD CONSTRAINT "training_session_log_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_log"
    ADD CONSTRAINT "training_session_log_program_workspace_client_fkey"
    FOREIGN KEY ("program_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."training_program"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_log"
    ADD CONSTRAINT "training_session_log_pin_workspace_program_fkey"
    FOREIGN KEY ("pinned_version_id", "workspace_id", "program_id")
    REFERENCES "public"."training_program_version"("id", "workspace_id", "program_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_set_log"
    ADD CONSTRAINT "training_set_log_session_workspace_client_fkey"
    FOREIGN KEY ("session_log_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."training_session_log"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
