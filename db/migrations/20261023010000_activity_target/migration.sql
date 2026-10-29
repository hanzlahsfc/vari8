-- Issue #169 (Stage 5 card 07): day-effective activity target versions.
--
-- One row per (client_profile_id, metric, effective_from) boundary. Each row
-- is either a prescription (kind set, stopped_at NULL) or a stop (kind NULL,
-- stopped_at set), the resolver picks the latest row with effective_from <=
-- the asked date, so a stop row supersedes the prescription without rewriting
-- earlier days. A same-day write replaces the row in place and bumps the
-- revision; the unique key is what makes "same day" a single row.
--
-- 1. metric stores the tracker metric key verbatim: 'steps' | 'cardioMin'
--    (raw CHECK closes the set).
-- 2. Raw CHECKs carry the domain shape Prisma cannot express: the cardio
--    columns must arrive together and exactly on kind CARDIO, range bounds
--    must be ordered, every prescription number is positive
--    (sessions_per_week is a whole number with no cap; minutes_per_session
--    is NUMERIC so fractions are accepted), and kind/stopped_at pair up.
-- 3. Composite coherence FKs pin (client, creator) tuples to the workspace,
--    matching the supplement_plan convention.

CREATE TYPE "public"."ActivityTargetKind" AS ENUM ('MINIMUM', 'MAXIMUM', 'RANGE', 'FIXED', 'CARDIO');

CREATE TABLE "public"."activity_target" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "kind" "public"."ActivityTargetKind",
    "step_min" INTEGER,
    "step_max" INTEGER,
    "sessions_per_week" INTEGER,
    "minutes_per_session" NUMERIC(10, 2),
    "effective_from" DATE NOT NULL,
    "stopped_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_by_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "activity_target_pkey" PRIMARY KEY ("id")
);

-- One version per client per metric per day.
CREATE UNIQUE INDEX "activity_target_client_metric_day_key" ON "public"."activity_target"("client_profile_id", "metric", "effective_from");
CREATE UNIQUE INDEX "activity_target_id_workspace_id_key" ON "public"."activity_target"("id", "workspace_id");
CREATE INDEX "activity_target_workspace_client_idx" ON "public"."activity_target"("workspace_id", "client_profile_id", "metric", "effective_from");

-- Content CHECKs.
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_metric_check" CHECK ("metric" IN ('steps', 'cardioMin'));
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_stop_pairing_check" CHECK (("kind" IS NULL) = ("stopped_at" IS NOT NULL));
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_cardio_columns_check" CHECK (("kind" = 'CARDIO') = ("sessions_per_week" IS NOT NULL AND "minutes_per_session" IS NOT NULL));
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_cardio_no_steps_check" CHECK ("kind" IS DISTINCT FROM 'CARDIO' OR ("step_min" IS NULL AND "step_max" IS NULL));
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_steps_presence_check" CHECK ("kind" IS NULL OR "kind" = 'CARDIO' OR "step_min" IS NOT NULL OR "step_max" IS NOT NULL);
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_range_order_check" CHECK ("step_min" IS NULL OR "step_max" IS NULL OR "step_min" <= "step_max");
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_step_min_positive_check" CHECK ("step_min" IS NULL OR "step_min" > 0);
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_step_max_positive_check" CHECK ("step_max" IS NULL OR "step_max" > 0);
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_sessions_positive_check" CHECK ("sessions_per_week" IS NULL OR "sessions_per_week" > 0);
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_minutes_positive_check" CHECK ("minutes_per_session" IS NULL OR "minutes_per_session" > 0);
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_revision_check" CHECK ("revision" > 0);

-- Declared foreign keys.
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."activity_target" ADD CONSTRAINT "activity_target_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/provenance coherence claim.
ALTER TABLE "public"."activity_target"
    ADD CONSTRAINT "activity_target_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."activity_target"
    ADD CONSTRAINT "activity_target_creator_workspace_fkey"
    FOREIGN KEY ("created_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
