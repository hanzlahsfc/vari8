-- DASHBOARD-I1-R2: correct the I1 timestamp drift — the original
-- migration emitted TIMESTAMP(6) (no time zone) for created_at/
-- updated_at while db/schema.prisma declares @db.Timestamptz(6)
-- (repo convention, matching every sibling table).
--
-- Conversion semantics for existing synthetic rows: PostgreSQL casts
-- each stored local timestamp to timestamptz using the *session*
-- TimeZone at ALTER time. Rows were written by synthetic test/dev
-- databases only; interpreting their naive values in the session zone
-- is acceptable for this development-stage correction and is the
-- repo-standard forward migration (no data reset, no history rewrite).

ALTER TABLE "public"."client_dashboard_layout"
    ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(6),
    ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(6);
