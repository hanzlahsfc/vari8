import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { markStaffThreadRead } from "@/lib/messages/service";

import { sessionOf, unwrapMessage } from "../../../messages/_result";

/**
 * POST /api/v1/workspaces/:workspaceId/conversations/:clientProfileId/read
 *
 * W2-A4 staff mark-read: idempotent MessageRead rows for the calling staff
 * user on the client's messages. The unread count cannot fall without
 * them, so the canvas calls this on thread open instead of mutating state.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

export const POST = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: async ({ viewer, params }) =>
    unwrapMessage(
      markStaffThreadRead(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
      }),
    ),
});
