-- P-020B: C2 template-version transitions — pin lineage (product-decisions
-- #58–#62 + P-020-R3 §23/§24 + R3.1 addendum 4). Additive only: every column
-- is nullable, so existing C1 pins satisfy the all-NULL lineage branch.
--
-- 1. Lineage: `supersedes_pin_id` is UNIQUE (a pin is superseded at most
--    once — anti-branching, NOT an idempotency key), cannot self-reference,
--    and must point at a pin of the SAME ClientSetup via the composite
--    foreign key (the (id, client_setup_id) unique target is added below).
--    All FKs are ON DELETE RESTRICT.
-- 2. `transition_kind` is a closed enum {UPGRADE, ROLLBACK};
--    `transition_summary` is a versioned structural-only JSONB object.
-- 3. Coupled CHECK: either all three lineage fields are NULL (C1 pins) or
--    all three are non-NULL (transition pins).
-- 4. Summary CHECKs: JSON object; schemaVersion 1; direction ∈
--    {UPGRADE,ROLLBACK}; transition_kind::text must equal
--    transition_summary->>'direction'; categories object with the six
--    required keys, each a non-negative integer; reasonCodes a JSON array.
--    Exact-key and closed-reason-union validation remains service-side.

CREATE TYPE "public"."PinTransitionKind" AS ENUM ('UPGRADE', 'ROLLBACK');

ALTER TABLE "public"."client_setup_pin"
    ADD COLUMN "supersedes_pin_id" TEXT,
    ADD COLUMN "transition_kind" "public"."PinTransitionKind",
    ADD COLUMN "transition_summary" JSONB;

-- A pin may be superseded by at most one successor (lineage/anti-branching).
CREATE UNIQUE INDEX "client_setup_pin_supersedes_pin_id_key"
    ON "public"."client_setup_pin"("supersedes_pin_id");

-- Composite target for the same-ClientSetup lineage foreign key.
CREATE UNIQUE INDEX "client_setup_pin_id_client_setup_id_key"
    ON "public"."client_setup_pin"("id", "client_setup_id");

-- Plain self-FK matching the Prisma relation, plus the stronger composite
-- same-setup FK (raw SQL — Prisma cannot express the pair).
ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_supersedes_pin_id_fkey"
    FOREIGN KEY ("supersedes_pin_id")
    REFERENCES "public"."client_setup_pin"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_supersedes_same_setup_fkey"
    FOREIGN KEY ("supersedes_pin_id", "client_setup_id")
    REFERENCES "public"."client_setup_pin"("id", "client_setup_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- No self-reference.
ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_no_self_supersede"
    CHECK ("supersedes_pin_id" IS NULL OR "supersedes_pin_id" <> "id");

-- Coupled lineage nullability: all three NULL (C1) or all three non-NULL.
ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_transition_lineage_shape"
    CHECK (
        ("supersedes_pin_id" IS NULL
            AND "transition_kind" IS NULL
            AND "transition_summary" IS NULL)
        OR ("supersedes_pin_id" IS NOT NULL
            AND "transition_kind" IS NOT NULL
            AND "transition_summary" IS NOT NULL)
    );

-- Structural-only summary shape (partial; the closed key/reason allowlists
-- are enforced service-side before insert). Every conjunct uses `?`
-- presence + jsonb_typeof guards — SQL NULL semantics must never let a
-- missing/JSON-null key pass as NULL-check-true.
ALTER TABLE "public"."client_setup_pin"
    ADD CONSTRAINT "client_setup_pin_transition_summary_shape"
    CHECK (
        "transition_summary" IS NULL
        OR (
            jsonb_typeof("transition_summary") = 'object'
            AND "transition_summary" ? 'schemaVersion'
            AND "transition_summary" ? 'direction'
            AND "transition_summary" ? 'categories'
            AND "transition_summary" ? 'reasonCodes'
            AND jsonb_typeof("transition_summary" -> 'schemaVersion') = 'number'
            AND ("transition_summary" ->> 'schemaVersion')::numeric = 1
            AND jsonb_typeof("transition_summary" -> 'direction') = 'string'
            AND ("transition_summary" ->> 'direction')
                IN ('UPGRADE', 'ROLLBACK')
            AND "transition_kind"::text
                = "transition_summary" ->> 'direction'
            AND jsonb_typeof("transition_summary" -> 'categories') = 'object'
            AND "transition_summary" -> 'categories' ? 'added'
            AND "transition_summary" -> 'categories' ? 'removed'
            AND "transition_summary" -> 'categories' ? 'rebound'
            AND "transition_summary" -> 'categories' ? 'moved'
            AND "transition_summary" -> 'categories' ? 'required'
            AND "transition_summary" -> 'categories' ? 'display'
            AND jsonb_typeof("transition_summary" -> 'categories' -> 'added') = 'number'
            AND jsonb_typeof("transition_summary" -> 'categories' -> 'removed') = 'number'
            AND jsonb_typeof("transition_summary" -> 'categories' -> 'rebound') = 'number'
            AND jsonb_typeof("transition_summary" -> 'categories' -> 'moved') = 'number'
            AND jsonb_typeof("transition_summary" -> 'categories' -> 'required') = 'number'
            AND jsonb_typeof("transition_summary" -> 'categories' -> 'display') = 'number'
            AND ("transition_summary" -> 'categories' ->> 'added')::numeric >= 0
            AND ("transition_summary" -> 'categories' ->> 'removed')::numeric >= 0
            AND ("transition_summary" -> 'categories' ->> 'rebound')::numeric >= 0
            AND ("transition_summary" -> 'categories' ->> 'moved')::numeric >= 0
            AND ("transition_summary" -> 'categories' ->> 'required')::numeric >= 0
            AND ("transition_summary" -> 'categories' ->> 'display')::numeric >= 0
            AND ("transition_summary" -> 'categories' ->> 'added')::numeric
                = trunc(("transition_summary" -> 'categories' ->> 'added')::numeric)
            AND ("transition_summary" -> 'categories' ->> 'removed')::numeric
                = trunc(("transition_summary" -> 'categories' ->> 'removed')::numeric)
            AND ("transition_summary" -> 'categories' ->> 'rebound')::numeric
                = trunc(("transition_summary" -> 'categories' ->> 'rebound')::numeric)
            AND ("transition_summary" -> 'categories' ->> 'moved')::numeric
                = trunc(("transition_summary" -> 'categories' ->> 'moved')::numeric)
            AND ("transition_summary" -> 'categories' ->> 'required')::numeric
                = trunc(("transition_summary" -> 'categories' ->> 'required')::numeric)
            AND ("transition_summary" -> 'categories' ->> 'display')::numeric
                = trunc(("transition_summary" -> 'categories' ->> 'display')::numeric)
            AND jsonb_typeof("transition_summary" -> 'reasonCodes') = 'array'
        )
    );
