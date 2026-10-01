import { execFileSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ExerciseImportError,
  importExerciseCatalog,
} from "../../lib/exercise/import";
import {
  listExerciseEquipment,
  listExerciseMuscleGroups,
  searchExerciseCatalog,
} from "../../lib/exercise/search";
import {
  extractExerciseSource,
  type ExerciseSource,
  type ExerciseSourceRecord,
} from "../../lib/exercise/source";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = typeof url === "string" && url.length > 0;

function record(
  overrides: Partial<ExerciseSourceRecord> & { sourceId: number },
): ExerciseSourceRecord {
  return {
    sourceRow: overrides.sourceId + 1,
    name: `Exercise ${overrides.sourceId}`,
    muscleGroup: "Core",
    primaryTarget: "Abdominals",
    additionalTargets: null,
    equipment: "Bodyweight",
    movementPattern: "Anti-Extension",
    positionSetup: "Prone",
    cues: null,
    videoLink: null,
    rowFingerprint: `fp-${overrides.sourceId}`,
    ...overrides,
  };
}

function source(overrides: Partial<ExerciseSource>): ExerciseSource {
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
      id: 2,
      name: 3,
      muscleGroup: 4,
      primaryTarget: 5,
      additionalTargets: 6,
      equipment: 7,
      movementPattern: 8,
      positionSetup: 9,
      cues: 10,
      videoLink: 11,
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

const TRUNCATE =
  'TRUNCATE "exercise_import_row_outcome","exercise_import_run","exercise_catalog_item" RESTART IDENTITY CASCADE';

describe.skipIf(!enabled)("Phase 2.2 Exercise catalog import (real PG)", () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url as string },
    });
    prisma = new PrismaClient({
      datasources: { db: { url: url as string } },
    });
    await prisma.$executeRawUnsafe(TRUNCATE);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("imports an extracted source atomically with reconciled counts", async () => {
    const html = `<table class="waffle"><tbody>
      <tr><td>ID</td><td>Exercise Name</td><td>Muscle Group</td><td>Primary Target</td><td>Additional Target(s)</td><td>Equipment</td><td>Movement Pattern</td><td>Position / Setup</td><td>Coaching Notes / Cues</td><td>Video Link</td></tr>
      <tr><td>1</td><td>Back Squat</td><td>Quadriceps</td><td>Quadriceps</td><td>Gluteus Maximus</td><td>Barbell</td><td>Squat</td><td>Standing</td><td>Brace the trunk.</td><td></td></tr>
      <tr><td>2</td><td>Plank</td><td>Core</td><td>Abdominals</td><td></td><td>Bodyweight</td><td>Anti-Extension</td><td>Prone</td><td></td><td></td></tr>
      <tr><td>3</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>Footer note</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody></table>`;
    const extracted = extractExerciseSource(html, {
      sourceName: "fixture.html",
      sourceFingerprint: "fp-extracted",
    });
    expect(extracted.accepted).toHaveLength(2);
    expect(extracted.rejected).toHaveLength(2);
    expect(extracted.sourceRowCount).toBe(4);

    const summary = await importExerciseCatalog(prisma, extracted);
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

    const items = await prisma.exerciseCatalogItem.findMany({
      orderBy: { sourceId: "asc" },
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      sourceId: 1,
      name: "Back Squat",
      muscleGroup: "Quadriceps",
      primaryTarget: "Quadriceps",
      additionalTargets: "Gluteus Maximus",
      equipment: "Barbell",
      movementPattern: "Squat",
      positionSetup: "Standing",
      cues: "Brace the trunk.",
      videoLink: null,
    });

    const outcomes = await prisma.exerciseImportRowOutcome.findMany({
      where: { importRunId: summary.runId },
      orderBy: { sourceRow: "asc" },
    });
    expect(outcomes.map((o) => [o.outcome, o.reasonCode])).toEqual([
      ["IMPORTED", null],
      ["IMPORTED", null],
      ["REJECTED", "missing_name"],
      ["REJECTED", "non_data_row"],
    ]);
    // Provenance stores no raw payload columns.
    expect(Object.keys(outcomes[0])).not.toContain("payload");
  });

  it("is idempotent: an identical re-run changes and inserts nothing", async () => {
    await prisma.$executeRawUnsafe(TRUNCATE);
    const src = source({
      sourceFingerprint: "fp-identical",
      accepted: [
        record({ sourceId: 1 }),
        record({ sourceId: 2, name: "Beef" }),
      ],
    });
    const first = await importExerciseCatalog(prisma, src);
    expect(first).toMatchObject({
      insertedCount: 2,
      updatedCount: 0,
      unchangedCount: 0,
    });
    const before = await prisma.exerciseCatalogItem.findMany({
      orderBy: { sourceId: "asc" },
    });

    const second = await importExerciseCatalog(prisma, src);
    expect(second).toMatchObject({
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 2,
      status: "SUCCESS",
    });
    const after = await prisma.exerciseCatalogItem.findMany({
      orderBy: { sourceId: "asc" },
    });
    expect(after).toEqual(before);
    expect(await prisma.exerciseImportRun.count()).toBe(2);
  });

  it("updates only rows whose content fingerprint changed", async () => {
    await prisma.$executeRawUnsafe(TRUNCATE);
    await importExerciseCatalog(
      prisma,
      source({
        accepted: [
          record({ sourceId: 1 }),
          record({ sourceId: 2, name: "Plank" }),
        ],
      }),
    );
    const summary = await importExerciseCatalog(
      prisma,
      source({
        accepted: [
          record({ sourceId: 1 }),
          record({
            sourceId: 2,
            name: "Plank",
            equipment: "Cable",
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
    const plank = await prisma.exerciseCatalogItem.findUniqueOrThrow({
      where: { sourceId: 2 },
    });
    expect(plank.equipment).toBe("Cable");
    expect(plank.rowFingerprint).toBe("fp-2-changed");
  });

  it("fails closed on reconciliation mismatch with no partial write", async () => {
    await prisma.$executeRawUnsafe(TRUNCATE);
    const bad = source({
      accepted: [record({ sourceId: 1 })],
      // sourceRowCount (declared 99) does not equal accepted+rejected+duplicate.
      sourceRowCount: 99,
    });
    await expect(importExerciseCatalog(prisma, bad)).rejects.toMatchObject({
      name: "ExerciseImportError",
      code: "reconciliation_failed",
    });
    expect(await prisma.exerciseCatalogItem.count()).toBe(0);
    expect(await prisma.exerciseImportRun.count()).toBe(0);
  });

  it("rolls back the whole transaction when a later write fails", async () => {
    await prisma.$executeRawUnsafe(TRUNCATE);
    const failing = source({
      accepted: [record({ sourceId: 1 })],
      // Two rejected outcomes share a sourceRow, violating the per-run unique
      // key at outcome-insert time — after the catalog insert has run.
      rejected: [
        { sourceRow: 50, sourceId: null, reasonCode: "non_data_row" },
        { sourceRow: 50, sourceId: null, reasonCode: "missing_name" },
      ],
    });
    await expect(importExerciseCatalog(prisma, failing)).rejects.toBeInstanceOf(
      ExerciseImportError,
    );
    expect(await prisma.exerciseCatalogItem.count()).toBe(0);
    expect(await prisma.exerciseImportRun.count()).toBe(0);
  });

  it("records duplicate source IDs as outcomes without merging rows", async () => {
    await prisma.$executeRawUnsafe(TRUNCATE);
    const html = `<table class="waffle"><tbody>
      <tr><td>ID</td><td>Exercise Name</td><td>Muscle Group</td><td>Primary Target</td><td>Additional Target(s)</td><td>Equipment</td><td>Movement Pattern</td><td>Position / Setup</td><td>Coaching Notes / Cues</td><td>Video Link</td></tr>
      <tr><td>1</td><td>Back Squat</td><td>Quadriceps</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>1</td><td>Front Squat</td><td>Quadriceps</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody></table>`;
    const extracted = extractExerciseSource(html, {
      sourceName: "fixture-dup.html",
      sourceFingerprint: "fp-dup",
    });
    expect(extracted.accepted).toHaveLength(1);
    expect(extracted.duplicates).toHaveLength(1);
    const summary = await importExerciseCatalog(prisma, extracted);
    expect(summary).toMatchObject({
      acceptedCount: 1,
      duplicateCount: 1,
      insertedCount: 1,
    });
    const outcomes = await prisma.exerciseImportRowOutcome.findMany({
      where: { importRunId: summary.runId, outcome: "DUPLICATE" },
    });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].reasonCode).toBe("duplicate_source_id");
    expect(await prisma.exerciseCatalogItem.count()).toBe(1);
  });

  it("searches by bounded, case-insensitive name and exact facets", async () => {
    await prisma.$executeRawUnsafe(TRUNCATE);
    await importExerciseCatalog(
      prisma,
      source({
        accepted: [
          record({
            sourceId: 1,
            name: "Back Squat",
            muscleGroup: "Quadriceps",
            equipment: "Barbell",
          }),
          record({
            sourceId: 2,
            name: "Front Squat",
            muscleGroup: "Quadriceps",
            equipment: "Barbell",
          }),
          record({
            sourceId: 3,
            name: "Goblet Squat",
            muscleGroup: "Quadriceps",
            equipment: "Dumbbell",
          }),
          record({
            sourceId: 4,
            name: "Lat Pulldown",
            muscleGroup: "Back",
            equipment: "Cable",
          }),
        ],
      }),
    );

    const belowMin = await searchExerciseCatalog(prisma, { query: "s" });
    expect(belowMin).toMatchObject({
      queryApplied: false,
      total: 0,
      items: [],
    });

    const empty = await searchExerciseCatalog(prisma, { query: "  " });
    expect(empty.queryApplied).toBe(false);

    const squat = await searchExerciseCatalog(prisma, { query: "squat" });
    expect(squat.queryApplied).toBe(true);
    expect(squat.total).toBe(3);
    expect(squat.items.map((i) => i.sourceId)).toEqual([1, 2, 3]);

    const limited = await searchExerciseCatalog(prisma, {
      query: "squat",
      limit: 2,
    });
    expect(limited.items).toHaveLength(2);
    expect(limited.total).toBe(3);
    expect(limited.limit).toBe(2);

    // The limit is clamped to a safe 1..50 band (never unbounded).
    expect(
      (await searchExerciseCatalog(prisma, { query: "squat", limit: 999 }))
        .limit,
    ).toBe(50);
    expect(
      (await searchExerciseCatalog(prisma, { query: "squat", limit: 0 })).limit,
    ).toBe(1);
    expect(
      (
        await searchExerciseCatalog(prisma, {
          query: "squat",
          limit: Number.NaN,
        })
      ).limit,
    ).toBe(1);

    const byMuscle = await searchExerciseCatalog(prisma, {
      query: "squat",
      muscleGroup: "Back",
    });
    expect(byMuscle.total).toBe(0);
    const byEquipment = await searchExerciseCatalog(prisma, {
      query: "squat",
      equipment: "Dumbbell",
    });
    expect(byEquipment.total).toBe(1);
    expect(byEquipment.items[0].sourceId).toBe(3);
    const both = await searchExerciseCatalog(prisma, {
      query: "squat",
      muscleGroup: "Quadriceps",
      equipment: "Barbell",
    });
    expect(both.total).toBe(2);

    const noMatch = await searchExerciseCatalog(prisma, {
      query: "zzzzz",
    });
    expect(noMatch).toMatchObject({
      queryApplied: true,
      total: 0,
      items: [],
    });

    expect(await listExerciseMuscleGroups(prisma)).toEqual([
      "Back",
      "Quadriceps",
    ]);
    expect(await listExerciseEquipment(prisma)).toEqual([
      "Barbell",
      "Cable",
      "Dumbbell",
    ]);
  });

  it("ships the pg_trgm GIN index used by name search", async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'exercise_catalog_item_name_trgm_idx'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/USING gin/i);
    expect(rows[0].indexdef).toMatch(/gin_trgm_ops/i);
  });
});
