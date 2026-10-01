import type { ExerciseCatalogItem, PrismaClient } from "@prisma/client";

/**
 * Phase 2.2 — bounded, indexed, source-backed Exercise catalog search.
 *
 * Only source-backed fields are searched: the source `Exercise Name` label
 * (case-insensitive substring, served by the pg_trgm GIN index) and the exact
 * source `Muscle Group` / `Equipment` facets (btree indexes). A minimum query
 * length and a hard result limit prevent an unbounded catalog dump; there is
 * no training interpretation or recommendation.
 */

export const EXERCISE_SEARCH_MIN_QUERY_LENGTH = 2;
export const EXERCISE_SEARCH_MAX_LIMIT = 50;

export type ExerciseSearchParams = {
  query: string;
  muscleGroup?: string;
  equipment?: string;
  limit?: number;
};

export type ExerciseSearchResult = {
  query: string;
  muscleGroup: string;
  equipment: string;
  queryApplied: boolean;
  total: number;
  limit: number;
  items: ExerciseCatalogItem[];
};

export async function searchExerciseCatalog(
  client: PrismaClient,
  params: ExerciseSearchParams,
): Promise<ExerciseSearchResult> {
  const query = (params.query ?? "").trim();
  const muscleGroup = (params.muscleGroup ?? "").trim();
  const equipment = (params.equipment ?? "").trim();
  const requestedLimit = params.limit ?? EXERCISE_SEARCH_MAX_LIMIT;
  const limit = Math.min(
    Math.max(Math.trunc(requestedLimit) || 1, 1),
    EXERCISE_SEARCH_MAX_LIMIT,
  );

  if (query.length < EXERCISE_SEARCH_MIN_QUERY_LENGTH) {
    return {
      query,
      muscleGroup,
      equipment,
      queryApplied: false,
      total: 0,
      limit,
      items: [],
    };
  }

  const where = {
    name: { contains: query, mode: "insensitive" as const },
    ...(muscleGroup !== "" ? { muscleGroup } : {}),
    ...(equipment !== "" ? { equipment } : {}),
  };

  const [items, total] = await Promise.all([
    client.exerciseCatalogItem.findMany({
      where,
      orderBy: { sourceId: "asc" },
      take: limit,
    }),
    client.exerciseCatalogItem.count({ where }),
  ]);

  return {
    query,
    muscleGroup,
    equipment,
    queryApplied: true,
    total,
    limit,
    items,
  };
}

export async function listExerciseMuscleGroups(
  client: PrismaClient,
): Promise<string[]> {
  const rows = await client.exerciseCatalogItem.findMany({
    where: { muscleGroup: { not: null } },
    distinct: ["muscleGroup"],
    select: { muscleGroup: true },
    orderBy: { muscleGroup: "asc" },
  });
  return rows
    .map((row) => row.muscleGroup)
    .filter((value): value is string => value !== null && value.trim() !== "");
}

export async function listExerciseEquipment(
  client: PrismaClient,
): Promise<string[]> {
  const rows = await client.exerciseCatalogItem.findMany({
    where: { equipment: { not: null } },
    distinct: ["equipment"],
    select: { equipment: true },
    orderBy: { equipment: "asc" },
  });
  return rows
    .map((row) => row.equipment)
    .filter((value): value is string => value !== null && value.trim() !== "");
}
