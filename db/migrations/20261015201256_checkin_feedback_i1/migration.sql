-- CHECK-IN-FEEDBACK-I1: staff-authored plain-text feedback on Check-In
-- submissions (reviewed P3 contract; #101 direction + owner answers).
-- Append-only follow-ups anchored to an exact submission; a
-- CheckInReview must exist first (service-enforced). Records only
-- provenance + bounded text; no updated_at — rows are immutable.
--
-- 1. unique(submission_id, client_request_id) is the idempotency anchor
--    — at most one durable row per (submission, client nonce); P2002 on
--    THIS constraint → bounded full-protocol re-entry.
-- 2. Composite coherence FKs (raw SQL — Prisma cannot express
--    multi-column relations):
--    - feedback → checkin_submission(id, workspace_id,
--      client_profile_id) — feedback can never drift to a
--      foreign/incoherent submission tuple
--    - feedback → client_profile(id, workspace_id)
--    - feedback → workspace_member(id, workspace_id)
-- 3. Restrict FKs everywhere — history is never cascade-deleted.
-- 4. No updated_at — sent feedback is immutable once committed;
--    corrections are new rows.

CREATE TABLE "public"."checkin_feedback" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "authored_by_member_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "client_request_id" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_feedback_pkey" PRIMARY KEY ("id")
);

-- Idempotency anchor: one durable row per (submission, client nonce).
-- Per-submission scoping — the same nonce on another submission is a
-- separate key by design.
CREATE UNIQUE INDEX "checkin_feedback_submission_id_client_request_id_key" ON "public"."checkin_feedback"("submission_id", "client_request_id");

-- ASC keyset pagination order (sentAt, id).
CREATE INDEX "checkin_feedback_submission_id_sent_at_id_idx" ON "public"."checkin_feedback"("submission_id", "sent_at", "id");

-- Bounded staff list lookup.
CREATE INDEX "checkin_feedback_workspace_id_client_profile_id_idx" ON "public"."checkin_feedback"("workspace_id", "client_profile_id");

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."checkin_feedback" ADD CONSTRAINT "checkin_feedback_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_feedback" ADD CONSTRAINT "checkin_feedback_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_feedback" ADD CONSTRAINT "checkin_feedback_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."checkin_submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_feedback" ADD CONSTRAINT "checkin_feedback_authored_by_member_id_fkey" FOREIGN KEY ("authored_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/provenance coherence claim.
ALTER TABLE "public"."checkin_feedback"
    ADD CONSTRAINT "checkin_feedback_coherence_fkey"
    FOREIGN KEY ("submission_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."checkin_submission"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_feedback"
    ADD CONSTRAINT "checkin_feedback_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_feedback"
    ADD CONSTRAINT "checkin_feedback_author_workspace_fkey"
    FOREIGN KEY ("authored_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
