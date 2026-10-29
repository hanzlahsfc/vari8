import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { cancelCheckInInstanceFromAction } from "@/lib/checkin/instances-boundary";

import { readBody, sessionOf, unwrap } from "../../../_result";

/**
 * POST /api/v1/workspaces/:workspaceId/checkins/instances/:instanceId/cancel
 *
 * Removing an additional date is a cancel, not a delete (the row and its audit
 * trail stay; the calendar drops it).
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  instanceId: z.string().min(1),
});

const bodySchema = z.object({ clientProfileId: z.string().min(1) });

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrap(
      await cancelCheckInInstanceFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: body.clientProfileId,
        instanceId: params.instanceId,
      }),
    );
  },
});
