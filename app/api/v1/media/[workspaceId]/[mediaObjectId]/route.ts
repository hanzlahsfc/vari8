import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { mintMediaDownload } from "../../service";

/**
 * GET /api/v1/media/:workspaceId/:mediaObjectId — PR-MEDIA download mint
 * (D20): returns the media_object metadata plus a short-lived presigned
 * GET. Own-scope (client role) callers only reach objects under their own
 * client profile prefix.
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
