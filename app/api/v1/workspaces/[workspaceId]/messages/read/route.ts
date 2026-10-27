import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { markOwnThreadRead } from "@/lib/messages/service";

import { sessionOf, unwrapMessage } from "../_result";

/**
 * POST /api/v1/workspaces/:workspaceId/messages/read
 *
 * W2-T8 client mark-read, the mirror of the staff
 * conversations/:clientProfileId/read route: marks every unread STAFF
 * message on the caller's own thread. message.write resolves own-scope for
 * the client role, so a staff caller reaches the service and fails its
 * no-linked-profile denial the same way the own sends do.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ workspaceId: z.string().min(1) });

export const POST = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapMessage(
      markOwnThreadRead(sessionOf(viewer), {
        workspaceId: params.workspaceId,
      }),
    ),
});
