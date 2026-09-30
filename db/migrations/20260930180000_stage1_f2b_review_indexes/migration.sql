-- S1-F2B repair (independent-review): supporting indexes.
--
-- 1. `listAccountAuditEvents` paginates with an `id` cursor and orders by `id`
--    scoped to one subject. The existing (subject_user_id, at) index does not
--    serve that access pattern; (subject_user_id, id) does.
--
-- 2. `cleanupTerminalAccessTokens` selects at most 1000 rows whose effective
--    terminal timestamp T is older than the retention cutoff, ordered
--    deterministically. T is exactly the semantics of the delete predicate:
--      consumed+revoked  -> GREATEST(consumed_at, revoked_at)
--      consumed only     -> consumed_at
--      revoked only      -> revoked_at
--      neither           -> expires_at  (active rows have a future T and are
--                                        never selected)
--    (T, id) serves the WHERE range scan and the ORDER BY T, id LIMIT without
--    a sort. 'epoch' is the GREATEST-neutral element for absent timestamps.

CREATE INDEX "audit_event_subject_user_id_id_idx"
    ON "audit_event" ("subject_user_id", "id");

CREATE INDEX "access_token_terminal_cleanup_idx" ON "access_token" (
    (
        GREATEST(
            COALESCE("consumed_at", 'epoch'::timestamptz),
            COALESCE("revoked_at", 'epoch'::timestamptz),
            CASE
                WHEN "consumed_at" IS NULL AND "revoked_at" IS NULL
                THEN "expires_at"
                ELSE 'epoch'::timestamptz
            END
        )
    ),
    "id"
);
