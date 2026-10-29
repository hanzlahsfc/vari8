import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { loadOwnTrackerColumns } from "@/lib/daily-entry/service";

import { sessionOf, unwrapDailyEntry } from "../daily-entries/_result";

/**
 * GET /api/v1/workspaces/:workspaceId/tracker-columns
 *
 * W2-T14 client tracker column groups: the pinned coaching template's
 * ordered, grouped parameter columns for the caller's own client profile -
 * resolved through the same setup/pin/eligibility chain the daily-entry
 * surface uses. No client id in the path; the service binds the caller.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapDailyEntry(
      loadOwnTrackerColumns(sessionOf(viewer), {
        workspaceId: params.workspaceId,
      }),
    ),
});
