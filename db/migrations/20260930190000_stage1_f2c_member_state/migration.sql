-- S1-F2C repair (independent-review): causal membership-state generation and
-- invitation listing index.
--
-- 1. `workspace_member.state_version` is a DB-owned monotonically increasing
--    generation: the trigger increments it iff status/role change and always
--    derives the value from OLD (a caller can never set it, including direct
--    SQL). Causality without clocks: a suspension/removal bumps the
--    generation in the same statement that changes the state, so "invitation
--    issued before the transition" is a value inequality, never a timestamp
--    comparison across application/database clocks.
-- 2. `access_token.target_member_state_version` snapshots the generation of
--    the target (workspace, email→user) membership at invitation issuance
--    (NULL = no member existed). Acceptance requires the snapshot to equal
--    the member's CURRENT generation — pre-transition invitations are stale
--    and fail closed.
-- 3. `access_token_ws_invite_list_idx` serves the owner-only listing:
--    WHERE workspace_id+purpose ORDER BY id LIMIT — removes the seqscan+sort.

ALTER TABLE "workspace_member"
    ADD COLUMN "state_version" INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION workspace_member_state_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.state_version := 0;
    ELSIF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.role IS DISTINCT FROM OLD.role THEN
        NEW.state_version := OLD.state_version + 1;
    ELSE
        NEW.state_version := OLD.state_version;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_member_state_version_guard
    BEFORE INSERT OR UPDATE ON "workspace_member"
    FOR EACH ROW EXECUTE FUNCTION workspace_member_state_guard();

ALTER TABLE "access_token"
    ADD COLUMN "target_member_state_version" INTEGER;

-- Impossible shapes: resets never carry a member snapshot; invite snapshots
-- are absent (no member at issuance) or a non-negative generation.
ALTER TABLE "access_token"
    ADD CONSTRAINT "access_token_invite_member_state_shape" CHECK (
        ("purpose" = 'WORKSPACE_INVITE' AND (
            "target_member_state_version" IS NULL
            OR "target_member_state_version" >= 0
        ))
        OR ("purpose" <> 'WORKSPACE_INVITE' AND "target_member_state_version" IS NULL)
    );

CREATE INDEX "access_token_ws_invite_list_idx"
    ON "access_token" ("workspace_id", "purpose", "id");
