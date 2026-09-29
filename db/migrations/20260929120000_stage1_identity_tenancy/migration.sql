-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'INVITED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('WORKSPACE_OWNER', 'COACH', 'ASSISTANT_COACH', 'SUPPORT', 'CLIENT');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('PRIMARY', 'COACH');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platform_role" "PlatformRole" NOT NULL DEFAULT 'USER',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_member" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'INVITED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_profile" (
    "id" TEXT NOT NULL,
    "workspace_member_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_profile" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_assignment" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "client_profile_id" TEXT NOT NULL,
    "coach_member_id" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_slug_key" ON "workspace"("slug");

-- CreateIndex
CREATE INDEX "workspace_member_workspace_id_status_idx" ON "workspace_member"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "workspace_member_workspace_id_role_idx" ON "workspace_member"("workspace_id", "role");

-- CreateIndex
CREATE INDEX "workspace_member_user_id_idx" ON "workspace_member"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_member_workspace_id_user_id_key" ON "workspace_member"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_member_id_workspace_id_key" ON "workspace_member"("id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "coach_profile_workspace_member_id_key" ON "coach_profile"("workspace_member_id");

-- CreateIndex
CREATE INDEX "client_profile_workspace_id_idx" ON "client_profile"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_profile_workspace_id_user_id_key" ON "client_profile"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_profile_id_workspace_id_key" ON "client_profile"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "client_assignment_workspace_id_idx" ON "client_assignment"("workspace_id");

-- CreateIndex
CREATE INDEX "client_assignment_coach_member_id_status_idx" ON "client_assignment"("coach_member_id", "status");

-- CreateIndex
CREATE INDEX "client_assignment_client_profile_id_status_idx" ON "client_assignment"("client_profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "client_assignment_client_profile_id_coach_member_id_key" ON "client_assignment"("client_profile_id", "coach_member_id");

-- AddForeignKey
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_profile" ADD CONSTRAINT "coach_profile_workspace_member_id_fkey" FOREIGN KEY ("workspace_member_id") REFERENCES "workspace_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_assignment" ADD CONSTRAINT "client_assignment_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_assignment" ADD CONSTRAINT "client_assignment_coach_member_id_fkey" FOREIGN KEY ("coach_member_id") REFERENCES "workspace_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- S1-A: enforce the same-workspace invariant at the database level.
-- Prisma cannot express two relations sharing workspace_id, so these composite
-- foreign keys are added with raw SQL against the composite unique keys above.
ALTER TABLE "client_assignment"
    ADD CONSTRAINT "client_assignment_client_workspace_fkey"
    FOREIGN KEY ("client_profile_id", "workspace_id")
    REFERENCES "client_profile"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_assignment"
    ADD CONSTRAINT "client_assignment_member_workspace_fkey"
    FOREIGN KEY ("coach_member_id", "workspace_id")
    REFERENCES "workspace_member"("id", "workspace_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- S1-A: at most one ACTIVE PRIMARY assignment per client.
CREATE UNIQUE INDEX "client_assignment_one_active_primary_key"
    ON "client_assignment" ("client_profile_id")
    WHERE "status" = 'ACTIVE'::"AssignmentStatus" AND "role" = 'PRIMARY'::"AssignmentRole";
