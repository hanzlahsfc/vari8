import Link from "next/link";
import { notFound } from "next/navigation";

import {
  requireOnboardingSubmissionsAccess,
  requireSessionUser,
} from "@/lib/auth/route-guard";
import { isOnboardingSubmissionEnabled } from "@/lib/onboarding/submission-gate";
import {
  listOwnAssignmentsForWorkspace,
  type OwnAssignmentItem,
} from "@/lib/onboarding/submissions-boundary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Onboarding" };

const STATUS_LABEL: Record<OwnAssignmentItem["status"], string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  SUPERSEDED: "Superseded",
};

/**
 * P-023 client onboarding — own-assignment discovery list (dev-gated).
 *
 * Order: dev gate → 404; session → /login; collection authorization →
 * 403 for every non-CLIENT principal. Rows carry only bounded operational
 * metadata (#85): form name, status, assigned/submitted dates — never
 * answer content or internals.
 */
export default async function OnboardingListPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isOnboardingSubmissionEnabled(process.env.ENABLE_ONBOARDING_SUBMISSION))
    notFound();

  const { workspaceId } = await params;
  const { session, userId } = await requireSessionUser();
  await requireOnboardingSubmissionsAccess(session, workspaceId);

  const result = await listOwnAssignmentsForWorkspace(
    { user: { id: userId } },
    { workspaceId },
  );
  const items = result.ok ? result.value.items : [];
  const error = result.ok ? null : result.message;

  return (
    <div className="tracker-page" data-testid="onboarding-page">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">Workspace</p>
        <h1 className="app-title">Onboarding</h1>
        <p className="app-lede">
          Forms assigned to you for one-time completion.
        </p>
      </header>
      {error !== null ? (
        <p className="daily-errors" role="alert">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="notice" role="note">
          No forms are assigned to you.
        </p>
      ) : (
        <ul className="daily-entry__history" data-testid="onboarding-list">
          {items.map((item) => (
            <li key={item.assignmentId} className="daily-group">
              <Link
                href={`/workspace/${workspaceId}/onboarding/${item.assignmentId}`}
              >
                <strong>{item.formName}</strong>
              </Link>
              <p className="app-lede">
                Status: {STATUS_LABEL[item.status]}
                {item.submittedAt !== null
                  ? ` — submitted ${item.submittedAt.slice(0, 10)}`
                  : ` — assigned ${item.assignedAt.slice(0, 10)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
