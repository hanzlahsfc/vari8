import type { CSSProperties } from "react";

import {
  requireSessionUser,
  requireWorkspaceAccess,
} from "@/lib/auth/route-guard";
import { prisma } from "@/lib/db";
import { vari8Theme } from "@/lib/canvas/vari8-theme";

import { SettingsForm } from "./settings-form";

import "@/components/canvas/app/vari8-tokens.css";

export const dynamic = "force-dynamic";

/**
 * W2-T1 (R9): the workspace settings route. Renders the shared vari8
 * settings surface inside the management shell; reads are gated by
 * workspaceSettings/read (the shell audience: owner, coach, assistant) and
 * every write goes through the own-scope API, so a member can only ever
 * change their own profile and notification preferences.
 *
 * The surface runs under the workspace's stored appearance (mode + accent),
 * the same theme plumbing the coach canvas applies to state.preferences.
 */
export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  await requireWorkspaceAccess(session, {
    resource: "workspaceSettings",
    action: "read",
    workspaceId,
  });
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { appearanceMode: true, appearanceAccent: true },
  });

  return (
    <section
      className="shell__panel v8-theme"
      data-testid="workspace-settings"
      data-mode={workspace.appearanceMode.toLowerCase()}
      style={
        vari8Theme({
          mode: workspace.appearanceMode.toLowerCase() as "dark" | "light",
          accent: workspace.appearanceAccent,
        }) as CSSProperties
      }
    >
      <SettingsForm workspaceId={workspaceId} />
    </section>
  );
}
