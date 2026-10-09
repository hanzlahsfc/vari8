import { notFound } from "next/navigation";

import {
  requireOnboardingSubmissionsAccess,
  requireSessionUser,
} from "@/lib/auth/route-guard";
import { isOnboardingSubmissionEnabled } from "@/lib/onboarding/submission-gate";
import { loadOwnDetailForRoute } from "@/lib/onboarding/submissions-boundary";
import { onboardingSubmissionConsentRegistry } from "@/lib/onboarding/submissions";

import { OnboardingPanel } from "../onboarding-panel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Onboarding Form" };

const UNAVAILABLE = "This form is not available.";

/**
 * P-023 client onboarding detail — fillable form for an eligible ACTIVE
 * own assignment, or the read-only submitted view while consent remains
 * active. Foreign, missing, terminal, denied, and consent-withheld
 * targets share the single non-disclosing unavailable surface (#85).
 * The dev gate 404s before any session/database work.
 */
export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; assignmentId: string }>;
}) {
  if (!isOnboardingSubmissionEnabled(process.env.ENABLE_ONBOARDING_SUBMISSION))
    notFound();

  const { workspaceId, assignmentId } = await params;
  const { session, userId } = await requireSessionUser();
  await requireOnboardingSubmissionsAccess(session, workspaceId);

  const result = await loadOwnDetailForRoute(
    { user: { id: userId } },
    { workspaceId, assignmentId },
    { registry: onboardingSubmissionConsentRegistry(true) },
  );
  const detail = result.ok ? result.value : { state: "unavailable" as const };

  return (
    <div className="tracker-page" data-testid="onboarding-detail">
      {detail.state === "unavailable" ? (
        <p className="app-lede" role="status">
          {UNAVAILABLE}
        </p>
      ) : (
        <OnboardingPanel workspaceId={workspaceId} detail={detail} />
      )}
    </div>
  );
}
