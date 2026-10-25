import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listSchedulableVersionsForClient } from "@/lib/checkin/instances-boundary";

import { sessionOf, unwrap } from "../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/checkins/schedule-versions
 *
 * The published form versions an additional date can be scheduled from
 * (Q10 default: the latest version; the canvas draws no picker). A create
 * needs a `formVersionId`, and the instance rows do not carry one, so the
 * restore path resolves it here.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const querySchema = z.object({ clientProfileId: z.string().min(1) });

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrap(
      await listSchedulableVersionsForClient(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: query.clientProfileId,
      }),
    ),
});
