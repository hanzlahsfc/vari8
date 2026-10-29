import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { setClientTaskCompletion } from "@/lib/tasks/service";

import { readBody, sessionOf, unwrapTask } from "../../../../tasks/_result";

/**
 * PATCH /api/v1/workspaces/:workspaceId/clients/:clientProfileId/tasks/:taskId
 *
 * Card 05a client row: the own-only completion transition. The service
 * rejects every scope that is not the owning client's "own": staff roles
 * are denied inside the transaction even with a workspace grant.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
  taskId: z.string().min(1),
});

const bodySchema = z.object({
  desired: z.enum(["COMPLETED", "OPEN"]),
  expectedRevision: z.number().int().min(0),
});

export const PATCH = defineApiV1Route({
  capability: "own.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapTask(
      setClientTaskCompletion(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        taskId: params.taskId,
        desired: body.desired,
        expectedRevision: body.expectedRevision,
      }),
    );
  },
});
