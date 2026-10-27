// W2-A2 staff training-program publish surface.
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { publishTrainingProgramVersion } from "@/lib/trainingprogram/service";

import { readBody, sessionOf, unwrapTraining } from "../../_result";

/**
 * POST /api/v1/workspaces/:workspaceId/clients/:clientProfileId/training-programs/:programId/publish
 *
 * Mints an immutable effective-dated version from the current boundary
 * draft. `expectedRevision` is the publish authority: an identical
 * replay returns the committed version (replayed: true); a
 * same-revision parameter mismatch is revision_already_published (409).
 * `acknowledgeImmediateTakeover` answers the confirmation_required
 * immediate-takeover gate.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
  programId: z.string().min(1),
});

const bodySchema = z.object({
  expectedRevision: z.number().int().min(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedPredecessor: z.string().min(1).nullable().optional(),
  acknowledgeImmediateTakeover: z.boolean().optional(),
});

export const POST = defineApiV1Route({
  capability: "plan.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapTraining(
      publishTrainingProgramVersion(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        programId: params.programId,
        expectedRevision: body.expectedRevision,
        effectiveDate: body.effectiveDate,
        expectedPredecessor: body.expectedPredecessor,
        acknowledgeImmediateTakeover: body.acknowledgeImmediateTakeover,
      }),
    );
  },
});
