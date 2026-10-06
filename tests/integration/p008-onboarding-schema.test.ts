import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * P-008 onboarding-form schema contract — asserted directly against real
 * PostgreSQL catalog, independent of the (not yet existing) service layer.
 * Synthetic fixtures only; the domain intentionally has NO submission tables.
 *
 * Provenance (TDD recovery): written fresh for the recovery branch against
 * the reviewed contract; no production code is assumed to exist.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

describe.skipIf(!enabled)("P-008 schema — tables/columns/constraints", () => {
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

  it("onboarding_form exists with the reviewed columns", async () => {
    const cols = (await columns("onboarding_form")).map((c) => c.column_name);
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

  it("onboarding_form_version exists with the reviewed columns", async () => {
    const cols = (await columns("onboarding_form_version")).map(
      (c) => c.column_name,
    );
    for (const expected of [
      "id",
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

  it("version uniqueness is enforced on (form_id, version_seq)", async () => {
    const idx = await prisma.$queryRawUnsafe<
      Array<{ indexname: string; indexdef: string }>
    >(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='onboarding_form_version'",
    );
    const unique = idx.find(
      (i) =>
        i.indexdef.includes("UNIQUE") &&
        i.indexdef.includes("form_id") &&
        i.indexdef.includes("version_seq"),
    );
    expect(unique, "missing UNIQUE(form_id, version_seq)").toBeDefined();
  });

  it("every form/version FK is ON DELETE RESTRICT (history anchored)", async () => {
    const fks = await prisma.$queryRawUnsafe<
      Array<{ conname: string; confdeltype: string }>
    >(
      `SELECT c.conname, c.confdeltype
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname IN ('onboarding_form','onboarding_form_version')
         AND c.contype = 'f'`,
    );
    expect(fks.length).toBeGreaterThanOrEqual(5);
    for (const fk of fks) {
      expect(fk.confdeltype, `${fk.conname} must be RESTRICT`).toBe("r");
    }
    const names = fks.map((f) => f.conname).sort();
    for (const expected of [
      "onboarding_form_workspace_id_fkey",
      "onboarding_form_created_by_member_id_fkey",
      "onboarding_form_archived_by_member_id_fkey",
      "onboarding_form_version_form_id_fkey",
      "onboarding_form_version_published_by_member_id_fkey",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("no submission/intake tables exist in this slice", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    );
    const names = rows.map((r) => r.table_name);
    for (const n of names) {
      expect(n).not.toMatch(/submission|intake_response|answer/i);
    }
  });
});
