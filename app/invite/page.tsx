import Link from "next/link";

import { auth } from "@/auth";
import { getInviteLinkState } from "@/lib/workspace/invite-acceptance";

import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Invitation" };

/**
 * Phase 3.1 public invitation-acceptance route. Validity is established by a
 * non-consuming peek — every unusable link (missing, malformed, expired,
 * revoked, consumed, wrong purpose) renders one identical safe state. The
 * atomic claim itself still happens inside the reviewed service on submit.
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

  if (state.state !== "ready") {
    return (
      <main className="app-main" data-testid="invite-invalid">
        <h1 className="app-title">Invitation</h1>
        <p className="app-lede">
          This invitation link is invalid, expired, or has already been used.
          Ask the workspace owner for a new invitation.
        </p>
        <p className="app-lede">
          <Link href="/login">Go to sign in</Link>
        </p>
      </main>
    );
  }

  const workspaceId = params.workspace as string;
  const rawToken = params.token as string;
  const signedIn = typeof session?.user?.id === "string";

  return (
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
          Already have an account? <Link href="/login">Sign in</Link> first,
          then open this link again.
        </p>
      )}
    </main>
  );
}
