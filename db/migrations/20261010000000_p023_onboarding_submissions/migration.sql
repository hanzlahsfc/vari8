-- P-023: client onboarding submission (decisions #82–#85). Exactly one
-- immutable submission per assignment plus revision-free immutable answer
-- rows; first successful submit atomically transitions the assignment to
-- COMPLETED (service layer — the schema already reserves that status).
--
-- 1. Tenant coherence is DB-enforced by composite foreign keys (raw SQL —
--    Prisma cannot express multi-column relations): the submission's
--    client, form, pinned version, and submitting member must belong to
--    its workspace; the pinned version must belong to the pinned form; and
--    the wide assignment FK proves the submission's
--    (workspace, client, form, version) tuple all belongs to the
--    referenced assignment.
-- 2. OnboardingSubmissionAnswer carries exactly the kind-appropriate
--    typed column: a raw CHECK makes any other shape impossible.
--    Single-choice cardinality (exactly one option) and the multi-choice
--    selection ceiling are DB-enforced; canonical ordering/dedup and
--    option validity remain service-enforced (they reference definition
--    content, not row structure). value_option_ids is a JSON array of
--    option-id strings.
-- 3. unique(assignment_id) is the at-most-one idempotency anchor and the
--    final concurrency authority for double-submit.
-- 4. Restrict FKs everywhere: deleting workspace/client/member/form/
--    version/assignment must not silently erase submission history
--    (retention/erasure remains pending D-10).

CREATE TYPE "public"."OnboardingAnswerKind" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_CHOICE', 'MULTI_CHOICE');

CREATE TABLE "public"."onboarding_submission" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "form_version_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "submitted_by_member_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."onboarding_submission_answer" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "kind" "public"."OnboardingAnswerKind" NOT NULL,
    "value_text" TEXT,
    "value_numeric" NUMERIC(23,6),
    "value_date" DATE,
    "value_option_ids" JSONB,

    CONSTRAINT "onboarding_submission_answer_pkey" PRIMARY KEY ("id")
);

-- Cardinality and composite unique targets.
CREATE UNIQUE INDEX "onboarding_submission_assignment_id_key" ON "public"."onboarding_submission"("assignment_id");
CREATE UNIQUE INDEX "onboarding_submission_id_workspace_id_key" ON "public"."onboarding_submission"("id", "workspace_id");
CREATE UNIQUE INDEX "onboarding_submission_answer_submission_id_field_id_key" ON "public"."onboarding_submission_answer"("submission_id", "field_id");

-- Discovery list + workspace-scoped id-cursor convention.
CREATE INDEX "onboarding_submission_workspace_id_client_profile_id_idx" ON "public"."onboarding_submission"("workspace_id", "client_profile_id");
CREATE INDEX "onboarding_submission_workspace_id_id_idx" ON "public"."onboarding_submission"("workspace_id", "id");
CREATE INDEX "onboarding_submission_answer_workspace_id_idx" ON "public"."onboarding_submission_answer"("workspace_id");

-- The one new wide assignment unique serving the coherence FK target.
CREATE UNIQUE INDEX "onboarding_assignment_wide_coherence_key" ON "public"."onboarding_form_assignment"("id", "workspace_id", "client_profile_id", "form_id", "form_version_id");

-- Exactly the kind-appropriate typed column, plus choice cardinality
-- bounds and the JSON array shape.
ALTER TABLE "public"."onboarding_submission_answer" ADD CONSTRAINT "onboarding_submission_answer_kind_value_ck" CHECK (
    (("kind" IN ('SHORT_TEXT', 'LONG_TEXT')) AND "value_text" IS NOT NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL)
 OR ("kind" = 'NUMBER' AND "value_text" IS NULL AND "value_numeric" IS NOT NULL AND "value_date" IS NULL AND "value_option_ids" IS NULL)
 OR ("kind" = 'DATE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NOT NULL AND "value_option_ids" IS NULL)
 OR ("kind" = 'SINGLE_CHOICE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NOT NULL AND jsonb_typeof("value_option_ids") = 'array' AND jsonb_array_length("value_option_ids") = 1)
 OR ("kind" = 'MULTI_CHOICE' AND "value_text" IS NULL AND "value_numeric" IS NULL AND "value_date" IS NULL AND "value_option_ids" IS NOT NULL AND jsonb_typeof("value_option_ids") = 'array' AND jsonb_array_length("value_option_ids") <= 50)
);

-- Plain foreign keys (as declared in the Prisma schema).
ALTER TABLE "public"."onboarding_submission" ADD CONSTRAINT "onboarding_submission_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_submission" ADD CONSTRAINT "onboarding_submission_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_submission" ADD CONSTRAINT "onboarding_submission_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public"."onboarding_form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_submission" ADD CONSTRAINT "onboarding_submission_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "public"."onboarding_form_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_submission" ADD CONSTRAINT "onboarding_submission_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."onboarding_form_assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_submission" ADD CONSTRAINT "onboarding_submission_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_submission" ADD CONSTRAINT "onboarding_submission_submitted_by_member_id_fkey" FOREIGN KEY ("submitted_by_member_id") REFERENCES "public"."workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."onboarding_submission_answer" ADD CONSTRAINT "onboarding_submission_answer_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."onboarding_submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."onboarding_submission_answer" ADD CONSTRAINT "onboarding_submission_answer_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite foreign keys: every tenant/pin coherence claim in the plan.
ALTER TABLE "public"."onboarding_submission"
    ADD CONSTRAINT "onboarding_submission_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."onboarding_submission"
    ADD CONSTRAINT "onboarding_submission_form_workspace_fkey"
    FOREIGN KEY ("form_id", "workspace_id")
    REFERENCES "public"."onboarding_form"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."onboarding_submission"
    ADD CONSTRAINT "onboarding_submission_version_in_form_fkey"
    FOREIGN KEY ("form_version_id", "form_id")
    REFERENCES "public"."onboarding_form_version"("id", "form_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."onboarding_submission"
    ADD CONSTRAINT "onboarding_submission_assignment_tuple_fkey"
    FOREIGN KEY ("assignment_id", "workspace_id", "client_profile_id", "form_id", "form_version_id")
    REFERENCES "public"."onboarding_form_assignment"("id", "workspace_id", "client_profile_id", "form_id", "form_version_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."onboarding_submission"
    ADD CONSTRAINT "onboarding_submission_member_workspace_fkey"
    FOREIGN KEY ("submitted_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."onboarding_submission_answer"
    ADD CONSTRAINT "onboarding_submission_answer_submission_workspace_fkey"
    FOREIGN KEY ("submission_id", "workspace_id")
    REFERENCES "public"."onboarding_submission"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
