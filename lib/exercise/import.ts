import type { PrismaClient } from "@prisma/client";

import type { ExerciseSource, ExerciseSourceRecord } from "./source";

/**
 * Phase 2.2 — transactional, idempotent Exercise Database import.
 *
 * The whole import runs in one interactive transaction: catalog writes and
 * provenance commit together, so a failure can never leave a partially written
 * catalog (or a run row without its data). This slice is upsert-only — rows
 * removed from a later source are deliberately NOT deleted. Re-importing
 * identical source content touches nothing (fingerprint equality), and counts
 * are reconciled before the run is reported successful.
 */

export class ExerciseImportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExerciseImportError";
  }
}

export type ExerciseImportSummary = {
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

function toData(record: ExerciseSourceRecord, now: Date) {
  return {
    sourceId: record.sourceId,
    rowFingerprint: record.rowFingerprint,
    name: record.name,
    muscleGroup: record.muscleGroup,
    primaryTarget: record.primaryTarget,
    additionalTargets: record.additionalTargets,
    equipment: record.equipment,
    movementPattern: record.movementPattern,
    positionSetup: record.positionSetup,
    cues: record.cues,
    videoLink: record.videoLink,
    firstImportedAt: now,
    updatedAt: now,
  };
}

export async function importExerciseCatalog(
  client: PrismaClient,
  source: ExerciseSource,
  now: Date = new Date(),
): Promise<ExerciseImportSummary> {
  const { accepted, rejected, duplicates } = source;

  try {
    return await client.$transaction(async (tx) => {
      // 1. Reconcile the supplied classification before any write.
      if (
        source.sourceRowCount !==
        accepted.length + rejected.length + duplicates.length
      ) {
        throw new ExerciseImportError(
          "reconciliation_failed",
          `sourceRowCount ${source.sourceRowCount} != accepted ${accepted.length} + rejected ${rejected.length} + duplicate ${duplicates.length}`,
        );
      }
      if (
        source.scannedRowCount !==
        source.sourceRowCount + source.ignoredEmptyRowCount
      ) {
        throw new ExerciseImportError(
          "reconciliation_failed",
          `scannedRowCount ${source.scannedRowCount} != sourceRowCount ${source.sourceRowCount} + ignoredEmpty ${source.ignoredEmptyRowCount}`,
        );
      }

      // 2. Partition accepted rows into insert / update / unchanged by
      //    (sourceId, content fingerprint).
      const existing = new Map(
        (accepted.length === 0
          ? []
          : await tx.exerciseCatalogItem.findMany({
              where: { sourceId: { in: accepted.map((r) => r.sourceId) } },
              select: { sourceId: true, rowFingerprint: true },
            })
        ).map((row) => [row.sourceId, row.rowFingerprint]),
      );

      const inserts: ExerciseSourceRecord[] = [];
      const updates: ExerciseSourceRecord[] = [];
      let unchangedCount = 0;
      for (const record of accepted) {
        const previous = existing.get(record.sourceId);
        if (previous === undefined) inserts.push(record);
        else if (previous !== record.rowFingerprint) updates.push(record);
        else unchangedCount += 1;
      }

      // 3. Write catalog changes.
      if (inserts.length > 0) {
        await tx.exerciseCatalogItem.createMany({
          data: inserts.map((record) => toData(record, now)),
        });
      }
      for (const record of updates) {
        await tx.exerciseCatalogItem.update({
          where: { sourceId: record.sourceId },
          data: toData(record, now),
        });
      }

      // 4. Re-reconcile the write outcome.
      if (
        accepted.length !==
        inserts.length + updates.length + unchangedCount
      ) {
        throw new ExerciseImportError(
          "reconciliation_failed",
          "accepted rows were not fully accounted for",
        );
      }

      // 5. Provenance: run header + one machine-readable outcome per candidate.
      const run = await tx.exerciseImportRun.create({
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

      await tx.exerciseImportRowOutcome.createMany({
        data: [
          ...accepted.map((record) => ({
            importRunId: run.id,
            sourceRow: record.sourceRow,
            sourceId: record.sourceId,
            outcome: "IMPORTED" as const,
            reasonCode: null,
            reasonField: null,
          })),
          ...rejected.map((row) => ({
            importRunId: run.id,
            sourceRow: row.sourceRow,
            sourceId: row.sourceId,
            outcome: "REJECTED" as const,
            reasonCode: row.reasonCode,
            reasonField: row.reasonField ?? null,
          })),
          ...duplicates.map((row) => ({
            importRunId: run.id,
            sourceRow: row.sourceRow,
            sourceId: row.sourceId,
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
    if (error instanceof ExerciseImportError) throw error;
    throw new ExerciseImportError(
      "write_failed",
      error instanceof Error ? error.message : "exercise import failed",
    );
  }
}
