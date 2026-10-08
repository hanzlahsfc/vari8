-- P-021: DailyEntry persistence (product-decisions #64–#78). Client-owned
-- dated health values — one logical entry per (workspace, client, declared
-- DATE), append-only revisions, and a composite current-revision pointer.
--
-- 1. Same-workspace / same-client coherence, revision↔entry membership,
--    revision↔pin version+client equality, value↔revision and
--    value↔parameter workspace coherence, and member provenance are
--    enforced by composite foreign keys (raw SQL — Prisma cannot express
--    cyclic or shared-scalar composite relations). All targets are
--    composite uniques created in this migration or already present.
-- 2. The current-revision pointer
--       daily_entry(current_revision_id, id)
--         → daily_entry_revision(id, daily_entry_id)
--    is cyclic: the entry is inserted with NULL pointer (MATCH SIMPLE —
--    the FK is satisfied whenever any referencing column is NULL), the
--    revision and values are inserted, and the pointer is set inside the
--    same transaction. The pointer can only reference a revision that
--    belongs to the same entry.
-- 3. One value row per (revision, parameter) — primary key. A CHECK makes
--    exactly one kind-compatible column non-NULL, so unsupported kinds
--    (TIME, DURATION) can never produce a value row.
-- 4. Restrict FKs: deleting a workspace/client/member/pin/version must not
--    silently erase entry history (decision #76 interim posture;
--    retention/erasure remains pending D-10).

CREATE TABLE "public"."daily_entry" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "current_revision_id" TEXT,
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_entry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."daily_entry_revision" (
    "id" TEXT NOT NULL,
    "daily_entry_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "client_setup_pin_id" TEXT NOT NULL,
    "template_version_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "canonical_hash" TEXT NOT NULL,
    "declared_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_entry_revision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."daily_entry_revision_value" (
    "revision_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "parameter_id" TEXT NOT NULL,
    "kind" "public"."ParameterKind" NOT NULL,
    "value_numeric" NUMERIC(30,8),
    "value_rating" INTEGER,
    "value_option_id" TEXT,
    "value_text" TEXT,

    CONSTRAINT "daily_entry_revision_value_pkey" PRIMARY KEY ("revision_id", "parameter_id")
);

-- Cardinality and composite unique targets.
CREATE UNIQUE INDEX "daily_entry_workspace_id_client_profile_id_entry_date_key" ON "public"."daily_entry"("workspace_id", "client_profile_id", "entry_date");
CREATE UNIQUE INDEX "daily_entry_id_workspace_id_key" ON "public"."daily_entry"("id", "workspace_id");
CREATE UNIQUE INDEX "daily_entry_id_client_profile_id_key" ON "public"."daily_entry"("id", "client_profile_id");
CREATE UNIQUE INDEX "daily_entry_id_workspace_id_client_profile_id_key" ON "public"."daily_entry"("id", "workspace_id", "client_profile_id");

CREATE UNIQUE INDEX "daily_entry_revision_daily_entry_id_seq_key" ON "public"."daily_entry_revision"("daily_entry_id", "seq");
CREATE UNIQUE INDEX "daily_entry_revision_id_daily_entry_id_key" ON "public"."daily_entry_revision"("id", "daily_entry_id");
CREATE UNIQUE INDEX "daily_entry_revision_id_workspace_id_key" ON "public"."daily_entry_revision"("id", "workspace_id");
CREATE UNIQUE INDEX "daily_entry_revision_id_client_profile_id_key" ON "public"."daily_entry_revision"("id", "client_profile_id");

-- New composite unique targets on client_setup_pin for the revision→pin
-- coherence foreign keys (additive; existing pins satisfy them trivially).
CREATE UNIQUE INDEX "client_setup_pin_id_workspace_id_template_version_id_key" ON "public"."client_setup_pin"("id", "workspace_id", "template_version_id");
CREATE UNIQUE INDEX "client_setup_pin_id_client_profile_id_key" ON "public"."client_setup_pin"("id", "client_profile_id");

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."daily_entry" ADD CONSTRAINT "daily_entry_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."daily_entry" ADD CONSTRAINT "daily_entry_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."daily_entry" ADD CONSTRAINT "daily_entry_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry_revision" ADD CONSTRAINT "daily_entry_revision_daily_entry_id_fkey" FOREIGN KEY ("daily_entry_id") REFERENCES "public"."daily_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."daily_entry_revision" ADD CONSTRAINT "daily_entry_revision_client_setup_pin_id_fkey" FOREIGN KEY ("client_setup_pin_id") REFERENCES "public"."client_setup_pin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."daily_entry_revision" ADD CONSTRAINT "daily_entry_revision_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "public"."coaching_template_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."daily_entry_revision" ADD CONSTRAINT "daily_entry_revision_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry_revision_value" ADD CONSTRAINT "daily_entry_revision_value_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "public"."daily_entry_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."daily_entry_revision_value" ADD CONSTRAINT "daily_entry_revision_value_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."parameter_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: the pointer can only reference a revision that
-- belongs to the same entry; every revision must agree with its entry on
-- entry, workspace, AND client, and with its pin on pin, workspace,
-- template version, AND client; every value must agree with its revision
-- and parameter on workspace; creators must be members of the row's
-- workspace.
ALTER TABLE "public"."daily_entry"
    ADD CONSTRAINT "daily_entry_pointer_own_revision_fkey"
    FOREIGN KEY ("current_revision_id", "id")
    REFERENCES "public"."daily_entry_revision"("id", "daily_entry_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry"
    ADD CONSTRAINT "daily_entry_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry"
    ADD CONSTRAINT "daily_entry_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry_revision"
    ADD CONSTRAINT "daily_entry_revision_entry_coherence_fkey"
    FOREIGN KEY ("daily_entry_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."daily_entry"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry_revision"
    ADD CONSTRAINT "daily_entry_revision_pin_coherence_fkey"
    FOREIGN KEY ("client_setup_pin_id", "workspace_id", "template_version_id")
    REFERENCES "public"."client_setup_pin"("id", "workspace_id", "template_version_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry_revision"
    ADD CONSTRAINT "daily_entry_revision_pin_client_fkey"
    FOREIGN KEY ("client_setup_pin_id", "client_profile_id")
    REFERENCES "public"."client_setup_pin"("id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry_revision"
    ADD CONSTRAINT "daily_entry_revision_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry_revision_value"
    ADD CONSTRAINT "daily_entry_revision_value_revision_workspace_fkey"
    FOREIGN KEY ("revision_id", "workspace_id")
    REFERENCES "public"."daily_entry_revision"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."daily_entry_revision_value"
    ADD CONSTRAINT "daily_entry_revision_value_parameter_workspace_fkey"
    FOREIGN KEY ("parameter_id", "workspace_id")
    REFERENCES "public"."parameter_definition"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one kind-compatible value column per row; unsupported kinds
-- (TIME, DURATION) satisfy no branch and can never produce a row.
ALTER TABLE "public"."daily_entry_revision_value"
    ADD CONSTRAINT "daily_entry_revision_value_kind_column_chk" CHECK (
        ("kind" = 'MEASUREMENT'::"public"."ParameterKind"
            AND "value_numeric" IS NOT NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NULL)
        OR ("kind" = 'RATING'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NOT NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NULL)
        OR ("kind" = 'OPTION'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NOT NULL
            AND "value_text" IS NULL)
        OR ("kind" = 'TEXT'::"public"."ParameterKind"
            AND "value_numeric" IS NULL
            AND "value_rating" IS NULL
            AND "value_option_id" IS NULL
            AND "value_text" IS NOT NULL)
    );

-- Query indexes: client/date history, pin/provider counts, revision scan,
-- and the parameter FK parent-delete scan.
CREATE INDEX "daily_entry_client_profile_id_entry_date_idx" ON "public"."daily_entry"("client_profile_id", "entry_date");
CREATE INDEX "daily_entry_revision_client_setup_pin_id_idx" ON "public"."daily_entry_revision"("client_setup_pin_id");
CREATE INDEX "daily_entry_revision_client_profile_id_idx" ON "public"."daily_entry_revision"("client_profile_id");
CREATE INDEX "daily_entry_revision_daily_entry_id_declared_at_idx" ON "public"."daily_entry_revision"("daily_entry_id", "declared_at");
CREATE INDEX "daily_entry_revision_value_parameter_id_idx" ON "public"."daily_entry_revision_value"("parameter_id");
-- C2 provider: per-client parameter history counting.
CREATE INDEX "daily_entry_revision_value_parameter_revision_idx" ON "public"."daily_entry_revision_value"("parameter_id", "revision_id");
