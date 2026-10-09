import Link from "next/link";
import { forbidden } from "next/navigation";

import { AccessDeniedError, authorize } from "@/lib/auth/guard";
import { requireSessionUser } from "@/lib/auth/route-guard";
import { prisma } from "@/lib/db";
import { DailyEntryError, resolveDailyEntryMode } from "@/lib/daily-entry/gate";
import {
  dailyEntryConsentRegistry,
  listStaffDailyEntries,
  parseStaffEntryCursor,
  type StaffDailyEntryListResult,
} from "@/lib/daily-entry/service";
import { createPrismaAuthorizationRepo } from "@/lib/workspace/access";

import { StaffDailyReview } from "./staff-daily-review";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daily entries" };

/**
 * P-022 — read-only staff DailyEntry review (decisions #79–#81).
 *
 * Wrapped by the staff workspace layout (workspaceSettings/read), so
 * CLIENT/SUPPORT/non-members already deny there; this page re-authorizes
 * `dailyTracking/read` for the selected client as an early denial only —
 * the detail action re-authorizes inside its Serializable transaction.
 *
 * Feature mode reuses the shared resolver (no new flag): non-persistent
 * modes render a non-disclosing unavailable state and fetch nothing. The
 * GET is a pure header read — dates, revision counts, latest-revision
 * marker; no values, and zero audit rows. `?c=` is a strict keyset cursor
 * bound to the (workspace, client) selection.
 */
export default async function StaffClientDailyPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; clientProfileId: string }>;
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const { workspaceId, clientProfileId } = await params;
  const raw = await searchParams;
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > 128 ||
    typeof clientProfileId !== "string" ||
    clientProfileId.length === 0 ||
    clientProfileId.length > 128
  )
    forbidden();
  const { session } = await requireSessionUser();

  // Early denial only — never authoritative for disclosure.
  let ctx;
  try {
    ctx = await authorize(
      session,
      {
        resource: "dailyTracking",
        action: "read",
        workspaceId,
        clientProfileId,
      },
      createPrismaAuthorizationRepo(prisma),
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) forbidden();
    throw error;
  }
  // Staff review exists only for workspace/assigned scopes — the client's
  // own scope is not a staff view.
  if (ctx.grantedScope !== "workspace" && ctx.grantedScope !== "assigned")
    forbidden();

  const backHref = `/workspace/${encodeURIComponent(workspaceId)}/clients`;

  const mode = resolveDailyEntryMode(
    process.env.ENABLE_DAILY_ENTRY,
    process.env.ENABLE_DAILY_PROTOTYPE,
  );
  if (mode !== "persistent") {
    return (
      <UnavailableShell
        backHref={backHref}
        message="Daily entries are currently unavailable."
      />
    );
  }

  const cursor =
    typeof raw.c === "string" ? parseStaffEntryCursor(raw.c) : null;
  if (raw.c !== undefined && cursor === null) forbidden();

  let list: StaffDailyEntryListResult;
  try {
    list = await listStaffDailyEntries(
      session,
      { workspaceId, clientProfileId, cursor: cursor ?? undefined },
      { registry: dailyEntryConsentRegistry(true) },
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) forbidden();
    if (error instanceof DailyEntryError) {
      return (
        <UnavailableShell
          backHref={backHref}
          message="Daily entries are currently unavailable."
        />
      );
    }
    throw error;
  }

  if (list.state === "consent_missing") {
    return (
      <UnavailableShell
        backHref={backHref}
        testId="staff-daily-consent"
        message="The client's required consent is not in place, so daily entries can't be reviewed."
      />
    );
  }

  const basePath = `/workspace/${encodeURIComponent(workspaceId)}/clients/${encodeURIComponent(clientProfileId)}/daily`;
  const nextHref =
    list.nextCursor === null
      ? null
      : `${basePath}?c=${encodeURIComponent(list.nextCursor)}`;

  return (
    <div className="catalog-page" data-testid="staff-daily-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">
          <Link href={backHref}>Clients</Link>
        </p>
        <h1 className="app-title">Daily entries — {list.clientName}</h1>
        <p className="app-lede">
          Read-only review of submitted daily entries. The latest revision is
          shown for each entry along with the total revision count.
        </p>
      </header>

      {list.items.length === 0 ? (
        <div
          className="empty-state"
          data-testid="staff-daily-empty"
          role="status"
        >
          <p>No daily entries to show.</p>
          <p>This client has not submitted any daily entries yet.</p>
        </div>
      ) : (
        <StaffDailyReview
          workspaceId={workspaceId}
          clientProfileId={clientProfileId}
          clientName={list.clientName}
          items={list.items}
          nextHref={nextHref}
        />
      )}
    </div>
  );
}

function UnavailableShell({
  backHref,
  message,
  testId = "staff-daily-unavailable",
}: {
  backHref: string;
  message: string;
  testId?: string;
}) {
  return (
    <div className="catalog-page" data-testid="staff-daily-page">
      <header className="catalog-page__header">
        <p className="catalog-page__eyebrow">
          <Link href={backHref}>Clients</Link>
        </p>
        <h1 className="app-title">Daily entries</h1>
      </header>
      <p className="app-lede" role="status" data-testid={testId}>
        {message}
      </p>
    </div>
  );
}
