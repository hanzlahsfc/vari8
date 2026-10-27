import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { listStaffConversations } from "@/lib/messages/service";

import { sessionOf, unwrapMessage } from "../messages/_result";

/**
 * GET /api/v1/workspaces/:workspaceId/conversations
 *
 * W2-A4 staff conversation list: one row per client thread with the
 * caller's unread count, last message preview and priority flag. roster.read
 * keeps client callers denied at the gate.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

export const GET = defineApiV1Route({
  capability: "roster.read",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapMessage(
      listStaffConversations(sessionOf(viewer), {
        workspaceId: params.workspaceId,
      }),
    ),
});
