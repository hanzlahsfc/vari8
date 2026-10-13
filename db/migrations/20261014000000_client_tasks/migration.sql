-- CLIENT-TASKS-I1 (decision #109): staff-assigned client tasks. Bounded
-- coach-authored title, declared due DATE (never an instant), lifecycle
-- provenance, CAS revision. RESTRICT everywhere; the composite
-- coherence FK + status/provenance CHECKs are raw SQL.

CREATE TYPE "public"."ClientTaskStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- 1. Prisma-declared table
CREATE TABLE "public"."client_task" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "public"."ClientTaskStatus" NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "assigned_by_member_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_by_user_id" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_by_member_id" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_task_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_task_id_workspace_id_key"
    ON "public"."client_task"("id", "workspace_id");
CREATE INDEX "client_task_workspace_id_client_profile_id_due_date_idx"
    ON "public"."client_task"("workspace_id", "client_profile_id", "due_date");
CREATE INDEX "client_task_workspace_id_client_profile_id_status_idx"
    ON "public"."client_task"("workspace_id", "client_profile_id", "status");

-- 2. Prisma-declared single-column relations (RESTRICT; the completedBy
--    pointer follows the ConsentRecord.grantedBy SetNull precedent — the
--    durable provenance bound is completed_at, enforced below).
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_client_profile_id_fkey"
    FOREIGN KEY ("client_profile_id") REFERENCES "public"."client_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_assigned_by_member_id_fkey"
    FOREIGN KEY ("assigned_by_member_id") REFERENCES "public"."workspace_member"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_completed_by_user_id_fkey"
    FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_cancelled_by_member_id_fkey"
    FOREIGN KEY ("cancelled_by_member_id") REFERENCES "public"."workspace_member"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Raw SQL — same-workspace coherence + lifecycle/provenance invariants.

-- The task's client profile must live in the same workspace.
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_client_coherence_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "public"."client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The assigning member must belong to the same workspace.
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_assigner_coherence_fkey"
    FOREIGN KEY ("assigned_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The cancelling member (when set) must belong to the same workspace.
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_canceller_coherence_fkey"
    FOREIGN KEY ("cancelled_by_member_id", "workspace_id")
    REFERENCES "public"."workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Title: non-empty after trimming, bounded at 120 chars.
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_title_bound"
    CHECK (btrim("title") <> '' AND length(btrim("title")) <= 120);

-- COMPLETED ⇔ completed_at set; the SetNull-able user pointer is
-- deliberately excluded (it is best-effort provenance, see schema).
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_completed_provenance"
    CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL));

-- CANCELLED ⇔ cancelled_at set.
ALTER TABLE "public"."client_task"
    ADD CONSTRAINT "client_task_cancelled_provenance"
    CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));
