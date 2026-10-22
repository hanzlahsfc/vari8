import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readCheckInReviewTrackerContextFromAction } from "@/lib/checkin/instances-boundary";

import { sessionOf, unwrap } from "../../../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/checkins/submissions/:submissionId/tracker-context
 *
 * One explicit `entryDate` read; a missing DailyEntry stays `not_available`
 * (403) rather than falling back to another date.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  submissionId: z.string().min(1),
});

const querySchema = z.object({
  clientProfileId: z.string().min(1),
  entryDate: z.string().min(10).max(10),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrap(
      await readCheckInReviewTrackerContextFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: query.clientProfileId,
        submissionId: params.submissionId,
        entryDate: query.entryDate,
      }),
    ),
});
