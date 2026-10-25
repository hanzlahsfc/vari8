import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listStaffDailyEntries } from "@/lib/daily-entry/service";

import {
  sessionOf,
  unwrapDailyEntry,
} from "../../../../daily-entries/_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/daily-entries/history?cursor=
 *
 * Card 05a staff row: the header-only entry list (dates, revision counts)
 * the coach tracker history reads. The service re-authorizes dailyTracking
 * for workspace|assigned scope and refuses a client caller itself.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const querySchema = z.object({
  cursor: z.string().optional(),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapDailyEntry(
      listStaffDailyEntries(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        cursor: query.cursor,
      }),
    ),
});
