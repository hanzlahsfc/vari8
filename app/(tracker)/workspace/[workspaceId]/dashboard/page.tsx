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
                {widget.kind === "CU04" ? (
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
