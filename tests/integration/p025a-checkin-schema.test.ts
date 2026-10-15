import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * P-025-A Check-In schema contract — asserted directly against real
 * PostgreSQL catalog. Synthetic fixtures only. The P-025-B slice later
 * added the instance/submission/answer trio (reviewed); the
 * `checkin_review` table remains absent — P-025-C.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("P-025-A schema — tables/columns/constraints", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({ datasources: { db: { url: url as string } } });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const columns = (table: string) =>
    prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
      table,
    );

  it("checkin_form exists with the reviewed columns", async () => {
    const cols = (await columns("checkin_form")).map((c) => c.column_name);
    for (const expected of [
      "id",
      "workspace_id",
      "name",
      "status",
      "draft",
      "draft_revision",
      "draft_saved_by_member_id",
      "draft_updated_at",
      "archived_at",
      "archived_by_member_id",
      "created_by_member_id",
      "created_at",
      "updated_at",
    ]) {
      expect(cols, `missing column ${expected}`).toContain(expected);
    }
  });

  it("checkin_form_version exists with the reviewed columns", async () => {
    const cols = (await columns("checkin_form_version")).map(
      (c) => c.column_name,
    );
    for (const expected of [
      "id",
      "workspace_id",
      "form_id",
      "version_seq",
      "definition",
      "publish_origin_revision",
      "published_at",
      "published_by_member_id",
    ]) {
      expect(cols, `missing column ${expected}`).toContain(expected);
    }
  });

  it("CheckIn enums exist and the onboarding-named kinds are not reused", async () => {
    const enums = await prisma.$queryRawUnsafe<
      Array<{ typname: string; enumlabel: string }>
    >(
      `SELECT t.typname, e.enumlabel FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname IN ('CheckInFormStatus','CheckInAnswerKind')
       ORDER BY t.typname, e.enumsortorder`,
    );
    const byEnum = (name: string) =>
      enums.filter((e) => e.typname === name).map((e) => e.enumlabel);
    expect(byEnum("CheckInFormStatus")).toEqual(["ACTIVE", "ARCHIVED"]);
    expect(byEnum("CheckInAnswerKind")).toEqual([
      "SHORT_TEXT",
      "LONG_TEXT",
      "NUMBER",
      "DATE",
      "SINGLE_CHOICE",
      "MULTI_CHOICE",
    ]);
  });

  it("version uniqueness: (form_id, version_seq) AND (form_id, publish_origin_revision)", async () => {
    const idx = await prisma.$queryRawUnsafe<
      Array<{ indexname: string; indexdef: string }>
    >(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='checkin_form_version'",
    );
    const seqUnique = idx.find(
      (i) =>
        i.indexdef.includes("UNIQUE") &&
        i.indexdef.includes("form_id") &&
        i.indexdef.includes("version_seq"),
    );
    expect(seqUnique, "missing UNIQUE(form_id, version_seq)").toBeDefined();
    const replayUnique = idx.find(
      (i) =>
        i.indexdef.includes("UNIQUE") &&
        i.indexdef.includes("form_id") &&
        i.indexdef.includes("publish_origin_revision"),
    );
    expect(
      replayUnique,
      "missing UNIQUE(form_id, publish_origin_revision) replay authority",
    ).toBeDefined();
  });

  it("composite coherence targets exist", async () => {
    const idx = await prisma.$queryRawUnsafe<
      Array<{ indexname: string; indexdef: string }>
    >(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('checkin_form','checkin_form_version')",
    );
    const formTarget = idx.find(
      (i) =>
        i.indexdef.includes("UNIQUE") &&
        i.indexdef.includes("id") &&
        i.indexdef.includes("workspace_id"),
    );
    expect(formTarget, "missing UNIQUE(id, workspace_id)").toBeDefined();
    const versionTarget = idx.find(
      (i) =>
        i.indexdef.includes("UNIQUE") &&
        i.indexdef.includes("id") &&
        i.indexdef.includes("workspace_id") &&
        i.indexdef.includes("form_id"),
    );
    expect(
      versionTarget,
      "missing UNIQUE(id, workspace_id, form_id)",
    ).toBeDefined();
  });

  it("every form/version FK is ON DELETE RESTRICT (history anchored)", async () => {
    const fks = await prisma.$queryRawUnsafe<
      Array<{ conname: string; confdeltype: string }>
    >(
      `SELECT c.conname, c.confdeltype
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname IN ('checkin_form','checkin_form_version')
         AND c.contype = 'f'`,
    );
    expect(fks.length).toBeGreaterThanOrEqual(8);
    for (const fk of fks) {
      expect(fk.confdeltype, `${fk.conname} must be RESTRICT`).toBe("r");
    }
    const names = fks.map((f) => f.conname).sort();
    for (const expected of [
      "checkin_form_workspace_id_fkey",
      "checkin_form_created_by_member_id_fkey",
      "checkin_form_archived_by_member_id_fkey",
      "checkin_form_draft_saver_workspace_fkey",
      "checkin_form_creator_workspace_fkey",
      "checkin_form_archiver_workspace_fkey",
      "checkin_form_version_form_id_fkey",
      "checkin_form_version_workspace_id_fkey",
      "checkin_form_version_form_workspace_fkey",
      "checkin_form_version_published_by_member_id_fkey",
      "checkin_form_version_publisher_workspace_fkey",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("no Check-In review table exists in this slice (P-025-C deferred)", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    );
    const names = rows.map((r) => r.table_name);
    // P-025-A reviewed the definition pair; P-025-B reviewed the
    // instance + submission pair; P-025-C reviewed `checkin_review`.
    // Anything else proves scope creep (P-025-D has no schema yet).
    const reviewed = new Set([
      "checkin_form",
      "checkin_form_version",
      "checkin_instance",
      "checkin_submission",
      "checkin_submission_answer",
      "checkin_review",
      // CHECK-IN-FEEDBACK-I1 (decision 112): append-only staff feedback.
      "checkin_feedback",
    ]);
    for (const n of names) {
      if (!n.startsWith("checkin_")) continue;
      expect(reviewed, `unexpected checkin table ${n}`).toContain(n);
    }
  });

  it("composite member-FK enforces same-workspace provenance", async () => {
    // Seed two workspaces + members; a version row whose
    // published_by_member_id belongs to ANOTHER workspace must violate the
    // composite (member, workspace) foreign key.
    const wsA = await prisma.workspace.create({
      data: { name: "A", slug: `p25s-a-${Date.now()}`, status: "ACTIVE" },
    });
    const wsB = await prisma.workspace.create({
      data: { name: "B", slug: `p25s-b-${Date.now()}`, status: "ACTIVE" },
    });
    const u = await prisma.user.create({
      data: {
        email: `p25s-${Date.now()}@example.test`,
        passwordHash: "x",
        name: "U",
        platformRole: "USER",
        status: "ACTIVE",
      },
    });
    const mA = await prisma.workspaceMember.create({
      data: {
        workspaceId: wsA.id,
        userId: u.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const mB = await prisma.workspaceMember.create({
      data: {
        workspaceId: wsB.id,
        userId: u.id,
        role: "WORKSPACE_OWNER",
        status: "ACTIVE",
      },
    });
    const form = await prisma.checkInForm.create({
      data: {
        workspaceId: wsA.id,
        name: "F",
        createdByMemberId: mA.id,
        draft: { title: "F", fields: [] },
      },
    });
    await expect(
      prisma.checkInFormVersion.create({
        data: {
          workspaceId: wsA.id,
          formId: form.id,
          versionSeq: 1,
          definition: { title: "F", fields: [] },
          publishOriginRevision: 1,
          // mB belongs to wsB — cross-workspace provenance must fail.
          publishedByMemberId: mB.id,
        },
      }),
    ).rejects.toThrow();
    const count = await prisma.checkInFormVersion.count({
      where: { formId: form.id },
    });
    expect(count).toBe(0);
  });
});
