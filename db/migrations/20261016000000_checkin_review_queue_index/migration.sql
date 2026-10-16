-- CHECK-IN-OVERVIEW-I1 (approved CHECK-IN-OVERVIEW-P2 contract):
-- workspace-level "awaiting review" queue on checkin_submission.
-- The list orders submitted_at ASC,id ASC with a keyset cursor inside
-- a single workspace; neither existing index ((workspace_id,id) nor
-- (workspace_id,client_profile_id)) serves that ordered scan, and the
-- reviewed-history tail grows unbounded. This composite supports the
-- ORDER BY + keyset predicate directly; the reviews: none anti-join
-- uses checkin_review's unique(submission_id).
--
-- Index-only migration — no table shape changes, no raw-FK drift.

CREATE INDEX "checkin_submission_workspace_id_submitted_at_id_idx"
    ON "public"."checkin_submission"("workspace_id", "submitted_at", "id");
