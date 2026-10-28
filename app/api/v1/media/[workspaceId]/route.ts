import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { MAX_MEDIA_BYTES } from "@/lib/storage";

import { createMediaUpload, listMediaLibrary } from "../service";

/**
 * POST /api/v1/media/:workspaceId — PR-MEDIA upload intent (D20). Body:
 * `{ fileName, contentType, byteSize, clientProfileId?, library? }`;
 * returns the media_object row plus a presigned PUT the client sends the
 * bytes to. Staff pass the client profile explicitly, or `library: true`
 * to file the item under the coach library owner (T6); a client's own
 * profile is resolved from their account inside the service.
 *
 * GET /api/v1/media/:workspaceId - T6 (R7) staff library list under
 * `library.manage`: every live media_object with its owner and current
 * assignment targets, filterable by `type` (kind) and `ownership`
 * (library | client). Clients are denied upstream.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const querySchema = z.object({
  type: z.enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"]).optional(),
  ownership: z.enum(["library", "client"]).optional(),
});

const bodySchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(3).max(100),
  byteSize: z.number().int().min(1).max(MAX_MEDIA_BYTES),
  clientProfileId: z.string().min(1).max(64).optional(),
  library: z.boolean().optional(),
});

export const GET = defineApiV1Route({
  capability: "library.manage",
  params: paramsSchema,
  query: querySchema,
  handler: ({ workspace, query }) =>
    listMediaLibrary(workspace, {
      kind: query.type,
      ownership: query.ownership,
    }),
});

export const POST = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: async ({ viewer, workspace, request }) => {
    const body = bodySchema.parse(await request.json());
    return createMediaUpload(viewer, workspace, body);
  },
});
