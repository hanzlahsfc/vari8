import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isClientDashboardEnabled } from "@/lib/dashboard/gate";
import { readStaffDashboardLayout } from "@/lib/dashboard/boundary";
import { resolveScope } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

import { DashboardEditor } from "./dashboard-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client dashboard" };

/**
 * DASHBOARD-I1 (decision 108): staff dashboard editor — owners +
 * assigned coaches edit; assistants read the layout (no controls).
 * The gate is checked first; every write re-authorizes inside its own
 * serialized transaction at the action layer.
 */
export default async function StaffClientDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; clientProfileId: string }>;
}) {
  if (!isClientDashboardEnabled()) notFound();

  const { workspaceId, clientProfileId } = await params;
  const { userId } = await requireSessionUser();
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length > 128 ||
    typeof clientProfileId !== "string" ||
    clientProfileId.length > 128
  )
    notFound();

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId, status: "ACTIVE" },
    select: { role: true },
  });
  if (!member) notFound();
  const scope = resolveScope("clientDashboards", "read", member.role);
  if (scope !== "workspace" && scope !== "assigned") notFound();
  const writeScope = resolveScope("clientDashboards", "write", member.role);
  const canEdit = writeScope === "workspace" || writeScope === "assigned";

  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, workspaceId },
    select: { name: true },
  });
  if (!client) notFound();

  const result = await readStaffDashboardLayout(
    { user: { id: userId } },
    { workspaceId, clientProfileId },
  );
  if (!result.ok) notFound();

  const config = result.value.layout?.config ?? {
    version: 1 as const,
    name: `${client.name}’s dashboard`,
    widgets: [],
    layouts: { desktop: {} },
    widths: { desktop: 1040 },
  };

  return (
    <div className="catalog-page" data-testid="dashboard-editor-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">
          <Link href={`/workspace/${workspaceId}/clients`}>Clients</Link>
        </p>
        <h1 className="app-title">{client.name}’s dashboard</h1>
        <p className="app-lede">
          One shared arrangement — widgets marked “Client” are visible on the
          client’s own dashboard.
        </p>
      </header>
      <DashboardEditor
        workspaceId={workspaceId}
        clientProfileId={clientProfileId}
        initialConfig={config}
        initialRevision={result.value.layout?.revision ?? 0}
        canEdit={canEdit}
      />
    </div>
  );
}
