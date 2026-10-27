import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";

import { listAssignedMedia } from "../../service";

/**
 * GET /api/v1/media/:workspaceId/assigned - T6 (R8) client-visible media
 * list under `clientData.read`. A client role caller resolves to their own
 * profile from the session and sees only items assigned to them; staff
 * pass `clientProfileId` to preview the same surface. The raw coach
 * library is never exposed here.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const querySchema = z.object({
  clientProfileId: z.string().min(1).max(64).optional(),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  query: querySchema,
  handler: ({ viewer, workspace, query }) =>
    listAssignedMedia(viewer, workspace, query.clientProfileId),
});
