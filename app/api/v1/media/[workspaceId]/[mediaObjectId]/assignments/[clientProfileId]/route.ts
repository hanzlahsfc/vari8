import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { unassignMediaFromClient } from "../../../../service";

/**
 * DELETE /api/v1/media/:workspaceId/:mediaObjectId/assignments/:clientProfileId
 * - T6 (R8) staff unassign under `library.manage`. Revoking the grant
 * removes the client-visible read and the download mint for that client.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  mediaObjectId: z.string().min(1).max(64),
  clientProfileId: z.string().min(1).max(64),
});

export const DELETE = defineApiV1Route({
  capability: "library.manage",
  params: paramsSchema,
  handler: ({ workspace, params }) =>
    unassignMediaFromClient(
      workspace,
      params.mediaObjectId,
      params.clientProfileId,
    ),
});
