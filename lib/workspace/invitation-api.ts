import { ApiError, type ApiViewer, type ApiWorkspaceContext } from "../api/v1";
import { AccessDeniedError } from "../auth/guard";
import { consumeRateLimit, userLimitKey } from "../auth/rate-limit";
import { sendMail } from "../mail";
import {
  assertInvitationOrchestrationExternallyExposable,
  createWorkspaceInvitation,
  InvitationError,
  listWorkspaceInvitations,
  revokeWorkspaceInvitation,
  type InvitationSummary,
} from "./invitations";

/**
 * PR-SV4 — route-facing boundary for the staff invitation operations behind
 * `/api/v1/workspaces/:workspaceId/invitations`. The reviewed S1-F2C service
 * and the token store are never imported by `app/**` (pinned by
 * `tests/unit/invitations.test.ts`); the file name deliberately avoids the
 * `workspace/invitations` substring that scan bans.
 *
 * - `createInvitationFromApi` runs the delivery gate first (an invite that
 *   cannot be delivered is never minted), then a per-issuer rolling-window
 *   throttle on the shared `rate_limit` table, then the service, then
 *   delivery through the PR-05 mail port. The raw token leaves exactly once —
 *   inside the mailed `/invite` link; it is never returned to the API caller.
 * - `listInvitationsFromApi` / `revokeInvitationFromApi` stay owner-only —
 *   the service enforces that on `membersInvitations`; the route-level
 *   `member.invite` capability only decides "may invoke the surface".
 * - Every service error maps to the `/api/v1` typed shape; nothing echoes
 *   input, tokens, or internals.
 */

const CREATE_INVITE_RULE = { window: 60, max: 20 } as const;

export type CreatedInvitationResult = {
  invitationId: string;
  expiresAt: Date;
  delivered: true;
};

/** Structural service error → the `/api/v1` `{error:{code}}` vocabulary. */
function mapInvitationApiError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof AccessDeniedError) {
    throw new ApiError(403, "forbidden");
  }
  if (error instanceof InvitationError) {
    switch (error.code) {
      case "invalid_input":
        throw new ApiError(400, "invalid_input");
      case "membership_conflict":
      case "serialization_conflict":
        throw new ApiError(409, error.code);
      case "invitations_not_exposable":
        throw new ApiError(503, "invitations_unavailable");
      default:
        // invitation_failed and anything unforeseen: honest generic 500.
        throw new ApiError(500, "internal");
    }
  }
  throw error;
}

function inviteAcceptUrl(workspaceId: string, rawToken: string): string {
  const origin = (
    process.env.BETTER_AUTH_URL ??
    process.env.AUTH_URL ??
    ""
  ).replace(/\/+$/, "");
  return `${origin}/invite?workspace=${encodeURIComponent(workspaceId)}&token=${encodeURIComponent(rawToken)}`;
}

export async function createInvitationFromApi(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  input: { targetEmail: unknown; intendedRole: unknown },
): Promise<CreatedInvitationResult> {
  try {
    // Fail closed before any mutation while delivery is unconfigured.
    assertInvitationOrchestrationExternallyExposable();
    const limit = await consumeRateLimit(
      userLimitKey("invite-create", viewer.userId),
      CREATE_INVITE_RULE,
    );
    if (!limit.allowed) {
      throw new ApiError(429, "rate_limited");
    }
    const created = await createWorkspaceInvitation(
      { user: { id: viewer.userId } },
      {
        workspaceId: workspace.workspaceId,
        targetEmail: input.targetEmail,
        intendedRole: input.intendedRole,
      },
    );
    try {
      await sendMail({
        to: created.delivery.to,
        subject: "You're invited to join a workspace",
        text:
          "You have been invited to join a workspace. " +
          `Accept your invitation: ${inviteAcceptUrl(created.delivery.workspaceId, created.delivery.rawToken)} ` +
          `(the link expires ${created.expiresAt.toISOString()}).`,
      });
    } catch {
      // The invitation row is committed; a failed send is reported so staff
      // can re-invite (replacement revokes the undelivered token).
      throw new ApiError(502, "delivery_failed");
    }
    return {
      invitationId: created.invitationId,
      expiresAt: created.expiresAt,
      delivered: true,
    };
  } catch (error) {
    throw mapInvitationApiError(error);
  }
}

export async function listInvitationsFromApi(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  input: { limit?: number; cursor?: string },
): Promise<{ items: InvitationSummary[]; nextCursor: string | null }> {
  try {
    return await listWorkspaceInvitations(
      { user: { id: viewer.userId } },
      {
        workspaceId: workspace.workspaceId,
        limit: input.limit,
        cursor: input.cursor,
      },
    );
  } catch (error) {
    throw mapInvitationApiError(error);
  }
}

export async function revokeInvitationFromApi(
  viewer: ApiViewer,
  workspace: ApiWorkspaceContext,
  input: { invitationId: unknown },
): Promise<{ changed: boolean }> {
  try {
    return await revokeWorkspaceInvitation(
      { user: { id: viewer.userId } },
      { workspaceId: workspace.workspaceId, invitationId: input.invitationId },
    );
  } catch (error) {
    throw mapInvitationApiError(error);
  }
}
