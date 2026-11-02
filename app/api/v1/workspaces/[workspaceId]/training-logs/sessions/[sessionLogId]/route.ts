import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readOwnSessionLog } from "@/lib/trainingprogram/service";

import { sessionOf, unwrapTraining } from "../../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/training-logs/sessions/:sessionLogId
 *
 * PR-M10 (#176): the resume read - pinned prescription (projection
 * filtered through the pinned field config) beside every logged set.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  sessionLogId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapTraining(
      readOwnSessionLog(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        sessionLogId: params.sessionLogId,
      }),
    ),
});
