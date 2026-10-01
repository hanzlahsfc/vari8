import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  importNutritionCatalog,
  NutritionImportError,
} from "../../lib/nutrition/import";
import {
  listNutritionCategories,
  searchNutritionCatalog,
} from "../../lib/nutrition/search";
import {
  extractNutritionSource,
  type NutritionSource,
  type NutritionSourceRecord,
} from "../../lib/nutrition/source";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

function record(
  overrides: Partial<NutritionSourceRecord> & { sourceNo: number },
): NutritionSourceRecord {
  return {
    sourceRow: overrides.sourceNo + 1,
    name: `Item ${overrides.sourceNo}`,
    amount: 100,
    unit: "g",
    calories: 100,
    protein: 10,
    carbs: 10,
    fats: 1,
    state: null,
    category: "PRO",
    rowFingerprint: `fp-${overrides.sourceNo}`,
    ...overrides,
  };
}

function source(overrides: Partial<NutritionSource>): NutritionSource {
  const accepted = overrides.accepted ?? [];
  const rejected = overrides.rejected ?? [];
  const duplicates = overrides.duplicates ?? [];
  const sourceRowCount =
    overrides.sourceRowCount ??
    accepted.length + rejected.length + duplicates.length;
  const ignoredEmptyRowCount = overrides.ignoredEmptyRowCount ?? 0;
  return {
    sourceName: "fixture.html",
    sourceFingerprint: "fp-fixture",
    headerRow: 1,
    columns: {
      no: 2,
      food: 3,
      amount: 4,
      unit: 5,
      calories: 6,
      protein: 7,
      carbs: 8,
      fats: 9,
      state: 10,
      category: 11,
    },
    sourceRowCount,
    ignoredEmptyRowCount,
    scannedRowCount: sourceRowCount + ignoredEmptyRowCount,
    accepted,
    rejected,
    duplicates,
    ...overrides,
  };
}

describe.skipIf(!enabled)(
  "Phase 2.1 Nutrition catalog import (real PG)",
  () => {
    let prisma: PrismaClient;
    beforeAll(async () => {
      execFileSync("npx", ["prisma", "migrate", "deploy"], {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: url as string },
      });
      prisma = new PrismaClient({
        datasources: { db: { url: url as string } },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "nutrition_import_row_outcome","nutrition_import_run","nutrition_catalog_item" RESTART IDENTITY CASCADE',
      );
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("imports an extracted source atomically with reconciled counts", async () => {
      const html = `<table class="waffle"><tbody>
      <tr><td>NO.</td><td>FOOD</td><td>AMOUNT</td><td>UNIT</td><td>CALORIES (kcal)</td><td>PROTEIN (g)</td><td>CARBS (g)</td><td>FATS (g)</td><td>COOKED/RAW/DRY</td><td>CAT</td></tr>
      <tr><td>1</td><td>Chicken Breast (Cooked)</td><td>100</td><td>g</td><td>145</td><td>32</td><td>0</td><td>1.9</td><td>Cooked Weight</td><td>PRO</td></tr>
      <tr><td>2</td><td>Lean Beef Mince (Raw)</td><td>100</td><td>g</td><td>125</td><td>21.9</td><td>0</td><td>4.2</td><td>Raw Weight</td><td>PRO</td></tr>
      <tr><td>3</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>Footer note</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody></table>`;
      const extracted = extractNutritionSource(html, {
        sourceName: "fixture.html",
        sourceFingerprint: "fp-extracted",
      });
      expect(extracted).toMatchObject({ accepted: expect.any(Array) });
      expect(extracted.accepted).toHaveLength(2);
      expect(extracted.rejected).toHaveLength(2);
      expect(extracted.sourceRowCount).toBe(4);

      const summary = await importNutritionCatalog(prisma, extracted);
      expect(summary).toMatchObject({
        status: "SUCCESS",
        acceptedCount: 2,
        rejectedCount: 2,
        duplicateCount: 0,
        insertedCount: 2,
        updatedCount: 0,
        unchangedCount: 0,
        sourceRowCount: 4,
      });

      const items = await prisma.nutritionCatalogItem.findMany({
        orderBy: { sourceNo: "asc" },
      });
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        sourceNo: 1,
        name: "Chicken Breast (Cooked)",
        calories: 145,
        protein: 32,
        category: "PRO",
        state: "Cooked Weight",
      });

      const outcomes = await prisma.nutritionImportRowOutcome.findMany({
        where: { importRunId: summary.runId },
        orderBy: { sourceRow: "asc" },
      });
      expect(outcomes.map((o) => [o.outcome, o.reasonCode])).toEqual([
        ["IMPORTED", null],
        ["IMPORTED", null],
        ["REJECTED", "missing_food"],
        ["REJECTED", "non_data_row"],
      ]);
      // Provenance stores no raw payload columns.
      expect(Object.keys(outcomes[0])).not.toContain("payload");
    });

    it("is idempotent: an identical re-run changes and inserts nothing", async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "nutrition_import_row_outcome","nutrition_import_run","nutrition_catalog_item" RESTART IDENTITY CASCADE',
      );
      const src = source({
        sourceFingerprint: "fp-identical",
        accepted: [
          record({ sourceNo: 1 }),
          record({ sourceNo: 2, name: "Beef" }),
        ],
      });
      const first = await importNutritionCatalog(prisma, src);
      expect(first).toMatchObject({
        insertedCount: 2,
        updatedCount: 0,
        unchangedCount: 0,
      });
      const before = await prisma.nutritionCatalogItem.findMany({
        orderBy: { sourceNo: "asc" },
      });

      const second = await importNutritionCatalog(prisma, src);
      expect(second).toMatchObject({
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 2,
        status: "SUCCESS",
      });
      const after = await prisma.nutritionCatalogItem.findMany({
        orderBy: { sourceNo: "asc" },
      });
      expect(after).toEqual(before);
      expect(await prisma.nutritionImportRun.count()).toBe(2);
    });

    it("updates only rows whose content fingerprint changed", async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "nutrition_import_row_outcome","nutrition_import_run","nutrition_catalog_item" RESTART IDENTITY CASCADE',
      );
      await importNutritionCatalog(
        prisma,
        source({
          accepted: [
            record({ sourceNo: 1 }),
            record({ sourceNo: 2, name: "Beef" }),
          ],
        }),
      );
      const summary = await importNutritionCatalog(
        prisma,
        source({
          accepted: [
            record({ sourceNo: 1 }),
            record({
              sourceNo: 2,
              name: "Beef",
              calories: 999,
              rowFingerprint: "fp-2-changed",
            }),
          ],
        }),
      );
      expect(summary).toMatchObject({
        insertedCount: 0,
        updatedCount: 1,
        unchangedCount: 1,
      });
      const beef = await prisma.nutritionCatalogItem.findUniqueOrThrow({
        where: { sourceNo: 2 },
      });
      expect(beef.calories).toBe(999);
      expect(beef.rowFingerprint).toBe("fp-2-changed");
    });

    it("fails closed on reconciliation mismatch with no partial write", async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "nutrition_import_row_outcome","nutrition_import_run","nutrition_catalog_item" RESTART IDENTITY CASCADE',
      );
      const bad = source({
        accepted: [record({ sourceNo: 1 })],
        // sourceRowCount (declared 99) does not equal accepted+rejected+duplicate.
        sourceRowCount: 99,
      });
      await expect(importNutritionCatalog(prisma, bad)).rejects.toMatchObject({
        name: "NutritionImportError",
        code: "reconciliation_failed",
      });
      expect(await prisma.nutritionCatalogItem.count()).toBe(0);
      expect(await prisma.nutritionImportRun.count()).toBe(0);
    });

    it("rolls back the whole transaction when a later write fails", async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "nutrition_import_row_outcome","nutrition_import_run","nutrition_catalog_item" RESTART IDENTITY CASCADE',
      );
      const failing = source({
        accepted: [record({ sourceNo: 1 })],
        // Two rejected outcomes share a sourceRow, violating the per-run unique
        // key at outcome-insert time — after the catalog insert has run.
        rejected: [
          { sourceRow: 50, sourceNo: null, reasonCode: "non_data_row" },
          { sourceRow: 50, sourceNo: null, reasonCode: "missing_food" },
        ],
      });
      await expect(
        importNutritionCatalog(prisma, failing),
      ).rejects.toBeInstanceOf(NutritionImportError);
      expect(await prisma.nutritionCatalogItem.count()).toBe(0);
      expect(await prisma.nutritionImportRun.count()).toBe(0);
    });

    it("searches by bounded, case-insensitive source name and category", async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE "nutrition_import_row_outcome","nutrition_import_run","nutrition_catalog_item" RESTART IDENTITY CASCADE',
      );
      await importNutritionCatalog(
        prisma,
        source({
          accepted: [
            record({
              sourceNo: 1,
              name: "Chicken Breast (Cooked)",
              category: "PRO",
            }),
            record({ sourceNo: 2, name: "Chicken Thigh", category: "PRO" }),
            record({ sourceNo: 3, name: "Lean Beef", category: "PRO" }),
            record({ sourceNo: 4, name: "White Rice", category: "CHO" }),
          ],
        }),
      );

      const belowMin = await searchNutritionCatalog(prisma, { query: "c" });
      expect(belowMin).toMatchObject({
        queryApplied: false,
        total: 0,
        items: [],
      });

      const empty = await searchNutritionCatalog(prisma, { query: "  " });
      expect(empty.queryApplied).toBe(false);

      const chicken = await searchNutritionCatalog(prisma, {
        query: "chicken",
      });
      expect(chicken.queryApplied).toBe(true);
      expect(chicken.total).toBe(2);
      expect(chicken.items.map((i) => i.sourceNo)).toEqual([1, 2]);

      const limited = await searchNutritionCatalog(prisma, {
        query: "chicken",
        limit: 1,
      });
      expect(limited.items).toHaveLength(1);
      expect(limited.total).toBe(2);
      expect(limited.limit).toBe(1);

      const categoryMiss = await searchNutritionCatalog(prisma, {
        query: "chicken",
        category: "CHO",
      });
      expect(categoryMiss.total).toBe(0);

      const noMatch = await searchNutritionCatalog(prisma, { query: "zzzzz" });
      expect(noMatch).toMatchObject({
        queryApplied: true,
        total: 0,
        items: [],
      });

      const categories = await listNutritionCategories(prisma);
      expect(categories).toEqual(["CHO", "PRO"]);
    });

    it("ships the pg_trgm GIN index used by name search", async () => {
      const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
        "SELECT indexdef FROM pg_indexes WHERE indexname = 'nutrition_catalog_item_name_trgm_idx'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toMatch(/USING gin/i);
      expect(rows[0].indexdef).toMatch(/gin_trgm_ops/i);
    });
  },
);
