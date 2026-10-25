import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { submitCheckInInstanceFromAction } from "@/lib/checkin/instances-boundary";

import { readBody, sessionOf, unwrap } from "../../../_result";

/**
 * POST /api/v1/workspaces/:workspaceId/checkins/instances/:instanceId/submit
 *
 * Card 05a client submit (R3-B2). `already_submitted` arrives as a result
 * status in the boundary value, not a thrown error; closed failures map
 * through the shared check-in result table.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  instanceId: z.string().min(1),
});

const bodySchema = z.object({
  answersJson: z.string().min(1),
});

export const POST = defineApiV1Route({
  capability: "own.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrap(
      await submitCheckInInstanceFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        instanceId: params.instanceId,
        answersJson: body.answersJson,
      }),
    );
  },
});
