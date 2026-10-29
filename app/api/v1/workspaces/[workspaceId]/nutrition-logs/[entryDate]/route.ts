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
 * Card 09 client save: the macro actuals plus the optional stored
 * calories, day-type and plan-followed state for the caller's own day.
 * Each macro key is required and independently nullable - null is not
 * recorded, never zero. The three day-state keys are optional: an
 * omitted key keeps the stored value, an explicit null clears it.
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
  calories: z.number().nullable().optional(),
  dayType: z.string().nullable().optional(),
  planFollowed: z.boolean().nullable().optional(),
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
        calories: body.calories,
        dayType: body.dayType,
        planFollowed: body.planFollowed,
      }),
    );
  },
});
