import Link from "next/link";
import { forbidden } from "next/navigation";
import type { ReactNode } from "react";

import type { WorkspaceRole } from "@/lib/auth/rbac";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceNav } from "@/components/workspace-nav";
import { prisma } from "@/lib/db";
import {
  getAuthorizedWorkspaceSummary,
  listSessionWorkspaces,
  requireSessionUser,
  resolveWorkspaceAccess,
} from "@/lib/auth/route-guard";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import { isOnboardingSubmissionEnabled } from "@/lib/onboarding/submission-gate";

export const dynamic = "force-dynamic";

/**
 * P-023 dual-role shell for `/workspace/[workspaceId]/onboarding`.
 *
 * Same admission contract as the daily layout: staff
 * (`workspaceSettings/read`) get the full workspace chrome; an ACTIVE
 * CLIENT member of an ACTIVE workspace gets a reduced chrome containing
 * only Daily Tracker and Onboarding links — every other destination
 * still 403s through the staff layout and its page-level guards. This is
 * layout admission only: the pages re-authorize
 * `onboardingSubmissions/read` server-side, and the dev gate's 404 runs
 * on the routes themselves.
 */
export default async function OnboardingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { userId, session } = await requireSessionUser();
  const staffCtx = await resolveWorkspaceAccess(session, {
    resource: "workspaceSettings",
    action: "read",
    workspaceId,
  });

  let name: string;
  let role: WorkspaceRole;
  let clientShell = false;
  let switcher: Awaited<ReturnType<typeof listSessionWorkspaces>> = [];
  if (staffCtx !== null) {
    ({ name } = await getAuthorizedWorkspaceSummary(
      staffCtx as typeof staffCtx & { workspaceId: string },
    ));
    role = staffCtx.workspaceRole!;
    switcher = await listSessionWorkspaces(userId);
  } else {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: {
        role: true,
        status: true,
        workspace: { select: { name: true, status: true } },
      },
    });
    if (
      member?.status !== "ACTIVE" ||
      member.role !== "CLIENT" ||
      member.workspace.status !== "ACTIVE"
    )
      forbidden();
    name = member.workspace.name;
    role = member.role;
    clientShell = true;
  }

  const onboardingOn = isOnboardingSubmissionEnabled(
    process.env.ENABLE_ONBOARDING_SUBMISSION,
  );

  return (
    <div className="shell" data-testid="workspace-shell">
      <aside className="shell__sidebar" data-testid="shell-sidebar">
        <div className="shell__header">
          <span className="shell__brand">{name}</span>
          <span className="shell__role" data-testid="shell-role">
            {role}
          </span>
        </div>
        {clientShell ? (
          <nav className="shell__nav" aria-label="Workspace">
            <Link href={`/workspace/${workspaceId}/home`}>Home</Link>
            <Link href={`/workspace/${workspaceId}/daily`}>Daily Tracker</Link>
            {onboardingOn ? (
              <Link href={`/workspace/${workspaceId}/onboarding`}>
                Onboarding
              </Link>
            ) : null}
            {isCheckInsEnabled() ? (
              <Link href={`/workspace/${workspaceId}/check-ins`}>
                Check-Ins
              </Link>
            ) : null}
          </nav>
        ) : (
          <WorkspaceNav workspaceId={workspaceId} role={role} />
        )}
        {switcher.length > 0 ? (
          <nav className="shell__switcher" aria-label="Your workspaces">
            <span className="shell__switcher-title">Workspaces</span>
            {switcher.map((workspace) => (
              <Link key={workspace.id} href={`/workspace/${workspace.id}`}>
                {workspace.name}
              </Link>
            ))}
          </nav>
        ) : null}
        <ThemeToggle />
        <SignOutButton />
      </aside>
      <main className="shell__main" data-testid="shell-main">
        {children}
      </main>
    </div>
  );
}
