import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { MAX_MEDIA_BYTES } from "@/lib/storage";

import { createMediaUpload } from "../service";

/**
 * POST /api/v1/media/:workspaceId — PR-MEDIA upload intent (D20). Body:
 * `{ fileName, contentType, byteSize, clientProfileId? }`; returns the
 * media_object row plus a presigned PUT the client sends the bytes to.
 * Staff pass the client profile explicitly; a client's own profile is
 * resolved from their account inside the service.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const bodySchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(3).max(100),
  byteSize: z.number().int().min(1).max(MAX_MEDIA_BYTES),
  clientProfileId: z.string().min(1).max(64).optional(),
});

export const POST = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: async ({ viewer, workspace, request }) => {
    const body = bodySchema.parse(await request.json());
    return createMediaUpload(viewer, workspace, body);
  },
});
