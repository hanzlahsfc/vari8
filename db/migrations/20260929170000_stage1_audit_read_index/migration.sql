-- S1-E P4 repair: `listAuditEvents` paginates by `id` cursor under `workspaceId`,
-- so the read path needs (workspace_id, id). Additive only; the chronological
-- (workspace_id, at) index stays.
CREATE INDEX "audit_event_workspace_id_id_idx" ON "audit_event"("workspace_id", "id");
