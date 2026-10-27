import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { deleteMediaObject, mintMediaDownload } from "../../service";

/**
 * GET /api/v1/media/:workspaceId/:mediaObjectId — PR-MEDIA download mint
 * (D20): returns the media_object metadata plus a short-lived presigned
 * GET. Own-scope (client role) callers reach objects under their own
 * client profile prefix, or objects assigned to them (T6).
 *
 * DELETE /api/v1/media/:workspaceId/:mediaObjectId - T6 (R8) staff soft
 * delete under `library.manage`. FAIL semantics: a row with live
 * assignments answers 409 `has_assignments` until every grant is revoked.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  mediaObjectId: z.string().min(1).max(64),
});

export const GET = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: ({ viewer, workspace, params }) =>
    mintMediaDownload(viewer, workspace, params.mediaObjectId),
});

export const DELETE = defineApiV1Route({
  capability: "library.manage",
  params: paramsSchema,
  handler: ({ workspace, params }) =>
    deleteMediaObject(workspace, params.mediaObjectId),
});
