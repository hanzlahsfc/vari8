import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readStaffTrainingLogs } from "@/lib/trainingprogram/service";

import { sessionOf, unwrapTraining } from "../../../training-logs/_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/training-logs?cursor=
 *
 * PR-M10 (#176) staff row: the coach's client-detail read of the logged
 * sessions — pinned prescription beside the actual sets, newest performed
 * date first. The service re-authorizes trainingPlansLogs and refuses a
 * client caller.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const querySchema = z.object({
  cursor: z.string().min(1).optional(),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapTraining(
      readStaffTrainingLogs(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        cursor: query.cursor,
      }),
    ),
});
