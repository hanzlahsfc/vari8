import { forbidden, notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import { listStaffCheckInReviewQueue } from "@/lib/checkin/instances-boundary";

import { CheckInReviewQueueList } from "@/components/checkin/review-queue-list";

export const dynamic = "force-dynamic";

export const metadata = { title: "Check-In Reviews" };

/**
 * CHECK-IN-OVERVIEW-I1 — staff "awaiting review" overview (bounded W09
 * subset; approved CHECK-IN-OVERVIEW-P2 contract). Read-only list of
 * submissions that exist with no review: owner reads workspace scope,
 * coach/assistant read assigned scope via checkinsCoachReviews — the
 * deny-set covers CLIENT/SUPPORT and dual-role PLATFORM_ADMIN.
 *
 * Feature resolver FIRST: flag-off/untrusted 404s before session or DB
 * work. Denied/revoked/foreign inputs fail closed to the repo-standard
 * non-disclosing 403 — never a disguised empty queue. The empty state
 * is therefore truthful for an authorized viewer.
 */
export default async function CheckInReviewQueuePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isCheckInsEnabled()) notFound();
  const { workspaceId } = await params;
  const { userId } = await requireSessionUser();
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length === 0 ||
    workspaceId.length > 128
  )
    notFound();

  const result = await listStaffCheckInReviewQueue(
    { user: { id: userId } },
    { workspaceId },
  );
  if (!result.ok) forbidden();
  const { items, nextCursor } = result.value;

  return (
    <div className="tracker-page" data-testid="checkin-review-queue-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">Workspace</p>
        <h1 className="app-title">Check-In Reviews</h1>
        <p className="app-lede">
          Submitted Check-Ins awaiting review, oldest first. Open a row to
          review it — whether you can mark it reviewed depends on your
          assignment, shown on the row.
        </p>
      </header>

      <CheckInReviewQueueList
        workspaceId={workspaceId}
        initialItems={items}
        initialNextCursor={nextCursor}
      />
    </div>
  );
}
