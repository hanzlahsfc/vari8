// W2-A2 staff training-program detail surface.
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readStaffTrainingProgram } from "@/lib/trainingprogram/service";

import { sessionOf, unwrapTraining } from "../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/training-programs/:programId
 *
 * Staff program detail: boundary draft + bounded labelled version page
 * + derived state + first bookings page. `plan.read` gates the route;
 * the service re-authorizes under locks and returns not_found for a
 * program outside the (workspace, client) scope.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
  programId: z.string().min(1),
});

const querySchema = z.object({
  versionCursor: z.coerce.number().int().min(1).optional(),
});

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrapTraining(
      readStaffTrainingProgram(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        programId: params.programId,
        versionCursor: query.versionCursor,
      }),
    ),
});
