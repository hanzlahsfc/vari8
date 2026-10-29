// FULL-PACKAGE SLICE of #173
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { loadNutritionLogSurface } from "@/lib/daily-entry/nutrition-log";

import { sessionOf, unwrapDailyEntry } from "../daily-entries/_result";

/**
 * GET /api/v1/workspaces/:workspaceId/nutrition-logs?date=YYYY-MM-DD
 *
 * Card 09 client surface: the caller's own macro actuals for one day (or
 * today) plus recent history, resolved from the session - no client id in
 * the path because the service binds the caller's own client profile.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapDailyEntry(
      loadNutritionLogSurface(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        entryDate: query.date,
      }),
    ),
});
