import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { getStaffThread, sendStaffMessage } from "@/lib/messages/service";

import { readBody, sessionOf, unwrapMessage } from "../../messages/_result";

/**
 * GET  /api/v1/workspaces/:workspaceId/conversations/:clientProfileId
 * POST /api/v1/workspaces/:workspaceId/conversations/:clientProfileId
 *
 * W2-A4 staff thread: GET reads the seeded thread plus the caller's draft;
 * POST is the staff-authored send (senderKind STAFF, senderUserId the
 * caller). The service re-binds staff membership so a client-scope
 * message.write grant cannot pass. W2-T8: POST also accepts mediaObjectIds
 * for the upload-then-link attachment flow.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const bodySchema = z.object({
  body: z.string().max(4000).optional(),
  clientRequestId: z.string().max(128).optional(),
  mediaObjectIds: z.array(z.string().min(1).max(64)).max(10).optional(),
});

export const GET = defineApiV1Route({
  capability: "roster.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapMessage(
      getStaffThread(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
      }),
    ),
});

export const POST = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapMessage(
      sendStaffMessage(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        body: body.body,
        clientRequestId: body.clientRequestId,
        mediaObjectIds: body.mediaObjectIds,
      }),
    );
  },
});
