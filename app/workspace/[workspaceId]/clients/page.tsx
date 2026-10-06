import Link from "next/link";
import { forbidden } from "next/navigation";

import { AccessDeniedError } from "@/lib/auth/guard";
import { requireSessionUser } from "@/lib/auth/route-guard";
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
  const { session } = await requireSessionUser();

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
            </tr>
          </thead>
          <tbody>
            {result.items.map((client) => (
              <tr key={client.id} data-testid="roster-row">
                <td>{client.name}</td>
                <td>{client.createdAt.toISOString().slice(0, 10)}</td>
                <td>{client.updatedAt.toISOString().slice(0, 10)}</td>
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
