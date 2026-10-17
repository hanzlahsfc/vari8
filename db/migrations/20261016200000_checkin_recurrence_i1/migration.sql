-- CHECK-IN-RECURRENCE-I1 (decision #114): bounded weekly Check-In
-- schedule rules + generation provenance on instances (reviewed P3
-- contract + P3-R1 refinements). Owner-approved bounded first version:
-- one weekday/week at a chosen local time in a coach-confirmed IANA
-- zone; explicit staff generation to an 8-week horizon (T+56
-- inclusive); pause blocks generation; End is terminal and cancels
-- still-unsubmitted generated occurrences; no automatic replenishment.
--
-- 1. Additive only — no existing table, constraint, or index changes
--    except two nullable columns on checkin_instance.
-- 2. checkin_schedule_rule:
--    - local_time_minutes CHECK 0–1439; end_date >= start_date CHECK;
--      paired ended_at/ended_by_member_id CHECK (mirrors cancellation
--      provenance); replaced_by_rule_id unique (at most one replacement).
--    - composite unique (id, workspace_id, client_profile_id) = the
--      coherence target for the instance's raw origin FK.
-- 3. checkin_instance link columns:
--    - unique(origin_rule_id, occurrence_date) = occurrence identity
--      (multi-NULL safe — manual rows carry both NULL).
--    - CHECK both-set-or-both-null (P3-R1 P3-4).
--    - raw composite FK (origin_rule_id, workspace_id,
--      client_profile_id) → rule coherence key — a generated row can
--      never drift to a foreign client/workspace tuple.
-- 4. Restrict FKs everywhere — history is never cascade-deleted.

CREATE TYPE "public"."CheckInScheduleRuleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');
CREATE TYPE "public"."CheckInWeekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

CREATE TABLE "public"."checkin_schedule_rule" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "weekday" "public"."CheckInWeekday" NOT NULL,
    "local_time_minutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "public"."CheckInScheduleRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_member_id" TEXT NOT NULL,
    "paused_at" TIMESTAMPTZ(6),
    "paused_by_member_id" TEXT,
    "ended_at" TIMESTAMPTZ(6),
    "ended_by_member_id" TEXT,
    "replaced_by_rule_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checkin_schedule_rule_pkey" PRIMARY KEY ("id")
);

-- Generation provenance on instances (both nullable — manual rows carry
-- neither; the CHECK below enforces both-set-or-both-null).
ALTER TABLE "public"."checkin_instance"
    ADD COLUMN "origin_rule_id" TEXT,
    ADD COLUMN "occurrence_date" DATE;

-- Composite coherence target for the instance's raw origin FK.
CREATE UNIQUE INDEX "checkin_schedule_rule_coherence_key" ON "public"."checkin_schedule_rule"("id", "workspace_id", "client_profile_id");

-- At most one replacement per rule.
CREATE UNIQUE INDEX "checkin_schedule_rule_replaced_by_rule_id_key" ON "public"."checkin_schedule_rule"("replaced_by_rule_id");

-- Staff per-client rule listing.
CREATE INDEX "checkin_schedule_rule_workspace_id_client_profile_id_status_idx" ON "public"."checkin_schedule_rule"("workspace_id", "client_profile_id", "status");

-- Occurrence identity: one generated row per (rule, local date).
CREATE UNIQUE INDEX "checkin_instance_occurrence_key" ON "public"."checkin_instance"("origin_rule_id", "occurrence_date");
CREATE INDEX "checkin_instance_origin_rule_id_idx" ON "public"."checkin_instance"("origin_rule_id");

-- Field CHECKs.
ALTER TABLE "public"."checkin_schedule_rule"
    ADD CONSTRAINT "checkin_schedule_rule_minutes_check"
    CHECK ("local_time_minutes" >= 0 AND "local_time_minutes" <= 1439);
ALTER TABLE "public"."checkin_schedule_rule"
    ADD CONSTRAINT "checkin_schedule_rule_dates_check"
    CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "public"."checkin_schedule_rule"
    ADD CONSTRAINT "checkin_schedule_rule_end_pairing_check"
    CHECK (("ended_at" IS NULL) = ("ended_by_member_id" IS NULL));
ALTER TABLE "public"."checkin_instance"
    ADD CONSTRAINT "checkin_instance_origin_pairing_check"
    CHECK (("origin_rule_id" IS NULL) = ("occurrence_date" IS NULL));

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."checkin_schedule_rule" ADD CONSTRAINT "checkin_schedule_rule_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_schedule_rule" ADD CONSTRAINT "checkin_schedule_rule_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_schedule_rule" ADD CONSTRAINT "checkin_schedule_rule_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."checkin_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_schedule_rule" ADD CONSTRAINT "checkin_schedule_rule_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_schedule_rule" ADD CONSTRAINT "checkin_schedule_rule_paused_by_member_id_fkey" FOREIGN KEY ("paused_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_schedule_rule" ADD CONSTRAINT "checkin_schedule_rule_ended_by_member_id_fkey" FOREIGN KEY ("ended_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_schedule_rule" ADD CONSTRAINT "checkin_schedule_rule_replaced_by_rule_id_fkey" FOREIGN KEY ("replaced_by_rule_id") REFERENCES "public"."checkin_schedule_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_instance" ADD CONSTRAINT "checkin_instance_origin_rule_id_fkey" FOREIGN KEY ("origin_rule_id") REFERENCES "public"."checkin_schedule_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite coherence FK: a generated instance can never drift to a
-- foreign client/workspace tuple (P3-R1 P3-4).
ALTER TABLE "public"."checkin_instance"
    ADD CONSTRAINT "checkin_instance_origin_coherence_fkey"
    FOREIGN KEY ("origin_rule_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."checkin_schedule_rule"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
