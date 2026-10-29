import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { deleteProgressPhoto, getProgressPhoto } from "../service";

/**
 * /api/v1/workspaces/:workspaceId/clients/:clientProfileId/progress-photos/:entryId
 * GET reads one live entry of the path client (own scope reads only its
 * own clientVisible entries). DELETE soft-deletes the entry; the media
 * object stays for the retention pass.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1).max(64),
  entryId: z.string().min(1).max(64),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  handler: ({ viewer, workspace, params }) =>
    getProgressPhoto(viewer, workspace, params.clientProfileId, params.entryId),
});

export const DELETE = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: ({ viewer, workspace, params }) =>
    deleteProgressPhoto(
      viewer,
      workspace,
      params.clientProfileId,
      params.entryId,
    ),
});
