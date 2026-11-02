import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listOwnMessages, sendOwnMessage } from "@/lib/messages/service";

import { readBody, sessionOf, unwrapMessage } from "./_result";

/**
 * GET  /api/v1/workspaces/:workspaceId/messages
 * POST /api/v1/workspaces/:workspaceId/messages
 *
 * Card 05a client thread. GET uses own.read (roles.ts has no message read
 * capability) and resolves the caller's own conversation; POST is the
 * client-authored send with server-generated clientRequestId idempotency.
 * W2-T8: POST also accepts mediaObjectIds (upload-then-link) and an empty
 * body when attachments carry the message.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

const bodySchema = z.object({
  body: z.string().max(4000).optional(),
  clientRequestId: z.string().max(128).optional(),
  mediaObjectIds: z.array(z.string().min(1).max(64)).max(10).optional(),
});

export const GET = defineApiV1Route({
  capability: "own.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapMessage(
      listOwnMessages(sessionOf(viewer), {
        workspaceId: params.workspaceId,
      }),
    ),
});

export const POST = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapMessage(
      sendOwnMessage(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        body: body.body,
        clientRequestId: body.clientRequestId,
        mediaObjectIds: body.mediaObjectIds,
      }),
    );
  },
});
