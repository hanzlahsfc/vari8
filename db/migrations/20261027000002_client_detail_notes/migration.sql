-- W2-A1: coach client-detail persistence - phases, per-week notes, and the
-- pin-to-overview flag on coach notes.
--
-- client_phase: the canvas phase plan (prep, recovery, ...) for a client.
-- The canvas orders phases by start_date and rewrites later starts
-- back-to-back; the row stores the declared phase core (name, start,
-- duration_weeks) and ordering is derived on read.
--
-- client_week_note: one note per (client_profile_id, week_start). The canvas
-- weekNotes map keys weeks by their Monday ISO date; week_start is that
-- declared local calendar date. An empty weekNotes map simply has no rows -
-- the reconcile write deletes keys the canvas no longer sends.
--
-- coach_note.pinned: W2-A1 resolved the pinned mapping the W0A audit left
-- open - the flag lives on the note row (only PRIVATE client notes may pin;
-- the raw CHECK below makes GENERAL rows always unpinned). The demo seed
-- previously smuggled it as a "[pinned] " body prefix.
--
-- Composite coherence FKs pin (client, author) tuples to the workspace,
-- matching the activity_target convention.

ALTER TABLE "public"."coach_note" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

-- A GENERAL note never pins; pin-to-overview is a private-note behavior.
ALTER TABLE "public"."coach_note" ADD CONSTRAINT "coach_note_pinned_visibility_check" CHECK ("pinned" = false OR "visibility" = 'PRIVATE');

CREATE TABLE "public"."client_phase" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "duration_weeks" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_phase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_phase_id_workspace_id_key" ON "public"."client_phase"("id", "workspace_id");
CREATE INDEX "client_phase_workspace_client_idx" ON "public"."client_phase"("workspace_id", "client_profile_id");

ALTER TABLE "public"."client_phase" ADD CONSTRAINT "client_phase_duration_positive_check" CHECK ("duration_weeks" > 0 AND "duration_weeks" <= 52);
ALTER TABLE "public"."client_phase" ADD CONSTRAINT "client_phase_name_nonempty_check" CHECK (length(btrim("name")) > 0);

ALTER TABLE "public"."client_phase" ADD CONSTRAINT "client_phase_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_phase" ADD CONSTRAINT "client_phase_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_phase"
    ADD CONSTRAINT "client_phase_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."client_week_note" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "body" TEXT NOT NULL,
    "author_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_week_note_pkey" PRIMARY KEY ("id")
);

-- One note per client per timeline week.
CREATE UNIQUE INDEX "client_week_note_client_week_key" ON "public"."client_week_note"("client_profile_id", "week_start");
CREATE UNIQUE INDEX "client_week_note_id_workspace_id_key" ON "public"."client_week_note"("id", "workspace_id");
CREATE INDEX "client_week_note_workspace_client_idx" ON "public"."client_week_note"("workspace_id", "client_profile_id");

ALTER TABLE "public"."client_week_note" ADD CONSTRAINT "client_week_note_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_week_note" ADD CONSTRAINT "client_week_note_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_week_note" ADD CONSTRAINT "client_week_note_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_week_note"
    ADD CONSTRAINT "client_week_note_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_week_note"
    ADD CONSTRAINT "client_week_note_author_workspace_fkey"
    FOREIGN KEY ("author_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
