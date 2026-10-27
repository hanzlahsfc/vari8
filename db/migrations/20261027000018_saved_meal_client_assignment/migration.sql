-- T7 (R6): saved meal assign-to-client.
--
-- A saved_meal row with NULL client_profile_id is a coach library row.
-- The assign action copies a library row into a new row owned by one
-- client profile: the copy carries its own id, a regenerated meal.id
-- inside the JSONB payload, and a source_saved_meal_id provenance
-- pointer. Detach semantics: the copy is a plain row, library edits and
-- deletes never propagate. No backfill needed: the column is new and
-- every existing row is a coach library row (NULL).

ALTER TABLE "public"."saved_meal" ADD COLUMN "client_profile_id" TEXT;
ALTER TABLE "public"."saved_meal" ADD COLUMN "source_saved_meal_id" TEXT;
ALTER TABLE "public"."saved_meal" ADD COLUMN "assigned_by_member_id" TEXT;
ALTER TABLE "public"."saved_meal" ADD COLUMN "assigned_at" TIMESTAMPTZ(6);

-- Composite coherence FKs (same pattern as media_object /
-- media_assignment): the owning client and the source library row must
-- live in the same workspace as the row itself. RESTRICT matches every
-- other saved_meal relation for the client owner; the provenance
-- pointer drops to NULL if a source row is ever hard-removed.
ALTER TABLE "public"."saved_meal"
    ADD CONSTRAINT "saved_meal_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."saved_meal"
    ADD CONSTRAINT "saved_meal_source_workspace_fkey"
    FOREIGN KEY ("source_saved_meal_id", "workspace_id")
    REFERENCES "public"."saved_meal"("id", "workspace_id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."saved_meal"
    ADD CONSTRAINT "saved_meal_assigned_by_member_id_fkey"
    FOREIGN KEY ("assigned_by_member_id")
    REFERENCES "public"."workspace_member"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Selection index: a client's own meal copies, per workspace.
CREATE INDEX "saved_meal_workspace_id_client_profile_id_idx" ON "public"."saved_meal"("workspace_id", "client_profile_id");
