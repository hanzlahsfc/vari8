import Link from "next/link";

import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth/route-guard";
import { isCheckInsEnabled } from "@/lib/checkin/forms-gate";
import { isOnboardingSubmissionEnabled } from "@/lib/onboarding/submission-gate";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home" };

/**
 * FI-I2 — client Home (navigation only). Lily-styled link cards to the
 * existing client routes; ZERO data loads — no next/latest selection,
 * no counts, no aggregates. Card visibility mirrors the client nav:
 * Onboarding/Check-Ins only while their gates are on; destinations
 * enforce their own authorization and feature gates.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { userId } = await requireSessionUser();
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });

  const isClient = member?.role === "CLIENT";
  const onboardingOn = isOnboardingSubmissionEnabled(
    process.env.ENABLE_ONBOARDING_SUBMISSION,
  );
  const checkInsOn = isCheckInsEnabled();

  return (
    <div className="tracker-page" data-testid="client-home">
      <header className="tracker-page__header">
        <p className="tracker-page__eyebrow">Workspace</p>
        <h1 className="app-title">Home</h1>
        {isClient ? (
          <p className="app-lede">Where would you like to go?</p>
        ) : (
          <p className="app-lede">
            Home is the client member navigation surface. Your workspace tools
            are in the navigation.
          </p>
        )}
      </header>
      {isClient ? (
        <nav className="home-cards" aria-label="Your workspace">
          <Link className="home-card" href={`/workspace/${workspaceId}/daily`}>
            <span className="home-card__title">Daily tracking</span>
            <span className="home-card__meta">
              Record today&apos;s tracking and review your weekly history.
            </span>
          </Link>
          {onboardingOn ? (
            <Link
              className="home-card"
              href={`/workspace/${workspaceId}/onboarding`}
            >
              <span className="home-card__title">Onboarding</span>
              <span className="home-card__meta">
                Complete the intake your coach assigned.
              </span>
            </Link>
          ) : null}
          {checkInsOn ? (
            <Link
              className="home-card"
              href={`/workspace/${workspaceId}/check-ins`}
            >
              <span className="home-card__title">Check-Ins</span>
              <span className="home-card__meta">
                Your scheduled Check-Ins and calendar.
              </span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
