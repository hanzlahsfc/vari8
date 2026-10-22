import { sendMail } from "./index";

/**
 * Workspace invitation email (owner ruling O22, link target per O17).
 *
 * `createWorkspaceInvitation` deliberately returns the raw token in its
 * `delivery` field instead of sending: it runs inside a Serializable
 * transaction and a provider call must not live in one. The route that owns
 * the request is the caller, and this is its one-line seam.
 *
 * Client and staff invitations open on different looks, but the invite page
 * resolves the look itself from the token's intended role
 * (`app/invite/page.tsx` through `getInviteShellRole`), so both link to the
 * same path. Only the copy differs.
 */
export type InvitationMailInput = {
  to: string;
  workspaceId: string;
  rawToken: string;
  /** Mirrors `InvitableRole` in `lib/workspace/invitations.ts`. */
  intendedRole: "CLIENT" | "COACH" | "ASSISTANT_COACH";
};

export function invitationLink(
  input: Pick<InvitationMailInput, "workspaceId" | "rawToken">,
): string {
  const origin = (
    process.env.BETTER_AUTH_URL ??
    process.env.AUTH_URL ??
    ""
  ).replace(/\/+$/, "");
  const query = new URLSearchParams({
    workspace: input.workspaceId,
    token: input.rawToken,
  });
  return `${origin}/invite?${query.toString()}`;
}

export async function sendInvitationMail(
  input: InvitationMailInput,
): Promise<void> {
  const link = invitationLink(input);
  const isClient = input.intendedRole === "CLIENT";
  const subject = isClient
    ? "You have been invited to your coaching space"
    : "You have been invited to a workspace";
  const text = isClient
    ? `Your coach invited you to your coaching space.\n\nOpen this link to set up your account:\n${link}\n\nIf you were not expecting this, you can ignore this email.`
    : `You have been invited to a workspace.\n\nOpen this link to accept:\n${link}\n\nIf you were not expecting this, you can ignore this email.`;
  await sendMail({ to: input.to, subject, text });
}
