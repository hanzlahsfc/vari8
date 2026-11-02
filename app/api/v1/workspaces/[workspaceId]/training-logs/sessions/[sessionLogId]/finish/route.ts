import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { finishTrainingSessionLog } from "@/lib/trainingprogram/service";

import { readBody, sessionOf, unwrapTraining } from "../../../_result";

/**
 * POST .../training-logs/sessions/:sessionLogId/finish
 *
 * PR-M10 (#176): the terminal transition. `completed` stores COMPLETED
 * when every prescribed set is logged, PARTIAL otherwise; `skipped`
 * stores SKIPPED. Terminal sessions refuse later set saves.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  sessionLogId: z.string().min(1),
});

const bodySchema = z.object({
  outcome: z.enum(["completed", "skipped"]),
});

export const POST = defineApiV1Route({
  capability: "own.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapTraining(
      finishTrainingSessionLog(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        sessionLogId: params.sessionLogId,
        outcome: body.outcome,
      }),
    );
  },
});
