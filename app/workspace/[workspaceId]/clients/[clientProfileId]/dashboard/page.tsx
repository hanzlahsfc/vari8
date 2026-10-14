import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isClientDashboardEnabled } from "@/lib/dashboard/gate";
import { readStaffDashboardLayout } from "@/lib/dashboard/boundary";
import {
  readStaffHabits,
  readHabitChoices,
  readHabitConsistency,
} from "@/lib/habits/boundary";
import { resolveScope } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

import { DashboardEditor } from "./dashboard-editor";
import { ClientTasksPanel } from "./client-tasks-panel";
import { ClientHabitsPanel } from "./client-habits-panel";

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

  // HABITS-I1 (decision 110): habit data must not gate the editor's
  // first paint or hydration — the serialized boundary reads would
  // delay the shell, widening the window where a fast edit lands before
  // hydration and is lost on navigation. The habit list streams inside
  // a Suspense boundary; the picker choices stream as a deferred promise
  // that only the TL21/TL22 settings panel resolves.
  const habitChoices = readHabitChoices(
    { user: { id: userId } },
    { workspaceId, clientProfileId },
  )
    .then((r) =>
      r.ok
        ? r.value
        : { choices: [] as { id: string; name: string }[], hasMore: false },
    )
    .catch(() => ({
      choices: [] as { id: string; name: string }[],
      hasMore: false,
    }));

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
        userId={userId}
        workspaceId={workspaceId}
        clientProfileId={clientProfileId}
        initialConfig={config}
        initialRevision={result.value.layout?.revision ?? 0}
        canEdit={canEdit}
        habitChoices={habitChoices}
      />
      <ClientTasksPanel
        workspaceId={workspaceId}
        clientProfileId={clientProfileId}
        canEdit={canEdit}
      />
      <Suspense
        fallback={
          <section className="catalog-card" data-testid="staff-habits-loading">
            <h2 className="catalog-card__title">Client habits</h2>
            <p data-testid="habits-loading">Loading…</p>
          </section>
        }
      >
        <StaffHabitsSection
          userId={userId}
          workspaceId={workspaceId}
          clientProfileId={clientProfileId}
          canEdit={canEdit}
        />
      </Suspense>
    </div>
  );
}

/** Streams the authorized habit cohort + weekly consistency into the
 * staff panel after the editor shell has shipped. */
async function StaffHabitsSection({
  userId,
  workspaceId,
  clientProfileId,
  canEdit,
}: {
  userId: string;
  workspaceId: string;
  clientProfileId: string;
  canEdit: boolean;
}) {
  const [habits, consistency] = await Promise.all([
    readStaffHabits({ user: { id: userId } }, { workspaceId, clientProfileId }),
    readHabitConsistency(
      { user: { id: userId } },
      { workspaceId, clientProfileId, period: "7d" },
    ),
  ]);
  return (
    <ClientHabitsPanel
      workspaceId={workspaceId}
      clientProfileId={clientProfileId}
      canEdit={canEdit}
      initialHabits={habits.ok ? habits.value.habits : null}
      initialHasMore={habits.ok ? habits.value.hasMore : false}
      initialConsistency={consistency.ok ? consistency.value : null}
    />
  );
}
