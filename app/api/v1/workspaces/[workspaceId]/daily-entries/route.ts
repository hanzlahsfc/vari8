import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { loadDailyEntrySurface } from "@/lib/daily-entry/service";

import { sessionOf, unwrapDailyEntry } from "./_result";

/**
 * GET /api/v1/workspaces/:workspaceId/daily-entries?date=YYYY-MM-DD
 *
 * Card 05a client surface: the caller's own day-entry form (sections,
 * history, form token) resolved from the session — no client id in the
 * path, because the service binds the caller's own client profile.
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
      loadDailyEntrySurface(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        entryDate: query.date,
      }),
    ),
});
