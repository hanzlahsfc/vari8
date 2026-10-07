-- P-016: C1 client setup + template assignment records (product-decisions
-- #49–#57). Client-associated operational metadata — a stable aggregate plus
-- append-only assignment/version-pin history; no plan, entry, or answer data.
--
-- 1. Same-workspace coherence, pin↔setup membership, pin.client↔setup.client,
--    and version∈template∈workspace pinning are enforced by composite foreign
--    keys (raw SQL — Prisma cannot express them). The client_setup composite
--    unique targets are created below; the client_profile, workspace_member,
--    coaching_template, and coaching_template_version targets already exist
--    from earlier migrations.
-- 2. One ACTIVE pin per setup via a partial unique index — the final
--    concurrency authority for "one current assignment per client" (#49).
-- 3. (client_setup_id, seq) uniqueness backstops the max(seq)+1 allocation.
-- 4. Provenance shape via CHECK: ACTIVE forbids ending provenance; terminal
--    statuses require it. SUPERSEDED is schema-reserved for C2; no C1
--    service may write it.
-- 5. Restrict FKs: deleting a workspace/client/member/template/version/setup
--    must not silently erase assignment history (decision #57 interim
--    posture; retention/erasure remains pending D-10).

CREATE TYPE "public"."ClientSetupPinStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'CANCELLED');

CREATE TABLE "public"."client_setup" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_setup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."client_setup_pin" (
    "id" TEXT NOT NULL,
    "client_setup_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "template_id" TEXT NOT NULL,
    "template_version_id" TEXT NOT NULL,
    "status" "public"."ClientSetupPinStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_by_member_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_by_member_id" TEXT,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_setup_pin_pkey" PRIMARY KEY ("id")
);

-- One stable setup per (workspace, client) — the aggregate survives
-- cancellation and is reused by every later pin.
CREATE UNIQUE INDEX "client_setup_workspace_id_client_profile_id_key" ON "public"."client_setup"("workspace_id", "client_profile_id");
-- Composite unique targets required by the pin's setup/workspace and
-- pin.client↔setup.client foreign keys below (redundant with the PK but
-- required as FK targets).
CREATE UNIQUE INDEX "client_setup_id_workspace_id_key" ON "public"."client_setup"("id", "workspace_id");
CREATE UNIQUE INDEX "client_setup_id_client_profile_id_key" ON "public"."client_setup"("id", "client_profile_id");

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."client_setup" ADD CONSTRAINT "client_setup_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_setup" ADD CONSTRAINT "client_setup_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_setup_pin" ADD CONSTRAINT "client_setup_pin_client_setup_id_fkey" FOREIGN KEY ("client_setup_id") REFERENCES "public"."client_setup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_setup_pin" ADD CONSTRAINT "client_setup_pin_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_setup_pin" ADD CONSTRAINT "client_setup_pin_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_setup_pin" ADD CONSTRAINT "client_setup_pin_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."coaching_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_setup_pin" ADD CONSTRAINT "client_setup_pin_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "public"."coaching_template_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_setup_pin" ADD CONSTRAINT "client_setup_pin_assigned_by_member_id_fkey" FOREIGN KEY ("assigned_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_setup_pin" ADD CONSTRAINT "client_setup_pin_ended_by_member_id_fkey" FOREIGN KEY ("ended_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: the setup must live in the pin's workspace and own
-- the pin's client; client, template, assigning member, and ending member
-- must all live in the pin's workspace; the pinned version must belong to
-- the pinned template in the same workspace (composite targets already exist
-- on coaching_template and coaching_template_version).
ALTER TABLE "public"."client_setup"
    ADD CONSTRAINT "client_setup_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_setup_workspace_fkey"
    FOREIGN KEY ("client_setup_id", "workspace_id")
    REFERENCES "public"."client_setup"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_setup_client_fkey"
    FOREIGN KEY ("client_setup_id", "client_profile_id")
    REFERENCES "public"."client_setup"("id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_template_workspace_fkey"
    FOREIGN KEY ("template_id", "workspace_id")
    REFERENCES "public"."coaching_template"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_version_template_workspace_fkey"
    FOREIGN KEY ("template_version_id", "template_id", "workspace_id")
    REFERENCES "public"."coaching_template_version"("id", "template_id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_assigned_by_workspace_fkey"
    FOREIGN KEY ("assigned_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_ended_by_workspace_fkey"
    FOREIGN KEY ("ended_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Provenance shape: ACTIVE has no ending provenance; terminal rows require it.
ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_provenance_shape" CHECK (
        ("status" = 'ACTIVE'::"public"."ClientSetupPinStatus"
            AND "ended_by_member_id" IS NULL AND "ended_at" IS NULL)
        OR ("status" <> 'ACTIVE'::"public"."ClientSetupPinStatus"
            AND "ended_by_member_id" IS NOT NULL AND "ended_at" IS NOT NULL)
    );

-- One ACTIVE pin per setup — final concurrency authority for decision #49.
-- Terminal history is unrestricted.
CREATE UNIQUE INDEX "client_setup_pin_one_active_key"
    ON "public"."client_setup_pin" ("client_setup_id")
    WHERE "status" = 'ACTIVE'::"public"."ClientSetupPinStatus";

-- (setup, seq) append-only ordering backstop.
CREATE UNIQUE INDEX "client_setup_pin_client_setup_id_seq_key" ON "public"."client_setup_pin"("client_setup_id", "seq");

-- Query indexes: workspace id-cursor pagination, scoped client/template
-- reads, the version FK parent-delete scan, and setup member listing.
CREATE INDEX "client_setup_client_profile_id_idx" ON "public"."client_setup"("client_profile_id");
CREATE INDEX "client_setup_pin_workspace_id_id_idx" ON "public"."client_setup_pin"("workspace_id", "id");
CREATE INDEX "client_setup_pin_client_profile_id_status_idx" ON "public"."client_setup_pin"("client_profile_id", "status");
CREATE INDEX "client_setup_pin_template_id_status_idx" ON "public"."client_setup_pin"("template_id", "status");
CREATE INDEX "client_setup_pin_template_version_id_idx" ON "public"."client_setup_pin"("template_version_id");
