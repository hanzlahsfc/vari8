-- TRAINING-I1B-2 (PROMPT 266, synthetic-only): dated-session bookings.
--
-- training_session_booking: an explicit staff-created booking that pins an
-- immutable prescription tuple (pinned_version_id, session_id, booked_week).
-- scheduled_date is a declared local calendar date under the program's
-- immutable anchor timezone — a date, never an instant. The partial unique
-- (program, session, date, active-only) is the natural-key idempotency
-- authority; cancelled rows are tombstones that free the tuple.
-- Composite coherence FKs and CHECKs follow the established raw-SQL
-- convention. Restrict FKs — pinned history is never cascade-deleted.

CREATE TABLE "public"."training_session_booking" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "pinned_version_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "booked_week" INTEGER NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "scheduled_by_member_id" TEXT NOT NULL,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_member_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_session_booking_pkey" PRIMARY KEY ("id")
);

-- One active booking per session per day — the idempotency key.
CREATE UNIQUE INDEX "training_session_booking_active_key"
    ON "public"."training_session_booking"("program_id", "session_id", "scheduled_date")
    WHERE "cancelled_at" IS NULL;

-- Bounded access paths: per-program agenda and per-client reads.
CREATE INDEX "training_session_booking_program_id_scheduled_date_idx"
    ON "public"."training_session_booking"("program_id", "scheduled_date");
CREATE INDEX "training_session_booking_client_scope_date_idx"
    ON "public"."training_session_booking"("workspace_id", "client_profile_id", "scheduled_date");

-- Field CHECKs.
ALTER TABLE "public"."training_session_booking"
    ADD CONSTRAINT "training_session_booking_booked_week_check"
    CHECK ("booked_week" >= 1);
ALTER TABLE "public"."training_session_booking"
    ADD CONSTRAINT "training_session_booking_cancel_pairing_check"
    CHECK (("cancelled_at" IS NULL) = ("cancelled_by_member_id" IS NULL));

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."training_session_booking" ADD CONSTRAINT "training_session_booking_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_booking" ADD CONSTRAINT "training_session_booking_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_booking" ADD CONSTRAINT "training_session_booking_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."training_program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_booking" ADD CONSTRAINT "training_session_booking_pinned_version_id_fkey" FOREIGN KEY ("pinned_version_id") REFERENCES "public"."training_program_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_booking" ADD CONSTRAINT "training_session_booking_scheduled_by_member_id_fkey" FOREIGN KEY ("scheduled_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_booking" ADD CONSTRAINT "training_session_booking_cancelled_by_member_id_fkey" FOREIGN KEY ("cancelled_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite coherence FKs: booking tenant/program and pin coherence.
ALTER TABLE "public"."training_session_booking"
    ADD CONSTRAINT "training_session_booking_program_workspace_client_fkey"
    FOREIGN KEY ("program_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."training_program"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_booking"
    ADD CONSTRAINT "training_session_booking_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_session_booking"
    ADD CONSTRAINT "training_session_booking_pin_workspace_program_fkey"
    FOREIGN KEY ("pinned_version_id", "workspace_id", "program_id")
    REFERENCES "public"."training_program_version"("id", "workspace_id", "program_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
