import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import {
  requireOnboardingAssignmentsAccess,
  requireSessionUser,
} from "@/lib/auth/route-guard";
import { resolveScope } from "@/lib/auth/rbac";
import { isOnboardingAssignmentsEnabled } from "@/lib/onboarding/assignments-gate";
import {
  listAssignableClientsForWorkspace,
  listAssignableFormsForWorkspace,
  listAssignmentsForWorkspace,
  type AssignableClient,
  type AssignableForm,
} from "@/lib/onboarding/assignments-boundary";
import {
  nextRosterHref,
  parseRosterQuery,
  prevRosterHref,
  ROSTER_PAGE_SIZE,
  rosterPageNumber,
} from "@/lib/workspace/roster-query";
import { AssignmentManager } from "./assignment-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Onboarding Assignments" };

/**
 * P-013 staff-only onboarding-form assignments — dev-gated surface.
 *
 * Order: feature flag → 404 before anything renders; session gate →
 * `/login`; `?c=`/`?p=` strict parse → 403 on malformed; collection
 * authorization → 403 for CLIENT/SUPPORT/non-member/inactive/cross-workspace/
 * platform-admin. Owner sees all rows; coach/assistant see only assignments
 * for clients covered by their current ACTIVE ClientAssignment. Mutation
 * controls render only for owner/coach (write scope); assistants read.
 *
 * Rows carry only the approved fields — client name, form name, pinned
 * version seq, status, assigned/ended dates. No emails, IDs-in-UI, tokens,
 * answers, or form definitions.
 */
export default async function OnboardingAssignmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ c?: string | string[]; p?: string | string[] }>;
}) {
  if (
    !isOnboardingAssignmentsEnabled(process.env.ENABLE_ONBOARDING_ASSIGNMENTS)
  )
    notFound();

  const { workspaceId } = await params;
  const raw = await searchParams;
  const { session } = await requireSessionUser();

  const query = parseRosterQuery({ c: raw.c, p: raw.p });
  if (query === null) forbidden();

  const ctx = await requireOnboardingAssignmentsAccess(session, workspaceId);

  const assignmentPage = await listAssignmentsForWorkspace(session, {
    workspaceId,
    limit: ROSTER_PAGE_SIZE,
    cursor: query.cursor,
  });
  if (!assignmentPage.ok) forbidden();
  const assignments = assignmentPage.value;

  const canWrite =
    resolveScope("onboardingAssignments", "write", ctx.workspaceRole) !==
    "denied";

  // Picker lists are only fetched when mutation controls render.
  let clients: AssignableClient[] = [];
  let forms: AssignableForm[] = [];
  if (canWrite) {
    const [clientsPage, formsResult] = await Promise.all([
      listAssignableClientsForWorkspace(session, { workspaceId, limit: 100 }),
      listAssignableFormsForWorkspace(session, { workspaceId }),
    ]);
    if (!clientsPage.ok || !formsResult.ok) forbidden();
    clients = clientsPage.value.items;
    forms = formsResult.value;
  }

  const basePath = `/workspace/${encodeURIComponent(workspaceId)}/onboarding/assignments`;
  const prevHref = prevRosterHref(basePath, query.history);
  const nextHref =
    assignments.nextCursor === null
      ? null
      : nextRosterHref(basePath, query, assignments.nextCursor);
  const pageNumber = rosterPageNumber(query.history);

  return (
    <div className="catalog-page" data-testid="onboarding-assignments">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace</p>
        <h1 className="app-title">Onboarding Assignments</h1>
        <p className="app-lede">
          Assign onboarding forms to clients. A new assignment always uses the
          form&apos;s latest published version; existing assignments keep their
          pinned version until explicitly replaced.
        </p>
      </header>

      <AssignmentManager
        workspaceId={workspaceId}
        canWrite={canWrite}
        clients={clients}
        forms={forms}
        rows={assignments.items}
      />

      {prevHref !== null || nextHref !== null ? (
        <nav
          className="roster-pagination"
          aria-label="Onboarding assignment pages"
        >
          {prevHref === null ? null : (
            <Link className="roster-pagination__link" href={prevHref}>
              Previous page
            </Link>
          )}
          <span
            className="roster-pagination__page"
            aria-current="page"
            data-testid="assignments-page-indicator"
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
