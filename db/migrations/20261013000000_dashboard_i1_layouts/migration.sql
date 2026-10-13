-- DASHBOARD-I1 (decision #108): persisted coach-configured client
-- dashboard layouts. Configuration-only rows (widgets/rects/settings);
-- standard id PK + (workspace_id, client_profile_id) uniqueness;
-- provenance and composite coherence FKs are RESTRICT — matching the
-- scheduler/reviewer precedent (no SET NULL anywhere).

-- 1. Prisma-declared table
CREATE TABLE "public"."client_dashboard_layout" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "config_version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_by_member_id" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "client_dashboard_layout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_dashboard_layout_workspace_id_client_profile_id_key"
    ON "public"."client_dashboard_layout"("workspace_id", "client_profile_id");
CREATE UNIQUE INDEX "client_dashboard_layout_id_workspace_id_key"
    ON "public"."client_dashboard_layout"("id", "workspace_id");
CREATE INDEX "client_dashboard_layout_client_profile_id_idx"
    ON "public"."client_dashboard_layout"("client_profile_id");

-- 2. Prisma-declared single-column relations (RESTRICT everywhere)
ALTER TABLE "public"."client_dashboard_layout"
    ADD CONSTRAINT "client_dashboard_layout_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_dashboard_layout"
    ADD CONSTRAINT "client_dashboard_layout_client_profile_id_fkey"
    FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_dashboard_layout"
    ADD CONSTRAINT "client_dashboard_layout_updated_by_member_id_fkey"
    FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."workspace_member"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Composite coherence foreign keys (raw SQL — cross-workspace or
--    wrong-client/editor references are impossible at the DB level)
ALTER TABLE "public"."client_dashboard_layout"
    ADD CONSTRAINT "client_dashboard_layout_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_dashboard_layout"
    ADD CONSTRAINT "client_dashboard_layout_editor_workspace_fkey"
    FOREIGN KEY ("updated_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
