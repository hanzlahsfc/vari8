import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listStaffTrackerValues } from "@/lib/daily-entry/service";

import { sessionOf, unwrapDailyEntry } from "../../../../daily-entries/_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/daily-entries/values
 *
 * W2-FE2 staff tracker span: every logged day's per-field values plus the
 * staff cell notes and day notes in one response - the shape the coach
 * Tracker tab hydrates from. The service re-authorizes dailyTracking for
 * workspace|assigned scope and refuses a client caller itself.
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
      listStaffTrackerValues(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
      }),
    ),
});
