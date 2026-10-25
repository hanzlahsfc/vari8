// FULL-PACKAGE SLICE of #173
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { saveNutritionLog } from "@/lib/daily-entry/nutrition-log";

import {
  readBody,
  sessionOf,
  unwrapDailyEntry,
} from "../../daily-entries/_result";

/**
 * PUT /api/v1/workspaces/:workspaceId/nutrition-logs/:entryDate
 *
 * Card 09 client save: the three macro actuals for the caller's own day.
 * Each key is required and independently nullable - null is not recorded,
 * never zero. There is no calories field anywhere by design: kcal derives
 * at read time (4/4/9).
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const macroSchema = z.number().nullable();

const bodySchema = z.object({
  protein: macroSchema,
  carbohydrate: macroSchema,
  fat: macroSchema,
});

export const PUT = defineApiV1Route({
  capability: "own.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapDailyEntry(
      saveNutritionLog(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        entryDate: params.entryDate,
        macros: {
          protein: body.protein,
          carbohydrate: body.carbohydrate,
          fat: body.fat,
        },
      }),
    );
  },
});
