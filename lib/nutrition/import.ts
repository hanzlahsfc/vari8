import type { PrismaClient } from "@prisma/client";

import type { NutritionSource, NutritionSourceRecord } from "./source";

/**
 * Phase 2.1 — transactional, idempotent Nutrition Database import.
 *
 * The whole import runs in one interactive transaction: the catalog is only
 * ever swapped atomically, so a failure can never leave a partially replaced
 * catalog. Re-importing identical source content touches nothing (fingerprint
 * equality), and counts are reconciled before the run is reported successful.
 */

export class NutritionImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NutritionImportError";
  }
}

export type NutritionImportSummary = {
  runId: string;
  status: string;
  scannedRowCount: number;
  sourceRowCount: number;
  ignoredEmptyRowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
};

function toData(record: NutritionSourceRecord, now: Date) {
  return {
    sourceNo: record.sourceNo,
    rowFingerprint: record.rowFingerprint,
    name: record.name,
    amount: record.amount,
    unit: record.unit,
    calories: record.calories,
    protein: record.protein,
    carbs: record.carbs,
    fats: record.fats,
    state: record.state,
    category: record.category,
    firstImportedAt: now,
    updatedAt: now,
  };
}

export async function importNutritionCatalog(
  client: PrismaClient,
  source: NutritionSource,
  now: Date = new Date(),
): Promise<NutritionImportSummary> {
  const { accepted, rejected, duplicates } = source;

  try {
    return await client.$transaction(async (tx) => {
      // 1. Reconcile the supplied classification before any write.
      if (
        source.sourceRowCount !==
        accepted.length + rejected.length + duplicates.length
      ) {
        throw new NutritionImportError(
          "reconciliation_failed",
          `sourceRowCount ${source.sourceRowCount} != accepted ${accepted.length} + rejected ${rejected.length} + duplicate ${duplicates.length}`,
        );
      }
      if (
        source.scannedRowCount !==
        source.sourceRowCount + source.ignoredEmptyRowCount
      ) {
        throw new NutritionImportError(
          "reconciliation_failed",
          `scannedRowCount ${source.scannedRowCount} != sourceRowCount ${source.sourceRowCount} + ignoredEmpty ${source.ignoredEmptyRowCount}`,
        );
      }

      // 2. Partition accepted rows into insert / update / unchanged by
      //    (sourceNo, content fingerprint).
      const existing = new Map(
        (accepted.length === 0
          ? []
          : await tx.nutritionCatalogItem.findMany({
              where: { sourceNo: { in: accepted.map((r) => r.sourceNo) } },
              select: { sourceNo: true, rowFingerprint: true },
            })
        ).map((row) => [row.sourceNo, row.rowFingerprint]),
      );

      const inserts: NutritionSourceRecord[] = [];
      const updates: NutritionSourceRecord[] = [];
      let unchangedCount = 0;
      for (const record of accepted) {
        const previous = existing.get(record.sourceNo);
        if (previous === undefined) inserts.push(record);
        else if (previous !== record.rowFingerprint) updates.push(record);
        else unchangedCount += 1;
      }

      // 3. Write catalog changes.
      if (inserts.length > 0) {
        await tx.nutritionCatalogItem.createMany({
          data: inserts.map((record) => toData(record, now)),
        });
      }
      for (const record of updates) {
        await tx.nutritionCatalogItem.update({
          where: { sourceNo: record.sourceNo },
          data: toData(record, now),
        });
      }

      // 4. Re-reconcile the write outcome.
      if (
        accepted.length !==
        inserts.length + updates.length + unchangedCount
      ) {
        throw new NutritionImportError(
          "reconciliation_failed",
          "accepted rows were not fully accounted for",
        );
      }

      // 5. Provenance: run header + one machine-readable outcome per candidate.
      const run = await tx.nutritionImportRun.create({
        data: {
          sourceName: source.sourceName,
          sourceFingerprint: source.sourceFingerprint,
          scannedRowCount: source.scannedRowCount,
          sourceRowCount: source.sourceRowCount,
          ignoredEmptyRowCount: source.ignoredEmptyRowCount,
          acceptedCount: accepted.length,
          rejectedCount: rejected.length,
          duplicateCount: duplicates.length,
          insertedCount: inserts.length,
          updatedCount: updates.length,
          unchangedCount,
          status: "SUCCESS",
          startedAt: now,
          completedAt: new Date(),
        },
      });

      await tx.nutritionImportRowOutcome.createMany({
        data: [
          ...accepted.map((record) => ({
            importRunId: run.id,
            sourceRow: record.sourceRow,
            sourceNo: record.sourceNo,
            outcome: "IMPORTED" as const,
            reasonCode: null,
            reasonField: null,
          })),
          ...rejected.map((row) => ({
            importRunId: run.id,
            sourceRow: row.sourceRow,
            sourceNo: row.sourceNo,
            outcome: "REJECTED" as const,
            reasonCode: row.reasonCode,
            reasonField: row.reasonField ?? null,
          })),
          ...duplicates.map((row) => ({
            importRunId: run.id,
            sourceRow: row.sourceRow,
            sourceNo: row.sourceNo,
            outcome: "DUPLICATE" as const,
            reasonCode: row.reasonCode,
            reasonField: row.reasonField ?? null,
          })),
        ],
      });

      return {
        runId: run.id,
        status: run.status,
        scannedRowCount: source.scannedRowCount,
        sourceRowCount: source.sourceRowCount,
        ignoredEmptyRowCount: source.ignoredEmptyRowCount,
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        duplicateCount: duplicates.length,
        insertedCount: inserts.length,
        updatedCount: updates.length,
        unchangedCount,
      };
    });
  } catch (error) {
    if (error instanceof NutritionImportError) throw error;
    throw new NutritionImportError(
      "write_failed",
      error instanceof Error ? error.message : "nutrition import failed",
    );
  }
}
