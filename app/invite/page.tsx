import Link from "next/link";

import { auth } from "@/auth";
import { CoachAuthShell, ClientAuthShell } from "@/components/auth/auth-shells";
import {
  getInviteLinkState,
  getInviteShellRole,
} from "@/lib/workspace/invite-acceptance";

import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Invitation" };

/**
 * Phase 3.1 public invitation-acceptance route. Validity is established by a
 * non-consuming peek — every unusable link (missing, malformed, expired,
 * revoked, consumed, wrong purpose) renders one identical safe state. The
 * atomic claim itself still happens inside the reviewed service on submit.
 *
 * O17: the page wears the shell the invitation was issued for. A client
 * invitation opens on the client look (`/me`'s root) and keeps its sign-in
 * links on `/me`; a staff invitation, and every unusable link, keep the coach
 * look and `/login`.
 */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string | string[];
    token?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const [session, state] = await Promise.all([
    auth(),
    getInviteLinkState({
      workspaceId: params.workspace,
      rawToken: params.token,
    }),
  ]);

  const role =
    state.state === "ready"
      ? await getInviteShellRole({
          workspaceId: params.workspace,
          rawToken: params.token,
        })
      : null;
  const Shell = role === "client" ? ClientAuthShell : CoachAuthShell;
  const signInHref = role === "client" ? "/me/login" : "/login";

  if (state.state !== "ready") {
    return (
      <Shell>
        <main className="app-main" data-testid="invite-invalid">
          <h1 className="app-title">Invitation</h1>
          <p className="app-lede">
            This invitation link is invalid, expired, or has already been used.
            Ask the workspace owner for a new invitation.
          </p>
          <p className="app-lede">
            <Link href={signInHref}>Go to sign in</Link>
          </p>
        </main>
      </Shell>
    );
  }

  const workspaceId = params.workspace as string;
  const rawToken = params.token as string;
  const signedIn = typeof session?.user?.id === "string";

  return (
    <Shell>
      <main className="app-main" data-testid="invite-page">
        <h1 className="app-title">Accept your invitation</h1>
        <p className="app-lede">
          {signedIn
            ? "Confirm to join the workspace with your signed-in account."
            : "Set your name and a password to create your account."}
        </p>
        <InviteForm
          workspaceId={workspaceId}
          token={rawToken}
          needsAccount={!signedIn}
        />
        {signedIn ? null : (
          <p className="app-lede">
            Already have an account? <Link href={signInHref}>Sign in</Link>{" "}
            first, then open this link again.
          </p>
        )}
      </main>
    </Shell>
  );
}
