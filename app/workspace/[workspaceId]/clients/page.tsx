import Link from "next/link";
import { forbidden } from "next/navigation";

import { AccessDeniedError } from "@/lib/auth/guard";
import { requireSessionUser } from "@/lib/auth/route-guard";
import { resolveScope } from "@/lib/auth/rbac";
import { memberRoleToRole } from "@/lib/auth/roles";
import { resolveDailyEntryMode } from "@/lib/daily-entry/gate";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import { isClientDashboardEnabled } from "@/lib/dashboard/gate";
import { isIifymPlansEnabled } from "@/lib/iifym/gate";
import { isMealPlansEnabled } from "@/lib/mealplan/gate";
import { isTrainingPlansEnabled } from "@/lib/trainingprogram/gate";
import { isOnboardingSubmissionEnabled } from "@/lib/onboarding/submission-gate";
import { prisma } from "@/lib/db";
import { listAccessibleClientProfiles } from "@/lib/workspace/clients";
import {
  nextRosterHref,
  parseRosterQuery,
  prevRosterHref,
  ROSTER_PAGE_SIZE,
  rosterPageNumber,
} from "@/lib/workspace/roster-query";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clients" };

/**
 * P-010 read-only staff client roster.
 *
 * Session gate first (unauthenticated → `/login`), then the reviewed
 * `listAccessibleClientProfiles` service re-authorizes `clientProfiles/read`
 * per request: owner → workspace scope, coach/assistant → ACTIVE assignments,
 * every denial → the repo-standard non-disclosing HTTP 403. CLIENT is already
 * denied by the workspace shell's `workspaceSettings/read` gate.
 *
 * Pagination is a fixed server-controlled page size over the service's
 * `id > cursor` contract; `?c=`/`?p=` are strictly validated before they reach
 * the service. This page performs no mutations and renders only the approved
 * summary fields (name + timestamps).
 */
export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ c?: string | string[]; p?: string | string[] }>;
}) {
  const { workspaceId } = await params;
  const raw = await searchParams;
  const { session, userId } = await requireSessionUser();

  const query = parseRosterQuery({ c: raw.c, p: raw.p });
  if (query === null) forbidden();

  let result;
  try {
    result = await listAccessibleClientProfiles(session, {
      workspaceId,
      limit: ROSTER_PAGE_SIZE,
      cursor: query.cursor,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) forbidden();
    throw error;
  }

  const basePath = `/workspace/${encodeURIComponent(workspaceId)}/clients`;
  const prevHref = prevRosterHref(basePath, query.history);
  const nextHref =
    result.nextCursor === null
      ? null
      : nextRosterHref(basePath, query, result.nextCursor);
  const pageNumber = rosterPageNumber(query.history);

  // P-022 cosmetic entry point: the "Daily entries" link renders only when
  // the actor's role resolves a staff (workspace/assigned) `dailyTracking`
  // read scope AND persistence mode is active. Cosmetic convenience only —
  // the destination route fully re-authorizes.
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  });
  const dailyLinkScope =
    member?.status === "ACTIVE" && member.role !== undefined
      ? resolveScope("dailyTracking", "read", member.role)
      : "denied";
  const showDailyLinks =
    resolveDailyEntryMode(
      process.env.ENABLE_DAILY_ENTRY,
      process.env.ENABLE_DAILY_PROTOTYPE,
    ) === "persistent" &&
    (dailyLinkScope === "workspace" || dailyLinkScope === "assigned");
  // P-025-B: Check-In instance links follow the same cosmetic-gate shape —
  // flag on AND the role can read instance headers (workspace/assigned);
  // the destination re-authorizes `checkinInstances` server-side.
  const checkInLinkScope =
    member?.status === "ACTIVE" && member.role !== undefined
      ? resolveScope("checkinInstances", "read", member.role)
      : "denied";
  const showCheckInLinks =
    isCheckInsEnabled() &&
    (checkInLinkScope === "workspace" || checkInLinkScope === "assigned");
  // P-024: "Onboarding" review links follow the same cosmetic-gate shape —
  // submission flag on AND the role can read review headers
  // (workspace/assigned); the destination re-authorizes
  // `onboardingSubmissionReviews` server-side.
  const onboardingLinkScope =
    member?.status === "ACTIVE" && member.role !== undefined
      ? resolveScope("onboardingSubmissionReviews", "read", member.role)
      : "denied";
  const showOnboardingLinks =
    isOnboardingSubmissionEnabled(process.env.ENABLE_ONBOARDING_SUBMISSION) &&
    (onboardingLinkScope === "workspace" || onboardingLinkScope === "assigned");
  // DASHBOARD-I1 (decision 108): same cosmetic-gate shape — flag on AND
  // the role can read layouts; the destination re-authorizes.
  const dashboardLinkScope =
    member?.status === "ACTIVE" && member.role !== undefined
      ? resolveScope("clientDashboards", "read", member.role)
      : "denied";
  const showDashboardLinks =
    isClientDashboardEnabled() &&
    (dashboardLinkScope === "workspace" || dashboardLinkScope === "assigned");
  // SOLO-COACH-I1 (decision 111): "Coaches" link renders only when the
  // role resolves a `clientAssignments` write scope — owner only.
  // Cosmetic convenience only; the destination re-authorizes (and the
  // deny-set still catches a dual-role platform admin).
  const coachesLinkScope =
    member?.status === "ACTIVE" && member.role !== undefined
      ? resolveScope("clientAssignments", "write", member.role)
      : "denied";
  const showCoachesLinks = coachesLinkScope !== "denied";
  // MEAL-PLAN-I1 (decision 115): same cosmetic-gate shape — flag on AND
  // the role can read meal plans (workspace/assigned); the destination
  // re-authorizes `mealPlans` server-side.
  const mealPlanLinkScope =
    member?.status === "ACTIVE" && member.role !== undefined
      ? resolveScope("mealPlans", "read", member.role)
      : "denied";
  const showMealPlanLinks =
    isMealPlansEnabled() &&
    (mealPlanLinkScope === "workspace" || mealPlanLinkScope === "assigned");
  // Card 10 (#175): same cosmetic-gate shape for macro targets — flag on
  // AND the role can read nutrition plans; the destination re-authorizes
  // `mealPlans` server-side on every read and write.
  const showIifymLinks =
    isIifymPlansEnabled() &&
    (mealPlanLinkScope === "workspace" || mealPlanLinkScope === "assigned");
  // TRAINING-I1A (PROMPT 244): same cosmetic-gate shape — flag on AND
  // the role can read training programs (workspace/assigned); the
  // destination re-authorizes `trainingPlansLogs` server-side.
  const trainingPlanLinkScope =
    member?.status === "ACTIVE" && member.role !== undefined
      ? resolveScope("trainingPlansLogs", "read", member.role)
      : "denied";
  const showTrainingPlanLinks =
    isTrainingPlansEnabled() &&
    (trainingPlanLinkScope === "workspace" ||
      trainingPlanLinkScope === "assigned");
  // Card 08: same cosmetic-gate shape — the link renders for staff roles
  // only; the destination page and every /api/v1 call it makes re-authorize.
  const photoLinkRole =
    member?.status === "ACTIVE" ? memberRoleToRole(member.role) : null;
  const showPhotoLinks = photoLinkRole === "owner" || photoLinkRole === "coach";

  return (
    <div className="catalog-page" data-testid="client-roster">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace</p>
        <h1 className="app-title">Clients</h1>
        <p className="app-lede">
          Client profiles you can access in this workspace. Coaches and
          assistants see only clients assigned to them.
        </p>
      </header>

      {result.items.length === 0 ? (
        <div
          className="empty-state"
          data-testid="client-roster-empty"
          role="status"
        >
          <p>No clients to show.</p>
          <p>No client profiles are visible to you in this workspace yet.</p>
        </div>
      ) : (
        <table className="catalog-table" data-testid="client-roster-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Added</th>
              <th scope="col">Updated</th>
              {showDailyLinks ? <th scope="col">Daily</th> : null}
              {showCheckInLinks ? <th scope="col">Check-Ins</th> : null}
              {showPhotoLinks ? <th scope="col">Photos</th> : null}
              {showOnboardingLinks ? <th scope="col">Onboarding</th> : null}
              {showDashboardLinks ? <th scope="col">Dashboard</th> : null}
              {showMealPlanLinks ? <th scope="col">Meal plan</th> : null}
              {showIifymLinks ? <th scope="col">Macro targets</th> : null}
              {showTrainingPlanLinks ? <th scope="col">Training</th> : null}
              {showCoachesLinks ? <th scope="col">Coaches</th> : null}
            </tr>
          </thead>
          <tbody>
            {result.items.map((client) => (
              <tr key={client.id} data-testid="roster-row">
                <td>{client.name}</td>
                <td>{client.createdAt.toISOString().slice(0, 10)}</td>
                <td>{client.updatedAt.toISOString().slice(0, 10)}</td>
                {showDailyLinks ? (
                  <td>
                    <Link
                      className="roster-pagination__link"
                      href={`${basePath}/${encodeURIComponent(client.id)}/daily`}
                    >
                      Daily entries
                    </Link>
                  </td>
                ) : null}
                {showCheckInLinks ? (
                  <td>
                    <Link
                      className="roster-pagination__link"
                      href={`${basePath}/${encodeURIComponent(client.id)}/checkins`}
                    >
                      Check-Ins
                    </Link>
                  </td>
                ) : null}
                {showPhotoLinks ? (
                  <td>
                    <Link
                      className="roster-pagination__link"
                      href={`${basePath}/${encodeURIComponent(client.id)}/photos`}
                      data-testid={`photos-link-${client.id}`}
                    >
                      Photos
                    </Link>
                  </td>
                ) : null}
                {showDashboardLinks ? (
                  <td>
                    <Link
                      className="roster-pagination__link"
                      href={`${basePath}/${encodeURIComponent(client.id)}/dashboard`}
                      data-testid={`dashboard-link-${client.id}`}
                    >
                      Dashboard
                    </Link>
                  </td>
                ) : null}
                {showOnboardingLinks ? (
                  <td>
                    <Link
                      className="roster-pagination__link"
                      href={`${basePath}/${encodeURIComponent(client.id)}/onboarding`}
                    >
                      Onboarding
                    </Link>
                  </td>
                ) : null}
                {showMealPlanLinks ? (
                  <td>
                    <Link
                      className="roster-pagination__link"
                      href={`${basePath}/${encodeURIComponent(client.id)}/meal-plan`}
                      data-testid={`mealplan-link-${client.id}`}
                    >
                      Meal plan
                    </Link>
                  </td>
                ) : null}
                {showIifymLinks ? (
                  <td>
                    <Link
                      className="roster-pagination__link"
                      href={`${basePath}/${encodeURIComponent(client.id)}/macro-targets`}
                      data-testid={`iifym-link-${client.id}`}
                    >
                      Macro targets
                    </Link>
                  </td>
                ) : null}
                {showTrainingPlanLinks ? (
                  <td>
                    <Link
                      className="roster-pagination__link"
                      href={`${basePath}/${encodeURIComponent(client.id)}/training-program`}
                      data-testid={`training-link-${client.id}`}
                    >
                      Training
                    </Link>
                  </td>
                ) : null}
                {showCoachesLinks ? (
                  <td>
                    <Link
                      className="roster-pagination__link"
                      href={`${basePath}/${encodeURIComponent(client.id)}/coaches`}
                    >
                      Coaches
                    </Link>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {prevHref !== null || nextHref !== null ? (
        <nav className="roster-pagination" aria-label="Client roster pages">
          {prevHref === null ? null : (
            <Link className="roster-pagination__link" href={prevHref}>
              Previous page
            </Link>
          )}
          <span
            className="roster-pagination__page"
            aria-current="page"
            data-testid="roster-page-indicator"
          >
            Page {pageNumber}
          </span>
          {nextHref === null ? null : (
            <Link className="roster-pagination__link" href={nextHref}>
              Next page
            </Link>
          )}
        </nav>
      ) : null}
    </div>
  );
}
