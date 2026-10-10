import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import { getOwnCheckInInstance } from "@/lib/checkin/instances-boundary";

import { CheckInSubmissionPanel } from "../checkin-submission-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Check-In" };

/**
 * P-025-B — client Check-In detail/fill (decisions #92–#97). Own-scope
 * only; the pinned immutable definition renders the fill form; submitted
 * state shows answers only while consent holds; cancelled/unavailable is
 * non-disclosing.
 */
export default async function CheckInDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; instanceId: string }>;
}) {
  if (!isCheckInsEnabled()) notFound();

  const { workspaceId, instanceId } = await params;
  const { userId } = await requireSessionUser();
  const result = await getOwnCheckInInstance(
    { user: { id: userId } },
    { workspaceId, instanceId },
  );

  if (!result.ok)
    return (
      <div className="tracker-page" data-testid="checkin-unavailable">
        <header className="tracker-page__header">
          <h1 className="app-title">Check-In</h1>
        </header>
        <p className="daily-errors" role="alert">
          {result.message}
        </p>
        <Link
          href={`/workspace/${workspaceId}/check-ins`}
          className="roster-pagination__link"
        >
          Back to Check-Ins
        </Link>
      </div>
    );

  const detail = result.value;
  return (
    <div className="tracker-page" data-testid="checkin-detail">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">
          <Link href={`/workspace/${workspaceId}/check-ins`}>Check-Ins</Link>
        </p>
        <h1 className="app-title">{detail.formName}</h1>
        <p className="app-lede">
          Due{" "}
          {new Date(detail.dueAt).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {detail.late && detail.state === "SCHEDULED" ? " · Overdue" : ""}
          {detail.state === "CANCELLED" ? " · Cancelled" : ""}
        </p>
      </header>
      <CheckInSubmissionPanel workspaceId={workspaceId} detail={detail} />
    </div>
  );
}
