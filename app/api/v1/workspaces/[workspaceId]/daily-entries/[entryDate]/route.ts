import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { saveDailyEntry } from "@/lib/daily-entry/service";

import { readBody, sessionOf, unwrapDailyEntry } from "../_result";

/**
 * PUT /api/v1/workspaces/:workspaceId/daily-entries/:entryDate
 *
 * Card 05a client surface: one save against the caller's own day entry.
 * workspaceId and entryDate come from the path; formToken + ordinal values
 * come from the body, matching SaveDailyEntryInput in the service.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const bodySchema = z.object({
  formToken: z.string().min(1),
  values: z.array(z.object({ ordinal: z.number().int(), raw: z.string() })),
});

export const PUT = defineApiV1Route({
  capability: "own.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapDailyEntry(
      saveDailyEntry(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        entryDate: params.entryDate,
        formToken: body.formToken,
        values: body.values,
      }),
    );
  },
});
