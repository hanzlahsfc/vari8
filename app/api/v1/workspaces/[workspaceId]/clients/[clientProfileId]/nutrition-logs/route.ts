// FULL-PACKAGE SLICE of #173
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listStaffNutritionLogs } from "@/lib/daily-entry/nutrition-log";

import { sessionOf, unwrapDailyEntry } from "../../../daily-entries/_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/nutrition-logs?from=&to=
 *
 * Card 09 staff row: the coach's date-range read of a client's recorded
 * macro days (defaults to the last 30 days). The service re-authorizes
 * dailyTracking for workspace|assigned scope and refuses a client caller.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapDailyEntry(
      listStaffNutritionLogs(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        from: query.from,
        to: query.to,
      }),
    ),
});
