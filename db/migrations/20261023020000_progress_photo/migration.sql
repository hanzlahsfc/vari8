-- Card 08 (#172): dated progress photos on top of the media upload.
--
-- 1. progress_photo_entry: one row per gallery photo — a unique link to
--    exactly one media_object, the owning client, the client-picked
--    taken_on date, an optional check-in submission link, a
--    client_visible flag and soft delete (deleted_at). Deleting an entry
--    never touches the media_object row; the retention pass owns that.
-- 2. Raw composite coherence FKs pin media_object and checkin_submission
--    to the same workspace (and the submission to the same client), so an
--    entry can never reference a foreign workspace's object or another
--    client's submission. All FKs are RESTRICT.
-- 3. A progress photo is a dated image and nothing more: this table
--    deliberately carries no pose or shot-variant column or enum.

CREATE TABLE "public"."progress_photo_entry" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "media_object_id" TEXT NOT NULL,
    "taken_on" DATE NOT NULL,
    "checkin_submission_id" TEXT,
    "client_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "progress_photo_entry_pkey" PRIMARY KEY ("id")
);

-- One entry per media object; composite coherence targets.
CREATE UNIQUE INDEX "progress_photo_entry_media_object_id_key" ON "public"."progress_photo_entry"("media_object_id");
CREATE UNIQUE INDEX "progress_photo_entry_id_workspace_id_key" ON "public"."progress_photo_entry"("id", "workspace_id");
CREATE UNIQUE INDEX "progress_photo_entry_id_workspace_id_client_profile_id_key" ON "public"."progress_photo_entry"("id", "workspace_id", "client_profile_id");

-- Selection indexes: a client's gallery ordered by date, per workspace.
CREATE INDEX "progress_photo_entry_client_profile_id_taken_on_idx" ON "public"."progress_photo_entry"("client_profile_id", "taken_on");
CREATE INDEX "progress_photo_entry_workspace_id_client_profile_id_idx" ON "public"."progress_photo_entry"("workspace_id", "client_profile_id");

-- Declared foreign keys: the same composite coherence pattern the schema
-- uses for message_attachment/checkin_answer_media — every referenced row
-- must live in the same workspace, and the check-in submission must
-- belong to the same client.
ALTER TABLE "public"."progress_photo_entry" ADD CONSTRAINT "progress_photo_entry_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."progress_photo_entry" ADD CONSTRAINT "progress_photo_entry_client_workspace_fkey" FOREIGN KEY ("client_profile_id", "workspace_id") REFERENCES "public"."client_profile"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."progress_photo_entry" ADD CONSTRAINT "progress_photo_entry_media_workspace_fkey" FOREIGN KEY ("media_object_id", "workspace_id") REFERENCES "public"."media_object"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."progress_photo_entry" ADD CONSTRAINT "progress_photo_entry_submission_coherence_fkey" FOREIGN KEY ("checkin_submission_id", "workspace_id", "client_profile_id") REFERENCES "public"."checkin_submission"("id", "workspace_id", "client_profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;
