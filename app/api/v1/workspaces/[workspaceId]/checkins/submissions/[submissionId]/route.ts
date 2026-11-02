import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readStaffCheckInSubmissionDetail } from "@/lib/checkin/instances-boundary";

import { sessionOf, unwrap } from "../../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/checkins/submissions/:submissionId
 *
 * The audited review read: answers (`fields[].display`), media ids, reviewer
 * state, and the first page of the feedback thread. Body text only ever
 * travels here.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  submissionId: z.string().min(1),
});

const querySchema = z.object({ clientProfileId: z.string().min(1) });

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrap(
      await readStaffCheckInSubmissionDetail(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: query.clientProfileId,
        submissionId: params.submissionId,
      }),
    ),
});
