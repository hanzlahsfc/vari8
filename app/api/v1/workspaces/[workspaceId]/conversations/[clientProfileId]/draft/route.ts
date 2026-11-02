import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { saveStaffDraft } from "@/lib/messages/service";

import { readBody, sessionOf, unwrapMessage } from "../../../messages/_result";

/**
 * PUT /api/v1/workspaces/:workspaceId/conversations/:clientProfileId/draft
 *
 * W2-A4 staff draft save through MessageDraft, keyed on
 * (conversationId, authorUserId). Empty body upserts an empty draft; the
 * canvas clears the composer the same way. Draft attachments are w2-t8's.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
});

const bodySchema = z.object({
  body: z.string().max(4000),
});

export const PUT = defineApiV1Route({
  capability: "message.write",
  params: paramsSchema,
  handler: async ({ viewer, params, request }) => {
    const body = await readBody(request, bodySchema);
    return unwrapMessage(
      saveStaffDraft(sessionOf(viewer), {
        workspaceId: params.workspaceId,
        clientProfileId: params.clientProfileId,
        body: body.body,
      }),
    );
  },
});
