import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isClientDashboardEnabled } from "@/lib/dashboard/gate";
import { readOwnDashboardLayout } from "@/lib/dashboard/boundary";
import {
  readingOrder,
  WIDGET_CATALOGUE,
  type DashboardConfig,
} from "@/lib/dashboard/config-schema";
import { prisma } from "@/lib/db";
import { readOwnClientTasks } from "@/lib/tasks/boundary";
import { readTodayHabits, readHabitConsistency } from "@/lib/habits/boundary";
import { ClientTasksWidget } from "./client-tasks-widget";
import { ClientHabitsWidget } from "./client-habits-widget";
import { ClientConsistencyWidget } from "./client-consistency-widget";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

/**
 * DASHBOARD-I1 (decision 108): the client's own committed dashboard —
 * the server-filtered subset only (staff widgets/settings/rects never
 * reach this page). Unconnected widgets show a truthful placeholder;
 * each connected widget keeps its own authorization boundary.
 */
export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isClientDashboardEnabled()) notFound();

  const { workspaceId } = await params;
  const { userId } = await requireSessionUser();
  if (typeof workspaceId !== "string" || workspaceId.length > 128) notFound();

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId, status: "ACTIVE", role: "CLIENT" },
    select: { id: true },
  });
  if (!member) notFound();

  const result = await readOwnDashboardLayout(
    { user: { id: userId } },
    { workspaceId },
  );
  if (!result.ok) notFound();
  const layout = result.value.layout;

  const config: DashboardConfig | null = layout?.config ?? null;
  const rects = config?.layouts.desktop ?? {};
  const order = config ? readingOrder(rects) : [];
  const visible = order.filter((id) =>
    config?.widgets.some((w) => w.id === id),
  );

  // CU03 connected data: loaded through the task boundary — dashboard
  // placement grants no task-data permission (decision 109).
  const ownProfile = await prisma.clientProfile.findFirst({
    where: { workspaceId, userId },
    select: { id: true },
  });
  const cu03Widgets = config
    ? config.widgets.filter((w) => w.kind === "CU03")
    : [];
  const taskLists: Record<
    string,
    { tasks: import("@/lib/tasks/service").TaskView[]; hasMore: boolean }
  > = {};
  if (ownProfile) {
    for (const w of cu03Widgets) {
      const opt = w.settings.option;
      const option = opt === "open" || opt === "completed" ? opt : "both";
      const result = await readOwnClientTasks(
        { user: { id: userId } },
        { workspaceId, option },
      );
      taskLists[w.id] = result.ok
        ? result.value
        : { tasks: [], hasMore: false };
    }
  }

  // HABITS-I1 (decision 110): TL21/TL22 load through the habit boundary —
  // dashboard placement grants no habit-data permission. `fields` is the
  // reviewed subset selector (empty = full authorized cohort); TL22 keeps
  // the configured period.
  const habitLists: Record<
    string,
    {
      habits: import("@/lib/habits/service").TodayHabitView[];
      hasMore: boolean;
      date: string;
    }
  > = {};
  const consistency: Record<
    string,
    import("@/lib/habits/service").HabitConsistencyResult | null
  > = {};
  if (ownProfile) {
    for (const w of config?.widgets ?? []) {
      if (w.kind === "TL21") {
        const result = await readTodayHabits(
          { user: { id: userId } },
          { workspaceId, fields: w.settings.fields },
        );
        habitLists[w.id] = result.ok
          ? result.value
          : { habits: [], hasMore: false, date: "" };
      } else if (w.kind === "TL22") {
        const result = await readHabitConsistency(
          { user: { id: userId } },
          {
            workspaceId,
            period: w.settings.period,
            fields: w.settings.fields,
          },
        );
        consistency[w.id] = result.ok ? result.value : null;
      }
    }
  }

  const LINKS: Record<string, string> = {
    Tracker: `/workspace/${workspaceId}/daily`,
    "Check-in": `/workspace/${workspaceId}/check-ins`,
  };

  return (
    <div className="catalog-page" data-testid="client-dashboard">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">
          <Link href={`/workspace/${workspaceId}/home`}>Home</Link>
        </p>
        <h1 className="app-title">{config?.name ?? "Dashboard"}</h1>
      </header>
      {!config || visible.length === 0 ? (
        <div
          className="empty-state"
          role="status"
          data-testid="dashboard-empty"
        >
          <p>No shared dashboard yet.</p>
          <p>Your coach hasn’t shared any dashboard widgets with you.</p>
        </div>
      ) : (
        <ul className="dashboard-grid">
          {visible.map((id) => {
            const widget = config.widgets.find((w) => w.id === id);
            if (!widget) return null;
            const cat = WIDGET_CATALOGUE[widget.kind];
            return (
              <li
                key={id}
                className="dashboard-widget"
                data-testid={`client-widget-${widget.kind}`}
              >
                <strong>{widget.settings.title}</strong>
                {widget.kind === "CU03" ? (
                  <ClientTasksWidget
                    workspaceId={workspaceId}
                    clientProfileId={ownProfile?.id ?? ""}
                    tasks={taskLists[widget.id]?.tasks ?? []}
                  />
                ) : widget.kind === "TL21" ? (
                  <ClientHabitsWidget
                    workspaceId={workspaceId}
                    clientProfileId={ownProfile?.id ?? ""}
                    date={habitLists[widget.id]?.date ?? ""}
                    habits={habitLists[widget.id]?.habits ?? []}
                    hasMore={habitLists[widget.id]?.hasMore ?? false}
                  />
                ) : widget.kind === "TL22" ? (
                  <ClientConsistencyWidget
                    result={consistency[widget.id] ?? null}
                  />
                ) : widget.kind === "CU04" ? (
                  <Link href={`/workspace/${workspaceId}/check-ins`}>
                    Open Check-Ins
                  </Link>
                ) : widget.kind === "CU16" ? (
                  <ul>
                    {widget.settings.fields.map((f) =>
                      LINKS[f] ? (
                        <li key={f}>
                          <Link href={LINKS[f]}>{f}</Link>
                        </li>
                      ) : (
                        <li key={f}>{f} — not connected</li>
                      ),
                    )}
                  </ul>
                ) : (
                  <span data-testid="placeholder">
                    {cat.name} — not connected yet
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
