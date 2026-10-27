// W2-A2 staff training-program version detail surface.
import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { readStaffTrainingProgramVersion } from "@/lib/trainingprogram/service";

import { sessionOf, unwrapTraining } from "../../../_result";

/**
 * GET /api/v1/workspaces/:workspaceId/clients/:clientProfileId/training-programs/:programId/versions/:versionId
 *
 * Exact-id materialized version read, scoped to the verified
 * (workspace, client, program) triple; a foreign or cross-client id is
 * not_found (404). The coach canvas uses it to hydrate the ACTIVE
 * program payload.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
  programId: z.string().min(1),
  versionId: z.string().min(1),
});

export const GET = defineApiV1Route({
  capability: "plan.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapTraining(
      readStaffTrainingProgramVersion(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        programId: params.programId,
        versionId: params.versionId,
      }),
    ),
});
