import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { loadStaffTrackerColumns } from "@/lib/daily-entry/service";

import { sessionOf, unwrapDailyEntry } from "../../../daily-entries/_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/tracker-columns
 *
 * W2-T14 staff preview of a client's tracker column groups: the pinned
 * coaching template's ordered, grouped parameter columns for the named
 * client. The service authorizes dailyTracking read for workspace|assigned
 * scope and refuses client callers itself.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapDailyEntry(
      loadStaffTrackerColumns(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
      }),
    ),
});
