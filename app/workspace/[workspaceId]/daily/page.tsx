import { DailyTrackerShell } from "@/components/tracker/daily-tracker-shell";
import {
  requireDailyTrackerAccess,
  requireSessionUser,
} from "@/lib/auth/route-guard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daily Tracker" };

/**
 * Phase 1.1 production Daily Tracker shell.
 *
 * Session gate first (unauthenticated → `/login`), then a server-side
 * `dailyTracking/read` collection authorization (denied → HTTP 403). The page
 * presents the verified PRGRSS sections from the Phase 0.1 blueprint as
 * read-only contracts; entry/saving arrives with Phase 4 persistence, so no
 * data is collected or stored here.
 */
export default async function DailyTrackerPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { session } = await requireSessionUser();
  await requireDailyTrackerAccess(session, workspaceId);

  return (
    <div className="tracker-page" data-testid="daily-tracker-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">Workspace tracker</p>
        <h1 className="app-title">Daily Tracker</h1>
        <p className="app-lede">
          Source-backed PRGRSS Daily Tracker sections, in source order. Labels,
          units, and constraints come from the approved Phase 0.1 blueprint;
          nothing else is inferred.
        </p>
      </header>
      <p className="notice" role="note">
        Entry and saving are not available yet. This read-only workspace shell
        maps the tracker sections to future persisted records and becomes
        editable when Daily Tracker persistence ships in Phase 4. Computed
        columns such as CALORIES stay <code>TODO(product)</code> and are never
        calculated here.
      </p>
      <DailyTrackerShell />
    </div>
  );
}
