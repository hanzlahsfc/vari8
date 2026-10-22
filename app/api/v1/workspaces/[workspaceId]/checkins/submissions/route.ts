import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listStaffCheckInSubmissions } from "@/lib/checkin/instances-boundary";

import { sessionOf, unwrap } from "../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/checkins/submissions
 *
 * Answer-free submission headers for one client (the board's event status and
 * the "awaiting feedback" count read from this). Answers stay behind the
 * audited detail route.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const querySchema = z.object({ clientProfileId: z.string().min(1) });

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrap(
      await listStaffCheckInSubmissions(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: query.clientProfileId,
      }),
    ),
});
