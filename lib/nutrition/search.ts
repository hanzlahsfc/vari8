import type { NutritionCatalogItem, PrismaClient } from "@prisma/client";

/**
 * Phase 2.1 — bounded, indexed, source-backed Nutrition catalog search.
 *
 * Only source-backed fields are searched: the source `FOOD` label (case-
 * insensitive substring, served by the pg_trgm GIN index) and the exact source
 * `CAT` category (btree index). A minimum query length and a hard result limit
 * prevent an unbounded catalog dump; there is no nutrition interpretation.
 */

export const NUTRITION_SEARCH_MIN_QUERY_LENGTH = 2;
export const NUTRITION_SEARCH_MAX_LIMIT = 50;

export type NutritionSearchParams = {
  query: string;
  category?: string;
  limit?: number;
};

export type NutritionSearchResult = {
  query: string;
  category: string;
  queryApplied: boolean;
  total: number;
  limit: number;
  items: NutritionCatalogItem[];
};

export async function searchNutritionCatalog(
  client: PrismaClient,
  params: NutritionSearchParams,
): Promise<NutritionSearchResult> {
  const query = (params.query ?? "").trim();
  const category = (params.category ?? "").trim();
  const requestedLimit = params.limit ?? NUTRITION_SEARCH_MAX_LIMIT;
  const limit = Math.min(
    Math.max(Math.trunc(requestedLimit) || 1, 1),
    NUTRITION_SEARCH_MAX_LIMIT,
  );

  if (query.length < NUTRITION_SEARCH_MIN_QUERY_LENGTH) {
    return { query, category, queryApplied: false, total: 0, limit, items: [] };
  }

  const where = {
    name: { contains: query, mode: "insensitive" as const },
    ...(category !== "" ? { category } : {}),
  };

  const [items, total] = await Promise.all([
    client.nutritionCatalogItem.findMany({
      where,
      orderBy: { sourceNo: "asc" },
      take: limit,
    }),
    client.nutritionCatalogItem.count({ where }),
  ]);

  return { query, category, queryApplied: true, total, limit, items };
}

export async function listNutritionCategories(
  client: PrismaClient,
): Promise<string[]> {
  const rows = await client.nutritionCatalogItem.findMany({
    where: { category: { not: null } },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows
    .map((row) => row.category)
    .filter((value): value is string => value !== null && value.trim() !== "");
}
