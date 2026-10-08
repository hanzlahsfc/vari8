import { DailyTrackerShell } from "@/components/tracker/daily-tracker-shell";
import {
  requireDailyTrackerAccess,
  requireSessionUser,
} from "@/lib/auth/route-guard";
import { prisma } from "@/lib/db";
import { DailyEntryError } from "@/lib/daily-entry/gate";
import { resolveDailyEntryMode } from "@/lib/daily-entry/gate";
import {
  dailyEntryConsentRegistry,
  loadDailyEntrySurface,
  type DailyEntrySurface,
} from "@/lib/daily-entry/service";

import { DailyEntryPanel } from "./daily-entry-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daily Tracker" };

/**
 * Phase 1.1 production Daily Tracker shell + P-021 dev-gated persistence.
 *
 * Session gate first (unauthenticated → `/login`), then a server-side
 * `dailyTracking/read` collection authorization (denied → HTTP 403). The
 * read-only structural shell ALWAYS renders for authorized users — it is
 * not gated on `ENABLE_DAILY_ENTRY` and never 404s because the flag is
 * unset, off, invalid, or conflicting.
 *
 * The persistent client form/history renders additively only when the
 * resolved mode is "persistent" and the viewer is the authorized CLIENT;
 * any other principal keeps shell-only access (no staff value/history view
 * in v1). Unavailable/ineligible/no-consent states show non-disclosing
 * copy for the client.
 */
export default async function DailyTrackerPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { session, userId } = await requireSessionUser();
  await requireDailyTrackerAccess(session, workspaceId);

  const mode = resolveDailyEntryMode(
    process.env.ENABLE_DAILY_ENTRY,
    process.env.ENABLE_DAILY_PROTOTYPE,
  );
  let surface: DailyEntrySurface | null = null;
  if (mode === "persistent") {
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      select: { role: true, status: true },
    });
    if (member?.status === "ACTIVE" && member.role === "CLIENT") {
      try {
        surface = await loadDailyEntrySurface(
          { user: { id: userId } },
          { workspaceId },
          { registry: dailyEntryConsentRegistry(true) },
        );
      } catch (error) {
        if (error instanceof DailyEntryError)
          surface = { state: "unavailable" };
        else throw error;
      }
    }
  } else if (mode === "conflict") {
    // Conflict disables only the persistence affordances — the client sees
    // a non-disclosing unavailable state; the shell stays.
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      select: { role: true, status: true },
    });
    if (member?.status === "ACTIVE" && member.role === "CLIENT")
      surface = { state: "unavailable" };
  }

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
      {surface === null ? (
        <p className="notice" role="note">
          Entry and saving are not available yet. This read-only workspace shell
          maps the tracker sections to future persisted records and becomes
          editable when Daily Tracker persistence ships in Phase 4. Computed
          columns such as CALORIES stay <code>TODO(product)</code> and are never
          calculated here.
        </p>
      ) : null}
      <DailyTrackerShell />
      {surface !== null ? (
        <DailyEntryPanel workspaceId={workspaceId} surface={surface} />
      ) : null}
    </div>
  );
}
