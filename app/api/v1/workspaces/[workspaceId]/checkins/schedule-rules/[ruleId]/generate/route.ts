import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { generateCheckInScheduleRuleInstancesFromAction } from "@/lib/checkin/instances-boundary";

import { readBody, sessionOf, unwrap } from "../../../_result";

/**
 * POST /api/v1/workspaces/:workspaceId/checkins/schedule-rules/:ruleId/generate
 *
 * D30/decision 114: occurrence generation is its own explicit call. The create
 * route never generates, a second call is a no-op, and conflicts are reported
 * rather than absorbed.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  ruleId: z.string().min(1),
});

const bodySchema = z.object({ clientProfileId: z.string().min(1) });

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrap(
      await generateCheckInScheduleRuleInstancesFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: body.clientProfileId,
        ruleId: params.ruleId,
      }),
    );
  },
});
