"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  acceptInvitationFromLink,
  getInviteShellRole,
} from "@/lib/workspace/invite-acceptance";

export type InviteActionState = { error?: string; name?: string } | undefined;

/**
 * Phase 3.1 invite-acceptance server action. All authorization, identity
 * binding, policy enforcement, and atomicity live in the reviewed service
 * behind `acceptInvitationFromLink` — this action only forwards form fields
 * and maps the structural result to a redirect or a safe inline error.
 *
 * Success hands off to existing behavior only: a signed-in acceptor keeps
 * their session (redirect to `/`, which lands each role on its own home: staff
 * on /coach, a client on /me), a brand-new account goes through the ordinary
 * credentials sign-in, on `/me/login` for a client invitation (O17), on
 * `/login` for a staff one.
 */
export async function acceptInvite(
  _previous: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const session = await auth();
  const name = formData.get("name");
  // O17: read the intended role before the claim consumes the token. A link
  // that is no longer usable yields null, which keeps the staff destination.
  const role = await getInviteShellRole({
    workspaceId: formData.get("workspace"),
    rawToken: formData.get("token"),
  });
  const result = await acceptInvitationFromLink(session, {
    workspaceId: formData.get("workspace"),
    rawToken: formData.get("token"),
    name,
    password: formData.get("password"),
  });
  if (!result.ok) {
    // React clears uncontrolled fields after a form action completes; hand
    // the (already user-supplied, XSS-escaped on render) name back so the
    // remounted input restores it. The password is deliberately NOT echoed.
    return {
      error: result.message,
      name: typeof name === "string" && name.length <= 200 ? name : undefined,
    };
  }

  if (session?.user?.id) redirect("/");
  redirect(
    role === "client"
      ? "/me/login?inviteAccepted=1"
      : "/login?inviteAccepted=1",
  );
}
