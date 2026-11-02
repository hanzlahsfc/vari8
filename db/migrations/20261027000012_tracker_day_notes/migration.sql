-- W2-FE2: one coach-authored day note per client per declared date (the
-- tracker tab's "coach-note" slot). Mirrors tracker_comment minus the
-- parameter dimension: unique (client_profile_id, entry_date) is the
-- upsert authority. Composite coherence FKs follow the established raw
-- SQL convention; Restrict FKs - notes are never cascade-deleted.

CREATE TABLE "public"."tracker_day_note" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "body" TEXT NOT NULL,
    "author_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tracker_day_note_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tracker_day_note_client_profile_id_entry_date_key" ON "public"."tracker_day_note"("client_profile_id", "entry_date");

CREATE UNIQUE INDEX "tracker_day_note_id_workspace_id_key" ON "public"."tracker_day_note"("id", "workspace_id");

ALTER TABLE "public"."tracker_day_note" ADD CONSTRAINT "tracker_day_note_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_day_note" ADD CONSTRAINT "tracker_day_note_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_day_note" ADD CONSTRAINT "tracker_day_note_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_day_note"
    ADD CONSTRAINT "tracker_day_note_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_day_note"
    ADD CONSTRAINT "tracker_day_note_author_workspace_fkey"
    FOREIGN KEY ("author_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tracker_day_note"
    ADD CONSTRAINT "tracker_day_note_body_nonempty_check"
    CHECK (btrim("body") <> '');
