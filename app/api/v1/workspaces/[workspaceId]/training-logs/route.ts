import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readOwnTrainingLogWeek } from "@/lib/trainingprogram/service";

import { sessionOf, unwrapTraining } from "./_result";

/**
 * GET /api/v1/workspaces/:workspaceId/training-logs?week=N
 *
 * PR-M10 (#176) client logbook list: the caller's own session logs for one
 * program week. No client id in the path because the service binds the
 * caller's own client profile.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const querySchema = z.object({
  week: z.coerce.number().int().min(1),
});

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapTraining(
      readOwnTrainingLogWeek(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        week: query.week,
      }),
    ),
});
