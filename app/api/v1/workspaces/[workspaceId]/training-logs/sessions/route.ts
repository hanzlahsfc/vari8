import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { startTrainingSessionLog } from "@/lib/trainingprogram/service";

import { readBody, sessionOf, unwrapTraining } from "../_result";

/**
 * POST /api/v1/workspaces/:workspaceId/training-logs/sessions
 *
 * PR-M10 (#176): start a session - or resume it when the natural key
 * already exists. The response pins the prescription version that was
 * live at first start; replays return the same sessionLogId.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const bodySchema = z.object({
  programId: z.string().min(1),
  sessionId: z.string().min(1),
  bookedWeek: z.number().int().min(1),
  performedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = defineApiV1Route({
  capability: "own.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapTraining(
      startTrainingSessionLog(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        ...body,
      }),
    );
  },
});
