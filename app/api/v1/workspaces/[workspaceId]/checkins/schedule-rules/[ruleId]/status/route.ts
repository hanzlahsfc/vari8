import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { setCheckInScheduleRuleStatusFromAction } from "@/lib/checkin/instances-boundary";

import { readBody, sessionOf, unwrap } from "../../../_result";

/**
 * POST /api/v1/workspaces/:workspaceId/checkins/schedule-rules/:ruleId/status
 *
 * pause | resume | end. The service closes the union; `ended` reports how many
 * unsubmitted generated occurrences were cancelled.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  ruleId: z.string().min(1),
});

const bodySchema = z.object({
  clientProfileId: z.string().min(1),
  action: z.enum(["pause", "resume", "end"]),
});

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrap(
      await setCheckInScheduleRuleStatusFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: body.clientProfileId,
        ruleId: params.ruleId,
        action: body.action,
      }),
    );
  },
});
