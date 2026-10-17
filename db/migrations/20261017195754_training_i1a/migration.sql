-- TRAINING-I1A (PROMPT 244, synthetic-only): week-based per-client
-- training program chain.
--
-- 1. training_program: program container — startDate/weekCount/fieldConfig,
--    mutable shared override-boundary draft under draftRevision CAS,
--    confirmed IANA timezone with setter/instant provenance (pairing
--    CHECK), replacement link + publish/cancel timestamps committed
--    atomically, defensive locked-week high-water (integer week count).
-- 2. training_program_version: immutable publication — stored
--    (effective_date, effective_timezone, activation_instant) snapshot
--    resolved once at publish; materialized weeks payload + fieldConfig
--    snapshot; (program_id, publish_origin_revision) NOT NULL unique =
--    the deterministic replay authority (meal-plan precedent).
-- 3. Raw partial unique indexes: training_program_single_root (one
--    published non-cancelled root per workspace+client),
--    training_program_live_successor (one non-cancelled claimer per
--    predecessor). Tail + activation indexes for the bounded access
--    path. Composite coherence FKs and CHECKs follow the established
--    raw-SQL convention. Restrict FKs everywhere — published history
--    is never cascade-deleted.

CREATE TABLE "public"."training_program" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "week_count" INTEGER NOT NULL,
    "field_config" JSONB NOT NULL,
    "confirmed_timezone" TEXT,
    "timezone_set_by_member_id" TEXT,
    "timezone_set_at" TIMESTAMPTZ(6),
    "draft" JSONB,
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "replaces_program_id" TEXT,
    "first_published_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_member_id" TEXT,
    "draft_saved_by_member_id" TEXT,
    "draft_updated_at" TIMESTAMPTZ(6),
    "locked_week_high_water" INTEGER NOT NULL DEFAULT 0,
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_program_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."training_program_version" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "version_seq" INTEGER NOT NULL,
    "effective_date" DATE NOT NULL,
    "effective_timezone" TEXT NOT NULL,
    "activation_instant" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL,
    "field_config" JSONB NOT NULL,
    "publish_origin_revision" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_member_id" TEXT NOT NULL,

    CONSTRAINT "training_program_version_pkey" PRIMARY KEY ("id")
);

-- Cardinality + composite coherence targets.
CREATE UNIQUE INDEX "training_program_id_workspace_id_key" ON "public"."training_program"("id", "workspace_id");
CREATE UNIQUE INDEX "training_program_id_workspace_id_client_profile_id_key" ON "public"."training_program"("id", "workspace_id", "client_profile_id");
CREATE UNIQUE INDEX "training_program_version_program_id_version_seq_key" ON "public"."training_program_version"("program_id", "version_seq");
CREATE UNIQUE INDEX "training_program_version_publish_origin_key" ON "public"."training_program_version"("program_id", "publish_origin_revision");
CREATE UNIQUE INDEX "training_program_version_id_workspace_id_program_id_key" ON "public"."training_program_version"("id", "workspace_id", "program_id");

-- Published-chain uniques (partial — drafts never participate):
-- at most one published non-cancelled root per workspace+client.
CREATE UNIQUE INDEX "training_program_single_root"
    ON "public"."training_program"("workspace_id", "client_profile_id")
    WHERE "replaces_program_id" IS NULL
      AND "first_published_at" IS NOT NULL
      AND "cancelled_at" IS NULL;
-- at most one non-cancelled successor claim per predecessor.
CREATE UNIQUE INDEX "training_program_live_successor"
    ON "public"."training_program"("replaces_program_id")
    WHERE "cancelled_at" IS NULL;

-- Bounded access path (P9 §4.1): tail lookup + per-program version scan.
CREATE INDEX "training_program_tail"
    ON "public"."training_program"("workspace_id", "client_profile_id",
                                   "first_published_at" DESC, "id" DESC)
    WHERE "first_published_at" IS NOT NULL AND "cancelled_at" IS NULL;
CREATE INDEX "training_program_workspace_id_idx" ON "public"."training_program"("workspace_id");
CREATE INDEX "training_program_replaces_program_id_idx" ON "public"."training_program"("replaces_program_id");
CREATE INDEX "training_program_version_program_id_activation_instant_idx" ON "public"."training_program_version"("program_id", "activation_instant");

-- Field CHECKs.
ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_timezone_pairing_check"
    CHECK (("confirmed_timezone" IS NULL) = ("timezone_set_by_member_id" IS NULL)
       AND ("confirmed_timezone" IS NULL) = ("timezone_set_at" IS NULL));
ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_draft_provenance_check"
    CHECK (("draft_saved_by_member_id" IS NULL) = ("draft_updated_at" IS NULL));
ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_cancel_provenance_check"
    CHECK (("cancelled_at" IS NULL) = ("cancelled_by_member_id" IS NULL));
ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_draft_revision_check"
    CHECK ("draft_revision" >= 1);
ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_week_count_check"
    CHECK ("week_count" >= 1 AND "week_count" <= 52);
ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_high_water_check"
    CHECK ("locked_week_high_water" >= 0 AND "locked_week_high_water" <= 52);
ALTER TABLE "public"."training_program_version"
    ADD CONSTRAINT "training_program_version_seq_check"
    CHECK ("version_seq" >= 1 AND "publish_origin_revision" >= 1);
ALTER TABLE "public"."training_program_version"
    ADD CONSTRAINT "training_program_version_timezone_check"
    CHECK (length(btrim("effective_timezone")) > 0);

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."training_program" ADD CONSTRAINT "training_program_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_program" ADD CONSTRAINT "training_program_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_program" ADD CONSTRAINT "training_program_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_program" ADD CONSTRAINT "training_program_draft_saved_by_member_id_fkey" FOREIGN KEY ("draft_saved_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_program" ADD CONSTRAINT "training_program_timezone_set_by_member_id_fkey" FOREIGN KEY ("timezone_set_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_program" ADD CONSTRAINT "training_program_cancelled_by_member_id_fkey" FOREIGN KEY ("cancelled_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."training_program_version" ADD CONSTRAINT "training_program_version_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_program_version" ADD CONSTRAINT "training_program_version_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."training_program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_program_version" ADD CONSTRAINT "training_program_version_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."training_program_version" ADD CONSTRAINT "training_program_version_published_by_member_id_fkey" FOREIGN KEY ("published_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/provenance coherence claim.
ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_draft_saver_workspace_fkey"
    FOREIGN KEY ("draft_saved_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_timezone_setter_workspace_fkey"
    FOREIGN KEY ("timezone_set_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_canceller_workspace_fkey"
    FOREIGN KEY ("cancelled_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replacement coherence: (replaces_program_id, workspace_id) must point
-- at a program in the SAME workspace (composite coherence key); plain
-- replaces_program_id → id is covered transitively by this FK.
ALTER TABLE "public"."training_program"
    ADD CONSTRAINT "training_program_replacement_workspace_fkey"
    FOREIGN KEY ("replaces_program_id", "workspace_id")
    REFERENCES "public"."training_program"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."training_program_version"
    ADD CONSTRAINT "training_program_version_program_coherence_fkey"
    FOREIGN KEY ("program_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."training_program"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."training_program_version"
    ADD CONSTRAINT "training_program_version_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."training_program_version"
    ADD CONSTRAINT "training_program_version_publisher_workspace_fkey"
    FOREIGN KEY ("published_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
