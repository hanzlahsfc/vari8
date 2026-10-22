import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { sendCheckInFeedbackFromAction } from "@/lib/checkin/instances-boundary";

import { readBody, sessionOf, unwrap } from "../../../_result";

/**
 * POST /api/v1/workspaces/:workspaceId/checkins/submissions/:submissionId/feedback
 *
 * Sending feedback marks the submission answered and delivers the body in one
 * serialized write. `clientRequestId` is the idempotency anchor: an identical
 * replay is `already_sent`, a different body under the same nonce is a loud
 * 409 `idempotency_conflict`.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  submissionId: z.string().min(1),
});

const bodySchema = z.object({
  clientProfileId: z.string().min(1),
  body: z.string().min(1).max(2000),
  clientRequestId: z.string().min(1).max(64),
});

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrap(
      await sendCheckInFeedbackFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: body.clientProfileId,
        submissionId: params.submissionId,
        body: body.body,
        clientRequestId: body.clientRequestId,
      }),
    );
  },
});
