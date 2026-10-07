import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import {
  requireClientSetupAccess,
  requireSessionUser,
} from "@/lib/auth/route-guard";
import { resolveScope } from "@/lib/auth/rbac";
import { isClientSetupEnabled } from "@/lib/coaching/client-setup-gate";
import {
  listAssignableClientsForSetup,
  listAssignableTemplatesForSetup,
  listClientSetupsForWorkspace,
  type AssignableSetupClient,
  type AssignableTemplate,
} from "@/lib/coaching/client-setup-boundary";
import {
  nextRosterHref,
  parseRosterQuery,
  prevRosterHref,
  ROSTER_PAGE_SIZE,
  rosterPageNumber,
} from "@/lib/workspace/roster-query";
import { SetupManager } from "./setup-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Client Setup" };

/**
 * P-016 staff-only client setup / template assignments — dev-gated surface.
 *
 * Order: feature flag → 404 before anything renders; session gate →
 * `/login`; `?c=`/`?p=` strict parse → 403 on malformed; collection
 * authorization → 403 for CLIENT/SUPPORT/non-member/inactive/cross-workspace/
 * platform-admin. Owner sees all rows; coach/assistant see only assignments
 * for clients covered by their current ACTIVE ClientAssignment. Mutation
 * controls render only for owner/coach (write scope); assistants read.
 *
 * Rows carry only the approved fields — client name, template name, pinned
 * version seq, status, assigned/ended dates. No emails, IDs-in-UI, tokens,
 * draft content, or template definitions.
 */
export default async function ClientSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ c?: string | string[]; p?: string | string[] }>;
}) {
  if (!isClientSetupEnabled(process.env.ENABLE_CLIENT_SETUP)) notFound();

  const { workspaceId } = await params;
  const raw = await searchParams;
  const { session } = await requireSessionUser();

  const query = parseRosterQuery({ c: raw.c, p: raw.p });
  if (query === null) forbidden();

  const ctx = await requireClientSetupAccess(session, workspaceId);

  const setupPage = await listClientSetupsForWorkspace(session, {
    workspaceId,
    limit: ROSTER_PAGE_SIZE,
    cursor: query.cursor,
  });
  if (!setupPage.ok) forbidden();
  const assignments = setupPage.value;

  const canWrite =
    resolveScope("clientSetups", "write", ctx.workspaceRole) !== "denied";

  // Picker lists are only fetched when mutation controls render.
  let clients: AssignableSetupClient[] = [];
  let templates: AssignableTemplate[] = [];
  if (canWrite) {
    const [clientsPage, templatesResult] = await Promise.all([
      listAssignableClientsForSetup(session, { workspaceId, limit: 100 }),
      listAssignableTemplatesForSetup(session, { workspaceId }),
    ]);
    if (!clientsPage.ok || !templatesResult.ok) forbidden();
    clients = clientsPage.value.items;
    templates = templatesResult.value;
  }

  const basePath = `/workspace/${encodeURIComponent(workspaceId)}/client-setup`;
  const prevHref = prevRosterHref(basePath, query.history);
  const nextHref =
    assignments.nextCursor === null
      ? null
      : nextRosterHref(basePath, query, assignments.nextCursor);
  const pageNumber = rosterPageNumber(query.history);

  return (
    <div className="catalog-page" data-testid="client-setup-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">Workspace</p>
        <h1 className="app-title">Client Setup</h1>
        <p className="app-lede">
          Assign a coaching template to a client. A new template assignment
          always uses the template&apos;s latest published version; existing
          assignments keep their pinned version until explicitly changed.
        </p>
      </header>

      <SetupManager
        workspaceId={workspaceId}
        canWrite={canWrite}
        clients={clients}
        templates={templates}
        rows={assignments.items}
      />

      {prevHref !== null || nextHref !== null ? (
        <nav className="roster-pagination" aria-label="Client setup pages">
          {prevHref === null ? null : (
            <Link className="roster-pagination__link" href={prevHref}>
              Previous page
            </Link>
          )}
          <span
            className="roster-pagination__page"
            aria-current="page"
            data-testid="setup-page-indicator"
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
