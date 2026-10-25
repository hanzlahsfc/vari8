import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";

import { createProgressPhoto, listProgressPhotos } from "./service";

/**
 * /api/v1/workspaces/:workspaceId/clients/:clientProfileId/progress-photos
 * — card 08 (#172). GET lists the client's dated gallery: workspace scope
 * (staff) sees every live entry, own scope (the client) resolves the
 * profile from the session and sees only clientVisible entries. POST
 * attaches an uploaded media object with the picked date (default today).
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1).max(64),
});

const bodySchema = z.object({
  mediaObjectId: z.string().min(1).max(64),
  takenOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  checkInSubmissionId: z.string().min(1).max(64).optional(),
  clientVisible: z.boolean().optional(),
});

export const GET = defineApiV1Route({
  capability: "clientData.read",
  params: paramsSchema,
  handler: ({ viewer, workspace, params }) =>
    listProgressPhotos(viewer, workspace, params.clientProfileId),
});

export const POST = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: async ({ viewer, workspace, params, request }) => {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new ApiError(400, "invalid_input");
    }
    const body = bodySchema.parse(payload);
    return createProgressPhoto(viewer, workspace, params.clientProfileId, body);
  },
});
