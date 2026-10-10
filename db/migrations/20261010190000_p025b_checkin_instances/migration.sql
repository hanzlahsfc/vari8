-- P-025-B: Check-In instances + immutable client submissions
-- (decisions #92–#97). One-off instances only (#92 — no recurrence);
-- single due_at, no open/close window (#93); no stored lifecycle status —
-- effective state derives from cancellation provenance + child submission
-- rows through the shared projector (#97).
--
-- 1. Tenant/client/form coherence is DB-enforced by composite foreign keys
--    (raw SQL — Prisma cannot express multi-column relations):
--    - instance → client_profile(id, workspace_id)
--    - instance → checkin_form_version(id, workspace_id, form_id) — the
--      pinned version must belong to its form and workspace
--    - instance scheduler/canceller → workspace_member(id, workspace_id)
--    - submission → the FULL instance wide tuple
--      (id, workspace_id, client_profile_id, form_id, form_version_id)
--      so a submission can never drift to a foreign/incoherent instance
--    - submission client/provenance → same-workspace composites
--    - answer → checkin_submission(id, workspace_id, client_profile_id)
-- 2. unique(workspace_id, client_profile_id, form_id, due_at) is the
--    duplicate-scheduling authority (P2002 → bounded re-entry).
-- 3. unique(instance_id) on submissions is the at-most-one + idempotency
--    authority (P2002 → bounded full-protocol re-entry).
-- 4. unique(submission_id, field_id) is the per-field answer authority.
-- 5. Paired cancellation provenance CHECK: cancelled_at and
--    cancelled_by_member_id are both null or both non-null.
-- 6. kind↔column CHECK on answers: exactly the value column for the
--    declared kind may be non-null.
-- 7. Restrict FKs everywhere — history is never cascade-deleted.

CREATE TABLE "public"."checkin_instance" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "form_version_id" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "due_tz" TEXT,
    "scheduled_by_member_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by_member_id" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "checkin_instance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."checkin_submission" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "form_version_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "submitted_by_member_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."checkin_submission_answer" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "kind" "public"."CheckInAnswerKind" NOT NULL,
    "value_text" TEXT,
    "value_numeric" DECIMAL(23,6),
    "value_date" DATE,
    "value_option_ids" JSONB,

    CONSTRAINT "checkin_submission_answer_pkey" PRIMARY KEY ("id")
);

-- Cardinality + composite unique targets.
CREATE UNIQUE INDEX "checkin_instance_wide_coherence_key" ON "public"."checkin_instance"("id", "workspace_id", "client_profile_id", "form_id", "form_version_id");
CREATE UNIQUE INDEX "checkin_instance_duplicate_schedule_key" ON "public"."checkin_instance"("workspace_id", "client_profile_id", "form_id", "due_at");
CREATE UNIQUE INDEX "checkin_submission_instance_id_key" ON "public"."checkin_submission"("instance_id");
CREATE UNIQUE INDEX "checkin_submission_coherence_key" ON "public"."checkin_submission"("id", "workspace_id", "client_profile_id");
CREATE UNIQUE INDEX "checkin_submission_answer_submission_id_field_id_key" ON "public"."checkin_submission_answer"("submission_id", "field_id");

-- Bounded lookup indexes.
CREATE INDEX "checkin_instance_workspace_id_client_profile_id_due_at_idx" ON "public"."checkin_instance"("workspace_id", "client_profile_id", "due_at");
CREATE INDEX "checkin_instance_workspace_id_id_idx" ON "public"."checkin_instance"("workspace_id", "id");
CREATE INDEX "checkin_instance_form_version_id_idx" ON "public"."checkin_instance"("form_version_id");
CREATE INDEX "checkin_submission_workspace_id_client_profile_id_idx" ON "public"."checkin_submission"("workspace_id", "client_profile_id");
CREATE INDEX "checkin_submission_workspace_id_id_idx" ON "public"."checkin_submission"("workspace_id", "id");
CREATE INDEX "checkin_submission_answer_workspace_id_idx" ON "public"."checkin_submission_answer"("workspace_id");

-- Paired cancellation provenance: both null or both non-null.
ALTER TABLE "public"."checkin_instance"
    ADD CONSTRAINT "checkin_instance_cancel_pairing_check"
    CHECK (("cancelled_at" IS NULL) = ("cancelled_by_member_id" IS NULL));

-- Answer kind↔column shape: exactly the value column for the declared
-- kind may be non-null.
ALTER TABLE "public"."checkin_submission_answer"
    ADD CONSTRAINT "checkin_submission_answer_kind_column_check"
    CHECK (
        ("kind" = 'SHORT_TEXT' AND "value_text" IS NOT NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL)
     OR ("kind" = 'LONG_TEXT' AND "value_text" IS NOT NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL)
     OR ("kind" = 'NUMBER' AND "value_text" IS NULL AND "value_numeric" IS NOT NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL)
     OR ("kind" = 'DATE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NOT NULL AND "value_option_ids" IS NULL)
     OR ("kind" = 'SINGLE_CHOICE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NOT NULL)
     OR ("kind" = 'MULTI_CHOICE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NOT NULL)
    );

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."checkin_instance" ADD CONSTRAINT "checkin_instance_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_instance" ADD CONSTRAINT "checkin_instance_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_instance" ADD CONSTRAINT "checkin_instance_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."checkin_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_instance" ADD CONSTRAINT "checkin_instance_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "public"."checkin_form_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_instance" ADD CONSTRAINT "checkin_instance_scheduled_by_member_id_fkey" FOREIGN KEY ("scheduled_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_instance" ADD CONSTRAINT "checkin_instance_cancelled_by_member_id_fkey" FOREIGN KEY ("cancelled_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_submission" ADD CONSTRAINT "checkin_submission_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_submission" ADD CONSTRAINT "checkin_submission_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_submission" ADD CONSTRAINT "checkin_submission_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."checkin_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_submission" ADD CONSTRAINT "checkin_submission_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "public"."checkin_form_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_submission" ADD CONSTRAINT "checkin_submission_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."checkin_instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_submission" ADD CONSTRAINT "checkin_submission_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_submission" ADD CONSTRAINT "checkin_submission_submitted_by_member_id_fkey" FOREIGN KEY ("submitted_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_submission_answer" ADD CONSTRAINT "checkin_submission_answer_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."checkin_submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_submission_answer" ADD CONSTRAINT "checkin_submission_answer_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_submission_answer" ADD CONSTRAINT "checkin_submission_answer_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/provenance coherence claim.
ALTER TABLE "public"."checkin_instance"
    ADD CONSTRAINT "checkin_instance_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_instance"
    ADD CONSTRAINT "checkin_instance_version_coherence_fkey"
    FOREIGN KEY ("form_version_id", "workspace_id", "form_id")
    REFERENCES "public"."checkin_form_version"("id", "workspace_id", "form_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_instance"
    ADD CONSTRAINT "checkin_instance_scheduler_workspace_fkey"
    FOREIGN KEY ("scheduled_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_instance"
    ADD CONSTRAINT "checkin_instance_canceller_workspace_fkey"
    FOREIGN KEY ("cancelled_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_instance"
    ADD CONSTRAINT "checkin_instance_form_workspace_fkey"
    FOREIGN KEY ("form_id", "workspace_id")
    REFERENCES "public"."checkin_form"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_submission"
    ADD CONSTRAINT "checkin_submission_instance_coherence_fkey"
    FOREIGN KEY ("instance_id", "workspace_id", "client_profile_id", "form_id", "form_version_id")
    REFERENCES "public"."checkin_instance"("id", "workspace_id", "client_profile_id", "form_id", "form_version_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_submission"
    ADD CONSTRAINT "checkin_submission_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_submission"
    ADD CONSTRAINT "checkin_submission_submitter_workspace_fkey"
    FOREIGN KEY ("submitted_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_submission_answer"
    ADD CONSTRAINT "checkin_submission_answer_coherence_fkey"
    FOREIGN KEY ("submission_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."checkin_submission"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
