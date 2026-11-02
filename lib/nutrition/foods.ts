/**
 * PR-M5 — NutritionCatalogItem -> shared-math `Food` adapter. Server
 * only: resolves the `foodId` references stored in meal-plan payloads
 * (`lib/mealplan/payload.ts`) so `lib/nutrition/math.ts` can compute
 * the canvas totals. Nullable catalog columns read as 0 — a food with
 * no stored amount contributes nothing (canvas `amount > 0` guard).
 */

import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "../db";
import type { Food } from "./math";

export async function loadNutritionFoodMap(
  foodIds: readonly string[],
  db: PrismaClient = defaultPrisma,
): Promise<Map<string, Food>> {
  const ids = [...new Set(foodIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.nutritionCatalogItem.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      amount: true,
      unit: true,
      calories: true,
      protein: true,
      carbs: true,
      fats: true,
    },
  });
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        amount: row.amount ?? 0,
        unit: row.unit ?? "",
        calories: row.calories ?? 0,
        protein: row.protein ?? 0,
        carbs: row.carbs ?? 0,
        fat: row.fats ?? 0,
      },
    ]),
  );
}
