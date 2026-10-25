import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { getOwnCheckInInstance } from "@/lib/checkin/instances-boundary";

import { sessionOf, unwrap } from "../../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/checkins/instances/:instanceId
 *
 * Card 05a own read (R3-B2): the client's own check-in instance detail.
 * The card 03 staff routes are not reused — the boundary's own-scope
 * wrapper re-binds the caller inside the service.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  instanceId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrap(
      await getOwnCheckInInstance(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        instanceId: params.instanceId,
      }),
    ),
});
