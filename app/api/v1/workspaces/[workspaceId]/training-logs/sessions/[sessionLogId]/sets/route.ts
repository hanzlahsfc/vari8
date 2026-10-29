import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { saveTrainingSetLog } from "@/lib/trainingprogram/service";
import { setLogEntrySchema } from "@/lib/trainingprogram/validators";

import { readBody, sessionOf, unwrapTraining } from "../../../_result";

/**
 * POST .../training-logs/sessions/:sessionLogId/sets
 *
 * PR-M10 (#176): manual save per set. The payload is the M6 set entry:
 * actuals for whatever fields the coach's template defines. Saving the
 * same set twice updates the row; it never duplicates.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  sessionLogId: z.string().min(1),
});

const bodySchema = z.object({
  exerciseId: z.string().min(1),
  position: z.number().int().min(0),
  set: setLogEntrySchema,
});

export const POST = defineApiV1Route({
  capability: "own.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapTraining(
      saveTrainingSetLog(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        sessionLogId: params.sessionLogId,
        ...body,
      }),
    );
  },
});
