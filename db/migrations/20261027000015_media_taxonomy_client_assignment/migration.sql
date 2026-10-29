-- T6 (R7, R8): media taxonomy ownership plus coach-to-client assignment.
--
-- 1. media_object.client_profile_id records the owning client profile.
--    A NULL owner means the row belongs to the coach library: staff upload
--    with `library: true` and the object key anchors under the reserved
--    `client/library/` pseudo-owner segment, so the existing presign and
--    redemption grammar is unchanged. Type stays the existing `kind` enum;
--    type filtering needs no new column.
-- 2. media_assignment is the share grant: coach assigns any live media
--    object to a client profile in the same workspace. The client-visible
--    read and the download mint both check this table.
-- 3. Delete semantics decided by the card: FAIL (RESTRICT). Every existing
--    media_object relation already restricts; deleting a shared item now
--    requires the coach to unassign it first. The service maps the live
--    assignment count to 409 `has_assignments` before touching the row.

ALTER TABLE "public"."media_object" ADD COLUMN "client_profile_id" TEXT;

-- Backfill (repair 1): rows that predate T6 carry the owner only in the
-- storage key, so NULL here would misclassify every existing client
-- upload as coach library. The key grammar is
-- workspace/<workspaceId>/client/<clientProfileId>/<objectId>. Guarded
-- three ways: the key must sit under a client path, the owner segment
-- must not be the reserved `library` pseudo-owner, and the segment must
-- resolve to a client_profile row inside the same workspace. Everything
-- else keeps NULL and stays coach library.
UPDATE "public"."media_object" m
    SET "client_profile_id" = split_part(split_part(m."storage_key", '/client/', 2), '/', 1)
    WHERE m."storage_key" LIKE 'workspace/%/client/%'
      AND split_part(split_part(m."storage_key", '/client/', 2), '/', 1) <> 'library'
      AND EXISTS (
          SELECT 1 FROM "public"."client_profile" cp
          WHERE cp."id" = split_part(split_part(m."storage_key", '/client/', 2), '/', 1)
            AND cp."workspace_id" = m."workspace_id"
      );

-- Composite coherence FK: an owner must be a client of the same
-- workspace. RESTRICT matches every other media_object relation.
ALTER TABLE "public"."media_object"
    ADD CONSTRAINT "media_object_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "media_object_workspace_id_client_profile_id_idx" ON "public"."media_object"("workspace_id", "client_profile_id");

CREATE TABLE "public"."media_assignment" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "media_object_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "assigned_by_member_id" TEXT,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assignment_pkey" PRIMARY KEY ("id")
);

-- One grant per (item, client); composite coherence target.
CREATE UNIQUE INDEX "media_assignment_media_object_id_client_profile_id_key" ON "public"."media_assignment"("media_object_id", "client_profile_id");
CREATE UNIQUE INDEX "media_assignment_id_workspace_id_key" ON "public"."media_assignment"("id", "workspace_id");

-- Selection index: a client's shared media list, per workspace.
CREATE INDEX "media_assignment_workspace_id_client_profile_id_idx" ON "public"."media_assignment"("workspace_id", "client_profile_id");

-- Declared foreign keys: same composite coherence pattern as
-- progress_photo_entry - object and client must live in this workspace.
ALTER TABLE "public"."media_assignment" ADD CONSTRAINT "media_assignment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."media_assignment" ADD CONSTRAINT "media_assignment_media_workspace_fkey" FOREIGN KEY ("media_object_id", "workspace_id") REFERENCES "public"."media_object"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."media_assignment" ADD CONSTRAINT "media_assignment_client_workspace_fkey" FOREIGN KEY ("client_profile_id", "workspace_id") REFERENCES "public"."client_profile"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."media_assignment" ADD CONSTRAINT "media_assignment_assigned_by_member_id_fkey" FOREIGN KEY ("assigned_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
