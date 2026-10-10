-- P-025-C: staff Check-In review acknowledgement (decisions #86–#91
-- carried by #96). One workspace-terminal immutable review per
-- submission — records only who reviewed and when; no notes, no
-- feedback, no workflow gate.
--
-- 1. unique(submission_id) is the #86-analog terminal anchor — at most
--    one review per submission; P2002 → bounded full-protocol re-entry.
-- 2. Composite coherence FKs (raw SQL — Prisma cannot express
--    multi-column relations):
--    - review → checkin_submission(id, workspace_id, client_profile_id)
--      — a review can never drift to a foreign/incoherent submission
--    - review → client_profile(id, workspace_id)
--    - reviewer → workspace_member(id, workspace_id)
-- 3. Restrict FKs everywhere — history is never cascade-deleted.
-- 4. No updated_at — the acknowledgement is immutable once committed.

CREATE TABLE "public"."checkin_review" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "reviewed_by_member_id" TEXT NOT NULL,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_review_pkey" PRIMARY KEY ("id")
);

-- Terminal anchor: exactly one review per submission.
CREATE UNIQUE INDEX "checkin_review_submission_id_key" ON "public"."checkin_review"("submission_id");

-- Bounded staff list lookup.
CREATE INDEX "checkin_review_workspace_id_client_profile_id_idx" ON "public"."checkin_review"("workspace_id", "client_profile_id");

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."checkin_review" ADD CONSTRAINT "checkin_review_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_review" ADD CONSTRAINT "checkin_review_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_review" ADD CONSTRAINT "checkin_review_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."checkin_submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_review" ADD CONSTRAINT "checkin_review_reviewed_by_member_id_fkey" FOREIGN KEY ("reviewed_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/provenance coherence claim.
ALTER TABLE "public"."checkin_review"
    ADD CONSTRAINT "checkin_review_coherence_fkey"
    FOREIGN KEY ("submission_id", "workspace_id", "client_profile_id")
    REFERENCES "public"."checkin_submission"("id", "workspace_id", "client_profile_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_review"
    ADD CONSTRAINT "checkin_review_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."checkin_review"
    ADD CONSTRAINT "checkin_review_reviewer_workspace_fkey"
    FOREIGN KEY ("reviewed_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
