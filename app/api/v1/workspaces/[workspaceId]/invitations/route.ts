import { z } from "zod";

import { ApiError, defineApiV1Route } from "@/lib/api/v1";
import {
  createInvitationFromApi,
  listInvitationsFromApi,
} from "@/lib/workspace/invitation-api";

/**
 * PR-SV4 invitations API — the roster's Add/invite control (O8 parity
 * exception, wired by PR-W2) and the onboarding-drafts list call these.
 *
 * GET  — owner-only listing (the service enforces it on
 *        `membersInvitations`; coaches get 403) with keyset pagination.
 * POST — create (or atomically replace) an invitation and deliver the
 *        `/invite` link through the PR-05 mail port. Owner may invite any
 *        role; a coach may invite CLIENT only (service-enforced). The raw
 *        token is never in the response — only inside the mailed link.
 */
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  workspaceId: z.string().min(1),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(64).optional(),
});

const createBodySchema = z.object({
  // The service's normalizeEmail only canonicalizes; the address shape is a
  // trust-boundary concern and is validated here (D6).
  targetEmail: z.email().max(254),
  intendedRole: z.enum(["COACH", "ASSISTANT_COACH", "CLIENT"]),
});

export const GET = defineApiV1Route({
  capability: "member.invite",
  params: paramsSchema,
  query: querySchema,
  handler: ({ viewer, workspace, query }) =>
    listInvitationsFromApi(viewer, workspace, query ?? {}),
});

export const POST = defineApiV1Route({
  capability: "member.invite",
  params: paramsSchema,
  handler: async ({ viewer, workspace, request }) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "invalid_input");
    }
    return createInvitationFromApi(
      viewer,
      workspace,
      createBodySchema.parse(body),
    );
  },
});
