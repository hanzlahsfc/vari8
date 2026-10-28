import { z } from "zod";

import { defineApiV1Route } from "@/lib/api/v1";
import { revokeInvitationFromApi } from "@/lib/workspace/invitation-api";

/**
 * DELETE /api/v1/workspaces/:workspaceId/invitations/:invitationId — owner-only
 * revocation (service-enforced on `membersInvitations`; coaches get 403).
 * Idempotent: only an active, unconsumed, unrevoked, unexpired row in this
 * workspace reports `{changed:true}`; every other shape is `{changed:false}`.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
  invitationId: z.string().min(1),
});

export const DELETE = defineApiV1Route({
  capability: "member.invite",
  params: paramsSchema,
  handler: ({ viewer, workspace, params }) =>
    revokeInvitationFromApi(viewer, workspace, {
      invitationId: params.invitationId,
    }),
});
