import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import {
  markCheckInSubmissionReviewedFromAction,
  readCheckInReviewPanelFromAction,
} from "@/lib/checkin/instances-boundary";

import { readBody, sessionOf, unwrap } from "../../../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/checkins/submissions/:submissionId/review
 *
 * FULL-PACKAGE SLICE of #171 — the coach review-panel read: one call
 * returns the audited submission detail (answers, review state, feedback,
 * linked media) plus the change summary against the previous submission
 * of the same form.
 *
 * POST /api/v1/workspaces/:workspaceId/checkins/submissions/:submissionId/review
 *
 * The terminal review acknowledgement. Idempotent: a replay returns
 * `already_reviewed` with zero rows and zero audits.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  submissionId: z.string().min(1),
});

const querySchema = z.object({ clientProfileId: z.string().min(1) });

const bodySchema = z.object({ clientProfileId: z.string().min(1) });

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ viewer, params, query }) =>
    unwrap(
      await readCheckInReviewPanelFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: query.clientProfileId,
        submissionId: params.submissionId,
      }),
    ),
});

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrap(
      await markCheckInSubmissionReviewedFromAction(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: body.clientProfileId,
        submissionId: params.submissionId,
      }),
    );
  },
});
