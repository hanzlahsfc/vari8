-- MEAL-PLAN-I1 (decision #115 — PROMPT 211): versioned per-client meal
-- plan, synthetic-only development.
--
-- 1. meal_plan: one container per client profile — mutable shared draft +
--    draftRevision CAS + the plan-scoped confirmed IANA timezone with
--    setter/instant provenance (raw pairing CHECK).
-- 2. meal_plan_version: immutable effective-dated publication carrying a
--    stored (effective_date, effective_timezone, activation_instant)
--    snapshot resolved once at publish; (meal_plan_id,
--    publish_origin_revision) unique = deterministic replay authority.
-- 3. Raw composite coherence FKs: version (meal_plan_id, workspace_id,
--    client_profile_id) → plan coherence key; member/client tuples
--    workspace-pinned (established convention).
-- 4. Restrict FKs everywhere — published history is never cascade-deleted.

CREATE TABLE "public"."meal_plan" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "timezone" TEXT,
    "timezone_set_by_member_id" TEXT,
    "timezone_set_at" TIMESTAMPTZ(6),
    "draft" JSONB,
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "draft_saved_by_member_id" TEXT,
    "draft_updated_at" TIMESTAMPTZ(6),
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meal_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."meal_plan_version" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "meal_plan_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "version_seq" INTEGER NOT NULL,
    "effective_date" DATE NOT NULL,
    "effective_timezone" TEXT NOT NULL,
    "activation_instant" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL,
    "publish_origin_revision" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_member_id" TEXT NOT NULL,

    CONSTRAINT "meal_plan_version_pkey" PRIMARY KEY ("id")
);

-- Cardinality + composite coherence targets.
CREATE UNIQUE INDEX "meal_plan_client_profile_id_key" ON "public"."meal_plan"("client_profile_id");
CREATE UNIQUE INDEX "meal_plan_id_workspace_id_key" ON "public"."meal_plan"("id", "workspace_id");
CREATE UNIQUE INDEX "meal_plan_id_workspace_id_client_profile_id_key" ON "public"."meal_plan"("id", "workspace_id", "client_profile_id");
CREATE UNIQUE INDEX "meal_plan_version_meal_plan_id_version_seq_key" ON "public"."meal_plan_version"("meal_plan_id", "version_seq");
CREATE UNIQUE INDEX "meal_plan_version_publish_origin_key" ON "public"."meal_plan_version"("meal_plan_id", "publish_origin_revision");
CREATE UNIQUE INDEX "meal_plan_version_id_workspace_id_meal_plan_id_key" ON "public"."meal_plan_version"("id", "workspace_id", "meal_plan_id");

-- Selection indexes: precedence ordering + eligibility gate.
CREATE INDEX "meal_plan_workspace_id_idx" ON "public"."meal_plan"("workspace_id");
CREATE INDEX "meal_plan_version_meal_plan_id_effective_date_version_seq_idx" ON "public"."meal_plan_version"("meal_plan_id", "effective_date", "version_seq");
CREATE INDEX "meal_plan_version_meal_plan_id_activation_instant_idx" ON "public"."meal_plan_version"("meal_plan_id", "activation_instant");

-- Field CHECKs.
ALTER TABLE "public"."meal_plan"
    ADD CONSTRAINT "meal_plan_timezone_pairing_check"
    CHECK (("timezone" IS NULL) = ("timezone_set_by_member_id" IS NULL)
       AND ("timezone" IS NULL) = ("timezone_set_at" IS NULL));
ALTER TABLE "public"."meal_plan"
    ADD CONSTRAINT "meal_plan_draft_provenance_check"
    CHECK (("draft_saved_by_member_id" IS NULL) = ("draft_updated_at" IS NULL));
ALTER TABLE "public"."meal_plan"
    ADD CONSTRAINT "meal_plan_draft_revision_check"
    CHECK ("draft_revision" >= 1);
ALTER TABLE "public"."meal_plan_version"
    ADD CONSTRAINT "meal_plan_version_seq_check"
    CHECK ("version_seq" >= 1 AND "publish_origin_revision" >= 1);
ALTER TABLE "public"."meal_plan_version"
    ADD CONSTRAINT "meal_plan_version_timezone_check"
    CHECK (length(btrim("effective_timezone")) > 0);

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."meal_plan" ADD CONSTRAINT "meal_plan_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."meal_plan" ADD CONSTRAINT "meal_plan_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."meal_plan" ADD CONSTRAINT "meal_plan_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."meal_plan" ADD CONSTRAINT "meal_plan_draft_saved_by_member_id_fkey" FOREIGN KEY ("draft_saved_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."meal_plan" ADD CONSTRAINT "meal_plan_timezone_set_by_member_id_fkey" FOREIGN KEY ("timezone_set_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."meal_plan_version" ADD CONSTRAINT "meal_plan_version_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."meal_plan_version" ADD CONSTRAINT "meal_plan_version_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."meal_plan_version" ADD CONSTRAINT "meal_plan_version_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."meal_plan_version" ADD CONSTRAINT "meal_plan_version_published_by_member_id_fkey" FOREIGN KEY ("published_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/provenance coherence claim.
ALTER TABLE "public"."meal_plan"
    ADD CONSTRAINT "meal_plan_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."meal_plan"
    ADD CONSTRAINT "meal_plan_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."meal_plan"
    ADD CONSTRAINT "meal_plan_draft_saver_workspace_fkey"
    FOREIGN KEY ("draft_saved_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."meal_plan"
    ADD CONSTRAINT "meal_plan_timezone_setter_workspace_fkey"
    FOREIGN KEY ("timezone_set_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."meal_plan_version"
    ADD CONSTRAINT "meal_plan_version_plan_coherence_fkey"
    FOREIGN KEY ("meal_plan_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."meal_plan"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."meal_plan_version"
    ADD CONSTRAINT "meal_plan_version_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."meal_plan_version"
    ADD CONSTRAINT "meal_plan_version_publisher_workspace_fkey"
    FOREIGN KEY ("published_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
