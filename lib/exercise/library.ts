// W2-A2 - workspace exercise-library read.
//
// The workspace-scoped coach library (ExerciseLibraryItem) backs the
// training program editor's exercise picker. Read is a plain scoped
// query: the route capability (`library.manage`) resolves workspace
// membership and role before this runs; there is no per-client consent
// gate on workspace-owned reference data.

import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";

export type ExerciseLibraryEntry = {
  id: string;
  name: string;
  muscle: string;
  secondaryMuscles: string[];
  notes: string;
};

export async function listExerciseLibraryItems(
  input: { workspaceId: string },
  deps: { db?: PrismaClient } = {},
): Promise<ExerciseLibraryEntry[]> {
  const db = deps.db ?? defaultPrisma;
  const rows = await db.exerciseLibraryItem.findMany({
    where: { workspaceId: input.workspaceId, archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      muscle: true,
      secondaryMuscles: true,
      notes: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    muscle: row.muscle,
    secondaryMuscles: row.secondaryMuscles,
    notes: row.notes,
  }));
}
