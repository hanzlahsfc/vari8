import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import { listOwnCheckInInstances } from "@/lib/checkin/instances-boundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Check-Ins" };

const STATE_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  SUBMITTED: "Submitted",
  CANCELLED: "Cancelled",
};

/**
 * P-025-B — client Check-In list (decisions #92–#97). Own-scope headers
 * only: form name, derived state, due timestamp, late marker, submitted
 * timestamp — zero answer values. Feature gate first; own-profile
 * rebinding happens inside the service.
 */
export default async function CheckInsListPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isCheckInsEnabled()) notFound();

  const { workspaceId } = await params;
  const { userId } = await requireSessionUser();
  const result = await listOwnCheckInInstances(
    { user: { id: userId } },
    { workspaceId },
  );
  const items = result.ok ? result.value.items : [];
  const error = result.ok ? null : result.message;

  return (
    <div className="tracker-page" data-testid="checkins-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">Workspace</p>
        <h1 className="app-title">Check-Ins</h1>
        <p className="app-lede">Check-Ins scheduled for you by your coach.</p>
      </header>
      {error !== null ? (
        <p className="daily-errors" role="alert">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="app-lede" data-testid="checkins-empty">
          You have no Check-Ins right now.
        </p>
      ) : (
        <ul className="tracker-list" data-testid="checkins-list">
          {items.map((item) => (
            <li key={item.instanceId} className="tracker-list__row">
              <Link
                href={`/workspace/${workspaceId}/check-ins/${item.instanceId}`}
                className="tracker-list__link"
                data-testid={`checkin-item-${item.state.toLowerCase()}`}
              >
                <span className="tracker-list__title">{item.formName}</span>
                <span className="tracker-list__sub">
                  Due{" "}
                  {new Date(item.dueAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {STATE_LABEL[item.state]}
                  {item.late ? " · Late" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
