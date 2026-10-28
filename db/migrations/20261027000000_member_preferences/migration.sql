-- W2-T1 (R9/R10): member-scoped server preference rows behind the workspace
-- settings surface and the notification delivery gate.
--
-- member_preference: one row per (workspace, member, key). The member's own
-- notification choices persist server-side and are read by mail delivery at
-- send time. Missing row means the key default (enabled); writes go through
-- the closed key registry in lib/workspace/preferences.ts, so a CHECK on
-- the key set is not duplicated here (the service is the boundary).
-- member rows cascade with the member (the row is member-owned data, same
-- posture as coach_profile); the workspace FK stays Restrict like every
-- tenant relation.

CREATE TABLE "public"."member_preference" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "member_preference_pkey" PRIMARY KEY ("id")
);

-- One row per (workspace, member, key): the upsert idempotency key.
CREATE UNIQUE INDEX "member_preference_workspace_id_member_id_key_key"
    ON "public"."member_preference"("workspace_id", "member_id", "key");
CREATE INDEX "member_preference_member_id_idx"
    ON "public"."member_preference"("member_id");

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."member_preference" ADD CONSTRAINT "member_preference_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."member_preference" ADD CONSTRAINT "member_preference_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite coherence: the member id must belong to the row's workspace.
ALTER TABLE "public"."member_preference"
    ADD CONSTRAINT "member_preference_member_workspace_fkey"
    FOREIGN KEY ("member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
