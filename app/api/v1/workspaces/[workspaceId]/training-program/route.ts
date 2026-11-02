import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readOwnTrainingProgram } from "@/lib/trainingprogram/service";

import { sessionOf, unwrapTraining } from "../training-logs/_result";

/**
 * GET /api/v1/workspaces/:workspaceId/training-program?week=N
 *
 * PR-M10 (#176): the caller's own program view - state, agenda and one
 * materialized week of the governing version (defaults to the current
 * week; `week` navigates inside the program bounds). The service binds
 * the caller's own client profile and refuses non-own scope.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const querySchema = z.object({
  week: z.coerce.number().int().min(1).optional(),
});

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapTraining(
      readOwnTrainingProgram(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        week: query.week,
      }),
    ),
});
